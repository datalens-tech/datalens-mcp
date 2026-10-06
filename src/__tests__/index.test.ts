import {spawn} from 'child_process';
import {once} from 'events';
import {mkdtemp, rm, writeFile} from 'fs/promises';
import {createServer} from 'net';
import type {AddressInfo} from 'net';
import {tmpdir} from 'os';
import path from 'path';
import {createInterface} from 'readline';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

let fixtureDir: string;
let preload: string;

beforeAll(async () => {
    fixtureDir = await mkdtemp(path.join(tmpdir(), 'datalens-mcp-stdio-'));
    preload = path.join(fixtureDir, 'fetch.cjs');
    await writeFile(
        preload,
        `globalThis.fetch = async (url, options) => {
            if (String(url).includes('registry.npmjs.org')) {
                return new Promise((_resolve, reject) => {
                    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
                });
            }
            return new Response(JSON.stringify(String(url).endsWith('/json/')
                ? {paths: {'/rpc/test': {post: {'x-mcp-scope': 'read'}}}}
                : {ok: true}));
        };`,
    );
});

afterAll(async () => {
    if (fixtureDir) await rm(fixtureDir, {recursive: true, force: true});
});

describe('stdio CLI', () => {
    it.each([
        ['legacy', 'eof'],
        ['modern', 'eof'],
        ['modern', 'SIGINT'],
        ['modern', 'SIGTERM'],
    ] as const)('serves %s clients and exits on %s', async (era, shutdown) => {
        const child = spawn(
            process.execPath,
            ['--require', 'ts-node/register/transpile-only', '--require', preload, 'src/index.ts'],
            {
                cwd: path.resolve(__dirname, '../..'),
                env: {
                    PATH: process.env.PATH,
                    NODE_ENV: 'test',
                    DATALENS_ORG_ID: 'test',
                    DATALENS_YC_STATIC_AUTH: '1',
                    MCP_PORT: 'ignored-in-stdio',
                },
                stdio: ['pipe', 'pipe', 'pipe'],
            },
        );
        const exited = once(child, 'exit');
        let stderr = '';
        child.stderr.setEncoding('utf8').on('data', (chunk) => {
            stderr += chunk;
        });
        const lines = createInterface({input: child.stdout});
        const replies = lines[Symbol.asyncIterator]();
        let id = 0;
        const request = async (method: string, params: Record<string, unknown> = {}) => {
            const requestId = ++id;
            child.stdin.write(
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
            expect(line.done).toBe(false);
            const reply = JSON.parse(line.value!);
            expect(reply.id).toBe(requestId);
            expect(reply.error).toBeUndefined();
            return reply.result;
        };
        try {
            if (era === 'legacy') {
                const result = await request('initialize', {
                    protocolVersion: '2025-11-25',
                    capabilities: {},
                    clientInfo: {name: 'stdio-test', version: '1'},
                });
                expect(result.protocolVersion).toBe('2025-11-25');
                child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
            } else {
                await request('server/discover');
            }
            const listed = await request('tools/list');
            expect(listed.tools).toHaveLength(5);
            const called = await request('tools/call', {
                name: 'invoke_read_command',
                arguments: {command_name: 'test'},
            });
            expect(called.isError).not.toBe(true);
            expect(JSON.parse(called.content[0].text)).toEqual({
                trust: 'untrusted_data',
                data: '{"ok":true}',
            });
            const denied = await request('tools/call', {
                name: 'invoke_write_command',
                arguments: {command_name: 'test'},
            });
            expect(denied.isError).toBe(true);
            if (shutdown === 'eof') child.stdin.end();
            else child.kill(shutdown);
            expect(await exited).toEqual(shutdown === 'eof' ? [0, null] : [null, shutdown]);
            expect(stderr).toContain('DataLens MCP server running on stdio');
            expect(stderr).not.toContain('DataLens MCP error:');
        } finally {
            lines.close();
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
            await exited;
        }
    });
});

describe('HTTP CLI', () => {
    it('starts with internal config, serves discovery without credentials and shuts down', async () => {
        const reservation = createServer();
        await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
        const port = (reservation.address() as AddressInfo).port;
        await new Promise<void>((resolve) => reservation.close(() => resolve()));
        const child = spawn(
            process.execPath,
            ['--require', 'ts-node/register/transpile-only', '--require', preload, 'src/index.ts'],
            {
                cwd: path.resolve(__dirname, '../..'),
                env: {
                    PATH: process.env.PATH,
                    NODE_ENV: 'test',
                    MCP_TRANSPORT: 'http',
                    MCP_PORT: String(port),
                    DATALENS_INSTALLATION: 'internal',
                    DATALENS_API_URL: 'https://api.example.com',
                },
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 8000,
                killSignal: 'SIGKILL',
            },
        );
        const exited = once(child, 'exit');
        let stdout = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        const ready = new Promise<void>((resolve, reject) => {
            let stderr = '';
            child.stderr.on('data', (chunk) => {
                stderr += chunk;
                if (stderr.includes('DataLens MCP server running on HTTP')) resolve();
            });
            child.once('error', reject);
            child.once('exit', () =>
                reject(new Error(`HTTP server exited before readiness: ${stderr}`)),
            );
        });
        try {
            await ready;
            const base = `http://127.0.0.1:${port}`;
            expect((await fetch(`${base}/ping`)).status).toBe(200);
            const response = await fetch(`${base}/mcp`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json, text/event-stream',
                },
                body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list', params: {}}),
            });
            expect(response.status).toBe(200);
            const body = await response.text();
            expect(body).toContain('invoke_read_command');
            child.kill('SIGTERM');
            expect(await exited).toEqual([null, 'SIGTERM']);
            expect(stdout).toContain('START POST /mcp requestId=');
            expect(stdout).toContain('FINISH POST /mcp requestId=');
        } finally {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
            await exited;
        }
    });
});
