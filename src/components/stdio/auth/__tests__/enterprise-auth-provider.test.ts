import {constants, generateKeyPairSync, verify} from 'node:crypto';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import jwt from 'jsonwebtoken';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {MAX_API_RESPONSE_BYTES} from '../../../../utils';
import type {EnterpriseConfig} from '../../../config';
import {INSTALLATION} from '../../../config';
import {collectTools} from '../../../tools/utils/collect-tools';
import {createAuthProvider} from '../create-auth-provider';

const {privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY} = generateKeyPairSync('rsa', {
    modulusLength: 2048,
});
const KEY = {
    id: 'key-id',
    service_account_id: 'sa-id',
    private_key: PRIVATE_KEY.export({type: 'pkcs8', format: 'pem'}),
};
const NOW = new Date('2026-10-28T10:00:00Z').getTime();
const accessToken = (expiresIn = 900, id = 'one') =>
    jwt.sign({id}, PRIVATE_KEY, {algorithm: 'PS256', expiresIn});
const response = (token = accessToken()) => new Response(JSON.stringify({accessToken: token}));

describe('Enterprise auth', () => {
    let dir: string;
    let config: EnterpriseConfig;
    let keyFile: string;
    const fetchMock = vi.fn();

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'datalens-enterprise-test-'));
        keyFile = join(dir, 'key.json');
        config = {
            installation: INSTALLATION.ENTERPRISE,
            apiUrl: 'https://enterprise.example.com',
            schemaUrl: 'https://enterprise.example.com/api/docs/swagger/json/',
            apiVersion: '3',
            maxResponseChars: 100_000,
            auth: {type: 'service-account', keyFile},
        };
        await writeFile(keyFile, JSON.stringify(KEY));
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        await rm(dir, {recursive: true, force: true});
    });

    it('signs a PS256 assertion and exchanges it lazily without Authorization', async () => {
        const token = accessToken();
        fetchMock.mockResolvedValue(response(token));
        const provider = await createAuthProvider(config);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await provider.getAuthHeader()).toBe(`Bearer ${token}`);
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe(`${config.apiUrl}/rpc/exchangeServiceAccountToken`);
        expect(options).toMatchObject({
            method: 'POST',
            redirect: 'error',
            headers: {'content-type': 'application/json', 'x-dl-api-version': '3'},
            signal: expect.any(AbortSignal),
        });
        expect(options.headers).not.toHaveProperty('Authorization');
        const {saToken} = JSON.parse(options.body);
        const [header, payload, signature] = saToken.split('.');
        expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
            alg: 'PS256',
            typ: 'JWT',
            kid: 'key-id',
        });
        expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
            iss: 'sa-id',
            iat: NOW / 1000,
            exp: NOW / 1000 + 60,
        });
        expect(
            verify(
                'sha256',
                Buffer.from(`${header}.${payload}`),
                {
                    key: PUBLIC_KEY,
                    padding: constants.RSA_PKCS1_PSS_PADDING,
                    saltLength: 32,
                },
                Buffer.from(signature, 'base64url'),
            ),
        ).toBe(true);
    });

    it('shares concurrent renewals and caches until the refresh margin', async () => {
        const token = accessToken();
        fetchMock.mockResolvedValueOnce(response(token));
        const provider = await createAuthProvider(config);
        expect(await Promise.all(Array.from({length: 5}, () => provider.getAuthHeader()))).toEqual(
            Array(5).fill(`Bearer ${token}`),
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
        vi.setSystemTime(NOW + 839_000);
        expect(await provider.getAuthHeader()).toBe(`Bearer ${token}`);
        const next = accessToken(900, 'two');
        fetchMock.mockResolvedValueOnce(response(next));
        vi.setSystemTime(NOW + 840_000);
        expect(await provider.getAuthHeader()).toBe(`Bearer ${next}`);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('adapts renewal to short token lifetimes', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(response(accessToken(10))));
        const provider = await createAuthProvider(config);
        await provider.getAuthHeader();
        vi.setSystemTime(NOW + 8_000);
        await provider.getAuthHeader();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        vi.setSystemTime(NOW + 9_000);
        await provider.getAuthHeader();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('falls back only to an unexpired cached token and retries after failure', async () => {
        const token = accessToken();
        fetchMock
            .mockResolvedValueOnce(response(token))
            .mockRejectedValue(new Error('secret transport details'));
        const provider = await createAuthProvider(config);
        await provider.getAuthHeader();
        vi.setSystemTime(NOW + 841_000);
        expect(await provider.getAuthHeader()).toBe(`Bearer ${token}`);
        vi.setSystemTime(NOW + 900_000);
        await expect(provider.getAuthHeader()).rejects.toThrow('Enterprise token exchange failed');
        fetchMock.mockResolvedValueOnce(response(accessToken()));
        await expect(provider.getAuthHeader()).resolves.toContain('Bearer ');
    });

    it('does not return a token that expires while a failed exchange is in flight', async () => {
        fetchMock.mockResolvedValueOnce(response(accessToken(10)));
        const provider = await createAuthProvider(config);
        await provider.getAuthHeader();
        vi.setSystemTime(NOW + 9_000);
        fetchMock.mockImplementationOnce(async () => {
            vi.setSystemTime(NOW + 11_000);
            throw new Error('secret');
        });
        await expect(provider.getAuthHeader()).rejects.toThrow('Enterprise token exchange failed');
    });

    it.each([
        null,
        {},
        {accessToken: ''},
        {accessToken: 'secret'},
        {accessToken: 'a.bnVsbA.c'},
        {accessToken: 'a.eyJleHAiOiJzZWNyZXQifQ.c'},
    ])('rejects malformed token responses without forwarding their contents', async (body) => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
        const provider = await createAuthProvider(config);
        await expect(provider.getAuthHeader()).rejects.toThrow('Enterprise token exchange failed');
    });

    it('rejects expired access tokens', async () => {
        fetchMock.mockResolvedValue(response(accessToken(-1)));
        const provider = await createAuthProvider(config);
        await expect(provider.getAuthHeader()).rejects.toThrow('Enterprise token exchange failed');
    });

    it('rejects access tokens without an expiration', async () => {
        fetchMock.mockResolvedValue(response(jwt.sign({}, PRIVATE_KEY, {algorithm: 'PS256'})));
        const provider = await createAuthProvider(config);
        await expect(provider.getAuthHeader()).rejects.toThrow('Enterprise token exchange failed');
    });

    it.each([401, 403, 302, 500])('hides upstream bodies on HTTP %s', async (status) => {
        fetchMock.mockResolvedValue(new Response('private-key-and-token', {status}));
        const provider = await createAuthProvider(config);
        const error = await Promise.resolve(provider.getAuthHeader()).catch((err: unknown) => err);
        expect(String(error)).toContain('Enterprise token exchange failed');
        expect(String(error)).not.toContain('private-key-and-token');
    });

    it('bounds the exchange response size', async () => {
        fetchMock.mockResolvedValue(new Response('x'.repeat(MAX_API_RESPONSE_BYTES + 1)));
        const provider = await createAuthProvider(config);
        await expect(provider.getAuthHeader()).rejects.toThrow('Enterprise token exchange failed');
    });

    it('times out exchange requests and allows the next attempt', async () => {
        fetchMock.mockImplementationOnce(
            (_url, {signal}) =>
                new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () =>
                        reject(new DOMException('secret', 'AbortError')),
                    );
                }),
        );
        const provider = await createAuthProvider(config);
        const result = expect(provider.getAuthHeader()).rejects.toThrow(
            'Enterprise token exchange failed',
        );
        await vi.advanceTimersByTimeAsync(30_000);
        await result;
        fetchMock.mockResolvedValueOnce(response());
        await expect(provider.getAuthHeader()).resolves.toContain('Bearer ');
    });

    it.each(['not json', '{}', JSON.stringify({...KEY, private_key: 'secret-invalid-pem'})])(
        'rejects invalid key files without leaking contents',
        async (contents) => {
            await writeFile(keyFile, contents);
            await expect(createAuthProvider(config)).rejects.toThrow(
                'Cannot load Enterprise service account key',
            );
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it('rejects a non-RSA private key and a missing file', async () => {
        const {privateKey} = generateKeyPairSync('ed25519');
        await writeFile(
            keyFile,
            JSON.stringify({
                ...KEY,
                private_key: privateKey.export({type: 'pkcs8', format: 'pem'}),
            }),
        );
        await expect(createAuthProvider(config)).rejects.toThrow('Cannot load Enterprise');
        await rm(keyFile);
        await expect(createAuthProvider(config)).rejects.toThrow('Cannot load Enterprise');
    });

    it('uses a static bearer without loading a key or exchanging tokens', async () => {
        const provider = await createAuthProvider({
            ...config,
            auth: {type: 'static', header: 'Bearer static'},
        });
        expect(await provider.getAuthHeader()).toBe('Bearer static');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends the exchanged token to RPC and keeps exchange out of discovery', async () => {
        const token = accessToken();
        fetchMock
            .mockResolvedValueOnce(response(token))
            .mockResolvedValueOnce(new Response('{"id":"entry"}'));
        const provider = await createAuthProvider(config);
        const commands = collectTools(
            {
                paths: {
                    '/rpc/getEntry': {post: {'x-mcp-scope': 'read'}},
                    '/rpc/exchangeServiceAccountToken': {post: {'x-mcp-disabled': true}},
                },
            },
            config,
        );
        expect(commands.map(({name}) => name)).toEqual(['getEntry']);
        expect(
            await commands[0].invoke({entryId: 'entry'}, await provider.getAuthHeader()),
        ).toEqual({
            id: 'entry',
        });
        expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
            Authorization: `Bearer ${token}`,
            'x-dl-api-version': '3',
        });
    });
});
