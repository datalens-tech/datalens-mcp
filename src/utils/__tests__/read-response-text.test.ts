import {createServer} from 'http';
import {gzipSync} from 'zlib';

import {describe, expect, it, vi} from 'vitest';

import {listenHttp} from '../../__tests__/helpers/http';
import {readResponseText} from '../read-response-text';

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
        const url = await listenHttp(server);

        const response = await fetch(url);

        await expect(readResponseText(response, 1024)).rejects.toThrow('maximum allowed size');
    });
});
