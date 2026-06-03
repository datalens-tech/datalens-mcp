import type {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';

import {TOOL_DEFS, TOOL_NAME} from '../constants';
import type {CollectedTool} from '../types';

const toToolResult = (data: unknown) => ({
    content: [
        {
            type: 'text' as const,
            text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
        },
    ],
});

const toErrorResult = (message: string) => ({
    isError: true,
    content: [{type: 'text' as const, text: message}],
});

export const registerTools = ({server, tools}: {server: Server; tools: CollectedTool[]}): void => {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: TOOL_DEFS,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

        const {name, arguments: rawArgs} = request.params;
        const args = (rawArgs ?? {}) as Record<string, unknown>;

        switch (name) {
            case TOOL_NAME.LIST_COMMANDS: {
                return toToolResult(
                    tools.map(({name: commandName, summary}) => ({
                        command_name: commandName,
                        summary,
                    })),
                );
            }

            case TOOL_NAME.DESCRIBE_COMMANDS: {
                const commandNames = args['command_names'];
                if (!Array.isArray(commandNames)) {
                    return toErrorResult('describe_commands requires a command_names array');
                }
                const results = commandNames.map((cmdName) => {
                    const tool = toolsByName.get(String(cmdName));
                    if (!tool) {
                        return {
                            command_name: cmdName,
                            error: `Unknown command: ${cmdName}`,
                        };
                    }
                    return {
                        command_name: tool.name,
                        description: tool.description,
                        inputSchema: tool.rawInputSchema,
                    };
                });
                return toToolResult(results);
            }

            case TOOL_NAME.INVOKE_COMMAND: {
                const commandName = args['command_name'];
                if (typeof commandName !== 'string' || !commandName) {
                    return toErrorResult('invoke_command requires a command_name string');
                }

                const tool = toolsByName.get(commandName);
                if (!tool) {
                    return toErrorResult(`Unknown command: ${commandName}`);
                }

                const parameters = (args['parameters'] ?? {}) as Record<string, unknown>;

                try {
                    const data = await tool.invoke(parameters);
                    return toToolResult(data);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    return toErrorResult(message);
                }
            }

            default:
                return toErrorResult(`Unknown tool: ${name}`);
        }
    });
};
