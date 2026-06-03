import path from 'path';

import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';

import {createApp} from './app';

if (process.env.NODE_ENV === 'development') {
    dotenv.config({path: path.resolve(__dirname, '..', '.env'), quiet: true});
}

const main = async () => {
    console.error('Starting DataLens MCP server...');

    const server = await createApp();

    const transport = new StdioServerTransport();

    await server.connect(transport);

    console.error('DataLens MCP server running on stdio');
};

main().catch((err) => {
    console.error('Failed to start datalens-mcp:', err);
    process.exit(1);
});
