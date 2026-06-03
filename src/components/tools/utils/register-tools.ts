import type {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';

import {TOOL_DEFS, TOOL_NAME} from '../constants';
import type {CollectedTool} from '../types';

type ToolResult = {content: {type: 'text'; text: string}[]; isError?: true};
type Args = Record<string, unknown>;

const toToolResult = (data: unknown): ToolResult => ({
    content: [
        {
            type: 'text' as const,
            text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
        },
    ],
});

const toErrorResult = (message: string): ToolResult => ({
    isError: true,
    content: [{type: 'text' as const, text: message}],
});

const handleListCommands = (tools: CollectedTool[]): ToolResult =>
    toToolResult(tools.map(({name, summary}) => ({command_name: name, summary})));

const handleDescribeCommands = (
    args: Args,
    toolsByName: Map<string, CollectedTool>,
): ToolResult => {
    const commandNames = args['command_names'];
    if (!Array.isArray(commandNames)) {
        return toErrorResult('describe_commands requires a command_names array');
    }

    const results = commandNames.map((cmdName) => {
        const tool = toolsByName.get(String(cmdName));
        if (!tool) {
            return {command_name: cmdName, error: `Unknown command: ${cmdName}`};
        }
        return {
            command_name: tool.name,
            description: tool.description,
            inputSchema: tool.rawInputSchema,
        };
    });

    return toToolResult(results);
};

const handleInvokeCommand = async (
    args: Args,
    toolsByName: Map<string, CollectedTool>,
): Promise<ToolResult> => {
    const commandName = args['command_name'];
    if (typeof commandName !== 'string' || !commandName) {
        return toErrorResult('invoke_command requires a command_name string');
    }

    const tool = toolsByName.get(commandName);
    if (!tool) {
        return toErrorResult(`Unknown command: ${commandName}`);
    }

    const parameters = (args['parameters'] ?? {}) as Args;

    try {
        const data = await tool.invoke(parameters);
        return toToolResult(data);
    } catch (err) {
        return toErrorResult(err instanceof Error ? err.message : String(err));
    }
};

const handleCallTool = async (
    name: string,
    args: Args,
    tools: CollectedTool[],
): Promise<ToolResult> => {
    const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

    switch (name) {
        case TOOL_NAME.LIST_COMMANDS:
            return handleListCommands(tools);
        case TOOL_NAME.DESCRIBE_COMMANDS:
            return handleDescribeCommands(args, toolsByName);
        case TOOL_NAME.INVOKE_COMMAND:
            return handleInvokeCommand(args, toolsByName);
        default:
            return toErrorResult(`Unknown tool: ${name}`);
    }
};

export const registerTools = ({server, tools}: {server: Server; tools: CollectedTool[]}): void => {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({tools: TOOL_DEFS}));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const {name, arguments: rawArgs} = request.params;
        const args = (rawArgs ?? {}) as Args;
        return handleCallTool(name, args, tools);
    });
};
