import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createApp} from './app';
import {INSTALLATION} from './components/config';
import {getPackageVersion} from './utils';

const {loadConfigMock} = vi.hoisted(() => ({loadConfigMock: vi.fn()}));

vi.mock('./components/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./components/config')>()),
    loadConfig: loadConfigMock,
}));
vi.mock('./components/auth', () => ({
    createAuthProvider: async () => ({getAuthHeader: () => undefined}),
}));
vi.mock('./components/openapi', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./components/openapi')>()),
    fetchOpenAPISpec: async () => ({paths: {'/rpc/test': {post: {'x-mcp-scope': 'read'}}}}),
}));

describe('createApp update check', () => {
    beforeEach(() => {
        loadConfigMock.mockReturnValue({installation: INSTALLATION.CLOUD, maxResponseChars: 1000});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it.each([INSTALLATION.CLOUD, INSTALLATION.INTERNAL])(
        'checks updates without blocking commands on %s and aborts on timeout or close',
        async (installation) => {
            loadConfigMock.mockReturnValue({installation, maxResponseChars: 1000});
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
        },
    );

    it('does not contact npm or emit update notices for Enterprise', async () => {
        loadConfigMock.mockReturnValue({
            installation: INSTALLATION.ENTERPRISE,
            maxResponseChars: 1000,
        });
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"version":"999.0.0"}'));
        vi.stubGlobal('fetch', fetchMock);
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        const server = await createApp();
        const client = new Client({name: 'test', version: '1'});
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        try {
            await client.connect(clientTransport);
            const result = await client.callTool({name: 'list_commands'});
            expect(result.isError).not.toBe(true);
            expect(result.content).toHaveLength(1);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(errorLog).not.toHaveBeenCalled();
        } finally {
            await client.close();
            await server.close();
        }
    });
});
