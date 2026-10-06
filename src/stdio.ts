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
    const shutdown = () => {
        handle.close().catch((err) => {
            console.error(
                'Failed to close datalens-mcp stdio:',
                err instanceof Error ? err.message : err,
            );
            process.exitCode = 1;
        });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    console.error('DataLens MCP server running on stdio');

    return handle;
};
