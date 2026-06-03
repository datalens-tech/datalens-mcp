import {AppConfig} from './types';

const parseExtraHeaders = (headersStr: string | undefined): Record<string, string> => {
    const result: Record<string, string> = {};
    if (!headersStr) {
        return result;
    }

    for (const pair of headersStr.split(',')) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx > 0) {
            result[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
        }
    }

    return result;
};

export const loadConfig = (): AppConfig => {
    if (!process.env.DATALENS_API_URL) {
        throw new Error('DATALENS_API_URL env is not set');
    }

    const apiUrl = process.env.DATALENS_API_URL.replace(/\/$/, '');

    return {
        apiUrl,
        apiToken: process.env.DATALENS_API_TOKEN,
        extraHeaders: parseExtraHeaders(process.env.DATALENS_HEADERS),
        schemaUrl: process.env.DATALENS_SCHEMA_URL ?? `${apiUrl}/json/`,
        apiVersion: process.env.DATALENS_API_VERSION ?? 'latest',
    };
};
