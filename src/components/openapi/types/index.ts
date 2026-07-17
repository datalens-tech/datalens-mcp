export type JsonSchema = {
    $ref?: string;
    type?: string;
    description?: string;
    properties?: Record<string, JsonSchema>;
    [key: string]: unknown;
};

export type McpCommandAccess = 'read' | 'write';

export type McpOperationPolicy = {
    enabled?: boolean;
    access?: McpCommandAccess;
    destructive?: boolean;
    idempotent?: boolean;
};

export type OpenAPIOperation = {
    operationId?: string;
    summary?: string;
    description?: string;
    deprecated?: boolean;
    'x-mcp-disabled'?: boolean;
    'x-mcp'?: McpOperationPolicy;
    requestBody?: {
        content?: {
            'application/json'?: {
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

export type LoadedOpenAPISpec = {
    spec: OpenAPISpec;
    source: string;
};
