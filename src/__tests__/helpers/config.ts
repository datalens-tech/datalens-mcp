import {vi} from 'vitest';

import type {AppConfig} from '../../components/config';

export const testConfig: AppConfig = {
    installation: 'internal',
    apiUrl: 'https://api.example.com',
    schemaUrl: 'https://api.example.com/json/',
    apiVersion: 'latest',
    maxResponseChars: 1000,
};

/** Isolate configuration tests from developer or CI credentials and overrides. */
export const stubConfigEnv = (env: Record<string, string> = {}) => {
    for (const key of Object.keys(process.env)) {
        if (key.startsWith('DATALENS_') || key.startsWith('MCP_')) vi.stubEnv(key, undefined);
    }
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
};
