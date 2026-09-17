import {
    MAX_OPENAPI_RESPONSE_BYTES,
    readResponseText,
    validateHttpsUrl,
    withRequestTimeout,
} from '../../../utils';
import type {AppConfig} from '../../config';
import type {OpenAPISpec} from '../types';

import {validateOpenAPIStructure} from './validate-openapi-structure';

export const fetchOpenAPISpec = async (config: AppConfig): Promise<OpenAPISpec> => {
    validateHttpsUrl(config.schemaUrl, 'DATALENS_SCHEMA_URL');
    const schemaOrigin = new URL(config.schemaUrl).origin;
    return withRequestTimeout('OpenAPI schema', async (signal) => {
        const res = await fetch(config.schemaUrl, {
            headers: {
                'content-type': 'application/json',
            },
            signal,
            redirect: 'error',
        });

        if (!res.ok) {
            await res.body?.cancel();
            throw new Error(
                `Failed to fetch OpenAPI schema from ${schemaOrigin}: HTTP ${res.status}`,
            );
        }

        const text = await readResponseText(res, MAX_OPENAPI_RESPONSE_BYTES);
        let spec: unknown;
        try {
            spec = JSON.parse(text);
        } catch {
            throw new Error('OpenAPI schema is not valid JSON');
        }
        validateOpenAPIStructure(spec);
        return spec as OpenAPISpec;
    });
};
