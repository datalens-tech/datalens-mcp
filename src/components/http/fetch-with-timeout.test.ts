import {afterEach, describe, expect, it, vi} from 'vitest';

import {fetchWithTimeout} from './fetch-with-timeout';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('fetchWithTimeout', () => {
    it('keeps the timeout active while the response body is being read', async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((_url: string, init: RequestInit) => {
                const stream = new ReadableStream({
                    start(controller) {
                        init.signal?.addEventListener('abort', () => {
                            const error = new Error('aborted');
                            error.name = 'AbortError';
                            controller.error(error);
                        });
                    },
                });
                return Promise.resolve(new Response(stream, {status: 200}));
            }),
        );

        const pending = fetchWithTimeout({
            url: 'http://api.example/slow',
            label: 'GET /slow',
            timeoutMs: 10,
            retryable: true,
        });
        const assertion = expect(pending).rejects.toMatchObject({
            code: 'REQUEST_TIMEOUT',
            kind: 'timeout',
            retryable: true,
        });

        await vi.advanceTimersByTimeAsync(11);
        await assertion;
    });
});
