import {Server} from '@modelcontextprotocol/sdk/server/index.js';

import {createAuthProvider} from './components/auth';
import {loadConfig} from './components/config';
import {fetchOpenAPISpec} from './components/openapi';
import {collectTools, registerTools} from './components/tools';
import {PACKAGE_VERSION} from './package-info';

const MCP_SERVER_NAME = 'datalens-public-api';

export const createApp = async (): Promise<Server> => {
    const config = loadConfig();

    const authProvider = await createAuthProvider(config);

    const {spec, source} = await fetchOpenAPISpec(config);

    const tools = collectTools(spec, config, authProvider);

    const server = new Server(
        {name: MCP_SERVER_NAME, version: PACKAGE_VERSION},
        {capabilities: {tools: {}}},
    );

    registerTools({server, tools, config});

    console.error(
        `DataLens MCP ${PACKAGE_VERSION}: loaded ${tools.length} commands from ${source}; write mode ${config.writeMode}`,
    );

    return server;
};
