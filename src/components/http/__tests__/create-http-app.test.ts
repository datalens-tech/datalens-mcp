import {once} from 'events';
import {request} from 'http';
import type {Server} from 'http';
import type {AddressInfo} from 'net';

import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {StdioConfig} from '../../stdio/config';
import type {HttpConfig} from '../config';
import {createHttpApp} from '../create-http-app';

const nativeFetch = globalThis.fetch;
const config: StdioConfig = {
    installation: 'internal',
    apiUrl: 'https://api.example.com',
    schemaUrl: 'https://api.example.com/json/',
    apiVersion: 'latest',
    maxResponseChars: 1000,
    // Even explicitly configured server credentials must never be used over HTTP.
    authHeader: 'OAuth server-secret',
    ycIam: {bin: 'must-not-be-executed'},
};
const httpConfig: HttpConfig = {
    ...config,
    port: 3000,
};
const spec = {
    paths: Object.fromEntries(
        ['read', 'write', 'privileged'].map((scope) => [
            `/rpc/${scope}`,
            {post: {'x-mcp-scope': scope}},
        ]),
    ),
};

const servers: Server[] = [];
const listen = async ({app}: Awaited<ReturnType<typeof createHttpApp>>) => {
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await once(server, 'listening');
    return new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
};

const makeClient = (url: URL, era: 'legacy' | 'modern', authorization?: string) => {
    const client = new Client(
        {name: 'http-test', version: '1'},
        {versionNegotiation: {mode: era === 'modern' ? {pin: '2026-07-28'} : 'legacy'}},
    );
    const transport = new StreamableHTTPClientTransport(url, {
        fetch: nativeFetch,
        requestInit: {headers: authorization ? {Authorization: authorization} : {}},
    });
    return {client, transport};
};

