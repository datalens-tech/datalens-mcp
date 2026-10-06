import type {Server} from '@modelcontextprotocol/server';

import {getPackageVersion} from '../../utils';
import {createMcpServer} from '../mcp';
import {loadTools} from '../tools';

import {createAuthProvider} from './auth';
import {checkForUpdate} from './check-for-update';
import {loadStdioConfig} from './config';

const UPDATE_CHECK_TIMEOUT_MS = 2000;

export const createStdioServer = async (): Promise<Server> => {
    const config = loadStdioConfig();
    const authProvider = await createAuthProvider(config);
    const tools = await loadTools(config);
    const packageVersion = getPackageVersion();

    let updateNotice: string | undefined;
    const server = createMcpServer({
        packageVersion,
        tools,
        authProvider,
        maxResponseChars: config.maxResponseChars,
        getUpdateNotice: () => updateNotice,
    });
    const updateController = new AbortController();
    server.onclose = () => updateController.abort();

    const timer = setTimeout(() => updateController.abort(), UPDATE_CHECK_TIMEOUT_MS);
    timer.unref();
    checkForUpdate(packageVersion, updateController.signal)
        .then((notice) => {
            if (updateController.signal.aborted) return;
            updateNotice = notice;
            if (notice) console.error(notice);
        })
        .finally(() => clearTimeout(timer));

    return server;
};
