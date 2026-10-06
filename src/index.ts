#!/usr/bin/env node

import path from 'path';

import dotenv from 'dotenv';

import {MCP_TRANSPORT} from './components/config';
import {startHttp} from './http';
import {startStdio} from './stdio';

if (process.env.NODE_ENV === 'development') {
    dotenv.config({path: path.resolve(__dirname, '..', '.env'), quiet: true});
}

const main = async () => {
    console.error('Starting DataLens MCP server...');

    const transport = process.env.MCP_TRANSPORT ?? MCP_TRANSPORT.STDIO;

    if (transport === MCP_TRANSPORT.HTTP) {
        await startHttp();
    } else if (transport === MCP_TRANSPORT.STDIO) {
        startStdio();
    } else {
        throw new Error('MCP_TRANSPORT must be stdio or http');
    }
};

main().catch((err) => {
    console.error('Failed to start datalens-mcp:', err instanceof Error ? err.message : err);
    process.exit(1);
});
