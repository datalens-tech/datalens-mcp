import {afterEach, describe, expect, it, vi} from 'vitest';

import {withRequestTimeout} from '../with-request-timeout';

describe('withRequestTimeout', () => {
    afterEach(() => vi.useRealTimers());

    it('does not start work when the request is already cancelled', async () => {
        vi.useFakeTimers();
        const reason = new Error('Client cancelled');
        const work = vi.fn();

        await expect(
            withRequestTimeout('test', work, {signal: AbortSignal.abort(reason)}),
        ).rejects.toBe(reason);
        expect(work).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('clears the timeout after successful work', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        await expect(
            withRequestTimeout('test', async () => 'ok', {signal: controller.signal}),
        ).resolves.toBe('ok');
        expect(vi.getTimerCount()).toBe(0);
        expect(controller.signal.aborted).toBe(false);
    });

    it('keeps client cancellation distinct even if the timeout fires before work rejects', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const reason = new DOMException('Client cancelled', 'AbortError');
        let rejectWork!: (reason: unknown) => void;
        let signal!: AbortSignal;
        const result = withRequestTimeout(
            'test',
            (combinedSignal) => {
                signal = combinedSignal;
                return new Promise((_resolve, reject) => {
                    rejectWork = reject;
                });
            },
            {signal: controller.signal, timeoutMs: 10},
        );
        const rejected = expect(result).rejects.toBe(reason);

        controller.abort(reason);
        await vi.advanceTimersByTimeAsync(10);
        expect(signal.reason).toBe(reason);
        rejectWork(reason);

        await rejected;
        expect(vi.getTimerCount()).toBe(0);
    });

    it('reports the timeout when response reading throws a generic AbortError', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const result = withRequestTimeout(
            'test',
            (signal) =>
                new Promise((_resolve, reject) => {
                    signal.addEventListener(
                        'abort',
                        () => reject(new DOMException('Aborted', 'AbortError')),
                        {once: true},
                    );
                }),
            {signal: controller.signal, timeoutMs: 10},
        );
        const rejected = expect(result).rejects.toThrow('Request timed out after 10ms: test');

        await vi.advanceTimersByTimeAsync(10);

        await rejected;
        expect(controller.signal.aborted).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('preserves unrelated errors and clears the timeout', async () => {
        vi.useFakeTimers();
        const error = new Error('Connection failed');
        await expect(
            withRequestTimeout('test', async () => {
                throw error;
            }),
        ).rejects.toBe(error);
        expect(vi.getTimerCount()).toBe(0);
    });
});
