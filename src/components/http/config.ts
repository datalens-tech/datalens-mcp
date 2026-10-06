import {loadConfigCommon} from '../config';
import type {AppConfig} from '../config';

export type HttpConfig = AppConfig & {
    port: number;
};

export const loadHttpConfig = (): HttpConfig => {
    if (process.env.DATALENS_INSTALLATION?.trim().toLowerCase() !== 'internal') {
        throw new Error('HTTP transport requires DATALENS_INSTALLATION=internal');
    }
    const config = loadConfigCommon();

    const rawPort = process.env.MCP_PORT ?? '3000';
    const port = Number(rawPort);
    if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('MCP_PORT must be an integer between 1 and 65535');
    }
    return {
        ...config,
        port,
    };
};