describe('HTTP server', () => {
    afterEach(async () => {
        vi.unstubAllGlobals();
        await Promise.all(
            servers.splice(0).map(
                (server) =>
                    new Promise<void>((resolve) => {
                        server.close(() => resolve());
                        server.closeAllConnections();
                    }),
            ),
        );
    });

    it.each(['legacy', 'modern'] as const)(
        'isolates credentials, leaves auth to DataLens and loads the catalog once (%s)',
        async (era) => {
            const apiHeaders: (string | null)[] = [];
            let releaseFirst: (() => void) | undefined;
            const firstArrived = new Promise<void>((resolve) => {
                releaseFirst = resolve;
            });
            let releaseSecond: (() => void) | undefined;
            const secondArrived = new Promise<void>((resolve) => {
                releaseSecond = resolve;
            });
            const upstream = vi.fn(async (url: string, options?: RequestInit) => {
                if (url === config.schemaUrl) return Response.json(spec);
                // Unexpected npm checks also fail this assertion.
                expect(url).toMatch(/^https:\/\/api\.example\.com\/rpc\//);
                const auth = new Headers(options?.headers).get('authorization');
                apiHeaders.push(auth);
                if (!auth || auth === 'OAuth expired') {
                    return Response.json({code: 'UNAUTHORIZED'}, {status: 401});
                }
                if (apiHeaders.length === 1) {
                    releaseFirst?.();
                    await secondArrived;
                } else if (apiHeaders.length === 2) {
                    await firstArrived;
                    releaseSecond?.();
                }
                return Response.json({user: auth === 'OAuth alice' ? 'alice' : 'bob'});
            });
            vi.stubGlobal('fetch', upstream);
            const app = await createHttpApp(httpConfig);
            const url = await listen(app);
            const peers = [undefined, 'OAuth alice', 'OAuth bob', 'OAuth expired'].map((auth) =>
                makeClient(url, era, auth),
            );
            try {
                await Promise.all(peers.map(({client, transport}) => client.connect(transport)));
                const [anonymous, alice, bob, expired] = peers.map(({client}) => client);
                expect(alice.getProtocolEra()).toBe(era);
                expect((await anonymous.listTools()).tools).toHaveLength(5);
                for (const name of ['list_commands', 'describe_commands']) {
                    const result = await anonymous.callTool({
                        name,
                        arguments: {command_names: ['read']},
                    });
                    expect(result.isError).not.toBe(true);
                    expect(result.content).toHaveLength(1);
                }
                expect(apiHeaders).toHaveLength(0);
                for (const scope of ['read', 'write', 'privileged']) {
                    const results = await Promise.all(
                        [alice, bob].map((client) =>
                            client.callTool({
                                name: `invoke_${scope}_command`,
                                arguments: {command_name: scope},
                            }),
                        ),
                    );
                    results.forEach((result, i) => {
                        expect(result.isError).not.toBe(true);
                        expect(result.content).toHaveLength(1);
                        const block = result.content[0];
                        if (block.type !== 'text') throw new Error('Expected text');
                        expect(JSON.parse(JSON.parse(block.text).data)).toEqual({
                            user: i === 0 ? 'alice' : 'bob',
                        });
                    });
                }
                for (const client of [anonymous, expired]) {
                    const result = await client.callTool({
                        name: 'invoke_read_command',
                        arguments: {command_name: 'read'},
                    });
                    expect(result.isError).toBe(true);
                    expect(JSON.stringify(result.content)).toContain('401');
                }
                expect(apiHeaders).toEqual([
                    'OAuth alice',
                    'OAuth bob',
                    'OAuth alice',
                    'OAuth bob',
                    'OAuth alice',
                    'OAuth bob',
                    null,
                    'OAuth expired',
                ]);
                const calls = upstream.mock.calls.length;
                const denied = await alice.callTool({
                    name: 'invoke_read_command',
                    arguments: {command_name: 'privileged'},
                });
                expect(denied.isError).toBe(true);
                expect(upstream).toHaveBeenCalledTimes(calls);
                expect(
                    upstream.mock.calls.filter(([target]) => target === config.schemaUrl),
                ).toHaveLength(1);
                expect(
                    upstream.mock.calls.every(([target]) => target.startsWith(config.apiUrl)),
                ).toBe(true);
            } finally {
                await Promise.all(peers.map(({client}) => client.close()));
                await app.closeMcp();
            }
        },
    );

    it('accepts arbitrary hosts and origins, serves health checks and enforces routing and body limits', async () => {
        const upstream = vi.fn(async () => Response.json(spec));
        vi.stubGlobal('fetch', upstream);
        const app = await createHttpApp(httpConfig);
        const url = await listen(app);
        try {
            const response = await nativeFetch(new URL('/ping', url));
            expect(response.status).toBe(200);
            expect(await response.text()).toBe('OK');
            expect((await nativeFetch(new URL('/other', url))).status).toBe(404);
            expect((await nativeFetch(new URL('/ping', url), {method: 'POST'})).status).toBe(404);
            for (const headers of [
                {Host: 'mcp.example.com'},
                {Origin: 'https://client.example.com'},
            ]) {
                const status = await new Promise<number | undefined>((resolve, reject) => {
                    const req = request(
                        url,
                        {
                            method: 'POST',
                            headers: {
                                ...headers,
                                'content-type': 'application/json',
                                accept: 'application/json, text/event-stream',
                            },
                        },
                        (response) => {
                            response.resume();
                            response.on('end', () => resolve(response.statusCode));
                        },
                    );
                    req.on('error', reject);
                    req.end(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'}));
                });
                expect(status).toBe(200);
            }
            const oversized = await new Promise<number | undefined>((resolve, reject) => {
                const req = request(
                    url,
                    {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            'content-length': 4 * 1024 * 1024 + 1,
                        },
                    },
                    (response) => {
                        response.resume();
                        response.on('end', () => resolve(response.statusCode));
                    },
                );
                req.on('error', reject);
                req.end('x'.repeat(4 * 1024 * 1024 + 1));
            });
            expect(oversized).toBe(413);
            expect(upstream).toHaveBeenCalledOnce();
        } finally {
            await app.closeMcp();
        }
    });

    it('handles parsed bodies above 100 KiB and returns no caller data for malformed JSON', async () => {
        const upstream = vi.fn(async () => Response.json(spec));
        vi.stubGlobal('fetch', upstream);
        const app = await createHttpApp(httpConfig);
        const url = await listen(app);
        const headers = {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            'mcp-protocol-version': '2026-07-28',
            'mcp-method': 'tools/list',
        };
        try {
            const response = await nativeFetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
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
            });
            const body = await response.text();
            expect(response.status, body).toBe(200);
            expect(body).toContain('invoke_read_command');
            const malformed = await nativeFetch(url, {
                method: 'POST',
                headers,
                body: '{"secret": "caller-secret",',
            });
            expect(malformed.status).toBe(400);
            expect(await malformed.text()).toBe('');
            expect(malformed.headers.get('x-request-id')).toBeTruthy();
            expect(upstream).toHaveBeenCalledOnce();
        } finally {
            await app.closeMcp();
        }
    });

    it('rejects cloud mode before fetching a schema or credentials', async () => {
        const upstream = vi.fn();
        vi.stubGlobal('fetch', upstream);
        await expect(createHttpApp({...httpConfig, installation: 'cloud'})).rejects.toThrow(
            'internal',
        );
        expect(upstream).not.toHaveBeenCalled();
    });
});
