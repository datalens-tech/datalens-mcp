#!/usr/bin/env node

import path from 'path';

import {serveStdio} from '@modelcontextprotocol/server/stdio';
import dotenv from 'dotenv';

import {createApp} from './app';

if (process.env.NODE_ENV === 'development') {
    dotenv.config({path: path.resolve(__dirname, '..', '.env'), quiet: true});
}

const main = () => {
    console.error('Starting DataLens MCP server...');

    const handle = serveStdio(
        () =>
            createApp().catch((err) => {
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
                'Failed to close datalens-mcp:',
                err instanceof Error ? err.message : err,
            );
            process.exitCode = 1;
        });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    console.error('DataLens MCP server running on stdio');
};

main();
