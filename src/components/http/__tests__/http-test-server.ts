import {createServer} from 'http';

import {StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {onTestFinished, vi} from 'vitest';

import {testConfig} from '../../../__tests__/helpers/config';
import {listenHttp} from '../../../__tests__/helpers/http';
import {createClient} from '../../../__tests__/helpers/mcp';
import type {ProtocolEra} from '../../../__tests__/helpers/mcp';
import type {StdioConfig} from '../../stdio/config';
import type {HttpConfig} from '../config';
import {createHttpApp} from '../create-http-app';

export const nativeFetch = globalThis.fetch;

// Server-side credentials must never be used by HTTP clients.
export const httpConfig: HttpConfig & StdioConfig = {
    ...testConfig,
    port: 3000,
    authHeader: 'OAuth server-secret',
    ycIam: {bin: 'must-not-be-executed'},
};

const spec = {
    paths: {
        '/rpc/read': {post: {'x-mcp-scope': 'read'}},
        '/rpc/write': {post: {'x-mcp-scope': 'write'}},
        '/rpc/privileged': {post: {'x-mcp-scope': 'privileged'}},
    },
};

export const startTestServer = async () => {
    const api = vi
        .fn<(url: string, options?: RequestInit) => Promise<Response>>()
        .mockImplementation(async () => Response.json({ok: true}));
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
        if (url === httpConfig.schemaUrl) return Response.json(spec);
        if (!url.startsWith(`${httpConfig.apiUrl}/rpc/`))
            throw new Error(`Unexpected fetch: ${url}`);
        return api(url, options);
    });
    vi.stubGlobal('fetch', fetchMock);
    onTestFinished(() => {
        vi.unstubAllGlobals();
    });
    const app = await createHttpApp(httpConfig);
    const baseUrl = await listenHttp(createServer(app));
    const url = new URL('/mcp', baseUrl);

    const connect = async (era: ProtocolEra, authorization?: string) => {
        const client = createClient(era);
        onTestFinished(() => client.close());
        await client.connect(
            new StreamableHTTPClientTransport(url, {
                fetch: nativeFetch,
                requestInit: {headers: authorization ? {Authorization: authorization} : {}},
            }),
        );
        return client;
    };

    const post = (body: string, headers: Record<string, string> = {}) =>
        nativeFetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                ...headers,
            },
            body,
        });

    return {url, api, fetchMock, connect, post};
};
