import type {Config} from './config';
import {inlineRefs} from './inline-refs';

export type CollectedTool = {
    name: string;
    summary: string;
    description: string;
    /** Body schema with $refs inlined — shown to the LLM via describe_commands */
    rawInputSchema: Record<string, unknown>;
    /** Executes the API call; receives the parameters from invoke_command directly */
    invoke: (args: Record<string, unknown>) => Promise<unknown>;
};

// Minimal OpenAPI types needed for tool collection
type OpenAPIOperation = {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    deprecated?: boolean;
    requestBody?: {
        content?: {
            'application/json'?: {
                schema?: Record<string, unknown>;
            };
        };
    };
};

type OpenAPISpec = {
    components?: {
        schemas?: Record<string, unknown>;
    };
    paths?: Record<string, Record<string, OpenAPIOperation>>;
};

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const EMPTY_OBJECT_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {},
};

// Derives a tool name from the URL path when operationId is absent.
// /rpc/get_workbook_entries  → "get_workbook_entries"
// /api/v1/workbooks          → "workbooks"
const toolNameFromPath = (path: string): string => {
    const segment = path.split('/').filter(Boolean).pop() ?? '';
    // Strip curly-brace path params, e.g. "{id}" → skip to previous segment
    return segment.replace(/[{}]/g, '') || path.replace(/\//g, '_').replace(/^_/, '');
};

const buildRequestHeaders = (config: Config): Record<string, string> => {
    const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-dl-api-version': config.apiVersion,
        ...config.extraHeaders,
    };
    if (config.apiToken) {
        headers['Authorization'] = config.apiToken;
    }
    return headers;
};

export const fetchOpenAPISpec = async (config: Config): Promise<OpenAPISpec> => {
    // Send auth headers when fetching the schema — the spec endpoint may also
    // require authentication (e.g. behind the same API gateway).
    const headers = buildRequestHeaders(config);
    const res = await fetch(config.schemaUrl, {headers});
    if (!res.ok) {
        throw new Error(
            `Failed to fetch OpenAPI schema from ${config.schemaUrl}: ${res.status} ${res.statusText}`,
        );
    }
    return res.json() as Promise<OpenAPISpec>;
};

const buildRawInputSchema = (
    bodySchema: Record<string, unknown> | undefined,
    components: Record<string, unknown> | undefined,
): Record<string, unknown> => {
    if (!bodySchema) {
        return EMPTY_OBJECT_SCHEMA;
    }

    const inlined = inlineRefs(bodySchema, components) as Record<string, unknown>;

    if (!inlined || typeof inlined !== 'object' || Array.isArray(inlined)) {
        return EMPTY_OBJECT_SCHEMA;
    }

    return inlined;
};

export const collectTools = (spec: OpenAPISpec, config: Config): CollectedTool[] => {
    const components = spec.components?.schemas;
    const headers = buildRequestHeaders(config);
    const tools: CollectedTool[] = [];

    for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
        for (const method of HTTP_METHODS) {
            const operation = pathItem[method];
            if (!operation) {
                continue;
            }

            const {operationId, summary, description, tags, deprecated} = operation;

            if (tags?.some((tag) => config.excludedTags.includes(tag))) {
                continue;
            }

            const name = operationId || toolNameFromPath(path);

            const bodySchema = operation.requestBody?.content?.['application/json']?.schema as
                | Record<string, unknown>
                | undefined;

            const rawInputSchema = buildRawInputSchema(bodySchema, components);

            const toolDescription = [
                deprecated ? '[deprecated] ' : '',
                summary ?? name,
                description ? ` — ${description}` : '',
            ]
                .filter(Boolean)
                .join('');

            const requestUrl = `${config.apiUrl}${path}`;
            const requestMethod = method.toUpperCase();

            tools.push({
                name,
                summary: summary ?? name,
                description: toolDescription,
                rawInputSchema,
                invoke: async (args) => {
                    const res = await fetch(requestUrl, {
                        method: requestMethod,
                        headers,
                        body: JSON.stringify(args),
                    });

                    const text = await res.text();
                    let data: unknown;
                    try {
                        data = JSON.parse(text);
                    } catch {
                        data = text;
                    }

                    if (!res.ok) {
                        const detail = typeof data === 'string' ? data : JSON.stringify(data);
                        throw new Error(
                            `API call to ${requestMethod} ${path} failed: ${res.status} ${res.statusText}\n${detail}`,
                        );
                    }

                    return data;
                },
            });
        }
    }

    return tools;
};
