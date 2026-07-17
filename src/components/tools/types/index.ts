export type CommandAccess = 'read' | 'write' | 'unknown';

export type CommandPolicy = {
    access: CommandAccess;
    destructive: boolean;
    idempotent: boolean;
};

export type CollectedTool = {
    name: string;
    path: string;
    summary: string;
    description: string;
    deprecated: boolean;
    policy: CommandPolicy;
    /** Body schema with $refs inlined — shown to the LLM via describe_commands */
    rawInputSchema: Record<string, unknown>;
    /** Validates and narrows parameters before they reach the downstream API. */
    validateParameters: (args: Record<string, unknown>) => void;
    /** Executes the API call; receives the parameters from invoke_command directly */
    invoke: (args: Record<string, unknown>) => Promise<unknown>;
};
