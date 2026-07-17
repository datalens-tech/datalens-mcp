import {afterEach, describe, expect, it, vi} from 'vitest';

import {ResultStore} from './result-store';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ResultStore', () => {
    it('expires stored results', () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const store = new ResultStore({
            ttlMs: 10,
            maxItemBytes: 100,
            maxTotalBytes: 100,
            chunkChars: 5,
        });
        const descriptor = store.store('abcdefghij');

        now.mockReturnValue(1_011);

        expect(() => store.read(descriptor.result_id, 0, 5)).toThrowError(
            expect.objectContaining({code: 'RESULT_EXPIRED'}),
        );
    });

    it('fails explicitly when one result exceeds the hard limit', () => {
        const store = new ResultStore({
            ttlMs: 100,
            maxItemBytes: 5,
            maxTotalBytes: 100,
            chunkChars: 3,
        });

        expect(() => store.store('123456')).toThrowError(
            expect.objectContaining({code: 'RESULT_TOO_LARGE'}),
        );
    });

    it('evicts least-recently-used results to remain within the total limit', () => {
        const store = new ResultStore({
            ttlMs: 100,
            maxItemBytes: 10,
            maxTotalBytes: 10,
            chunkChars: 2,
        });
        const first = store.store('11111');
        const second = store.store('22222');
        store.read(first.result_id, 0, 1); // first is now most recently used

        const third = store.store('33333');

        expect(() => store.read(second.result_id, 0, 1)).toThrowError(
            expect.objectContaining({code: 'RESULT_NOT_FOUND'}),
        );
        expect(store.read(first.result_id, 0, 1).text).toBe('1');
        expect(store.read(third.result_id, 0, 1).text).toBe('3');
    });
});
