import {spawn} from 'child_process';
import {once} from 'events';
import {createServer} from 'net';
import type {AddressInfo} from 'net';
import path from 'path';
import {createInterface} from 'readline';

import {onTestFinished} from 'vitest';

import type {ProtocolEra} from './mcp';

export const startCli = (env: Record<string, string> = {}) => {
    const child = spawn(
        process.execPath,
        [
            '--require',
            'ts-node/register/transpile-only',
            '--require',
            path.resolve(__dirname, '../fixtures/fetch.cjs'),
            'src/index.ts',
        ],
        {
            cwd: path.resolve(__dirname, '../../..'),
            env: {
                PATH: process.env.PATH,
                NODE_ENV: 'test',
                DATALENS_ORG_ID: 'test',
                DATALENS_YC_STATIC_AUTH: '1',
                DATALENS_API_URL: 'https://api.example.com',
                ...env,
            },
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 8000,
            killSignal: 'SIGKILL',
        },
    );
    // Wait for close rather than exit so stdout/stderr are fully collected.
    const exited = once(child, 'close');
    let stderr = '';
    let stdout = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
        stderr += chunk;
    });
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
        stdout += chunk;
    });
    onTestFinished(async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await exited;
    });

    const waitForStderr = async (text: string) => {
        const exitBeforeReady = () => {
            throw new Error(`CLI exited before ${text}: ${stderr}`);
        };
        while (!stderr.includes(text)) {
            await Promise.race([once(child.stderr, 'data'), exited.then(exitBeforeReady)]);
        }
    };

    return {child, exited, waitForStderr, getStderr: () => stderr, getStdout: () => stdout};
};

export const startStdioCli = async (era: ProtocolEra) => {
    const cli = startCli({MCP_PORT: 'ignored-in-stdio'});
    const lines = createInterface({input: cli.child.stdout});
    const replies = lines[Symbol.asyncIterator]();
    onTestFinished(() => {
        lines.close();
    });
    let id = 0;
    const request = async (method: string, params: Record<string, unknown> = {}) => {
        const requestId = ++id;
        cli.child.stdin.write(
            JSON.stringify({
                jsonrpc: '2.0',
                id: requestId,
                method,
                params: {
                    ...params,
                    ...(era === 'modern'
                        ? {
                              _meta: {
                                  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                                  'io.modelcontextprotocol/clientCapabilities': {},
                              },
                          }
                        : {}),
                },
            }) + '\n',
        );
        const line = await replies.next();
        if (line.done) throw new Error(`CLI closed before replying: ${cli.getStderr()}`);
        const reply = JSON.parse(line.value);
        if (reply.id !== requestId || reply.error)
            throw new Error(`Unexpected MCP reply: ${line.value}`);
        return reply.result;
    };

    if (era === 'legacy') {
        await request('initialize', {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: {name: 'cli-test', version: '1'},
        });
        cli.child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    } else {
        await request('server/discover');
    }
    return {...cli, request};
};

export const getAvailablePort = async () => {
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = (reservation.address() as AddressInfo).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    return port;
};
