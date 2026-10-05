import {Server} from '@modelcontextprotocol/server';

import {createAuthProvider} from './components/auth';
import {loadConfig} from './components/config';
import {fetchOpenAPISpec} from './components/openapi';
import {collectTools, registerTools} from './components/tools';
import {checkForUpdate, getPackageVersion} from './utils';

const MCP_SERVER_NAME = 'datalens-public-api';
const UPDATE_CHECK_TIMEOUT_MS = 2000;

export const createApp = async (): Promise<Server> => {
    const config = loadConfig();

    const authProvider = await createAuthProvider(config);

    const spec = await fetchOpenAPISpec(config);

    const tools = collectTools(spec, config, authProvider);
    if (!tools.length) {
        throw new Error('The OpenAPI schema has no enabled commands with a supported x-mcp-scope');
    }

    const packageVersion = getPackageVersion();
    const server = new Server(
        {name: MCP_SERVER_NAME, version: packageVersion},
        {capabilities: {tools: {}}},
    );

    let updateNotice: string | undefined;
    const updateController = new AbortController();
    server.onclose = () => updateController.abort();

    registerTools({
        server,
        tools,
        maxResponseChars: config.maxResponseChars,
        getUpdateNotice: () => updateNotice,
    });

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
