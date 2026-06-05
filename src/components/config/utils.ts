import {AppConfig} from './types';

const DEFAULT_MAX_RESPONSE_CHARS = 100_000;

export const parseExtraHeaders = (headersStr: string | undefined): Record<string, string> => {
    const result: Record<string, string> = {};
    if (!headersStr) {
        return result;
    }

    for (const pair of headersStr.split(';')) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx > 0) {
            result[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
        }
    }

    return result;
};

const parseMaxResponseChars = (raw: string | undefined): number => {
    if (!raw) {
        return DEFAULT_MAX_RESPONSE_CHARS;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_RESPONSE_CHARS;
};

export const loadConfig = (): AppConfig => {
    if (!process.env.DATALENS_API_URL) {
        throw new Error('DATALENS_API_URL env is not set');
    }

    const apiUrl = process.env.DATALENS_API_URL.replace(/\/$/, '');

    return {
        apiUrl,
        authHeader: process.env.DATALENS_API_AUTH_HEADER,
        extraHeaders: parseExtraHeaders(process.env.DATALENS_HEADERS),
        schemaUrl: process.env.DATALENS_SCHEMA_URL ?? `${apiUrl}/json/`,
        apiVersion: process.env.DATALENS_API_VERSION ?? 'latest',
        maxResponseChars: parseMaxResponseChars(process.env.DATALENS_MAX_RESPONSE_CHARS),
    };
};
