import http from 'http';
import path from 'path';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const toEnvironment = (): Record<string, string> =>
    Object.fromEntries(
        Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
        ),
    );

const readBody = async (request: http.IncomingMessage): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
};

const getText = (result: Awaited<ReturnType<Client['callTool']>>): string => {
    const content = Array.isArray(result.content) ? result.content[0] : undefined;
    if (
        !content ||
        typeof content !== 'object' ||
        content.type !== 'text' ||
        typeof content.text !== 'string'
    ) {
        throw new Error('Expected text tool content');
    }
    return content.text;
};

describe('stdio MCP integration', () => {
    let mockServer: http.Server;
    let baseUrl: string;
    let client: Client;
    let transport: StdioClientTransport;
    let stderr = '';
    const apiRequests: {headers: http.IncomingHttpHeaders; body: unknown}[] = [];

    beforeAll(async () => {
        mockServer = http.createServer((request, response) => {
            (async () => {
                if (request.url === '/json/') {
                    response.writeHead(200, {'content-type': 'application/json'});
                    response.end(
                        JSON.stringify({
                            openapi: '3.0.0',
                            paths: {
                                '/rpc/getThing': {
                                    post: {
                                        summary: 'Get a thing',
                                        'x-mcp': {access: 'read'},
                                        requestBody: {
                                            content: {
                                                'application/json': {
                                                    schema: {
                                                        type: 'object',
                                                        properties: {id: {type: 'string'}},
                                                        required: ['id'],
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        }),
                    );
                    return;
                }

                if (request.url === '/rpc/getThing' && request.method === 'POST') {
                    const body = JSON.parse(await readBody(request)) as unknown;
                    apiRequests.push({headers: request.headers, body});
                    response.writeHead(200, {'content-type': 'application/json'});
                    response.end(JSON.stringify({id: 'thing-1', title: 'Mock thing'}));
                    return;
                }

                response.writeHead(404);
                response.end('not found');
            })().catch((error) => {
                response.writeHead(500);
                response.end(error instanceof Error ? error.message : String(error));
            });
        });

        await new Promise<void>((resolve, reject) => {
            mockServer.once('error', reject);
            mockServer.listen(0, '127.0.0.1', resolve);
        });
        const address = mockServer.address();
        if (!address || typeof address === 'string') {
            throw new Error('Mock HTTP server did not expose a TCP address');
        }
        baseUrl = `http://127.0.0.1:${address.port}`;

        transport = new StdioClientTransport({
            command: process.execPath,
            args: [path.resolve(process.cwd(), 'dist/index.js')],
            cwd: process.cwd(),
            stderr: 'pipe',
            env: {
                ...toEnvironment(),
                NODE_ENV: 'production',
                DATALENS_INSTALLATION: 'internal',
                DATALENS_API_URL: baseUrl,
                DATALENS_SCHEMA_URL: `${baseUrl}/json/`,
                DATALENS_API_AUTH_HEADER: 'Bearer integration-secret',
                DATALENS_API_VERSION: 'integration-v1',
                DATALENS_MCP_WRITE_MODE: 'planned',
            },
        });
        transport.stderr?.on('data', (chunk) => {
            stderr += Buffer.from(chunk as Uint8Array).toString('utf8');
        });

        client = new Client({name: 'integration-client', version: '1.0.0'});
        await client.connect(transport);
    }, 10_000);

    afterAll(async () => {
        await client?.close();
        await new Promise<void>((resolve, reject) => {
            mockServer.close((error) => (error ? reject(error) : resolve()));
        });
    });

    it('negotiates MCP and completes list, describe, and invoke through stdio', async () => {
        const listedTools = await client.listTools();
        expect(listedTools.tools.map(({name}) => name)).toEqual([
            'list_commands',
            'describe_commands',
            'invoke_command',
            'read_result',
            'plan_command',
            'execute_plan',
        ]);

        const commands = JSON.parse(
            getText(await client.callTool({name: 'list_commands', arguments: {}})),
        ) as Record<string, unknown>[];
        expect(commands).toEqual([
            expect.objectContaining({
                command_name: 'getThing',
                access: 'read',
                execution: 'direct',
            }),
        ]);

        const descriptions = JSON.parse(
            getText(
                await client.callTool({
                    name: 'describe_commands',
                    arguments: {command_names: ['getThing']},
                }),
            ),
        ) as Record<string, unknown>[];
        expect(descriptions[0]).toEqual(
            expect.objectContaining({command_name: 'getThing', access: 'read'}),
        );

        const invoked = JSON.parse(
            getText(
                await client.callTool({
                    name: 'invoke_command',
                    arguments: {command_name: 'getThing', parameters: {id: 'thing-1'}},
                }),
            ),
        ) as Record<string, unknown>;
        expect(invoked).toEqual({id: 'thing-1', title: 'Mock thing'});

        expect(apiRequests).toHaveLength(1);
        expect(apiRequests[0].body).toEqual({id: 'thing-1'});
        expect(apiRequests[0].headers.authorization).toBe('Bearer integration-secret');
        expect(apiRequests[0].headers['x-dl-api-version']).toBe('integration-v1');
    });

    it('keeps diagnostics on stderr and redacts credentials', () => {
        expect(stderr).toContain('DataLens MCP 1.0.0');
        expect(stderr).toContain('write mode planned');
        expect(stderr).not.toContain('integration-secret');
    });
});
