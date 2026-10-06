import {INSTALLATION, loadConfigCommon} from '../config';
import type {AppConfig} from '../config';

import {DEFAULT_HTTP_PORT, MAX_HTTP_PORT} from './constants';

export type HttpConfig = AppConfig & {
    port: number;
};

export const loadHttpConfig = (): HttpConfig => {
    if (process.env.DATALENS_INSTALLATION?.trim().toLowerCase() !== INSTALLATION.INTERNAL) {
        throw new Error('HTTP transport requires DATALENS_INSTALLATION=internal');
    }
    const config = loadConfigCommon();

    const rawPort = process.env.MCP_PORT ?? String(DEFAULT_HTTP_PORT);
    const port = Number(rawPort);
    if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > MAX_HTTP_PORT) {
        throw new Error(`MCP_PORT must be an integer between 1 and ${MAX_HTTP_PORT}`);
    }
    return {
        ...config,
        port,
    };
};
