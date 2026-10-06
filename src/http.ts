import {once} from 'events';

import {createHttpApp, loadHttpConfig} from './components/http';

export const startHttp = async () => {
    const config = loadHttpConfig();
    const app = await createHttpApp(config);

    const server = app.listen(config.port);

    await once(server, 'listening');

    console.error(`DataLens MCP server running on HTTP on port ${config.port} at /mcp`);
    return server;
};
