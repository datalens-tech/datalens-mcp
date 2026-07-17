import {afterEach, describe, expect, it, vi} from 'vitest';

import type {AuthProvider} from '../auth';
import type {AppConfig} from '../config';

import {createApiClient} from './api-client';

const config: AppConfig = {
    apiUrl: 'http://api.example',
    installation: 'internal',
    orgId: 'org-1',
    schemaUrl: 'http://api.example/json/',
    apiVersion: 'v1',
    maxResponseChars: 100_000,
    requestTimeoutMs: 30_000,
    writeMode: 'planned',
    allowDestructive: false,
    allowCommands: [],
    denyCommands: [],
    resultTtlMs: 600_000,
    resultMaxBytes: 10 * 1024 * 1024,
    resultStoreMaxBytes: 50 * 1024 * 1024,
    planTtlMs: 300_000,
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('createApiClient', () => {
    it('refreshes dynamic auth once after a 401 response', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('unauthorized', {status: 401}))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ok: true}), {
                    status: 200,
                    headers: {'content-type': 'application/json'},
                }),
            );
        vi.stubGlobal('fetch', fetchMock);
        const authProvider: AuthProvider = {
            getAuthHeader: vi
                .fn()
                .mockReturnValueOnce('Bearer old-token')
                .mockReturnValueOnce('Bearer new-token'),
            invalidate: vi.fn(),
        };

        const result = await createApiClient(config, authProvider).post(
            '/rpc/getThing',
            {id: '1'},
            {idempotent: true},
        );

        expect(result).toEqual({ok: true});
        expect(authProvider.invalidate).toHaveBeenCalledOnce();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer old-token');
        expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new-token');
        expect(fetchMock.mock.calls[1][1].headers['x-dl-api-version']).toBe('v1');
        expect(fetchMock.mock.calls[1][1].headers['x-dl-org-id']).toBe('org-1');
        expect(fetchMock.mock.calls[1][1]).toEqual(
            expect.objectContaining({method: 'POST', body: JSON.stringify({id: '1'})}),
        );
    });

    it('does not retry a rejected static credential', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('no', {status: 401}));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            createApiClient(config, {getAuthHeader: () => 'Bearer static'}).post(
                '/rpc/getThing',
                {},
                {idempotent: true},
            ),
        ).rejects.toMatchObject({code: 'AUTH_REJECTED', kind: 'auth'});
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('never automatically replays a write after a network failure', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('connection reset'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            createApiClient(config, {getAuthHeader: () => undefined}).post(
                '/rpc/updateThing',
                {},
                {idempotent: false},
            ),
        ).rejects.toMatchObject({code: 'NETWORK_ERROR', retryable: false});
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('classifies credential-provider failures as auth errors', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            createApiClient(config, {
                getAuthHeader: () => {
                    throw new Error('yc failed');
                },
            }).post('/rpc/getThing', {}, {idempotent: true}),
        ).rejects.toMatchObject({code: 'AUTH_PROVIDER_ERROR', kind: 'auth'});
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
