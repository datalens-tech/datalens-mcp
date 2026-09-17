import {afterEach, describe, expect, it, vi} from 'vitest';

import type {AppConfig} from '../../config';

import {fetchOpenAPISpec} from './fetch-openapi-spec';

const config: AppConfig = {
    installation: 'internal',
    apiUrl: 'https://api.example.com',
    schemaUrl: 'https://schema.example.com/secret-path?token=secret-query#secret-fragment',
    apiVersion: 'latest',
    maxResponseChars: 100_000,
};

describe('fetchOpenAPISpec', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('reads a valid schema without following redirects', async () => {
        const spec = {openapi: '3.1.0', paths: {}};
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(spec)));
        vi.stubGlobal('fetch', fetchMock);
        expect(await fetchOpenAPISpec(config)).toEqual(spec);
        expect(fetchMock).toHaveBeenCalledWith(
            config.schemaUrl,
            expect.objectContaining({redirect: 'error'}),
        );
    });

    it('keeps the timeout active while reading the response body', async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            'fetch',
            vi.fn((_url, {signal}) =>
                Promise.resolve(
                    new Response(
                        new ReadableStream({
                            start(controller) {
                                signal.addEventListener('abort', () =>
                                    controller.error(new DOMException('Aborted', 'AbortError')),
                                );
                            },
                        }),
                    ),
                ),
            ),
        );
        const result = expect(fetchOpenAPISpec(config)).rejects.toThrow('Request timed out');
        await vi.advanceTimersByTimeAsync(30_000);
        await result;
    });

    it('does not expose the schema path, query, fragment or HTTP error body', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('secret-body', {status: 403})),
        );
        await expect(fetchOpenAPISpec(config)).rejects.toThrow(
            'Failed to fetch OpenAPI schema from https://schema.example.com: HTTP 403',
        );
    });

    it('rejects deeply nested schemas before recursive ref processing', async () => {
        let spec: unknown = {};
        for (let i = 0; i < 101; i++) spec = {nested: spec};
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(spec))));
        await expect(fetchOpenAPISpec(config)).rejects.toThrow('structural limits');
    });

    it('rejects wide schemas as well as deep ones', async () => {
        const spec = {nodes: Array(100_000).fill(null)};
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(spec))));
        await expect(fetchOpenAPISpec(config)).rejects.toThrow('structural limits');
    });
});
