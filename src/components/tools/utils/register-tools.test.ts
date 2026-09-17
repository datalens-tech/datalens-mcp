import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {describe, expect, it, vi} from 'vitest';

import {INVOKE_TOOL_BY_SCOPE} from '../constants';
import type {CollectedTool} from '../types';

import {registerTools} from './register-tools';

describe('registerTools', () => {
    it('enforces the scope boundary for every invocation tool and exposes routing metadata', async () => {
        const client = new Client({name: 'test', version: '1'});
        const server = new Server({name: 'test', version: '1'}, {capabilities: {tools: {}}});
        const commands: CollectedTool[] = (['read', 'write', 'privileged'] as const).map(
            (scope) => ({
                name: scope,
                scope,
                summary: scope,
                description: scope,
                rawInputSchema: {type: 'object'},
                invoke: vi.fn(async (args) => args),
            }),
        );
        let updateNotice: string | undefined;
        registerTools({
            server,
            tools: commands,
            maxResponseChars: 1000,
            getUpdateNotice: () => updateNotice,
        });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const readResult = (result: Awaited<ReturnType<Client['callTool']>>) =>
            JSON.parse((result.content as {text: string}[])[0].text);
        try {
            const {tools} = await client.listTools();
            expect(tools.map(({name}) => name)).toEqual([
                'list_commands',
                'describe_commands',
                ...Object.values(INVOKE_TOOL_BY_SCOPE),
            ]);
            for (const command of commands) {
                const tool = tools.find(({name}) => name === INVOKE_TOOL_BY_SCOPE[command.scope]);
                expect(tool?.annotations?.readOnlyHint).toBe(command.scope === 'read');
                expect(tool?.annotations?.destructiveHint).toBe(command.scope !== 'read');
                for (const [scope, name] of Object.entries(INVOKE_TOOL_BY_SCOPE)) {
                    vi.mocked(command.invoke).mockClear();
                    const result = await client.callTool({
                        name,
                        arguments: {command_name: command.name, parameters: {id: 'test'}},
                    });
                    if (scope === command.scope) {
                        expect(result.isError).not.toBe(true);
                        expect(readResult(result)).toEqual({id: 'test'});
                        expect(command.invoke).toHaveBeenCalledExactlyOnceWith({id: 'test'});
                    } else {
                        expect(result.isError).toBe(true);
                        expect(command.invoke).not.toHaveBeenCalled();
                    }
                }
            }
            for (const command of commands) vi.mocked(command.invoke).mockClear();
            const legacyResult = await client.callTool({
                name: 'invoke_command',
                arguments: {command_name: 'privileged'},
            });
            expect(legacyResult.isError).toBe(true);
            for (const command of commands) expect(command.invoke).not.toHaveBeenCalled();

            const listed = readResult(await client.callTool({name: 'list_commands'}));
            const described = readResult(
                await client.callTool({
                    name: 'describe_commands',
                    arguments: {command_names: commands.map(({name}) => name)},
                }),
            );
            for (const results of [listed, described]) {
                expect(
                    results.map(
                        ({
                            command_name: commandName,
                            scope,
                            invoke_tool: invokeTool,
                        }: Record<string, string>) => ({
                            command_name: commandName,
                            scope,
                            invoke_tool: invokeTool,
                        }),
                    ),
                ).toEqual(
                    commands.map(({name, scope}) => ({
                        command_name: name,
                        scope,
                        invoke_tool: INVOKE_TOOL_BY_SCOPE[scope],
                    })),
                );
            }
            updateNotice = 'An update is available';
            const withNotice = await client.callTool({
                name: 'invoke_read_command',
                arguments: {command_name: 'read', parameters: {id: 'test'}},
            });
            expect(readResult(withNotice)).toEqual({id: 'test'});
            expect(withNotice.content).toEqual([
                {type: 'text', text: JSON.stringify({id: 'test'})},
                {type: 'text', text: updateNotice},
            ]);
        } finally {
            await client.close();
            await server.close();
        }
    });
});
