import {MCP_SCOPE} from '../constants';
import type {McpScope} from '../types';

const MCP_SCOPES: ReadonlySet<string> = new Set(Object.values(MCP_SCOPE));

export const isMcpScope = (value: unknown): value is McpScope =>
    typeof value === 'string' && MCP_SCOPES.has(value);
