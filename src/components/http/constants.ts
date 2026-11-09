export const HTTP_PATH = {
    MCP: '/mcp',
    PING: '/ping',
} as const;

export const HTTP_HOST = '0.0.0.0';
export const DEFAULT_HTTP_PORT = 3000;
export const MAX_HTTP_PORT = 65535;
export const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;
