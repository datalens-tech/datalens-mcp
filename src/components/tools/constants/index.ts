export const TOOL_NAME = {
    LIST_COMMANDS: 'list_commands',
    DESCRIBE_COMMANDS: 'describe_commands',
    INVOKE_COMMAND: 'invoke_command',
} as const;

export const TOOL_DEFS = [
    {
        name: TOOL_NAME.LIST_COMMANDS,
        description:
            'List all available command names and one-line summaries. Call this first to discover what commands exist before using describe_commands or invoke_command.',
        inputSchema: {type: 'object' as const, properties: {}},
    },
    {
        name: TOOL_NAME.DESCRIBE_COMMANDS,
        description: 'Return the full description and input schema for one or more commands.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                command_names: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'Names of the commands to describe.',
                },
            },
            required: ['command_names'],
        },
    },
    {
        name: TOOL_NAME.INVOKE_COMMAND,
        description:
            'Invoke a command by name, passing optional parameters. Put all command inputs inside the parameters field.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                command_name: {
                    type: 'string',
                    description: 'The command to invoke.',
                },
                parameters: {
                    type: 'object',
                    description:
                        'Arguments for the command. Put downstream inputs here, not at the top level.',
                },
            },
            required: ['command_name'],
        },
    },
];
