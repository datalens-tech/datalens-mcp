import {Client, InMemoryTransport} from '@modelcontextprotocol/client';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {getPackageVersion} from '../../../utils';
import {createStdioServer} from '../create-stdio-server';

vi.mock('../config', () => ({loadStdioConfig: () => ({maxResponseChars: 1000})}));
vi.mock('../auth', () => ({
    createAuthProvider: async () => ({getAuthHeader: () => undefined}),
}));
vi.mock('../../openapi', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../openapi')>()),
    fetchOpenAPISpec: async () => ({paths: {'/rpc/test': {post: {'x-mcp-scope': 'read'}}}}),
}));

describe('createStdioServer update check', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('starts the update check before any client handshake and aborts it on close', async () => {
        let signal: AbortSignal | undefined;
        const fetchMock = vi.fn((_url, options: {signal: AbortSignal}) => {
            signal = options.signal;
            return new Promise<Response>((_resolve, reject) => {
                options.signal.addEventListener('abort', () =>
                    reject(new DOMException('Aborted', 'AbortError')),
                );
            });
        });
        vi.stubGlobal('fetch', fetchMock);
        const server = await createStdioServer();
        const [, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        try {
            expect(fetchMock).toHaveBeenCalledOnce();
            expect(signal?.aborted).toBe(false);
        } finally {
            await server.close();
        }
        expect(signal?.aborted).toBe(true);
    });

    it.each(['legacy', 'modern'] as const)(
        'bounds update checks on %s connections',
        async (era) => {
            vi.useFakeTimers();
            for (const finish of ['timeout', 'close']) {
                let signal: AbortSignal | undefined;
                const fetchMock = vi.fn((_url, options: {signal: AbortSignal}) => {
                    signal = options.signal;
                    return new Promise<Response>((_resolve, reject) => {
                        options.signal.addEventListener('abort', () =>
                            reject(new DOMException('Aborted', 'AbortError')),
                        );
                    });
                });
                vi.stubGlobal('fetch', fetchMock);
                const client = new Client(
                    {name: 'test', version: '1'},
                    {versionNegotiation: {mode: era === 'modern' ? {pin: '2026-07-28'} : 'legacy'}},
                );
                const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
                const handle = serveStdio(createStdioServer, {transport: serverTransport});
                expect(fetchMock).not.toHaveBeenCalled();
                await client.connect(clientTransport);
                try {
                    expect(client.getProtocolEra()).toBe(era);
                    expect(client.getServerVersion()?.version).toBe(getPackageVersion());
                    const result = await client.callTool({name: 'list_commands'});
                    expect(result.isError).not.toBe(true);
                    expect(fetchMock).toHaveBeenCalledOnce();
                    expect(signal?.aborted).toBe(false);
                    if (finish === 'timeout') await vi.advanceTimersByTimeAsync(2000);
                    else await handle.close();
                    expect(signal?.aborted).toBe(true);
                    if (finish === 'timeout') {
                        const retry = await client.callTool({name: 'list_commands'});
                        expect(retry.isError).not.toBe(true);
                        expect(fetchMock).toHaveBeenCalledOnce();
                    }
                } finally {
                    await client.close();
                    await handle.close();
                }
            }
        },
    );
});
