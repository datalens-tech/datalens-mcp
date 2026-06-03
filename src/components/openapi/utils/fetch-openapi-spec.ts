import type {AppConfig} from '../../config';
import type {OpenAPISpec} from '../types';

export const fetchOpenAPISpec = async (config: AppConfig): Promise<OpenAPISpec> => {
    const res = await fetch(config.schemaUrl, {
        headers: {
            'content-type': 'application/json',
        },
    });

    if (!res.ok) {
        throw new Error(
            `Failed to fetch OpenAPI schema from ${config.schemaUrl}: ${res.status} ${res.statusText}`,
        );
    }

    return res.json() as Promise<OpenAPISpec>;
};
