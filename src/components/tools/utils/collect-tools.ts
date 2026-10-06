import {CONTENT_TYPE, HTTP_HEADER} from '../../../constants/http';
import {
    MAX_API_RESPONSE_BYTES,
    readResponseText,
    validateHttpsUrl,
    withRequestTimeout,
} from '../../../utils';
import type {AppConfig} from '../../config';
import type {JsonSchema, McpScope, OpenAPIOperation, OpenAPISpec} from '../../openapi';
import {OPENAPI_EXTENSION, bundleRefs, isMcpScope} from '../../openapi';
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
// header is passed explicitly for each invocation.
const buildBaseHeaders = (config: AppConfig): Record<string, string> => {
    const headers: Record<string, string> = {
        [HTTP_HEADER.CONTENT_TYPE]: CONTENT_TYPE.JSON,
        [HTTP_HEADER.DATALENS_API_VERSION]: config.apiVersion,
    };
    if (config.orgId) {
        headers[HTTP_HEADER.DATALENS_ORG_ID] = config.orgId;
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
    ): CollectedTool['invoke'] =>
    async (args, authHeader) => {
        validateHttpsUrl(requestUrl, 'API request URL');
        const headers = authHeader
            ? {...baseHeaders, [HTTP_HEADER.AUTHORIZATION]: authHeader}
            : baseHeaders;

        return withRequestTimeout('DataLens API request', async (signal) => {
            const res = await fetch(requestUrl, {
                method: HTTP_POST_METHOD,
                headers,
                body: JSON.stringify(args),
                signal,
                redirect: 'error',
            });

            const data = await parseResponse(res);

            if (!res.ok) {
                const detail = typeof data === 'string' ? data : JSON.stringify(data);
                throw new Error(
                    `API call to ${HTTP_POST_METHOD} ${path} failed: ${res.status} ${res.statusText}\n${detail}`,
                );
            }

            return data;
        });
    };

const buildTool = (
    path: string,
    operation: OpenAPIOperation,
    scope: McpScope,
    components: OpenAPISpec['components'],
    config: AppConfig,
    baseHeaders: Record<string, string>,
    schemaBudget: {remainingNodes: number},
): CollectedTool => {
    const name = toolNameFromPath(path);
    const bodySchema = operation.requestBody?.content?.[CONTENT_TYPE.JSON]?.schema;
    const rawInputSchema = bodySchema
        ? bundleRefs(bodySchema, components?.schemas, schemaBudget)
        : EMPTY_OBJECT_SCHEMA;
    const requestUrl = `${config.apiUrl}${path}`;

    return {
        name,
        scope,
        summary: operation.summary ?? name,
        description: buildDescription(operation, name),
        rawInputSchema,
        invoke: buildInvokeFn(requestUrl, path, baseHeaders),
    };
};

export const collectTools = (spec: OpenAPISpec, config: AppConfig): CollectedTool[] => {
    const baseHeaders = buildBaseHeaders(config);
    const schemaBudget = {remainingNodes: MAX_BUNDLED_SCHEMA_NODES};

    return Object.entries(spec.paths ?? {}).flatMap(([path, pathItem]) => {
        const operation = pathItem[HTTP_POST_METHOD.toLowerCase()];
        if (!operation || operation[OPENAPI_EXTENSION.MCP_DISABLED]) {
            return [];
        }
        const scope = operation[OPENAPI_EXTENSION.MCP_SCOPE];
        if (!isMcpScope(scope)) {
            return [];
        }
        return [
            buildTool(path, operation, scope, spec.components, config, baseHeaders, schemaBudget),
        ];
    });
};
