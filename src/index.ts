#!/usr/bin/env node

import path from 'path';

import dotenv from 'dotenv';

import {startHttp} from './http';
import {startStdio} from './stdio';

if (process.env.NODE_ENV === 'development') {
    dotenv.config({path: path.resolve(__dirname, '..', '.env'), quiet: true});
}

const main = async () => {
    console.error('Starting DataLens MCP server...');

    const transport = process.env.MCP_TRANSPORT ?? 'stdio';

    if (transport === 'http') {
        await startHttp();
    } else if (transport === 'stdio') {
        startStdio();
    } else {
        throw new Error('MCP_TRANSPORT must be stdio or http');
    }
};

main().catch((err) => {
    console.error('Failed to start datalens-mcp:', err instanceof Error ? err.message : err);
    process.exit(1);
});
