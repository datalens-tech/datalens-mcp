import type {Server, ServerContext} from '@modelcontextprotocol/server';

import {truncateText} from '../../../utils';
import type {AuthProvider} from '../../auth';
import type {McpScope} from '../../openapi';
import {MCP_SCOPE} from '../../openapi';
import {INVOKE_TOOL_BY_SCOPE, MAX_DESCRIBE_COMMANDS, TOOL_DEFS, TOOL_NAME} from '../constants';
import type {CollectedTool} from '../types';

type ToolResult = {content: {type: 'text'; text: string}[]; isError?: true};
type Args = Record<string, unknown>;

// Compact (no pretty-print) — these payloads are machine-read by the model, so
// indentation only wastes tokens. Optionally cap the size for large API results.
const toToolResult = (data: unknown, maxChars?: number): ToolResult => {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return {content: [{type: 'text' as const, text: truncateText(text, maxChars)}]};
};

const toErrorResult = (message: string): ToolResult => ({
    isError: true,
    content: [{type: 'text' as const, text: message}],
});

const handleListCommands = (tools: CollectedTool[]): ToolResult =>
    toToolResult(
        tools.map(({name, summary, scope}) => ({
            command_name: name,
            summary,
            scope,
            invoke_tool: INVOKE_TOOL_BY_SCOPE[scope],
        })),
    );

const handleDescribeCommands = (
    args: Args,
    toolsByName: Map<string, CollectedTool>,
): ToolResult => {
    const commandNames = args['command_names'];

    if (!Array.isArray(commandNames)) {
        return toErrorResult('describe_commands requires a command_names array');
    }

    if (commandNames.length > MAX_DESCRIBE_COMMANDS) {
        return toErrorResult(
            `describe_commands accepts at most ${MAX_DESCRIBE_COMMANDS} command names`,
        );
    }

    const results = [...new Set(commandNames)].map((cmdName) => {
        const tool = toolsByName.get(String(cmdName));
        if (!tool) {
            return {command_name: cmdName, error: `Unknown command: ${cmdName}`};
        }
        return {
            command_name: tool.name,
            description: tool.description,
            scope: tool.scope,
            invoke_tool: INVOKE_TOOL_BY_SCOPE[tool.scope],
            inputSchema: tool.rawInputSchema,
        };
    });

    return toToolResult(results);
};

const handleInvokeCommand = async ({
    args,
    toolsByName,
    maxResponseChars,
    scope,
    ctx,
    authProvider,
}: {
    args: Args;
    toolsByName: Map<string, CollectedTool>;
    maxResponseChars: number;
    scope: McpScope;
    ctx: ServerContext;
    authProvider?: AuthProvider;
}): Promise<ToolResult> => {
    const commandName = args['command_name'];
    if (typeof commandName !== 'string' || !commandName) {
        return toErrorResult('A scoped invocation requires a command_name string');
    }

    const tool = toolsByName.get(commandName);
    if (!tool) {
        return toErrorResult(`Unknown command: ${commandName}`);
    }

    if (tool.scope !== scope) {
        return toErrorResult(`Command ${commandName} requires ${INVOKE_TOOL_BY_SCOPE[tool.scope]}`);
    }

    const parameters = (args['parameters'] ?? {}) as Args;

    try {
        const authHeader = await authProvider?.getAuthHeader(ctx.http?.req);
        const data = await tool.invoke({args: parameters, authHeader, signal: ctx.mcpReq.signal});
        return toToolResult({
            trust: 'untrusted_data',
            data: truncateText(
                typeof data === 'string' ? data : JSON.stringify(data),
                maxResponseChars,
            ),
        });
    } catch (err) {
        return toErrorResult(
            truncateText(err instanceof Error ? err.message : String(err), maxResponseChars),
        );
    }
};

export const registerTools = ({
    server,
    tools,
    maxResponseChars,
    authProvider,
    getUpdateNotice,
}: {
    server: Server;
    tools: CollectedTool[];
    maxResponseChars: number;
    authProvider?: AuthProvider;
    getUpdateNotice?: () => string | undefined;
}): void => {
    const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

    server.setRequestHandler('tools/list', async () => ({tools: TOOL_DEFS}));

    server.setRequestHandler('tools/call', async (request, ctx) => {
        const {name, arguments: rawArgs} = request.params;
        const args = (rawArgs ?? {}) as Args;

        const invoke = (scope: McpScope) =>
            handleInvokeCommand({args, toolsByName, maxResponseChars, scope, ctx, authProvider});

        const reply = (result: ToolResult): ToolResult => {
            const notice = getUpdateNotice?.();
            if (notice) result.content.push({type: 'text', text: notice});
            return result;
        };

        switch (name) {
            case TOOL_NAME.LIST_COMMANDS:
                return reply(handleListCommands(tools));
            case TOOL_NAME.DESCRIBE_COMMANDS:
                return reply(handleDescribeCommands(args, toolsByName));
            case TOOL_NAME.INVOKE_READ_COMMAND:
                return reply(await invoke(MCP_SCOPE.READ));
            case TOOL_NAME.INVOKE_WRITE_COMMAND:
                return reply(await invoke(MCP_SCOPE.WRITE));
            case TOOL_NAME.INVOKE_PRIVILEGED_COMMAND:
                return reply(await invoke(MCP_SCOPE.PRIVILEGED));
            default:
                return reply(toErrorResult(`Unknown tool: ${name}`));
        }
    });
};
