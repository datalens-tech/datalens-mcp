const assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {mkdtempSync, readFileSync, readdirSync, rmSync} = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const {Client} = require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport} = require('@modelcontextprotocol/sdk/client/stdio.js');

const environment = () =>
    Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined));

const getText = (result) => {
    const content = Array.isArray(result.content) ? result.content[0] : undefined;
    assert.equal(content?.type, 'text');
    return content.text;
};

const listen = (server) =>
    new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

const closeServer = (server) =>
    new Promise((resolve, reject) => {
        if (!server.listening) {
            resolve();
            return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
    });

const runNpmPack = (destination) => {
    const npmCli = process.env.npm_execpath;
    if (npmCli) {
        execFileSync(
            process.execPath,
            [npmCli, 'pack', '--json', '--pack-destination', destination],
            {
                cwd: process.cwd(),
                stdio: 'pipe',
            },
        );
        return;
    }
    execFileSync('npm', ['pack', '--json', '--pack-destination', destination], {
        cwd: process.cwd(),
        stdio: 'pipe',
    });
};

const main = async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'datalens-mcp-package-'));
    let client;
    let transport;
    let server;

    try {
        runNpmPack(tempDir);
        const tarballs = readdirSync(tempDir).filter((name) => name.endsWith('.tgz'));
        assert.equal(tarballs.length, 1, 'npm pack must produce exactly one tarball');
        const tarball = path.join(tempDir, tarballs[0]);
        const entries = execFileSync('tar', ['-tzf', tarball], {encoding: 'utf8'}).split('\n');
        assert(entries.includes('package/dist/index.js'));
        assert(entries.includes('package/package.json'));
        assert(entries.includes('package/MIGRATION.md'));
        assert(!entries.some((entry) => entry.startsWith('package/src/')));

        execFileSync('tar', ['-xzf', tarball, '-C', tempDir]);
        const packageRoot = path.join(tempDir, 'package');
        const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
        assert.equal(manifest.version, '1.0.0');

        const apiRequests = [];
        server = http.createServer((request, response) => {
            if (request.url === '/json/') {
                response.writeHead(200, {'content-type': 'application/json'});
                response.end(
                    JSON.stringify({
                        paths: {
                            '/rpc/getThing': {
                                post: {summary: 'Get thing', 'x-mcp': {access: 'read'}},
                            },
                        },
                    }),
                );
                return;
            }
            if (request.url === '/rpc/getThing' && request.method === 'POST') {
                const chunks = [];
                request.on('data', (chunk) => chunks.push(chunk));
                request.on('end', () => {
                    apiRequests.push({
                        authorization: request.headers.authorization,
                        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
                    });
                    response.writeHead(200, {'content-type': 'application/json'});
                    response.end(JSON.stringify({packaged: true}));
                });
                return;
            }
            response.writeHead(404);
            response.end('not found');
        });
        await listen(server);
        const address = server.address();
        assert(address && typeof address !== 'string');
        const baseUrl = `http://127.0.0.1:${address.port}`;

        let stderr = '';
        transport = new StdioClientTransport({
            command: process.execPath,
            args: [path.join(packageRoot, 'dist/index.js')],
            cwd: packageRoot,
            stderr: 'pipe',
            env: {
                ...environment(),
                NODE_ENV: 'production',
                DATALENS_INSTALLATION: 'internal',
                DATALENS_API_URL: baseUrl,
                DATALENS_SCHEMA_URL: `${baseUrl}/json/`,
                DATALENS_API_AUTH_HEADER: 'Bearer package-smoke-secret',
                DATALENS_MCP_WRITE_MODE: 'planned',
                NODE_PATH: path.join(process.cwd(), 'node_modules'),
            },
        });
        transport.stderr?.on('data', (chunk) => {
            stderr += Buffer.from(chunk).toString('utf8');
        });
        client = new Client({name: 'package-smoke', version: '1.0.0'});
        await client.connect(transport);

        const tools = await client.listTools();
        assert.deepEqual(
            tools.tools.map(({name}) => name),
            [
                'list_commands',
                'describe_commands',
                'invoke_command',
                'read_result',
                'plan_command',
                'execute_plan',
            ],
        );
        const result = await client.callTool({
            name: 'invoke_command',
            arguments: {command_name: 'getThing'},
        });
        assert.deepEqual(JSON.parse(getText(result)), {packaged: true});
        assert.deepEqual(apiRequests, [{authorization: 'Bearer package-smoke-secret', body: {}}]);
        assert(stderr.includes('DataLens MCP 1.0.0'));
        assert(!stderr.includes('package-smoke-secret'));

        console.info('Package smoke test passed');
    } finally {
        await client?.close().catch(() => undefined);
        if (!client) {
            await transport?.close().catch(() => undefined);
        }
        if (server) {
            await closeServer(server).catch(() => undefined);
        }
        rmSync(tempDir, {recursive: true, force: true});
    }
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
