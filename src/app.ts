import {Server} from '@modelcontextprotocol/sdk/server/index.js';

import {collectTools, fetchOpenAPISpec, loadConfig} from './components/mcp';
import {registerLazyMetaTools} from './components/mcp/meta-tools';

const MCP_SERVER_NAME = 'datalens-public-api';
const MCP_SERVER_VERSION = '0.1.0';

export const createApp = async (): Promise<Server> => {
    const config = loadConfig();
    const spec = await fetchOpenAPISpec(config);
    const tools = collectTools(spec, config);
    const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

    const server = new Server(
        {name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION},
        {capabilities: {tools: {}}},
    );

    registerLazyMetaTools({server, tools, toolsByName});

    return server;
};
