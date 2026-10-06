import {InMemoryTransport} from '@modelcontextprotocol/client';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {afterEach, describe, expect, it, onTestFinished, vi} from 'vitest';

import {createClient} from '../../../__tests__/helpers/mcp';
import type {ProtocolEra} from '../../../__tests__/helpers/mcp';
import {getPackageVersion} from '../../../utils';
import {createStdioServer} from '../create-stdio-server';

vi.mock('../config', () => ({loadStdioConfig: () => ({maxResponseChars: 1000})}));
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
