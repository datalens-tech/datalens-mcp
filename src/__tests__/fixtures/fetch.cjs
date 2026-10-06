// The CLI runs in a child process, so its fetch stub must be preloaded there.
globalThis.fetch = async (url, options) => {
    if (String(url).includes('registry.npmjs.org')) {
        return new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
        });
    }
    if (String(url) === 'https://api.example.com/json/') {
        return Response.json({paths: {'/rpc/test': {post: {'x-mcp-scope': 'read'}}}});
    }
    if (String(url) === 'https://api.example.com/rpc/test') return Response.json({ok: true});
    throw new Error(`Unexpected fetch: ${url}`);
};
