import {createServer} from 'http';
import type {AddressInfo} from 'net';
import {gzipSync} from 'zlib';

import {describe, expect, it, vi} from 'vitest';

import {readResponseText} from './read-response-text';

describe('readResponseText', () => {
    it('decodes a multibyte character split between chunks at the exact byte limit', async () => {
        const bytes = new TextEncoder().encode('a😀b');
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(bytes.slice(0, 3));
                controller.enqueue(bytes.slice(3));
                controller.close();
            },
        });
        expect(await readResponseText(new Response(body), bytes.length)).toBe('a😀b');
    });

    it('cancels an oversized chunked response before consuming the remainder', async () => {
        const cancel = vi.fn();
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(5));
            },
            cancel,
        });
        await expect(readResponseText(new Response(body), 4)).rejects.toThrow(
            'maximum allowed size',
        );
        expect(cancel).toHaveBeenCalledOnce();
        expect(body.locked).toBe(false);
    });

    it('limits decompressed bytes rather than a compressed Content-Length', async () => {
        const payload = 'a'.repeat(4096);
        const compressed = gzipSync(payload);
        const server = createServer((_request, response) => {
            response.writeHead(200, {
                'content-encoding': 'gzip',
                'content-length': compressed.length,
            });
            response.end(compressed);
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
            const response = await fetch(
                `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
            );
            await expect(readResponseText(response, 1024)).rejects.toThrow('maximum allowed size');
        } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
            );
        }
    });
});
