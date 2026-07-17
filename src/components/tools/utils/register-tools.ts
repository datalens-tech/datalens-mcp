import type {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';

import {GatewayError, redactSensitive, serializeGatewayError} from '../../../utils';
import type {AppConfig} from '../../config';
import {TOOL_NAME, getToolDefs} from '../constants';
import type {CollectedTool} from '../types';

import {PlanStore} from './plan-store';
import {ResultStore} from './result-store';

type ToolResult = {content: {type: 'text'; text: string}[]; isError?: true};
type Args = Record<string, unknown>;

const toTextResult = (text: string): ToolResult => ({
    content: [{type: 'text' as const, text}],
});

const toErrorResult = (error: unknown): ToolResult => ({
    isError: true,
    content: [
        {
            type: 'text' as const,
            text: JSON.stringify({ok: false, error: serializeGatewayError(error)}),
        },
    ],
});

const stringifyResult = (data: unknown): string => {
    if (typeof data === 'string') {
        return data;
    }
    return JSON.stringify(data) ?? 'null';
};

const toSuccessResult = (
    data: unknown,
    resultStore: ResultStore,
    maxResponseChars: number,
): ToolResult => {
    const text = stringifyResult(data);
    if (text.length <= maxResponseChars) {
        return toTextResult(text);
    }
    return toTextResult(JSON.stringify(resultStore.store(text)));
};

const commandExecution = (tool: CollectedTool, config: AppConfig) => {
    if (tool.policy.access === 'read' || config.writeMode === 'direct') {
        return {execution: 'direct' as const, requires_confirmation: false, available: true};
    }
    if (config.writeMode === 'disabled') {
        return {execution: 'blocked' as const, requires_confirmation: false, available: false};
    }
    if (tool.policy.destructive && !config.allowDestructive) {
        return {execution: 'blocked' as const, requires_confirmation: true, available: false};
    }
    return {execution: 'planned' as const, requires_confirmation: true, available: true};
};

const commandMetadata = (tool: CollectedTool, config: AppConfig) => ({
    access: tool.policy.access,
    destructive: tool.policy.destructive,
    idempotent: tool.policy.idempotent,
    deprecated: tool.deprecated,
    ...commandExecution(tool, config),
});

const requireCommandName = (args: Args, field = 'command_name'): string => {
    const commandName = args[field];
    if (typeof commandName !== 'string' || !commandName) {
        throw new GatewayError(`${field} must be a non-empty string`, {
            kind: 'validation',
            code: 'INVALID_COMMAND_NAME',
        });
    }
    return commandName;
};

const requireTool = (
    commandName: string,
    toolsByName: Map<string, CollectedTool>,
): CollectedTool => {
    const tool = toolsByName.get(commandName);
    if (!tool) {
        throw new GatewayError(`Unknown command: ${commandName}`, {
            kind: 'validation',
            code: 'UNKNOWN_COMMAND',
        });
    }
    return tool;
};

const getParameters = (args: Args): Args => {
    const parameters = args['parameters'] ?? {};
    if (parameters === null || typeof parameters !== 'object' || Array.isArray(parameters)) {
        throw new GatewayError('parameters must be an object', {
            kind: 'validation',
            code: 'INVALID_COMMAND_PARAMETERS',
        });
    }
    return parameters as Args;
};

const enforceInvokePolicy = (tool: CollectedTool, config: AppConfig): void => {
    if (tool.policy.access === 'read' || config.writeMode === 'direct') {
        return;
    }
    if (config.writeMode === 'disabled') {
        throw new GatewayError(`Writes are disabled; command ${tool.name} cannot be invoked`, {
            kind: 'policy',
            code: 'WRITES_DISABLED',
        });
    }
    if (tool.policy.destructive && !config.allowDestructive) {
        throw new GatewayError(`Destructive command ${tool.name} is disabled by server policy`, {
            kind: 'policy',
            code: 'DESTRUCTIVE_COMMAND_DISABLED',
        });
    }
    throw new GatewayError(`Command ${tool.name} requires plan_command followed by execute_plan`, {
        kind: 'policy',
        code: 'WRITE_REQUIRES_PLAN',
    });
};

export const registerTools = ({
    server,
    tools,
    config,
}: {
    server: Server;
    tools: CollectedTool[];
    config: AppConfig;
}): void => {
    const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
    const resultStore = new ResultStore({
        ttlMs: config.resultTtlMs,
        maxItemBytes: config.resultMaxBytes,
        maxTotalBytes: config.resultStoreMaxBytes,
        chunkChars: config.maxResponseChars,
    });
    const planStore = new PlanStore(config.planTtlMs);

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: getToolDefs(config.writeMode),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const {name, arguments: rawArgs} = request.params;
        const args = (rawArgs ?? {}) as Args;

        try {
            switch (name) {
                case TOOL_NAME.LIST_COMMANDS:
                    return toSuccessResult(
                        tools.map((tool) => ({
                            command_name: tool.name,
                            summary: tool.summary,
                            ...commandMetadata(tool, config),
                        })),
                        resultStore,
                        config.maxResponseChars,
                    );

                case TOOL_NAME.DESCRIBE_COMMANDS: {
                    const commandNames = args['command_names'];
                    if (!Array.isArray(commandNames) || commandNames.length === 0) {
                        throw new GatewayError(
                            'describe_commands requires a non-empty command_names array',
                            {kind: 'validation', code: 'INVALID_COMMAND_NAMES'},
                        );
                    }
                    const descriptions = commandNames.map((rawName) => {
                        const commandName = String(rawName);
                        const tool = toolsByName.get(commandName);
                        if (!tool) {
                            return {command_name: commandName, error: 'UNKNOWN_COMMAND'};
                        }
                        return {
                            command_name: tool.name,
                            description: tool.description,
                            inputSchema: tool.rawInputSchema,
                            ...commandMetadata(tool, config),
                        };
                    });
                    return toSuccessResult(descriptions, resultStore, config.maxResponseChars);
                }

                case TOOL_NAME.INVOKE_COMMAND: {
                    const tool = requireTool(requireCommandName(args), toolsByName);
                    enforceInvokePolicy(tool, config);
                    const parameters = getParameters(args);
                    tool.validateParameters(parameters);
                    return toSuccessResult(
                        await tool.invoke(parameters),
                        resultStore,
                        config.maxResponseChars,
                    );
                }

                case TOOL_NAME.READ_RESULT: {
                    const resultId = args['result_id'];
                    if (typeof resultId !== 'string' || !resultId) {
                        throw new GatewayError('result_id must be a non-empty string', {
                            kind: 'validation',
                            code: 'INVALID_RESULT_ID',
                        });
                    }
                    const rawOffset = args['offset'];
                    const rawLimit = args['limit'];
                    const offset = rawOffset === undefined ? 0 : rawOffset;
                    if (typeof offset !== 'number') {
                        throw new GatewayError('offset must be an integer', {
                            kind: 'validation',
                            code: 'INVALID_RESULT_OFFSET',
                        });
                    }
                    if (rawLimit !== undefined && typeof rawLimit !== 'number') {
                        throw new GatewayError('limit must be an integer', {
                            kind: 'validation',
                            code: 'INVALID_RESULT_LIMIT',
                        });
                    }
                    return toTextResult(
                        JSON.stringify(resultStore.read(resultId, offset, rawLimit)),
                    );
                }

                case TOOL_NAME.PLAN_COMMAND: {
                    if (config.writeMode !== 'planned') {
                        throw new GatewayError('Write planning is not enabled', {
                            kind: 'policy',
                            code: 'PLANNING_DISABLED',
                        });
                    }
                    const tool = requireTool(requireCommandName(args), toolsByName);
                    if (tool.policy.access === 'read') {
                        throw new GatewayError(
                            `Read command ${tool.name} should be called with invoke_command`,
                            {kind: 'policy', code: 'READ_DOES_NOT_REQUIRE_PLAN'},
                        );
                    }
                    if (tool.policy.destructive && !config.allowDestructive) {
                        throw new GatewayError(
                            `Destructive command ${tool.name} is disabled by server policy`,
                            {kind: 'policy', code: 'DESTRUCTIVE_COMMAND_DISABLED'},
                        );
                    }
                    const parameters = getParameters(args);
                    tool.validateParameters(parameters);
                    const {planId, expiresAt} = planStore.create(tool, parameters);
                    return toSuccessResult(
                        {
                            plan_id: planId,
                            command_name: tool.name,
                            access: tool.policy.access,
                            destructive: tool.policy.destructive,
                            idempotent: tool.policy.idempotent,
                            parameters: redactSensitive(parameters),
                            expires_at: new Date(expiresAt).toISOString(),
                        },
                        resultStore,
                        config.maxResponseChars,
                    );
                }

                case TOOL_NAME.EXECUTE_PLAN: {
                    if (config.writeMode !== 'planned') {
                        throw new GatewayError('Write planning is not enabled', {
                            kind: 'policy',
                            code: 'PLANNING_DISABLED',
                        });
                    }
                    const unexpectedFields = Object.keys(args).filter((key) => key !== 'plan_id');
                    if (unexpectedFields.length > 0) {
                        throw new GatewayError(
                            'execute_plan accepts only plan_id; planned parameters are immutable',
                            {
                                kind: 'validation',
                                code: 'UNEXPECTED_EXECUTE_PLAN_ARGUMENTS',
                                details: {fields: unexpectedFields},
                            },
                        );
                    }
                    const planId = requireCommandName(args, 'plan_id');
                    const plan = planStore.take(planId);
                    return toSuccessResult(
                        await plan.tool.invoke(plan.parameters),
                        resultStore,
                        config.maxResponseChars,
                    );
                }

                default:
                    throw new GatewayError(`Unknown tool: ${name}`, {
                        kind: 'validation',
                        code: 'UNKNOWN_TOOL',
                    });
            }
        } catch (error) {
            return toErrorResult(error);
        }
    });
};
