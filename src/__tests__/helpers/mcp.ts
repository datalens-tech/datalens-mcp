import {Client, InMemoryTransport} from '@modelcontextprotocol/client';
import type {Server} from '@modelcontextprotocol/server';
import {onTestFinished} from 'vitest';

export type ProtocolEra = 'legacy' | 'modern';

export const createClient = (era: ProtocolEra = 'modern') =>
    new Client(
        {name: 'test-client', version: '1'},
        {versionNegotiation: {mode: era === 'modern' ? {pin: '2026-07-28'} : 'legacy'}},
    );

export const connectInMemory = async (server: Server) => {
    const client = createClient('legacy');
    onTestFinished(async () => {
        await client.close();
        await server.close();
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return client;
};

export const readToolText = (result: Awaited<ReturnType<Client['callTool']>>) => {
    const block = result.content[0];
    if (block?.type !== 'text') throw new Error('Expected a text tool result');
    return block.text;
};

export const readToolJson = (result: Awaited<ReturnType<Client['callTool']>>) =>
    JSON.parse(readToolText(result));
