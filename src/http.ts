import {once} from 'events';

import {createHttpApp, loadHttpConfig} from './components/http';

export const startHttp = async () => {
    const config = loadHttpConfig();
    const {app, closeMcp} = await createHttpApp(config);

    const server = app.listen(config.port);

    const close = async (): Promise<void> => {
        const closed = new Promise<void>((resolve) => server.close(() => resolve()));
        try {
            await closeMcp();
        } finally {
            server.closeAllConnections();
            await closed;
        }
    };

    try {
        await once(server, 'listening');
    } catch (err) {
        await close();
        throw err;
    }

    const shutdown = () => {
        close().catch((err) => {
            console.error(
                'Failed to close datalens-mcp HTTP:',
                err instanceof Error ? err.message : err,
            );
            process.exitCode = 1;
        });
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    console.error(`DataLens MCP server running on HTTP on port ${config.port} at /mcp`);
    return {server, close};
};
