import {validateHttpsUrl} from '../../utils';

import type {CommonConfig, Installation} from './types';

const DEFAULT_MAX_RESPONSE_CHARS = 100_000;

const parseMaxResponseChars = (raw: string | undefined): number => {
    if (!raw) {
        return DEFAULT_MAX_RESPONSE_CHARS;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_RESPONSE_CHARS;
};

export const requireApiUrl = (installation: Installation): string => {
    const apiUrl = process.env.DATALENS_API_URL;
    if (!apiUrl) {
        throw new Error(
            `DATALENS_API_URL env is not set (required for the ${installation} installation)`,
        );
    }
    return apiUrl;
};

export const loadCommonConfig = (
    baseUrl: string,
    getSchemaPath: (apiVersion: string) => string = () => '/json/',
): CommonConfig => {
    const apiUrl = baseUrl.replace(/\/$/, '');
    const apiVersion = process.env.DATALENS_API_VERSION ?? 'latest';
    const schemaUrl = process.env.DATALENS_SCHEMA_URL ?? `${apiUrl}${getSchemaPath(apiVersion)}`;
    validateHttpsUrl(apiUrl, 'DATALENS_API_URL');
    validateHttpsUrl(schemaUrl, 'DATALENS_SCHEMA_URL');
    return {
        apiUrl,
        schemaUrl,
        apiVersion,
        maxResponseChars: parseMaxResponseChars(process.env.DATALENS_MAX_RESPONSE_CHARS),
    };
};
