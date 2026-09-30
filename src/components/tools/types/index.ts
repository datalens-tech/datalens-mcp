import type {McpScope} from '../../openapi';

export type CollectedTool = {
    name: string;
    scope: McpScope;
    summary: string;
    description: string;
    /** Body schema with $refs inlined — shown to the LLM via describe_commands */
    rawInputSchema: Record<string, unknown>;
    /** Executes the API call; receives parameters from a scoped invocation tool */
    invoke: (args: Record<string, unknown>) => Promise<unknown>;
};
