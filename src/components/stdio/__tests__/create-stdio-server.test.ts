import {InMemoryTransport} from '@modelcontextprotocol/client';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {afterEach, beforeEach, describe, expect, it, onTestFinished, vi} from 'vitest';

import {createClient} from '../../../__tests__/helpers/mcp';
import type {ProtocolEra} from '../../../__tests__/helpers/mcp';
import {getPackageVersion} from '../../../utils';
import {INSTALLATION} from '../../config';
import {createStdioServer} from '../create-stdio-server';

const {loadStdioConfigMock} = vi.hoisted(() => ({loadStdioConfigMock: vi.fn()}));

vi.mock('../config', () => ({loadStdioConfig: loadStdioConfigMock}));
vi.mock('../auth', () => ({createAuthProvider: async () => ({getAuthHeader: () => undefined})}));
vi.mock('../../openapi', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../openapi')>()),
    fetchOpenAPISpec: async () => ({paths: {'/rpc/test': {post: {'x-mcp-scope': 'read'}}}}),
}));

const mockPendingUpdate = () => {
    const fetch = vi.fn(
        (_url: string, {signal}: {signal: AbortSignal}) =>
            new Promise<Response>((_resolve, reject) => {
                signal.addEventListener('abort', () =>
                    reject(new DOMException('Aborted', 'AbortError')),
                );
            }),
    );
    vi.stubGlobal('fetch', fetch);
    return fetch;
};

const connect = async (era: ProtocolEra) => {
    const client = createClient(era);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = serveStdio(createStdioServer, {transport: serverTransport});
    onTestFinished(async () => {
        await client.close();
        await handle.close();
    });
    await client.connect(clientTransport);
    return {client, handle};
};

describe('stdio update checks', () => {
    beforeEach(() => {
        loadStdioConfigMock.mockReturnValue({
            installation: INSTALLATION.CLOUD,
            maxResponseChars: 1000,
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('starts the check when the server is created, before a handshake', async () => {
        const fetch = mockPendingUpdate();
        const server = await createStdioServer();
        onTestFinished(() => server.close());
        const [, transport] = InMemoryTransport.createLinkedPair();
        await server.connect(transport);

        expect(fetch).toHaveBeenCalledOnce();
        const signal = fetch.mock.calls[0][1].signal;
        expect(signal.aborted).toBe(false);
        await server.close();
        expect(signal.aborted).toBe(true);
    });

    describe.each(['legacy', 'modern'] as const)('%s client', (era) => {
        it('does not contact npm or emit update notices for Enterprise', async () => {
            loadStdioConfigMock.mockReturnValue({
                installation: INSTALLATION.ENTERPRISE,
                maxResponseChars: 1000,
            });
            const fetch = vi.fn().mockResolvedValue(new Response('{"version":"999.0.0"}'));
            vi.stubGlobal('fetch', fetch);
            const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
            onTestFinished(() => errorLog.mockRestore());

            const {client} = await connect(era);
            const result = await client.callTool({name: 'list_commands'});

            expect(result.isError).not.toBe(true);
            expect(result.content).toHaveLength(1);
            expect(fetch).not.toHaveBeenCalled();
            expect(errorLog).not.toHaveBeenCalled();
        });

        it('aborts a slow update check after two seconds and keeps serving tools', async () => {
            vi.useFakeTimers();
            const fetch = mockPendingUpdate();
            const {client} = await connect(era);
            expect(client.getProtocolEra()).toBe(era);
            expect(client.getServerVersion()?.version).toBe(getPackageVersion());
            expect(fetch).toHaveBeenCalledOnce();
            const signal = fetch.mock.calls[0][1].signal;
            expect(signal.aborted).toBe(false);

            await vi.advanceTimersByTimeAsync(2000);

            expect(signal.aborted).toBe(true);
            expect((await client.callTool({name: 'list_commands'})).isError).not.toBe(true);
            expect(fetch).toHaveBeenCalledOnce();
        });

        it('aborts the update check when the connection closes', async () => {
            const fetch = mockPendingUpdate();
            const {handle} = await connect(era);
            const signal = fetch.mock.calls[0][1].signal;
            expect(signal.aborted).toBe(false);

            await handle.close();

            expect(signal.aborted).toBe(true);
        });
    });
});
