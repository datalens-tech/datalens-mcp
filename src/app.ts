import {Server} from '@modelcontextprotocol/sdk/server/index.js';

import {createAuthProvider} from './components/auth';
import {loadConfig} from './components/config';
import {fetchOpenAPISpec} from './components/openapi';
import {collectTools, registerTools} from './components/tools';

const MCP_SERVER_NAME = 'datalens-public-api';
const MCP_SERVER_VERSION = '0.1.2';

export const createApp = async (): Promise<Server> => {
    const config = loadConfig();

    const authProvider = await createAuthProvider(config);

    const spec = await fetchOpenAPISpec(config);

    const tools = collectTools(spec, config, authProvider);

    const server = new Server(
        {name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION},
        {capabilities: {tools: {}}},
    );

    registerTools({server, tools, maxResponseChars: config.maxResponseChars});

    return server;
};
