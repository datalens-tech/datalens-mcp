import {Server} from '@modelcontextprotocol/server';

import type {AuthProvider} from '../auth';
import {registerTools} from '../tools';
import type {CollectedTool} from '../tools';

const MCP_SERVER_NAME = 'datalens-public-api';

/**
 * Creates a fresh MCP server from prepared dependencies.
 * HTTP calls this factory for every request, so keep it lightweight: no I/O,
 * schema loading, or command preparation. Do that once before serving requests.
 */
export const createMcpServer = ({
    packageVersion,
    tools,
    authProvider,
    maxResponseChars,
    getUpdateNotice,
}: {
    packageVersion: string;
    tools: CollectedTool[];
    authProvider?: AuthProvider;
    maxResponseChars: number;
    getUpdateNotice?: () => string | undefined;
}): Server => {
    const server = new Server(
        {name: MCP_SERVER_NAME, version: packageVersion},
        {capabilities: {tools: {}}},
    );
    registerTools({
        server,
        tools,
        authProvider,
        maxResponseChars,
        getUpdateNotice,
    });
    return server;
};
