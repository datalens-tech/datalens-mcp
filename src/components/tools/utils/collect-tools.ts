import {GatewayError} from '../../../utils';
import type {AuthProvider} from '../../auth';
import type {AppConfig} from '../../config';
import {createApiClient} from '../../http';
import type {JsonSchema, OpenAPIOperation, OpenAPISpec} from '../../openapi';
import {bundleRefs} from '../../openapi';
import type {CollectedTool} from '../types';

import {parseCommandPolicy} from './command-policy';
import {compileParameterValidator} from './schema-validator';

const HTTP_POST_METHOD = 'post';

const EMPTY_OBJECT_SCHEMA: JsonSchema = {
    type: 'object',
    properties: {},
};

type Candidate = {
    path: string;
    name: string;
    operation: OpenAPIOperation;
    policy: ReturnType<typeof parseCommandPolicy>;
};

// /rpc/getWorkbookEntries → "getWorkbookEntries"
const toolNameFromPath = (path: string): string => path.split('/').filter(Boolean).at(-1) ?? '';

const buildDescription = (operation: OpenAPIOperation, name: string): string =>
    [
        operation.deprecated ? '[deprecated] ' : '',
        operation.summary ?? name,
        operation.description ? ` — ${operation.description}` : '',
    ]
        .filter(Boolean)
        .join('');

const collectCandidates = (spec: OpenAPISpec): Candidate[] => {
    const candidates: Candidate[] = [];
    const pathsByName = new Map<string, string>();

    for (const [path, rawPathItem] of Object.entries(spec.paths ?? {})) {
        if (rawPathItem === null || typeof rawPathItem !== 'object') {
            throw new GatewayError(`Invalid OpenAPI path item: ${path}`, {
                kind: 'schema',
                code: 'INVALID_OPENAPI_PATH',
            });
        }

        const operation = rawPathItem[HTTP_POST_METHOD];
        if (!operation || typeof operation !== 'object') {
            continue;
        }

        const name = toolNameFromPath(path);
        if (!name) {
            throw new GatewayError(`Cannot derive a command name from OpenAPI path ${path}`, {
                kind: 'schema',
                code: 'INVALID_COMMAND_NAME',
            });
        }

        const policy = parseCommandPolicy(operation, name);
        if (!policy.enabled) {
            continue;
        }

        const previousPath = pathsByName.get(name);
        if (previousPath) {
            throw new GatewayError(
                `Duplicate command name ${name} is produced by ${previousPath} and ${path}`,
                {kind: 'schema', code: 'DUPLICATE_COMMAND_NAME'},
            );
        }
        pathsByName.set(name, path);
        candidates.push({path, name, operation, policy});
    }

    return candidates;
};

const warnAboutUnknownConfiguredCommands = (
    availableNames: Set<string>,
    config: AppConfig,
): void => {
    const unknown = [...config.allowCommands, ...config.denyCommands].filter(
        (name) => !availableNames.has(name),
    );
    if (unknown.length > 0) {
        console.error(
            `MCP command policy references unknown commands: ${[...new Set(unknown)].join(', ')}`,
        );
    }
};

export const collectTools = (
    spec: OpenAPISpec,
    config: AppConfig,
    authProvider: AuthProvider,
): CollectedTool[] => {
    const apiClient = createApiClient(config, authProvider);
    const candidates = collectCandidates(spec);
    const availableNames = new Set(candidates.map(({name}) => name));
    const allowed = new Set(config.allowCommands);
    const denied = new Set(config.denyCommands);
    warnAboutUnknownConfiguredCommands(availableNames, config);

    return candidates
        .filter(({name}) => (allowed.size === 0 || allowed.has(name)) && !denied.has(name))
        .map(({path, name, operation, policy}) => {
            const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
            const rawInputSchema = bodySchema
                ? bundleRefs(bodySchema, spec.components?.schemas)
                : EMPTY_OBJECT_SCHEMA;

            return {
                name,
                path,
                summary: operation.summary ?? name,
                description: buildDescription(operation, name),
                deprecated: operation.deprecated ?? false,
                policy: {
                    access: policy.access,
                    destructive: policy.destructive,
                    idempotent: policy.idempotent,
                },
                rawInputSchema,
                validateParameters: compileParameterValidator(rawInputSchema, name),
                invoke: (parameters) =>
                    apiClient.post(path, parameters, {idempotent: policy.idempotent}),
            };
        });
};
