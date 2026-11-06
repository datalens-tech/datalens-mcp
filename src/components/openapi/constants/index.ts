export const MCP_SCOPE = {
    READ: 'read',
    WRITE: 'write',
    PRIVILEGED: 'privileged',
} as const;

export const OPENAPI_EXTENSION = {
    MCP_SCOPE: 'x-mcp-scope',
    MCP_DISABLED: 'x-mcp-disabled',
} as const;
