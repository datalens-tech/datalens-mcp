import type {McpScope} from '../types';

const MCP_SCOPES = {
    read: true,
    write: true,
    privileged: true,
} satisfies Record<McpScope, true>;

export const isMcpScope = (value: unknown): value is McpScope =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(MCP_SCOPES, value);
