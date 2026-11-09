import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {stubConfigEnv} from '../../../__tests__/helpers/config';
import {loadHttpConfig} from '../config';

describe('HTTP configuration', () => {
    beforeEach(() =>
        stubConfigEnv({
            DATALENS_INSTALLATION: 'internal',
            DATALENS_API_URL: 'https://api.example.com',
        }),
    );
    afterEach(() => vi.unstubAllEnvs());

    it('requires the internal installation', () => {
        vi.stubEnv('DATALENS_INSTALLATION', 'cloud');
        expect(() => loadHttpConfig()).toThrow('DATALENS_INSTALLATION=internal');
    });

    it.each([
        {raw: undefined, port: 3000},
        {raw: '8080', port: 8080},
    ])('uses port $port when MCP_PORT=$raw', ({raw, port}) => {
        vi.stubEnv('MCP_PORT', raw);
        expect(loadHttpConfig()).toMatchObject({
            installation: 'internal',
            apiUrl: 'https://api.example.com',
            port,
        });
    });

    it.each(['0', '-1', '65536', '3.5', '3e3', ''])('rejects invalid port %j', (port) => {
        vi.stubEnv('MCP_PORT', port);
        expect(() => loadHttpConfig()).toThrow('MCP_PORT');
    });
});
