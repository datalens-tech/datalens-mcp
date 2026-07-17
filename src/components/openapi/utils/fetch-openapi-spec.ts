import {randomUUID} from 'crypto';
import {mkdir, readFile, rename, unlink, writeFile} from 'fs/promises';
import path from 'path';

import {GatewayError, toSafeErrorMessage} from '../../../utils';
import type {AppConfig} from '../../config';
import {fetchWithTimeout} from '../../http';
import type {LoadedOpenAPISpec, OpenAPISpec} from '../types';

const SCHEMA_FETCH_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [200, 500];

const wait = (delayMs: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, delayMs));

const safeUrl = (raw: string): string => {
    try {
        const url = new URL(raw);
        url.username = '';
        url.password = '';
        url.search = '';
        url.hash = '';
        return url.toString();
    } catch {
        return '[invalid URL]';
    }
};

const validateSpec = (value: unknown, source: string): OpenAPISpec => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new GatewayError(`OpenAPI schema from ${source} is not an object`, {
            kind: 'schema',
            code: 'INVALID_OPENAPI_SCHEMA',
        });
    }

    const spec = value as OpenAPISpec;
    if (spec.paths === null || typeof spec.paths !== 'object' || Array.isArray(spec.paths)) {
        throw new GatewayError(`OpenAPI schema from ${source} has no valid paths object`, {
            kind: 'schema',
            code: 'INVALID_OPENAPI_SCHEMA',
        });
    }

    return spec;
};

const parseSpecText = (text: string, source: string): OpenAPISpec => {
    try {
        return validateSpec(JSON.parse(text), source);
    } catch (error) {
        if (error instanceof GatewayError) {
            throw error;
        }
        throw new GatewayError(`OpenAPI schema from ${source} is not valid JSON`, {
            kind: 'schema',
            code: 'INVALID_OPENAPI_JSON',
            details: {cause: error},
        });
    }
};

const loadSpecFile = async (filePath: string, sourceLabel: string): Promise<OpenAPISpec> => {
    try {
        return parseSpecText(await readFile(filePath, 'utf8'), sourceLabel);
    } catch (error) {
        if (error instanceof GatewayError) {
            throw error;
        }
        throw new GatewayError(`Failed to read OpenAPI schema from ${sourceLabel}`, {
            kind: 'schema',
            code: 'OPENAPI_FILE_ERROR',
            details: {cause: error},
        });
    }
};

const writeCache = async (cachePath: string, spec: OpenAPISpec): Promise<void> => {
    const tempPath = `${cachePath}.${process.pid}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(cachePath), {recursive: true});
    try {
        await writeFile(tempPath, JSON.stringify(spec), {encoding: 'utf8', mode: 0o600});
        await rename(tempPath, cachePath);
    } finally {
        await unlink(tempPath).catch(() => undefined);
    }
};

const isRetryableSchemaStatus = (status: number): boolean =>
    status === 408 || status === 429 || status >= 500;

const fetchRemoteSpecOnce = async (config: AppConfig): Promise<OpenAPISpec> => {
    const source = safeUrl(config.schemaUrl);
    const {response, text} = await fetchWithTimeout({
        url: config.schemaUrl,
        label: `GET ${source}`,
        timeoutMs: config.requestTimeoutMs,
        retryable: true,
        init: {headers: {'content-type': 'application/json'}},
    });

    if (!response.ok) {
        const detail = text.slice(0, 4_000);
        throw new GatewayError(`Failed to fetch OpenAPI schema from ${source}`, {
            kind: 'schema',
            code: 'OPENAPI_FETCH_FAILED',
            status: response.status,
            retryable: isRetryableSchemaStatus(response.status),
            details: detail ? {response: detail} : undefined,
        });
    }

    return parseSpecText(text, source);
};

const fetchRemoteSpec = async (config: AppConfig): Promise<OpenAPISpec> => {
    let lastError: unknown;

    for (let attempt = 0; attempt < SCHEMA_FETCH_ATTEMPTS; attempt += 1) {
        try {
            return await fetchRemoteSpecOnce(config);
        } catch (error) {
            lastError = error;
            const retryable = error instanceof GatewayError && error.retryable;
            if (!retryable || attempt === SCHEMA_FETCH_ATTEMPTS - 1) {
                break;
            }
            await wait(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1) ?? 0);
        }
    }

    throw lastError;
};

export const fetchOpenAPISpec = async (config: AppConfig): Promise<LoadedOpenAPISpec> => {
    if (config.schemaPath) {
        return {
            spec: await loadSpecFile(config.schemaPath, `file ${config.schemaPath}`),
            source: `file:${config.schemaPath}`,
        };
    }

    try {
        const spec = await fetchRemoteSpec(config);
        if (config.schemaCachePath) {
            try {
                await writeCache(config.schemaCachePath, spec);
            } catch (error) {
                console.error('Failed to update OpenAPI cache:', toSafeErrorMessage(error));
            }
        }
        return {spec, source: safeUrl(config.schemaUrl)};
    } catch (remoteError) {
        if (!config.schemaCachePath) {
            throw remoteError;
        }

        try {
            const spec = await loadSpecFile(config.schemaCachePath, 'configured cache file');
            console.error(
                'OpenAPI endpoint is unavailable; using configured schema cache:',
                toSafeErrorMessage(remoteError),
            );
            return {spec, source: `cache:${config.schemaCachePath}`};
        } catch (cacheError) {
            throw new GatewayError('OpenAPI endpoint and configured schema cache are unavailable', {
                kind: 'schema',
                code: 'OPENAPI_UNAVAILABLE',
                details: {remote: remoteError, cache: cacheError},
            });
        }
    }
};
