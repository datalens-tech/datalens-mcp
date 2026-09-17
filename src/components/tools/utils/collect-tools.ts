import {
    MAX_API_RESPONSE_BYTES,
    readResponseText,
    validateHttpsUrl,
    withRequestTimeout,
} from '../../../utils';
import type {AuthProvider} from '../../auth';
import type {AppConfig} from '../../config';
import type {JsonSchema, OpenAPIOperation, OpenAPISpec} from '../../openapi';
import {bundleRefs} from '../../openapi';
import {MAX_BUNDLED_SCHEMA_NODES} from '../../openapi/utils/bundle-refs';
import type {CollectedTool} from '../types';

const HTTP_POST_METHOD = 'POST';

const EMPTY_OBJECT_SCHEMA: JsonSchema = {
    type: 'object',
    properties: {},
};

// /rpc/getWorkbookEntries → "getWorkbookEntries"
const toolNameFromPath = (path: string): string => path.split('/').filter(Boolean).at(-1) ?? '';

// Headers that never change for the lifetime of the server. The Authorization
// header is added per-request from the auth provider so a refreshed token is picked up.
const buildBaseHeaders = (config: AppConfig): Record<string, string> => {
    const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-dl-api-version': config.apiVersion,
    };
    if (config.orgId) {
        headers['x-dl-org-id'] = config.orgId;
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
    const text = await readResponseText(res, MAX_API_RESPONSE_BYTES);
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const buildInvokeFn =
    (
        requestUrl: string,
        path: string,
        baseHeaders: Record<string, string>,
        authProvider: AuthProvider,
    ): CollectedTool['invoke'] =>
    async (args) => {
        validateHttpsUrl(requestUrl, 'API request URL');
        const authHeader = await authProvider.getAuthHeader();
        const headers = authHeader ? {...baseHeaders, Authorization: authHeader} : baseHeaders;

        return withRequestTimeout('DataLens API request', async (signal) => {
            const res = await fetch(requestUrl, {
                method: HTTP_POST_METHOD,
                headers,
                body: JSON.stringify(args),
                signal,
                redirect: 'error',
            });

            if (!res.ok) {
                await res.body?.cancel();
                throw new Error(
                    `API call to ${HTTP_POST_METHOD} ${path} failed: HTTP ${res.status}`,
                );
            }

            return parseResponse(res);
        });
    };

const buildTool = (
    path: string,
    operation: OpenAPIOperation,
    components: OpenAPISpec['components'],
    config: AppConfig,
    baseHeaders: Record<string, string>,
    authProvider: AuthProvider,
    schemaBudget: {remainingNodes: number},
): CollectedTool => {
    const name = toolNameFromPath(path);
    const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
    const rawInputSchema = bodySchema
        ? bundleRefs(bodySchema, components?.schemas, schemaBudget)
        : EMPTY_OBJECT_SCHEMA;
    const requestUrl = `${config.apiUrl}${path}`;

    return {
        name,
        summary: operation.summary ?? name,
        description: buildDescription(operation, name),
        rawInputSchema,
        invoke: buildInvokeFn(requestUrl, path, baseHeaders, authProvider),
    };
};

export const collectTools = (
    spec: OpenAPISpec,
    config: AppConfig,
    authProvider: AuthProvider,
): CollectedTool[] => {
    const baseHeaders = buildBaseHeaders(config);
    const schemaBudget = {remainingNodes: MAX_BUNDLED_SCHEMA_NODES};

    return Object.entries(spec.paths ?? {}).flatMap(([path, pathItem]) => {
        const operation = pathItem[HTTP_POST_METHOD.toLowerCase()];
        if (!operation || operation['x-mcp-disabled']) {
            return [];
        }
        return [
            buildTool(
                path,
                operation,
                spec.components,
                config,
                baseHeaders,
                authProvider,
                schemaBudget,
            ),
        ];
    });
};
