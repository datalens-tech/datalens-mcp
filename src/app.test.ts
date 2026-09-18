import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {createApp} from './app';
import {getPackageVersion} from './utils';

vi.mock('./components/config', () => ({loadConfig: () => ({maxResponseChars: 1000})}));
vi.mock('./components/auth', () => ({
    createAuthProvider: async () => ({getAuthHeader: () => undefined}),
}));
vi.mock('./components/openapi', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./components/openapi')>()),
    fetchOpenAPISpec: async () => ({paths: {'/rpc/test': {post: {'x-mcp-scope': 'read'}}}}),
}));

describe('createApp update check', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('does not block commands on registry stalls and aborts the check on timeout or close', async () => {
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
            const server = await createApp();
            expect(fetchMock).not.toHaveBeenCalled();
            const client = new Client({name: 'test', version: '1'});
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            await server.connect(serverTransport);
            await client.connect(clientTransport);
            try {
                expect(client.getServerVersion()?.version).toBe(getPackageVersion());
                const result = await client.callTool({name: 'list_commands'});
                expect(result.isError).not.toBe(true);
                expect(fetchMock).toHaveBeenCalledOnce();
                expect(signal?.aborted).toBe(false);
                if (finish === 'timeout') await vi.advanceTimersByTimeAsync(2000);
                else await server.close();
                expect(signal?.aborted).toBe(true);
                if (finish === 'timeout') {
                    const retry = await client.callTool({name: 'list_commands'});
                    expect(retry.isError).not.toBe(true);
                    expect(fetchMock).toHaveBeenCalledOnce();
                }
            } finally {
                await client.close();
                await server.close();
            }
        }
    });
});
