import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {loadConfig} from './utils';

describe('loadConfig', () => {
    const ENV_KEYS = [
        'DATALENS_API_URL',
        'DATALENS_API_AUTH_HEADER',
        'DATALENS_SCHEMA_URL',
        'DATALENS_API_VERSION',
        'DATALENS_MAX_RESPONSE_CHARS',
        'DATALENS_INSTALLATION',
        'DATALENS_ORG_ID',
        'DATALENS_YC_STATIC_AUTH',
        'DATALENS_YC_PROFILE',
        'DATALENS_YC_BIN',
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

    it('throws when DATALENS_API_URL is missing on the yandex installation', () => {
        process.env.DATALENS_INSTALLATION = 'yandex';
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
        const config = loadConfig();

        expect(config.schemaUrl).toBe('http://schema.example/spec.json');
        expect(config.apiVersion).toBe('1.2.3');
        expect(config.authHeader).toBe('Bearer token');
        expect(config.maxResponseChars).toBe(500);
    });

    it('falls back to the default for an invalid maxResponseChars', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080';
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_MAX_RESPONSE_CHARS = 'not-a-number';
        expect(loadConfig().maxResponseChars).toBe(100_000);

        process.env.DATALENS_MAX_RESPONSE_CHARS = '-5';
        expect(loadConfig().maxResponseChars).toBe(100_000);
    });

    it('uses the yandex installation without ycIam settings', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080';
        process.env.DATALENS_INSTALLATION = 'yandex';
        process.env.DATALENS_API_AUTH_HEADER = 'Bearer token';
        process.env.DATALENS_YC_PROFILE = 'prod';
        const config = loadConfig();

        expect(config.installation).toBe('yandex');
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
