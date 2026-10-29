import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {INSTALLATION} from './constants';
import {loadConfig} from './load-config';

describe('loadConfig', () => {
    const ENV_KEYS = [
        'DATALENS_API_URL',
        'DATALENS_API_AUTH_HEADER',
        'DATALENS_OAUTH_TOKEN',
        'DATALENS_SCHEMA_URL',
        'DATALENS_API_VERSION',
        'DATALENS_MAX_RESPONSE_CHARS',
        'DATALENS_INSTALLATION',
        'DATALENS_ORG_ID',
        'DATALENS_YC_STATIC_AUTH',
        'DATALENS_YC_PROFILE',
        'DATALENS_YC_BIN',
        'DATALENS_SERVICE_ACCOUNT_KEY_FILE',
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

    it.each(['DATALENS_API_URL', 'DATALENS_SCHEMA_URL'])(
        'rejects plaintext and embedded credentials in %s',
        (key) => {
            process.env.DATALENS_ORG_ID = 'org1';
            for (const value of ['http://api.example.com', 'https://user:secret@api.example.com']) {
                process.env[key] = value;
                expect(() => loadConfig()).toThrow(key);
            }
        },
    );

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
        process.env.DATALENS_API_URL = 'https://api.example.com/';
        process.env.DATALENS_ORG_ID = 'org1';
        expect(loadConfig().apiUrl).toBe('https://api.example.com');
    });

    it('derives sensible defaults', () => {
        process.env.DATALENS_API_URL = 'https://api.example.com';
        process.env.DATALENS_ORG_ID = 'org1';
        const config = loadConfig();

        expect(config.schemaUrl).toBe('https://api.example.com/json/');
        expect(config.apiVersion).toBe('latest');
        expect(config.auth).not.toHaveProperty('header');
        expect(config.maxResponseChars).toBe(100_000);
        // defaults to the cloud installation (IAM token via yc)
        expect(config.installation).toBe('cloud');
        expect(config).toHaveProperty('orgId', 'org1');
        expect(config.auth).toEqual({
            type: 'yc-iam',
            profile: undefined,
            bin: 'yc',
        });
    });

    it('throws when DATALENS_ORG_ID is missing on the cloud installation', () => {
        process.env.DATALENS_API_URL = 'https://api.example.com';
        expect(() => loadConfig()).toThrow('DATALENS_ORG_ID');
    });

    it('honours explicit overrides', () => {
        process.env.DATALENS_API_URL = 'https://api.example.com';
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_SCHEMA_URL = 'https://schema.example/spec.json';
        process.env.DATALENS_API_VERSION = '1.2.3';
        process.env.DATALENS_API_AUTH_HEADER = 'Bearer token';
        process.env.DATALENS_YC_STATIC_AUTH = 'true';
        process.env.DATALENS_MAX_RESPONSE_CHARS = '500';
        const config = loadConfig();

        expect(config.schemaUrl).toBe('https://schema.example/spec.json');
        expect(config.apiVersion).toBe('1.2.3');
        expect(config.auth).toEqual({type: 'static', header: 'Bearer token'});
        expect(config.maxResponseChars).toBe(500);
    });

    it('falls back to the default for an invalid maxResponseChars', () => {
        process.env.DATALENS_API_URL = 'https://api.example.com';
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_MAX_RESPONSE_CHARS = 'not-a-number';
        expect(loadConfig().maxResponseChars).toBe(100_000);

        process.env.DATALENS_MAX_RESPONSE_CHARS = '-5';
        expect(loadConfig().maxResponseChars).toBe(100_000);
    });

    it('uses the internal installation without ycIam settings', () => {
        process.env.DATALENS_API_URL = 'https://api.example.com';
        process.env.DATALENS_INSTALLATION = 'internal';
        process.env.DATALENS_API_AUTH_HEADER = 'Bearer token';
        process.env.DATALENS_YC_PROFILE = 'prod';
        const config = loadConfig();

        expect(config.installation).toBe('internal');
        expect(config.auth.type).toBe('static');
        expect(config.auth).toEqual({type: 'static', header: 'Bearer token'});
    });

    it('uses DATALENS_OAUTH_TOKEN for the internal installation', () => {
        process.env.DATALENS_API_URL = 'https://api.example.com';
        process.env.DATALENS_INSTALLATION = 'internal';
        process.env.DATALENS_OAUTH_TOKEN = 'oauth-token';

        expect(loadConfig().auth).toEqual({type: 'static', header: 'OAuth oauth-token'});
    });

    it('prefers DATALENS_OAUTH_TOKEN to DATALENS_API_AUTH_HEADER internally', () => {
        process.env.DATALENS_API_URL = 'https://api.example.com';
        process.env.DATALENS_INSTALLATION = 'internal';
        process.env.DATALENS_OAUTH_TOKEN = 'oauth-token';
        process.env.DATALENS_API_AUTH_HEADER = 'Legacy header';

        expect(loadConfig().auth).toEqual({type: 'static', header: 'OAuth oauth-token'});
    });

    it('uses a static auth header on cloud when DATALENS_YC_STATIC_AUTH=true', () => {
        process.env.DATALENS_API_URL = 'https://api.example.com';
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_YC_STATIC_AUTH = 'true';
        process.env.DATALENS_API_AUTH_HEADER = 'Bearer static-token';
        process.env.DATALENS_OAUTH_TOKEN = 'internal-oauth-token';
        const config = loadConfig();

        expect(config.installation).toBe('cloud');
        expect(config.auth).toEqual({type: 'static', header: 'Bearer static-token'});
        expect(config.auth.type).toBe('static');
    });

    it('uses a static auth header on cloud when DATALENS_YC_STATIC_AUTH=1', () => {
        process.env.DATALENS_API_URL = 'https://api.example.com';
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_YC_STATIC_AUTH = '1';
        process.env.DATALENS_API_AUTH_HEADER = 'Bearer static-token';
        const config = loadConfig();

        expect(config.auth.type).toBe('static');
    });

    it('honours ycIam overrides on the cloud installation', () => {
        process.env.DATALENS_API_URL = 'https://api.example.com';
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_INSTALLATION = 'cloud';
        process.env.DATALENS_YC_PROFILE = 'prod';
        process.env.DATALENS_YC_BIN = '/usr/local/bin/yc';
        expect(loadConfig().auth).toEqual({
            type: 'yc-iam',
            profile: 'prod',
            bin: '/usr/local/bin/yc',
        });
    });

    it('rejects unknown installations', () => {
        process.env.DATALENS_INSTALLATION = 'enterprize';
        expect(() => loadConfig()).toThrow('DATALENS_INSTALLATION');
    });

    it.each(['cloud', 'internal', 'enterprise'])(
        'keeps only settings applicable to the %s installation',
        (installation) => {
            process.env.DATALENS_INSTALLATION = installation;
            process.env.DATALENS_API_URL = 'https://api.example.com';
            process.env.DATALENS_ORG_ID = 'org1';
            process.env.DATALENS_OAUTH_TOKEN = 'internal-token';
            process.env.DATALENS_YC_PROFILE = 'cloud-profile';
            process.env.DATALENS_SERVICE_ACCOUNT_KEY_FILE = '/keys/enterprise.json';
            const config = loadConfig();

            expect(config).not.toHaveProperty('authHeader');
            expect(config).not.toHaveProperty('ycIam');
            expect(config).not.toHaveProperty('serviceAccountKeyFile');
            switch (config.installation) {
                case INSTALLATION.CLOUD:
                    expect(config.orgId).toBe('org1');
                    expect(config.auth).toEqual({
                        type: 'yc-iam',
                        profile: 'cloud-profile',
                        bin: 'yc',
                    });
                    break;
                case INSTALLATION.INTERNAL:
                    expect(config).not.toHaveProperty('orgId');
                    expect(config.auth).toEqual({type: 'static', header: 'OAuth internal-token'});
                    break;
                case INSTALLATION.ENTERPRISE:
                    expect(config).not.toHaveProperty('orgId');
                    expect(config.auth).toEqual({
                        type: 'service-account',
                        keyFile: '/keys/enterprise.json',
                    });
                    break;
            }
        },
    );

    it('does not keep a static header when cloud CLI auth is selected', () => {
        process.env.DATALENS_ORG_ID = 'org1';
        process.env.DATALENS_API_AUTH_HEADER = 'Bearer unused';
        expect(loadConfig().auth).toEqual({type: 'yc-iam', profile: undefined, bin: 'yc'});
    });

    describe.each([
        [INSTALLATION.CLOUD, ''],
        [INSTALLATION.INTERNAL, ''],
        [INSTALLATION.ENTERPRISE, '/api/docs/swagger'],
    ])('%s schema version', (installation, schemaPrefix) => {
        beforeEach(() => {
            process.env.DATALENS_INSTALLATION = installation;
            process.env.DATALENS_API_URL = 'https://api.example.com/';
            process.env.DATALENS_ORG_ID = 'org1';
            process.env.DATALENS_API_AUTH_HEADER = 'Bearer token';
        });

        it.each([undefined, 'latest', '2'])(
            'matches schema and RPC versions when DATALENS_API_VERSION is %s',
            (apiVersion) => {
                if (apiVersion !== undefined) {
                    process.env.DATALENS_API_VERSION = apiVersion;
                }
                const config = loadConfig();
                const schemaPath = apiVersion === '2' ? '/2/json/' : '/json/';
                expect(config.schemaUrl).toBe(
                    `https://api.example.com${schemaPrefix}${schemaPath}`,
                );
                expect(config.apiVersion).toBe(apiVersion ?? 'latest');
            },
        );

        it('preserves an explicit schema URL with a pinned API version', () => {
            process.env.DATALENS_API_VERSION = '2';
            process.env.DATALENS_SCHEMA_URL = 'https://schema.example.com/custom.json?version=2';
            const config = loadConfig();
            expect(config.schemaUrl).toBe(process.env.DATALENS_SCHEMA_URL);
            expect(config.apiVersion).toBe('2');
        });
    });

    describe('enterprise', () => {
        beforeEach(() => {
            process.env.DATALENS_INSTALLATION = 'enterprise';
            process.env.DATALENS_API_URL = 'https://datalens.example.com';
            process.env.DATALENS_SERVICE_ACCOUNT_KEY_FILE = '/keys/sa.json';
        });

        it('uses the enterprise schema and key without cloud settings', () => {
            process.env.DATALENS_OAUTH_TOKEN = 'ignored';
            process.env.DATALENS_ORG_ID = 'ignored';
            expect(loadConfig()).toMatchObject({
                installation: INSTALLATION.ENTERPRISE,
                schemaUrl: 'https://datalens.example.com/api/docs/swagger/json/',
                auth: {type: 'service-account', keyFile: '/keys/sa.json'},
            });
        });

        it('requires an API URL', () => {
            delete process.env.DATALENS_API_URL;
            expect(() => loadConfig()).toThrow('DATALENS_API_URL');
        });

        it('requires exactly one credential source', () => {
            process.env.DATALENS_API_AUTH_HEADER = 'Bearer token';
            expect(() => loadConfig()).toThrow('exactly one');
            delete process.env.DATALENS_SERVICE_ACCOUNT_KEY_FILE;
            expect(loadConfig().auth).toEqual({type: 'static', header: 'Bearer token'});
            delete process.env.DATALENS_API_AUTH_HEADER;
            expect(() => loadConfig()).toThrow('exactly one');
        });

        it.each(['OAuth secret', 'Bearer ', 'Bearer token\nextra'])(
            'rejects invalid static auth',
            (header) => {
                delete process.env.DATALENS_SERVICE_ACCOUNT_KEY_FILE;
                process.env.DATALENS_API_AUTH_HEADER = header;
                expect(() => loadConfig()).toThrow('Bearer');
            },
        );
    });
});
