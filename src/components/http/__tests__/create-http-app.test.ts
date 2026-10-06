import {describe, expect, it, vi} from 'vitest';

import {readToolJson} from '../../../__tests__/helpers/mcp';
import {createHttpApp} from '../create-http-app';

import {httpConfig, nativeFetch, startTestServer} from './http-test-server';

const invokeRead = {name: 'invoke_read_command', arguments: {command_name: 'read'}};
const listToolsBody = JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'});

describe.each(['legacy', 'modern'] as const)('HTTP MCP (%s)', (era) => {
    it('serves the catalog anonymously and fetches the schema only once', async () => {
        const {connect, api, fetchMock} = await startTestServer();
        const first = await connect(era);
        const second = await connect(era);

        expect(first.getProtocolEra()).toBe(era);
        expect((await first.listTools()).tools).toHaveLength(5);
        const listed = await first.callTool({name: 'list_commands'});
        const described = await second.callTool({
            name: 'describe_commands',
            arguments: {command_names: ['read']},
        });

        expect(listed.isError).not.toBe(true);
        expect(described.isError).not.toBe(true);
        expect(readToolJson(listed)).toHaveLength(3);
        expect(readToolJson(described)[0]).toMatchObject({command_name: 'read', scope: 'read'});
        expect(api).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(httpConfig.schemaUrl, expect.any(Object));
    });

    it.each(['read', 'write', 'privileged'])(
        'forwards caller credentials for a %s command',
        async (scope) => {
            const {connect, api} = await startTestServer();
            const client = await connect(era, 'OAuth alice');

            const result = await client.callTool({
                name: `invoke_${scope}_command`,
                arguments: {command_name: scope},
            });

            expect(result.isError).not.toBe(true);
            expect(api).toHaveBeenCalledOnce();
            const [url, options] = api.mock.calls[0];
            expect(url).toBe(`${httpConfig.apiUrl}/rpc/${scope}`);
            expect(new Headers(options?.headers).get('authorization')).toBe('OAuth alice');
        },
    );

    it('keeps credentials isolated while two requests overlap', async () => {
        const {connect, api} = await startTestServer();
        const alice = await connect(era, 'OAuth alice');
        const bob = await connect(era, 'OAuth bob');
        let aliceArrived!: () => void;
        const started = new Promise<void>((resolve) => {
            aliceArrived = resolve;
        });
        let releaseAlice!: () => void;
        const blocked = new Promise<void>((resolve) => {
            releaseAlice = resolve;
        });
        api.mockImplementation(async (_url, options) => {
            const authorization = new Headers(options?.headers).get('authorization');
            if (authorization === 'OAuth alice') {
                aliceArrived();
                await blocked;
            }
            return Response.json({authorization});
        });

        const aliceResult = alice.callTool(invokeRead);
        try {
            await started;
            const bobResult = await bob.callTool(invokeRead);
            expect(JSON.parse(readToolJson(bobResult).data)).toEqual({authorization: 'OAuth bob'});
        } finally {
            releaseAlice();
        }
        expect(JSON.parse(readToolJson(await aliceResult).data)).toEqual({
            authorization: 'OAuth alice',
        });
        expect(api).toHaveBeenCalledTimes(2);
    });

    it.each([undefined, 'OAuth expired'])(
        'leaves authentication failures to DataLens (%s)',
        async (authorization) => {
            const {connect, api} = await startTestServer();
            api.mockImplementation(async () =>
                Response.json({code: 'UNAUTHORIZED'}, {status: 401}),
            );
            const client = await connect(era, authorization);

            const result = await client.callTool(invokeRead);

            expect(result.isError).toBe(true);
            expect(JSON.stringify(result.content)).toContain('401');
            expect(api).toHaveBeenCalledOnce();
            expect(new Headers(api.mock.calls[0][1]?.headers).get('authorization')).toBe(
                authorization ?? null,
            );
        },
    );

    it('rejects a scope mismatch without calling DataLens', async () => {
        const {connect, api} = await startTestServer();
        const client = await connect(era, 'OAuth alice');

        const result = await client.callTool({
            name: 'invoke_read_command',
            arguments: {command_name: 'privileged'},
        });

        expect(result.isError).toBe(true);
        expect(api).not.toHaveBeenCalled();
    });
});

describe('HTTP routing', () => {
    it('serves the health check', async () => {
        const {url} = await startTestServer();
        const response = await nativeFetch(new URL('/ping', url));
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('OK');
    });

    it.each([
        {path: '/other', method: 'GET'},
        {path: '/ping', method: 'POST'},
    ])('returns 404 for $method $path', async ({path, method}) => {
        const {url} = await startTestServer();
        const response = await nativeFetch(new URL(path, url), {method});
        expect(response.status).toBe(404);
        await response.body?.cancel();
    });

    it.each([
        ['Host', 'mcp.example.com'],
        ['Origin', 'https://client.example.com'],
    ])('accepts %s: %s', async (name, value) => {
        const {post} = await startTestServer();
        const response = await post(listToolsBody, {[name]: value});
        expect(response.status).toBe(200);
        await response.body?.cancel();
    });
});

describe('HTTP request bodies', () => {
    it('rejects bodies over 4 MiB', async () => {
        const {post, api} = await startTestServer();
        const response = await post('x'.repeat(4 * 1024 * 1024 + 1));
        expect(response.status).toBe(413);
        expect(api).not.toHaveBeenCalled();
        await response.body?.cancel();
    });

    it('accepts parsed JSON above the default Express limit of 100 KiB', async () => {
        const {post} = await startTestServer();
        const response = await post(
            JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {
                    _meta: {
                        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                        'io.modelcontextprotocol/clientCapabilities': {},
                        padding: 'x'.repeat(128 * 1024),
                    },
                },
            }),
            {'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/list'},
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toContain('invoke_read_command');
    });

    it('returns a request ID without echoing malformed JSON', async () => {
        const {post, api} = await startTestServer();
        const response = await post('{"secret": "caller-secret",');
        expect(response.status).toBe(400);
        expect(await response.text()).toBe('');
        expect(response.headers.get('x-request-id')).toBeTruthy();
        expect(api).not.toHaveBeenCalled();
    });
});

describe('HTTP installation', () => {
    it('rejects cloud mode before fetching a schema or credentials', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        try {
            await expect(createHttpApp({...httpConfig, installation: 'cloud'})).rejects.toThrow(
                'internal',
            );
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
