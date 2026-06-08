export type CollectedTool = {
    name: string;
    summary: string;
    description: string;
    /** Body schema with $refs inlined — shown to the LLM via describe_commands */
    rawInputSchema: Record<string, unknown>;
    /** Executes the API call; receives the parameters from invoke_command directly */
    invoke: (args: Record<string, unknown>) => Promise<unknown>;
};
