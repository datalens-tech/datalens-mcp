import {afterEach, describe, expect, it, vi} from 'vitest';

import {checkForUpdate} from './check-for-update';

describe('checkForUpdate', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('compares semantic versions and only reports a newer stable latest release', async () => {
        for (const [current, latest, outdated] of [
            ['0.9.0', '0.10.0', true],
            ['1.0.0', '1.0.0', false],
            ['2.0.0', '1.9.0', false],
            ['2.0.0-preview.1', '2.0.0', true],
            ['2.0.0-preview.1', '1.9.0', false],
            ['1.0.0', '2.0.0-preview.1', false],
            ['1.0.0', 'invalid', false],
        ] as const) {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(new Response(JSON.stringify({version: latest}))),
            );
            const notice = await checkForUpdate(current, new AbortController().signal);
            if (outdated) {
                expect(notice).toContain(latest);
                expect(notice).toContain(current);
            } else {
                expect(notice).toBeUndefined();
            }
        }
    });

    it('ignores network, HTTP and malformed metadata failures without exposing them', async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new Error('private-error'))
            .mockResolvedValueOnce(new Response('private-body', {status: 503}))
            .mockResolvedValueOnce(new Response('not JSON'))
            .mockResolvedValueOnce(new Response('{"version": 42}'));
        vi.stubGlobal('fetch', fetchMock);
        const signal = new AbortController().signal;
        for (let i = 0; i < 4; i++) expect(await checkForUpdate('1.0.0', signal)).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith(
            'https://registry.npmjs.org/@datalens-tech%2Fmcp/latest',
            {signal, redirect: 'error'},
        );
    });

    it('cancels oversized metadata instead of parsing it', async () => {
        const cancel = vi.fn();
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    new ReadableStream({
                        start(controller) {
                            controller.enqueue(new Uint8Array(64 * 1024 + 1));
                        },
                        cancel,
                    }),
                ),
            ),
        );
        expect(await checkForUpdate('1.0.0', new AbortController().signal)).toBeUndefined();
        expect(cancel).toHaveBeenCalledOnce();
    });
});
