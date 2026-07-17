import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {GatewayError} from '../../../utils';
import type {AppConfig, WriteMode} from '../../config';
import type {CollectedTool, CommandAccess} from '../types';

import {registerTools} from './register-tools';

const baseConfig: AppConfig = {
    apiUrl: 'http://localhost:8080',
    installation: 'internal',
    schemaUrl: 'http://localhost:8080/json/',
    apiVersion: 'latest',
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

const makeTool = ({
    name,
    access,
    destructive = false,
    result = {ok: true},
}: {
    name: string;
    access: CommandAccess;
    destructive?: boolean;
    result?: unknown;
}): CollectedTool => ({
    name,
    path: `/rpc/${name}`,
    summary: `Summary ${name}`,
    description: `Description ${name}`,
    deprecated: false,
    policy: {access, destructive, idempotent: access === 'read'},
    rawInputSchema: {type: 'object', properties: {}},
    validateParameters: vi.fn(),
    invoke: vi.fn().mockResolvedValue(result),
});

const getText = (result: Awaited<ReturnType<Client['callTool']>>): string => {
    const content = Array.isArray(result.content) ? result.content[0] : undefined;
    if (
        !content ||
        typeof content !== 'object' ||
        content.type !== 'text' ||
        typeof content.text !== 'string'
    ) {
        throw new Error('Expected text tool content');
    }
    return content.text;
};

const getJson = (
    result: Awaited<ReturnType<Client['callTool']>>,
): Record<string, unknown> | unknown[] =>
    JSON.parse(getText(result)) as Record<string, unknown> | unknown[];

const connections: {client: Client; server: Server}[] = [];

const connect = async (tools: CollectedTool[], config: AppConfig = baseConfig) => {
    const server = new Server({name: 'test-server', version: '1.0.0'}, {capabilities: {tools: {}}});
    registerTools({server, tools, config});
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({name: 'test-client', version: '1.0.0'});
    await client.connect(clientTransport);
    connections.push({client, server});
    return client;
};

afterEach(async () => {
    vi.restoreAllMocks();
    while (connections.length > 0) {
        const connection = connections.pop();
        await connection?.client.close();
        await connection?.server.close();
    }
});

describe('registerTools', () => {
    it.each([
        ['planned', 6, true],
        ['direct', 4, false],
        ['disabled', 4, true],
    ] as [WriteMode, number, boolean][])(
        'publishes the tools for %s mode',
        async (mode, count, invokeReadOnly) => {
            const client = await connect([], {...baseConfig, writeMode: mode});

            const {tools} = await client.listTools();

            expect(tools).toHaveLength(count);
            expect(tools.map(({name}) => name)).toContain('read_result');
            expect(tools.map(({name}) => name).includes('plan_command')).toBe(mode === 'planned');
            expect(
                tools.find(({name}) => name === 'invoke_command')?.annotations?.readOnlyHint,
            ).toBe(invokeReadOnly);
        },
    );

    it('enriches list and describe responses with policy metadata', async () => {
        const client = await connect([
            makeTool({name: 'getThing', access: 'read'}),
            makeTool({name: 'updateThing', access: 'write'}),
        ]);

        const listed = getJson(await client.callTool({name: 'list_commands', arguments: {}}));
        expect(listed).toEqual([
            expect.objectContaining({
                command_name: 'getThing',
                access: 'read',
                execution: 'direct',
                available: true,
            }),
            expect.objectContaining({
                command_name: 'updateThing',
                access: 'write',
                execution: 'planned',
                requires_confirmation: true,
            }),
        ]);

        const described = getJson(
            await client.callTool({
                name: 'describe_commands',
                arguments: {command_names: ['updateThing']},
            }),
        );
        expect(described).toEqual([
            expect.objectContaining({
                command_name: 'updateThing',
                inputSchema: expect.any(Object),
                access: 'write',
            }),
        ]);
    });

    it('executes reads directly and requires a plan for writes in planned mode', async () => {
        const read = makeTool({name: 'getThing', access: 'read', result: {value: 1}});
        const write = makeTool({name: 'updateThing', access: 'write', result: {updated: true}});
        const client = await connect([read, write]);

        const readResult = await client.callTool({
            name: 'invoke_command',
            arguments: {command_name: 'getThing', parameters: {id: '1'}},
        });
        expect(getJson(readResult)).toEqual({value: 1});
        expect(read.invoke).toHaveBeenCalledWith({id: '1'});

        const directWrite = await client.callTool({
            name: 'invoke_command',
            arguments: {command_name: 'updateThing', parameters: {id: '1'}},
        });
        expect(directWrite.isError).toBe(true);
        expect(getText(directWrite)).toContain('WRITE_REQUIRES_PLAN');
        expect(write.invoke).not.toHaveBeenCalled();
    });

    it('stores immutable, redacted, one-time write plans', async () => {
        const write = makeTool({name: 'updateThing', access: 'write', result: {updated: true}});
        const client = await connect([write]);
        const parameters = {id: '1', password: 'do-not-show'};

        const planned = getJson(
            await client.callTool({
                name: 'plan_command',
                arguments: {command_name: 'updateThing', parameters},
            }),
        ) as Record<string, unknown>;
        expect(planned.parameters).toEqual({id: '1', password: '[REDACTED]'});
        const planId = planned.plan_id as string;

        parameters.id = 'changed-after-plan';
        const executed = await client.callTool({
            name: 'execute_plan',
            arguments: {plan_id: planId},
        });
        expect(getJson(executed)).toEqual({updated: true});
        expect(write.invoke).toHaveBeenCalledWith({id: '1', password: 'do-not-show'});

        const repeated = await client.callTool({
            name: 'execute_plan',
            arguments: {plan_id: planId},
        });
        expect(repeated.isError).toBe(true);
        expect(getText(repeated)).toContain('PLAN_NOT_FOUND');
        expect(write.invoke).toHaveBeenCalledTimes(1);
    });

    it('does not allow execute_plan to override planned parameters', async () => {
        const write = makeTool({name: 'updateThing', access: 'write'});
        const client = await connect([write]);
        const planned = getJson(
            await client.callTool({
                name: 'plan_command',
                arguments: {command_name: 'updateThing', parameters: {id: 'original'}},
            }),
        ) as Record<string, unknown>;

        const result = await client.callTool({
            name: 'execute_plan',
            arguments: {plan_id: planned.plan_id, parameters: {id: 'replacement'}},
        });

        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('UNEXPECTED_EXECUTE_PLAN_ARGUMENTS');
        expect(write.invoke).not.toHaveBeenCalled();
    });

    it('consumes an expired plan without executing it', async () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const write = makeTool({name: 'updateThing', access: 'write'});
        const client = await connect([write], {...baseConfig, planTtlMs: 10});
        const planned = getJson(
            await client.callTool({
                name: 'plan_command',
                arguments: {command_name: 'updateThing'},
            }),
        ) as Record<string, unknown>;

        now.mockReturnValue(1_011);
        const result = await client.callTool({
            name: 'execute_plan',
            arguments: {plan_id: planned.plan_id},
        });

        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('PLAN_EXPIRED');
        expect(write.invoke).not.toHaveBeenCalled();
    });

    it('blocks destructive plans unless they are enabled server-side', async () => {
        const destructive = makeTool({name: 'deleteThing', access: 'write', destructive: true});
        const client = await connect([destructive]);

        const result = await client.callTool({
            name: 'plan_command',
            arguments: {command_name: 'deleteThing'},
        });

        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('DESTRUCTIVE_COMMAND_DISABLED');
    });

    it('preserves legacy direct writes and blocks all writes in disabled mode', async () => {
        const directWrite = makeTool({name: 'updateThing', access: 'write'});
        const directClient = await connect([directWrite], {...baseConfig, writeMode: 'direct'});
        const directResult = await directClient.callTool({
            name: 'invoke_command',
            arguments: {command_name: 'updateThing'},
        });
        expect(directResult.isError).not.toBe(true);
        expect(directWrite.invoke).toHaveBeenCalledOnce();

        const disabledWrite = makeTool({name: 'updateThing', access: 'unknown'});
        const disabledClient = await connect([disabledWrite], {
            ...baseConfig,
            writeMode: 'disabled',
        });
        const disabledResult = await disabledClient.callTool({
            name: 'invoke_command',
            arguments: {command_name: 'updateThing'},
        });
        expect(disabledResult.isError).toBe(true);
        expect(getText(disabledResult)).toContain('WRITES_DISABLED');
        expect(disabledWrite.invoke).not.toHaveBeenCalled();
    });

    it('stores and reconstructs a large command result', async () => {
        const read = makeTool({name: 'getLarge', access: 'read', result: 'abcdefghij'});
        const client = await connect([read], {
            ...baseConfig,
            maxResponseChars: 5,
            resultMaxBytes: 100,
            resultStoreMaxBytes: 1_000,
        });

        const invoked = getJson(
            await client.callTool({
                name: 'invoke_command',
                arguments: {command_name: 'getLarge'},
            }),
        ) as Record<string, unknown>;
        expect(invoked).toEqual(
            expect.objectContaining({
                type: 'stored_result',
                preview: 'abcde',
                total_chars: 10,
                next_offset: 5,
            }),
        );

        const chunk = getJson(
            await client.callTool({
                name: 'read_result',
                arguments: {result_id: invoked.result_id, offset: 5, limit: 100},
            }),
        );
        expect(chunk).toEqual(
            expect.objectContaining({text: 'fghij', offset: 5, next_offset: 10, done: true}),
        );
    });

    it('returns structured, redacted MCP errors', async () => {
        const read = makeTool({name: 'getThing', access: 'read'});
        vi.mocked(read.invoke).mockRejectedValue(
            new GatewayError('API failed with Bearer visible-secret', {
                kind: 'api',
                code: 'API_ERROR',
                details: {password: 'hidden-secret'},
            }),
        );
        const client = await connect([read]);

        const result = await client.callTool({
            name: 'invoke_command',
            arguments: {command_name: 'getThing'},
        });
        const text = getText(result);

        expect(result.isError).toBe(true);
        expect(JSON.parse(text)).toEqual({
            ok: false,
            error: expect.objectContaining({code: 'API_ERROR', kind: 'api', retryable: false}),
        });
        expect(text).not.toContain('visible-secret');
        expect(text).not.toContain('hidden-secret');
    });
});
