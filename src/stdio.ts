import {serveStdio} from '@modelcontextprotocol/server/stdio';

import {createStdioServer} from './components/stdio';

export const startStdio = () => {
    const handle = serveStdio(
        () =>
            createStdioServer().catch((err) => {
                console.error(
                    'Failed to start datalens-mcp:',
                    err instanceof Error ? err.message : err,
                );
                process.exit(1);
            }),
        {onerror: (err) => console.error('DataLens MCP error:', err.message)},
    );
    console.error('DataLens MCP server running on stdio');

    return handle;
};
