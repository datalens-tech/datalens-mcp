import type {Tool} from '@modelcontextprotocol/sdk/types.js';

import type {WriteMode} from '../../config';

export const TOOL_NAME = {
    LIST_COMMANDS: 'list_commands',
    DESCRIBE_COMMANDS: 'describe_commands',
    INVOKE_COMMAND: 'invoke_command',
    READ_RESULT: 'read_result',
    PLAN_COMMAND: 'plan_command',
    EXECUTE_PLAN: 'execute_plan',
} as const;

const READ_ONLY_ANNOTATIONS = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};

const commandInputSchema = {
    type: 'object' as const,
    properties: {
        command_name: {
            type: 'string',
            description: 'The command to invoke or prepare.',
        },
        parameters: {
            type: 'object',
            description: 'Arguments for the command. Put downstream inputs here.',
        },
    },
    required: ['command_name'],
};

export const getToolDefs = (writeMode: WriteMode): Tool[] => {
    const invokeIsReadOnly = writeMode !== 'direct';
    const tools: Tool[] = [
        {
            name: TOOL_NAME.LIST_COMMANDS,
            description:
                'List available command names, summaries, access class, and execution policy. Call this first.',
            inputSchema: {type: 'object', properties: {}},
            annotations: READ_ONLY_ANNOTATIONS,
        },
        {
            name: TOOL_NAME.DESCRIBE_COMMANDS,
            description:
                'Return descriptions, policy metadata, and input schemas for one or more commands.',
            inputSchema: {
                type: 'object',
                properties: {
                    command_names: {
                        type: 'array',
                        items: {type: 'string'},
                        minItems: 1,
                        description: 'Names of the commands to describe.',
                    },
                },
                required: ['command_names'],
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
        {
            name: TOOL_NAME.INVOKE_COMMAND,
            description: invokeIsReadOnly
                ? 'Invoke a read command. Write and unknown commands are controlled by the configured write policy.'
                : 'Invoke any allowed command directly. In direct mode this tool may mutate or delete DataLens objects.',
            inputSchema: commandInputSchema,
            annotations: invokeIsReadOnly
                ? {...READ_ONLY_ANNOTATIONS, openWorldHint: true}
                : {
                      readOnlyHint: false,
                      destructiveHint: true,
                      idempotentHint: false,
                      openWorldHint: true,
                  },
        },
        {
            name: TOOL_NAME.READ_RESULT,
            description:
                'Read a chunk of a large command result previously saved by this MCP server.',
            inputSchema: {
                type: 'object',
                properties: {
                    result_id: {type: 'string', description: 'Stored result identifier.'},
                    offset: {
                        type: 'integer',
                        minimum: 0,
                        description: 'Character offset. Defaults to 0.',
                    },
                    limit: {
                        type: 'integer',
                        minimum: 1,
                        description:
                            'Maximum characters to return; capped by server configuration.',
                    },
                },
                required: ['result_id'],
            },
            annotations: READ_ONLY_ANNOTATIONS,
        },
    ];

    if (writeMode === 'planned') {
        tools.push(
            {
                name: TOOL_NAME.PLAN_COMMAND,
                description:
                    'Validate and prepare an immutable write or unknown command without calling the DataLens API.',
                inputSchema: commandInputSchema,
                annotations: READ_ONLY_ANNOTATIONS,
            },
            {
                name: TOOL_NAME.EXECUTE_PLAN,
                description:
                    'Execute a previously prepared one-time write plan. Clients should require explicit approval for this tool.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        plan_id: {type: 'string', description: 'One-time plan identifier.'},
                    },
                    required: ['plan_id'],
                },
                annotations: {
                    readOnlyHint: false,
                    destructiveHint: true,
                    idempotentHint: false,
                    openWorldHint: true,
                },
            },
        );
    }

    return tools;
};
