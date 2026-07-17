import type {AppConfig, Installation, WriteMode, YcIamConfig} from './types';

const DEFAULT_MAX_RESPONSE_CHARS = 100_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_RESULT_TTL_MS = 10 * 60_000;
const DEFAULT_RESULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_RESULT_STORE_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_PLAN_TTL_MS = 5 * 60_000;
const DEFAULT_INSTALLATION: Installation = 'cloud';
const DEFAULT_WRITE_MODE: WriteMode = 'planned';
const DEFAULT_CLOUD_API_URL = 'https://api.datalens.tech';
const DEFAULT_YC_BIN = 'yc';

const parsePositiveInteger = (raw: string | undefined, fallback: number): number => {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

const parseInstallation = (raw: string | undefined): Installation =>
    raw?.trim().toLowerCase() === 'internal' ? 'internal' : DEFAULT_INSTALLATION;

const parseBool = (raw: string | undefined): boolean =>
    raw === '1' || raw?.toLowerCase() === 'true';

const parseWriteMode = (raw: string | undefined): WriteMode => {
    if (!raw) {
        return DEFAULT_WRITE_MODE;
    }

    const value = raw.trim().toLowerCase();
    if (value === 'direct' || value === 'planned' || value === 'disabled') {
        return value;
    }

    throw new Error(
        `Invalid DATALENS_MCP_WRITE_MODE: ${raw}. Expected direct, planned, or disabled.`,
    );
};

const parseCommandList = (raw: string | undefined): string[] =>
    raw
        ? [
              ...new Set(
                  raw
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
              ),
          ]
        : [];

const getYcIamConfig = (): YcIamConfig => ({
    profile: process.env.DATALENS_YC_PROFILE || undefined,
    bin: process.env.DATALENS_YC_BIN || DEFAULT_YC_BIN,
});

export const loadConfig = (): AppConfig => {
    const installation = parseInstallation(process.env.DATALENS_INSTALLATION);
    const isCloud = installation === 'cloud';
    const useStaticCloudAuth = isCloud && parseBool(process.env.DATALENS_YC_STATIC_AUTH);
    const authHeader = process.env.DATALENS_API_AUTH_HEADER?.trim() || undefined;

    if (!isCloud && !process.env.DATALENS_API_URL) {
        throw new Error('DATALENS_API_URL env is not set (required for the internal installation)');
    }
    const apiUrl = (process.env.DATALENS_API_URL || DEFAULT_CLOUD_API_URL).replace(/\/$/, '');

    const orgId = process.env.DATALENS_ORG_ID;
    if (isCloud && !orgId) {
        throw new Error('DATALENS_ORG_ID env is not set (required for the cloud installation)');
    }
    if (useStaticCloudAuth && !authHeader) {
        throw new Error(
            'DATALENS_API_AUTH_HEADER env is not set (required when DATALENS_YC_STATIC_AUTH is enabled)',
        );
    }

    let ycIam: YcIamConfig | undefined;

    if (isCloud && !useStaticCloudAuth) {
        ycIam = getYcIamConfig();
    }

    return {
        apiUrl,
        installation,
        orgId: isCloud ? orgId : undefined,
        authHeader,
        ycIam,
        schemaUrl: process.env.DATALENS_SCHEMA_URL ?? `${apiUrl}/json/`,
        schemaPath: process.env.DATALENS_SCHEMA_PATH || undefined,
        schemaCachePath: process.env.DATALENS_SCHEMA_CACHE_PATH || undefined,
        apiVersion: process.env.DATALENS_API_VERSION ?? 'latest',
        maxResponseChars: parsePositiveInteger(
            process.env.DATALENS_MAX_RESPONSE_CHARS,
            DEFAULT_MAX_RESPONSE_CHARS,
        ),
        requestTimeoutMs: parsePositiveInteger(
            process.env.DATALENS_REQUEST_TIMEOUT_MS,
            DEFAULT_REQUEST_TIMEOUT_MS,
        ),
        writeMode: parseWriteMode(process.env.DATALENS_MCP_WRITE_MODE),
        allowDestructive: parseBool(process.env.DATALENS_MCP_ALLOW_DESTRUCTIVE),
        allowCommands: parseCommandList(process.env.DATALENS_MCP_ALLOW_COMMANDS),
        denyCommands: parseCommandList(process.env.DATALENS_MCP_DENY_COMMANDS),
        resultTtlMs: parsePositiveInteger(
            process.env.DATALENS_RESULT_TTL_MS,
            DEFAULT_RESULT_TTL_MS,
        ),
        resultMaxBytes: parsePositiveInteger(
            process.env.DATALENS_RESULT_MAX_BYTES,
            DEFAULT_RESULT_MAX_BYTES,
        ),
        resultStoreMaxBytes: parsePositiveInteger(
            process.env.DATALENS_RESULT_STORE_MAX_BYTES,
            DEFAULT_RESULT_STORE_MAX_BYTES,
        ),
        planTtlMs: parsePositiveInteger(process.env.DATALENS_PLAN_TTL_MS, DEFAULT_PLAN_TTL_MS),
    };
};
