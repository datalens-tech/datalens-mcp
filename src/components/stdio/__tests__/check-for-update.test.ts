import {afterEach, describe, expect, it, vi} from 'vitest';

import {checkForUpdate} from '../check-for-update';

describe('checkForUpdate', () => {
    afterEach(() => vi.unstubAllGlobals());

    it.each([
        {current: '0.9.0', latest: '0.10.0'},
        {current: '2.0.0-preview.1', latest: '2.0.0'},
    ])('reports a newer stable release: $current → $latest', async ({current, latest}) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({version: latest})));
        const notice = await checkForUpdate(current, new AbortController().signal);
        expect(notice).toContain(current);
        expect(notice).toContain(latest);
    });

    it.each([
        {current: '1.0.0', latest: '1.0.0'},
        {current: '2.0.0', latest: '1.9.0'},
        {current: '2.0.0-preview.1', latest: '1.9.0'},
        {current: '1.0.0', latest: '2.0.0-preview.1'},
        {current: '1.0.0', latest: 'invalid'},
    ])('ignores an ineligible release: $current → $latest', async ({current, latest}) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({version: latest})));
        expect(await checkForUpdate(current, new AbortController().signal)).toBeUndefined();
    });

    it.each([
        {failure: 'network error', fetch: () => Promise.reject(new Error('private-error'))},
        {failure: 'HTTP error', fetch: async () => new Response('private-body', {status: 503})},
        {failure: 'malformed JSON', fetch: async () => new Response('not JSON')},
        {failure: 'invalid version type', fetch: async () => Response.json({version: 42})},
    ])('silently ignores $failure', async ({fetch}) => {
        vi.stubGlobal('fetch', vi.fn(fetch));
        expect(await checkForUpdate('1.0.0', new AbortController().signal)).toBeUndefined();
    });

    it('passes the abort signal and refuses redirects to the registry', async () => {
        const fetch = vi.fn().mockResolvedValue(Response.json({version: '1.0.0'}));
        vi.stubGlobal('fetch', fetch);
        const signal = new AbortController().signal;

        await checkForUpdate('1.0.0', signal);

        expect(fetch).toHaveBeenCalledExactlyOnceWith(
            'https://registry.npmjs.org/@datalens-tech%2Fmcp/latest',
            {signal, redirect: 'error'},
        );
    });

    it('cancels oversized metadata instead of parsing it', async () => {
        const cancel = vi.fn();
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(64 * 1024 + 1));
            },
            cancel,
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));

        expect(await checkForUpdate('1.0.0', new AbortController().signal)).toBeUndefined();
        expect(cancel).toHaveBeenCalledOnce();
    });
});
