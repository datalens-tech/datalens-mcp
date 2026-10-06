import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {loadHttpConfig} from '../config';

describe('HTTP configuration', () => {
    afterEach(() => vi.unstubAllEnvs());

    beforeEach(() => {
        vi.stubEnv('DATALENS_INSTALLATION', 'internal');
        vi.stubEnv('DATALENS_API_URL', 'https://api.example.com');
    });

    it('requires the internal installation', () => {
        vi.stubEnv('DATALENS_INSTALLATION', 'cloud');
        expect(() => loadHttpConfig()).toThrow('DATALENS_INSTALLATION=internal');
    });

    it('uses the default HTTP port and accepts an explicit port', () => {
        vi.stubEnv('MCP_PORT', undefined);
        expect(loadHttpConfig()).toMatchObject({
            installation: 'internal',
            apiUrl: 'https://api.example.com',
            port: 3000,
        });
        vi.stubEnv('MCP_PORT', '8080');
        expect(loadHttpConfig()).toMatchObject({
            installation: 'internal',
            apiUrl: 'https://api.example.com',
            port: 8080,
        });
    });

    it('rejects invalid ports', () => {
        for (const port of ['0', '-1', '65536', '3.5', '3e3', '']) {
            vi.stubEnv('MCP_PORT', port);
            expect(() => loadHttpConfig()).toThrow('MCP_PORT');
        }
    });
});
