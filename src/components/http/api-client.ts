import {GatewayError} from '../../utils';
import type {AuthProvider} from '../auth';
import type {AppConfig} from '../config';

import {fetchWithTimeout} from './fetch-with-timeout';

export type ApiClient = {
    post: (
        path: string,
        parameters: Record<string, unknown>,
        options: {idempotent: boolean},
    ) => Promise<unknown>;
};

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

const parseResponse = (text: string): unknown => {
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const getRequestId = (response: Response): string | undefined =>
    response.headers.get('x-request-id') ??
    response.headers.get('x-dl-request-id') ??
    response.headers.get('traceparent') ??
    undefined;

const isRetryableStatus = (status: number): boolean =>
    status === 408 || status === 429 || status === 502 || status === 503 || status === 504;

export const createApiClient = (config: AppConfig, authProvider: AuthProvider): ApiClient => {
    const baseHeaders = buildBaseHeaders(config);

    const send = async (
        path: string,
        parameters: Record<string, unknown>,
        idempotent: boolean,
    ): Promise<{response: Response; text: string}> => {
        let authHeader: string | undefined;
        try {
            authHeader = await authProvider.getAuthHeader();
        } catch (error) {
            throw new GatewayError('Failed to obtain DataLens API authorization', {
                kind: 'auth',
                code: 'AUTH_PROVIDER_ERROR',
                retryable: true,
                details: {cause: error},
            });
        }
        const headers = authHeader ? {...baseHeaders, Authorization: authHeader} : baseHeaders;
        const url = `${config.apiUrl}${path}`;

        return fetchWithTimeout({
            url,
            label: `POST ${path}`,
            timeoutMs: config.requestTimeoutMs,
            retryable: idempotent,
            init: {
                method: 'POST',
                headers,
                body: JSON.stringify(parameters),
            },
        });
    };

    return {
        post: async (path, parameters, {idempotent}) => {
            let request = await send(path, parameters, idempotent);

            if (request.response.status === 401 && authProvider.invalidate) {
                authProvider.invalidate();
                request = await send(path, parameters, idempotent);
            }

            const {response, text} = request;
            const data = parseResponse(text);
            if (!response.ok) {
                const isAuthError = response.status === 401 || response.status === 403;
                throw new GatewayError(
                    isAuthError
                        ? `DataLens API rejected authorization for POST ${path}`
                        : `DataLens API request failed: POST ${path}`,
                    {
                        kind: isAuthError ? 'auth' : 'api',
                        code: isAuthError ? 'AUTH_REJECTED' : 'API_ERROR',
                        status: response.status,
                        requestId: getRequestId(response),
                        retryable: idempotent && isRetryableStatus(response.status),
                        details: {response: data},
                    },
                );
            }

            return data;
        },
    };
};
