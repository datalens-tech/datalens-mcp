import type {CONTENT_TYPE} from '../../../constants/http';
import type {MCP_SCOPE, OPENAPI_EXTENSION} from '../constants';

export type JsonSchema = {
    $ref?: string;
    type?: string;
    description?: string;
    properties?: Record<string, JsonSchema>;
    [key: string]: unknown;
};

export type McpScope = (typeof MCP_SCOPE)[keyof typeof MCP_SCOPE];

export type OpenAPIOperation = {
    operationId?: string;
    summary?: string;
    description?: string;
    deprecated?: boolean;
    [OPENAPI_EXTENSION.MCP_DISABLED]?: boolean;
    [OPENAPI_EXTENSION.MCP_SCOPE]?: McpScope;
    requestBody?: {
        content?: {
            [CONTENT_TYPE.JSON]?: {
                schema?: JsonSchema;
            };
        };
    };
};

export type OpenAPISpec = {
    components?: {
        schemas?: Record<string, JsonSchema>;
    };
    paths?: Record<string, Record<string, OpenAPIOperation>>;
};
