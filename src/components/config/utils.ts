import {AppConfig, Installation, YcIamConfig} from './types';

const DEFAULT_MAX_RESPONSE_CHARS = 100_000;
const DEFAULT_INSTALLATION: Installation = 'cloud';
const DEFAULT_CLOUD_API_URL = 'https://api.datalens.tech';
const DEFAULT_YC_BIN = 'yc';

const parseMaxResponseChars = (raw: string | undefined): number => {
    if (!raw) {
        return DEFAULT_MAX_RESPONSE_CHARS;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_RESPONSE_CHARS;
};

const parseInstallation = (raw: string | undefined): Installation =>
    raw?.trim().toLowerCase() === 'internal' ? 'internal' : DEFAULT_INSTALLATION;

const parseBool = (raw: string | undefined): boolean =>
    raw === '1' || raw?.toLowerCase() === 'true';

const getYcIamConfig = (): YcIamConfig => ({
    profile: process.env.DATALENS_YC_PROFILE || undefined,
    bin: process.env.DATALENS_YC_BIN || DEFAULT_YC_BIN,
});

export const loadConfig = (): AppConfig => {
    const installation = parseInstallation(process.env.DATALENS_INSTALLATION);
    const isCloud = installation === 'cloud';

    if (!isCloud && !process.env.DATALENS_API_URL) {
        throw new Error('DATALENS_API_URL env is not set (required for the internal installation)');
    }
    const apiUrl = (process.env.DATALENS_API_URL || DEFAULT_CLOUD_API_URL).replace(/\/$/, '');

    const orgId = process.env.DATALENS_ORG_ID;
    if (isCloud && !orgId) {
        throw new Error('DATALENS_ORG_ID env is not set (required for the cloud installation)');
    }

    let ycIam: YcIamConfig | undefined;

    if (isCloud && !parseBool(process.env.DATALENS_YC_STATIC_AUTH)) {
        ycIam = getYcIamConfig();
    }

    return {
        apiUrl,
        installation,
        orgId: isCloud ? orgId : undefined,
        authHeader: process.env.DATALENS_API_AUTH_HEADER,
        ycIam,
        schemaUrl: process.env.DATALENS_SCHEMA_URL ?? `${apiUrl}/json/`,
        apiVersion: process.env.DATALENS_API_VERSION ?? 'latest',
        maxResponseChars: parseMaxResponseChars(process.env.DATALENS_MAX_RESPONSE_CHARS),
    };
};
