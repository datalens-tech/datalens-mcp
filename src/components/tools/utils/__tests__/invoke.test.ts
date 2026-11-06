import {afterEach, describe, expect, it, vi} from 'vitest';

import {testConfig} from '../../../../__tests__/helpers/config';
import {collectTools} from '../collect-tools';

const createCommand = (apiUrl = testConfig.apiUrl) =>
    collectTools(
        {paths: {'/rpc/test': {post: {'x-mcp-scope': 'read'}}}},
        {...testConfig, apiUrl},
    )[0];

describe('DataLens API invocation', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('does not call fetch when the invocation is already cancelled', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const reason = new Error('Client cancelled');

        await expect(
            createCommand().invoke({args: {}, signal: AbortSignal.abort(reason)}),
        ).rejects.toBe(reason);
        expect(fetch).not.toHaveBeenCalled();
    });

    describe.each(['headers', 'body'] as const)('while waiting for response %s', (phase) => {
        it.each(['cancel', 'timeout'] as const)('aborts fetch on %s', async (action) => {
            vi.useFakeTimers();
            let started!: () => void;
            const ready = new Promise<void>((resolve) => {
                started = resolve;
            });
            const fetch = vi.fn((_url: string, {signal}: {signal: AbortSignal}) => {
                if (phase === 'headers') {
                    return new Promise<Response>((_resolve, reject) => {
                        signal.addEventListener('abort', () => reject(signal.reason), {once: true});
                        started();
                    });
                }
                return Promise.resolve(
                    new Response(
                        new ReadableStream({
                            start(stream) {
                                signal.addEventListener(
                                    'abort',
                                    () => stream.error(new DOMException('Aborted', 'AbortError')),
                                    {once: true},
                                );
                            },
                            pull() {
                                started();
                            },
                        }),
                    ),
                );
            });
            vi.stubGlobal('fetch', fetch);
            const controller = new AbortController();
            const result = createCommand().invoke({args: {}, signal: controller.signal});
            const rejected =
                action === 'timeout'
                    ? expect(result).rejects.toThrow(
                          'Request timed out after 30000ms: DataLens API request',
                      )
                    : expect(result).rejects.toMatchObject({name: 'AbortError'});
            await ready;

            if (action === 'cancel') controller.abort();
            else await vi.advanceTimersByTimeAsync(30_000);

            await rejected;
            expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    it('sends credentials and serialized parameters without following redirects', async () => {
        const fetch = vi.fn().mockResolvedValue(Response.json({ok: true}));
        vi.stubGlobal('fetch', fetch);

        await createCommand().invoke({args: {id: 'entry'}, authHeader: 'Bearer test-token'});

        expect(fetch).toHaveBeenCalledExactlyOnceWith(
            'https://api.example.com/rpc/test',
            expect.objectContaining({
                method: 'POST',
                redirect: 'error',
                body: '{"id":"entry"}',
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-token',
                    'content-type': 'application/json',
                }),
            }),
        );
    });

    it.each([
        {format: 'JSON', body: '{"id":"entry"}', expected: {id: 'entry'}},
        {format: 'text', body: 'plain text', expected: 'plain text'},
    ])('preserves a $format response', async ({body, expected}) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
        expect(await createCommand().invoke({args: {}})).toEqual(expected);
    });

    it('rejects insecure HTTP before sending credentials', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        await expect(
            createCommand('http://api.example.com').invoke({args: {}, authHeader: 'Bearer token'}),
        ).rejects.toThrow('HTTPS');
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
        {
            format: 'JSON',
            body: '{"code":"ACCESS_DENIED","message":"Permission denied"}',
            status: 403,
        },
        {format: 'text', body: 'Invalid input', status: 400},
    ])('preserves $format API error details', async ({body, status}) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, {status})));
        await expect(createCommand().invoke({args: {}})).rejects.toThrow(body);
    });
});
