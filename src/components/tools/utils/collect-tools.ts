import {withRequestTimeout} from '../../../utils';
import type {AppConfig} from '../../config';
import type {JsonSchema, OpenAPIOperation, OpenAPISpec} from '../../openapi';
import {bundleRefs} from '../../openapi';
import type {CollectedTool} from '../types';

const HTTP_POST_METHOD = 'POST';

const EMPTY_OBJECT_SCHEMA: JsonSchema = {
    type: 'object',
    properties: {},
};

// /rpc/getWorkbookEntries → "getWorkbookEntries"
const toolNameFromPath = (path: string): string => path.split('/').filter(Boolean).at(-1) ?? '';

const buildRequestHeaders = (config: AppConfig): Record<string, string> => {
    const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-dl-api-version': config.apiVersion,
        ...config.extraHeaders,
    };
    if (config.authHeader) {
        headers['Authorization'] = config.authHeader;
    }
    return headers;
};

const buildDescription = (operation: OpenAPIOperation, name: string): string =>
    [
        operation.deprecated ? '[deprecated] ' : '',
        operation.summary ?? name,
        operation.description ? ` — ${operation.description}` : '',
    ]
        .filter(Boolean)
        .join('');

const parseResponse = async (res: Response): Promise<unknown> => {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const buildInvokeFn =
    (requestUrl: string, path: string, headers: Record<string, string>): CollectedTool['invoke'] =>
    async (args) => {
        const res = await withRequestTimeout(`${HTTP_POST_METHOD} ${requestUrl}`, (signal) =>
            fetch(requestUrl, {
                method: HTTP_POST_METHOD,
                headers,
                body: JSON.stringify(args),
                signal,
            }),
        );

        const data = await parseResponse(res);

        if (!res.ok) {
            const detail = typeof data === 'string' ? data : JSON.stringify(data);
            throw new Error(
                `API call to ${HTTP_POST_METHOD} ${path} failed: ${res.status} ${res.statusText}\n${detail}`,
            );
        }

        return data;
    };

const buildTool = (
    path: string,
    operation: OpenAPIOperation,
    components: OpenAPISpec['components'],
    config: AppConfig,
    headers: Record<string, string>,
): CollectedTool => {
    const name = toolNameFromPath(path);
    const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
    const rawInputSchema = bodySchema
        ? bundleRefs(bodySchema, components?.schemas)
        : EMPTY_OBJECT_SCHEMA;
    const requestUrl = `${config.apiUrl}${path}`;

    return {
        name,
        summary: operation.summary ?? name,
        description: buildDescription(operation, name),
        rawInputSchema,
        invoke: buildInvokeFn(requestUrl, path, headers),
    };
};

export const collectTools = (spec: OpenAPISpec, config: AppConfig): CollectedTool[] => {
    const headers = buildRequestHeaders(config);

    return Object.entries(spec.paths ?? {}).flatMap(([path, pathItem]) => {
        const operation = pathItem[HTTP_POST_METHOD.toLowerCase()];
        if (!operation || operation['x-mcp-disabled']) {
            return [];
        }
        return [buildTool(path, operation, spec.components, config, headers)];
    });
};
