import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {loadConfig} from './utils';

describe('loadConfig', () => {
    const ENV_KEYS = [
        'DATALENS_API_URL',
        'DATALENS_API_AUTH_HEADER',
        'DATALENS_SCHEMA_URL',
        'DATALENS_SCHEMA_PATH',
        'DATALENS_SCHEMA_CACHE_PATH',
        'DATALENS_API_VERSION',
        'DATALENS_MAX_RESPONSE_CHARS',
        'DATALENS_REQUEST_TIMEOUT_MS',
        'DATALENS_INSTALLATION',
        'DATALENS_ORG_ID',
        'DATALENS_YC_STATIC_AUTH',
        'DATALENS_YC_PROFILE',
        'DATALENS_YC_BIN',
        'DATALENS_MCP_WRITE_MODE',
        'DATALENS_MCP_ALLOW_DESTRUCTIVE',
        'DATALENS_MCP_ALLOW_COMMANDS',
        'DATALENS_MCP_DENY_COMMANDS',
        'DATALENS_RESULT_TTL_MS',
        'DATALENS_RESULT_MAX_BYTES',
        'DATALENS_RESULT_STORE_MAX_BYTES',
        'DATALENS_PLAN_TTL_MS',
    ];
    let saved: Record<string, string | undefined>;

    beforeEach(() => {
        saved = {};
        for (const key of ENV_KEYS) {
            saved[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (saved[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = saved[key];
            }
        }
    });

    it('defaults the api url to the public cloud endpoint when DATALENS_API_URL is missing', () => {
        process.env.DATALENS_ORG_ID = 'org1';
        const config = loadConfig();

        expect(config.apiUrl).toBe('https://api.datalens.tech');
        expect(config.schemaUrl).toBe('https://api.datalens.tech/json/');
    });

    it('throws when DATALENS_API_URL is missing on the internal installation', () => {
        process.env.DATALENS_INSTALLATION = 'internal';
        expect(() => loadConfig()).toThrow('DATALENS_API_URL');
    });

    it('strips a trailing slash from the api url', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080/';
        process.env.DATALENS_ORG_ID = 'org1';
        expect(loadConfig().apiUrl).toBe('http://localhost:8080');
    });

    it('derives sensible defaults', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080';
        process.env.DATALENS_ORG_ID = 'org1';
        const config = loadConfig();

        expect(config.schemaUrl).toBe('http://localhost:8080/json/');
        expect(config.apiVersion).toBe('latest');
        expect(config.authHeader).toBeUndefined();
        expect(config.maxResponseChars).toBe(100_000);
        expect(config.requestTimeoutMs).toBe(30_000);
        expect(config.writeMode).toBe('planned');
        expect(config.allowDestructive).toBe(false);
        expect(config.allowCommands).toEqual([]);
        expect(config.denyCommands).toEqual([]);
        expect(config.resultTtlMs).toBe(600_000);
        expect(config.resultMaxBytes).toBe(10 * 1024 * 1024);
        expect(config.resultStoreMaxBytes).toBe(50 * 1024 * 1024);
        expect(config.planTtlMs).toBe(300_000);
        // defaults to the cloud installation (IAM token via yc)
        expect(config.installation).toBe('cloud');
        expect(config.orgId).toBe('org1');
        expect(config.ycIam).toEqual({
            profile: undefined,
            bin: 'yc',
        });
    });

    it('throws when DATALENS_ORG_ID is missing on the cloud installation', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080';
        expect(() => loadConfig()).toThrow('DATALENS_ORG_ID');
    });

    it('honours explicit overrides', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080';
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_SCHEMA_URL = 'http://schema.example/spec.json';
        process.env.DATALENS_API_VERSION = '1.2.3';
        process.env.DATALENS_API_AUTH_HEADER = 'Bearer token';
        process.env.DATALENS_MAX_RESPONSE_CHARS = '500';
        process.env.DATALENS_REQUEST_TIMEOUT_MS = '1234';
        process.env.DATALENS_MCP_WRITE_MODE = 'direct';
        process.env.DATALENS_MCP_ALLOW_DESTRUCTIVE = 'true';
        process.env.DATALENS_MCP_ALLOW_COMMANDS = 'getA, updateB, getA';
        process.env.DATALENS_MCP_DENY_COMMANDS = 'deleteC';
        const config = loadConfig();

        expect(config.schemaUrl).toBe('http://schema.example/spec.json');
        expect(config.apiVersion).toBe('1.2.3');
        expect(config.authHeader).toBe('Bearer token');
        expect(config.maxResponseChars).toBe(500);
        expect(config.requestTimeoutMs).toBe(1234);
        expect(config.writeMode).toBe('direct');
        expect(config.allowDestructive).toBe(true);
        expect(config.allowCommands).toEqual(['getA', 'updateB']);
        expect(config.denyCommands).toEqual(['deleteC']);
    });

    it('falls back to the default for an invalid maxResponseChars', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080';
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_MAX_RESPONSE_CHARS = 'not-a-number';
        expect(loadConfig().maxResponseChars).toBe(100_000);

        process.env.DATALENS_MAX_RESPONSE_CHARS = '-5';
        expect(loadConfig().maxResponseChars).toBe(100_000);
    });

    it('uses the internal installation without ycIam settings', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080';
        process.env.DATALENS_INSTALLATION = 'internal';
        process.env.DATALENS_API_AUTH_HEADER = 'Bearer token';
        process.env.DATALENS_YC_PROFILE = 'prod';
        const config = loadConfig();

        expect(config.installation).toBe('internal');
        expect(config.ycIam).toBeUndefined();
        expect(config.authHeader).toBe('Bearer token');
    });

    it('uses a static auth header on cloud when DATALENS_YC_STATIC_AUTH=true', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080';
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_YC_STATIC_AUTH = 'true';
        process.env.DATALENS_API_AUTH_HEADER = 'Bearer static-token';
        const config = loadConfig();

        expect(config.installation).toBe('cloud');
        expect(config.authHeader).toBe('Bearer static-token');
        expect(config.ycIam).toBeUndefined();
    });

    it('uses a static auth header on cloud when DATALENS_YC_STATIC_AUTH=1', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080';
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_YC_STATIC_AUTH = '1';
        process.env.DATALENS_API_AUTH_HEADER = 'Bearer static-token';
        const config = loadConfig();

        expect(config.ycIam).toBeUndefined();
    });

    it('fails fast when cloud static auth is enabled without a header', () => {
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_YC_STATIC_AUTH = '1';

        expect(() => loadConfig()).toThrow('DATALENS_API_AUTH_HEADER');
    });

    it('rejects an invalid write mode', () => {
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_MCP_WRITE_MODE = 'unsafe';

        expect(() => loadConfig()).toThrow('DATALENS_MCP_WRITE_MODE');
    });

    it('honours ycIam overrides on the cloud installation', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080';
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_INSTALLATION = 'cloud';
        process.env.DATALENS_YC_PROFILE = 'prod';
        process.env.DATALENS_YC_BIN = '/usr/local/bin/yc';
        expect(loadConfig().ycIam).toEqual({
            profile: 'prod',
            bin: '/usr/local/bin/yc',
        });
    });
});
