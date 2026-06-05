import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {loadConfig, parseExtraHeaders} from './utils';

describe('parseExtraHeaders', () => {
    it('returns an empty object for undefined or empty input', () => {
        expect(parseExtraHeaders(undefined)).toEqual({});
        expect(parseExtraHeaders('')).toEqual({});
    });

    it('parses semicolon-separated KEY=VALUE pairs and trims whitespace', () => {
        expect(parseExtraHeaders('x-a=1; x-b = 2 ')).toEqual({'x-a': '1', 'x-b': '2'});
    });

    it('keeps "=" characters that appear inside the value', () => {
        expect(parseExtraHeaders('x-token=a=b=c')).toEqual({'x-token': 'a=b=c'});
    });

    it('skips malformed pairs without an "="', () => {
        expect(parseExtraHeaders('garbage;x-a=1')).toEqual({'x-a': '1'});
    });
});

describe('loadConfig', () => {
    const ENV_KEYS = [
        'DATALENS_API_URL',
        'DATALENS_API_AUTH_HEADER',
        'DATALENS_HEADERS',
        'DATALENS_SCHEMA_URL',
        'DATALENS_API_VERSION',
        'DATALENS_MAX_RESPONSE_CHARS',
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

    it('throws when DATALENS_API_URL is missing', () => {
        expect(() => loadConfig()).toThrow('DATALENS_API_URL');
    });

    it('strips a trailing slash from the api url', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080/';
        expect(loadConfig().apiUrl).toBe('http://localhost:8080');
    });

    it('derives sensible defaults', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080';
        const config = loadConfig();

        expect(config.schemaUrl).toBe('http://localhost:8080/json/');
        expect(config.apiVersion).toBe('latest');
        expect(config.authHeader).toBeUndefined();
        expect(config.extraHeaders).toEqual({});
        expect(config.maxResponseChars).toBe(100_000);
    });

    it('honours explicit overrides', () => {
        process.env.DATALENS_API_URL = 'http://localhost:8080';
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
        process.env.DATALENS_MAX_RESPONSE_CHARS = 'not-a-number';
        expect(loadConfig().maxResponseChars).toBe(100_000);

        process.env.DATALENS_MAX_RESPONSE_CHARS = '-5';
        expect(loadConfig().maxResponseChars).toBe(100_000);
    });
});
