import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {stubConfigEnv} from '../../../__tests__/helpers/config';
import {loadStdioConfig} from '../config';

describe('stdio cloud credentials', () => {
    beforeEach(() => stubConfigEnv({DATALENS_ORG_ID: 'org1'}));
    afterEach(() => vi.unstubAllEnvs());

    it('uses yc with the active profile by default', () => {
        expect(loadStdioConfig()).toMatchObject({
            installation: 'cloud',
            authHeader: undefined,
            ycIam: {bin: 'yc', profile: undefined},
        });
    });

    it('honors yc binary and profile overrides', () => {
        vi.stubEnv('DATALENS_YC_PROFILE', 'prod');
        vi.stubEnv('DATALENS_YC_BIN', '/usr/local/bin/yc');
        expect(loadStdioConfig().ycIam).toEqual({profile: 'prod', bin: '/usr/local/bin/yc'});
    });

    it.each(['true', '1'])('uses a static header when DATALENS_YC_STATIC_AUTH=%s', (value) => {
        vi.stubEnv('DATALENS_YC_STATIC_AUTH', value);
        vi.stubEnv('DATALENS_API_AUTH_HEADER', 'Bearer static-token');
        vi.stubEnv('DATALENS_OAUTH_TOKEN', 'internal-only-token');

        expect(loadStdioConfig()).toMatchObject({
            installation: 'cloud',
            authHeader: 'Bearer static-token',
            ycIam: undefined,
        });
    });
});

describe('stdio internal credentials', () => {
    beforeEach(() =>
        stubConfigEnv({
            DATALENS_INSTALLATION: 'internal',
            DATALENS_API_URL: 'https://api.example.com',
        }),
    );
    afterEach(() => vi.unstubAllEnvs());

    it('uses a configured header without yc settings', () => {
        vi.stubEnv('DATALENS_API_AUTH_HEADER', 'Bearer token');
        vi.stubEnv('DATALENS_YC_PROFILE', 'prod');
        expect(loadStdioConfig()).toMatchObject({
            installation: 'internal',
            ycIam: undefined,
            authHeader: 'Bearer token',
        });
    });

    it.each([undefined, 'Legacy header'])('prefers OAuth to the static header (%s)', (header) => {
        vi.stubEnv('DATALENS_OAUTH_TOKEN', 'oauth-token');
        vi.stubEnv('DATALENS_API_AUTH_HEADER', header);
        expect(loadStdioConfig().authHeader).toBe('OAuth oauth-token');
    });
});
