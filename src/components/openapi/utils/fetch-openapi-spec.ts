import {withRequestTimeout} from '../../../utils';
import type {AppConfig} from '../../config';
import type {OpenAPISpec} from '../types';

export const fetchOpenAPISpec = async (config: AppConfig): Promise<OpenAPISpec> => {
    const res = await withRequestTimeout(config.schemaUrl, (signal) =>
        fetch(config.schemaUrl, {
            headers: {
                'content-type': 'application/json',
            },
            signal,
        }),
    );

    if (!res.ok) {
        throw new Error(
            `Failed to fetch OpenAPI schema from ${config.schemaUrl}: ${res.status} ${res.statusText}`,
        );
    }

    return res.json() as Promise<OpenAPISpec>;
};
