import {withRequestTimeout} from '../../../utils';
import type {AppConfig} from '../../config';
import type {JsonSchema, OpenAPISpec} from '../../openapi';
import {inlineRefs} from '../../openapi';
import type {CollectedTool} from '../types';

// API has only post methods
const HTTP_POST_METHOD = 'POST';

const EMPTY_OBJECT_SCHEMA: JsonSchema = {
    type: 'object',
    properties: {},
};

// Derives a tool name from the URL path
// /rpc/getWorkbookEntries  → "getWorkbookEntries"
const toolNameFromPath = (path: string): string => {
    return path.split('/').filter(Boolean).at(-1) ?? '';
};

const buildRequestHeaders = (config: AppConfig): Record<string, string> => {
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

export const collectTools = (spec: OpenAPISpec, config: AppConfig): CollectedTool[] => {
    const components = spec.components?.schemas;
    const headers = buildRequestHeaders(config);
    const tools: CollectedTool[] = [];

    for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
        const operation = pathItem[HTTP_POST_METHOD.toLowerCase()];
        if (!operation) {
            continue;
        }

        const {summary, description, deprecated} = operation;

        const name = toolNameFromPath(path);

        const bodySchema = operation.requestBody?.content?.['application/json']?.schema;

        const rawInputSchema = bodySchema
            ? inlineRefs(bodySchema, components)
            : EMPTY_OBJECT_SCHEMA;

        const toolDescription = [
            deprecated ? '[deprecated] ' : '',
            summary ?? name,
            description ? ` — ${description}` : '',
        ]
            .filter(Boolean)
            .join('');

        const requestUrl = `${config.apiUrl}${path}`;

        tools.push({
            name,
            summary: summary ?? name,
            description: toolDescription,
            rawInputSchema,
            invoke: async (args) => {
                const res = await withRequestTimeout(
                    `${HTTP_POST_METHOD} ${requestUrl}`,
                    (signal) =>
                        fetch(requestUrl, {
                            method: HTTP_POST_METHOD,
                            headers,
                            body: JSON.stringify(args),
                            signal,
                        }),
                );

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
                        `API call to ${HTTP_POST_METHOD} ${path} failed: ${res.status} ${res.statusText}\n${detail}`,
                    );
                }

                return data;
            },
        });
    }

    return tools;
};
