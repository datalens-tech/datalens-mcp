import {Server} from '@modelcontextprotocol/sdk/server/index.js';

import {loadConfig} from './components/config';
import {fetchOpenAPISpec} from './components/openapi';
import {collectTools, registerTools} from './components/tools';

const MCP_SERVER_NAME = 'datalens-public-api';
const MCP_SERVER_VERSION = '0.1.0';

export const createApp = async (): Promise<Server> => {
    const config = loadConfig();

    const spec = await fetchOpenAPISpec(config);

    const tools = collectTools(spec, config);

    const server = new Server(
        {name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION},
        {capabilities: {tools: {}}},
    );

    registerTools({server, tools, maxResponseChars: config.maxResponseChars});

    return server;
};
