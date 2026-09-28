import {readFileSync} from 'fs';
import path from 'path';

import {Server} from '@modelcontextprotocol/sdk/server/index.js';

import {createAuthProvider} from './components/auth';
import {loadConfig} from './components/config';
import {fetchOpenAPISpec} from './components/openapi';
import {collectTools, registerTools} from './components/tools';

const MCP_SERVER_NAME = 'datalens-public-api';
const {version: MCP_SERVER_VERSION} = JSON.parse(
    readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
) as {version: string};

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
