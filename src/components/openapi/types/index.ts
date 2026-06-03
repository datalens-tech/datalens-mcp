export type JsonSchema = {
    $ref?: string;
    type?: string;
    description?: string;
    properties?: Record<string, JsonSchema>;
    [key: string]: unknown;
};

type OpenAPIOperation = {
    operationId?: string;
    summary?: string;
    description?: string;
    deprecated?: boolean;
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
