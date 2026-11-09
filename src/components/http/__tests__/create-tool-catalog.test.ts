import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createToolCatalog} from '../create-tool-catalog';

import {httpConfig} from './http-test-server';

const HALF_HOUR_MS = 30 * 60 * 1000;
const initialSpec = {paths: {'/rpc/read': {post: {'x-mcp-scope': 'read'}}}};
const updatedSpec = {paths: {'/rpc/write': {post: {'x-mcp-scope': 'write'}}}};

const setup = async () => {
    const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => Response.json(initialSpec));
    vi.stubGlobal('fetch', fetch);
    const catalog = await createToolCatalog(httpConfig);
    return {catalog, fetch};
};

describe('HTTP command catalog refresh', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('replaces the catalog after 30 minutes, keeping the previous snapshot intact', async () => {
        const {catalog, fetch} = await setup();
        const previous = catalog.getTools();
        let release!: (response: Response) => void;
        fetch.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    release = resolve;
                }),
        );

        await vi.advanceTimersByTimeAsync(HALF_HOUR_MS - 1);
        expect(fetch).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(catalog.getTools()).toBe(previous);

        release(Response.json(updatedSpec));
        await vi.advanceTimersByTimeAsync(0);
        expect(catalog.getTools().map(({name, scope}) => ({name, scope}))).toEqual([
            {name: 'write', scope: 'write'},
        ]);
        expect(previous.map(({name}) => name)).toEqual(['read']);

        await vi.advanceTimersByTimeAsync(HALF_HOUR_MS);
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it.each([
        {failure: 'HTTP error', response: () => new Response('unavailable', {status: 503})},
        {failure: 'invalid JSON', response: () => new Response('not JSON')},
        {failure: 'empty catalog', response: () => Response.json({paths: {}})},
    ])('keeps the last good catalog after $failure and retries later', async ({response}) => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const {catalog, fetch} = await setup();
        const previous = catalog.getTools();
        fetch.mockImplementationOnce(async () => response());

        await vi.advanceTimersByTimeAsync(HALF_HOUR_MS);
        expect(catalog.getTools()).toBe(previous);
        expect(log).toHaveBeenCalledOnce();

        fetch.mockImplementationOnce(async () => Response.json(updatedSpec));
        await vi.advanceTimersByTimeAsync(HALF_HOUR_MS);
        expect(catalog.getTools()[0].name).toBe('write');
    });

    it('times out a slow refresh before scheduling the next attempt', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const {catalog, fetch} = await setup();
        const previous = catalog.getTools();
        let signal!: AbortSignal;
        fetch.mockImplementationOnce(
            (_url, options) =>
                new Promise((_resolve, reject) => {
                    signal = options!.signal!;
                    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
                }),
        );

        await vi.advanceTimersByTimeAsync(HALF_HOUR_MS + 29_999);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(signal.aborted).toBe(true);
        expect(catalog.getTools()).toBe(previous);

        await vi.advanceTimersByTimeAsync(HALF_HOUR_MS - 1);
        expect(fetch).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('fails startup without scheduling refreshes when no initial catalog is available', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({paths: {}})));
        await expect(createToolCatalog(httpConfig)).rejects.toThrow('no enabled commands');
        expect(vi.getTimerCount()).toBe(0);
    });
});
