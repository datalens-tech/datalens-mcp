import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {stubConfigEnv} from '../../../__tests__/helpers/config';
import {loadConfigCommon} from '../utils';

describe('common configuration', () => {
    beforeEach(() => stubConfigEnv({DATALENS_ORG_ID: 'org1'}));
    afterEach(() => vi.unstubAllEnvs());

    it('uses cloud defaults', () => {
        expect(loadConfigCommon()).toEqual({
            installation: 'cloud',
            orgId: 'org1',
            apiUrl: 'https://api.datalens.tech',
            schemaUrl: 'https://api.datalens.tech/json/',
            apiVersion: 'latest',
            maxResponseChars: 100_000,
        });
    });

    it('requires an organization for cloud', () => {
        vi.stubEnv('DATALENS_ORG_ID', undefined);
        expect(() => loadConfigCommon()).toThrow('DATALENS_ORG_ID');
    });

    it('requires an explicit API URL for internal installations', () => {
        vi.stubEnv('DATALENS_INSTALLATION', 'internal');
        expect(() => loadConfigCommon()).toThrow('DATALENS_API_URL');
    });

    it('strips the trailing API slash before deriving the schema URL', () => {
        vi.stubEnv('DATALENS_API_URL', 'https://api.example.com/');
        expect(loadConfigCommon()).toMatchObject({
            apiUrl: 'https://api.example.com',
            schemaUrl: 'https://api.example.com/json/',
        });
    });

    it('honors explicit schema, API version and response-size overrides', () => {
        vi.stubEnv('DATALENS_SCHEMA_URL', 'https://schema.example/spec.json');
        vi.stubEnv('DATALENS_API_VERSION', '1.2.3');
        vi.stubEnv('DATALENS_MAX_RESPONSE_CHARS', '500');
        expect(loadConfigCommon()).toMatchObject({
            schemaUrl: 'https://schema.example/spec.json',
            apiVersion: '1.2.3',
            maxResponseChars: 500,
        });
    });

    it.each(['not-a-number', '-5'])('falls back to the response-size default for %s', (value) => {
        vi.stubEnv('DATALENS_MAX_RESPONSE_CHARS', value);
        expect(loadConfigCommon().maxResponseChars).toBe(100_000);
    });

    describe.each(['DATALENS_API_URL', 'DATALENS_SCHEMA_URL'])('%s', (key) => {
        it.each(['http://api.example.com', 'https://user:secret@api.example.com'])(
            'rejects unsafe URL %s',
            (value) => {
                vi.stubEnv(key, value);
                expect(() => loadConfigCommon()).toThrow(key);
            },
        );
    });
});
