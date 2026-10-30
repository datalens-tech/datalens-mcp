import {describe, expect, it} from 'vitest';

import {getAvailablePort, startCli, startStdioCli} from './helpers/cli';

describe.each(['legacy', 'modern'] as const)('stdio CLI (%s)', (era) => {
    it('serves discovery and an API invocation over stdio', async () => {
        const cli = await startStdioCli(era);

        expect((await cli.request('tools/list')).tools).toHaveLength(5);
        const result = await cli.request('tools/call', {
            name: 'invoke_read_command',
            arguments: {command_name: 'test'},
        });

        expect(result.isError).not.toBe(true);
        expect(JSON.parse(result.content[0].text)).toEqual({
            trust: 'untrusted_data',
            data: '{"ok":true}',
        });
        expect(cli.getStderr()).toContain('DataLens MCP server running on stdio');
        expect(cli.getStderr()).not.toContain('DataLens MCP error:');
    });

    it('exits cleanly when stdin closes', async () => {
        const cli = await startStdioCli(era);
        cli.child.stdin.end();
        expect(await cli.exited).toEqual([0, null]);
    });
});

describe('CLI signals', () => {
    it.each(['SIGINT', 'SIGTERM'] as const)(
        'uses default process termination for %s',
        async (signal) => {
            const cli = await startStdioCli('modern');
            cli.child.kill(signal);
            expect(await cli.exited).toEqual([null, signal]);
        },
    );
});

describe('HTTP CLI', () => {
    it('serves HTTP and request logs, then exits on SIGTERM', async () => {
        const port = await getAvailablePort();
        const cli = startCli({
            MCP_TRANSPORT: 'http',
            MCP_PORT: String(port),
            DATALENS_INSTALLATION: 'internal',
        });
        await cli.waitForStderr('DataLens MCP server running on HTTP');
        const base = `http://127.0.0.1:${port}`;

        const health = await fetch(`${base}/ping`);
        expect(health.status).toBe(200);
        await health.body?.cancel();
        const response = await fetch(`${base}/mcp`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'}),
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('invoke_read_command');

        cli.child.kill('SIGTERM');
        expect(await cli.exited).toEqual([null, 'SIGTERM']);
        expect(cli.getStdout()).toContain('START POST /mcp requestId=');
        expect(cli.getStdout()).toContain('FINISH POST /mcp requestId=');
    });
});
