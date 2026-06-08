import {describe, expect, it} from 'vitest';

import {truncateText} from './truncate';

describe('truncateText', () => {
    it('returns text unchanged when no limit is given', () => {
        expect(truncateText('hello')).toBe('hello');
    });

    it('returns text unchanged when within the limit', () => {
        expect(truncateText('hello', 10)).toBe('hello');
        expect(truncateText('hello', 5)).toBe('hello');
    });

    it('returns text unchanged for a non-positive limit', () => {
        expect(truncateText('hello', 0)).toBe('hello');
        expect(truncateText('hello', -1)).toBe('hello');
    });

    it('truncates and appends a marker when over the limit', () => {
        const result = truncateText('abcdefghij', 4);
        expect(result.startsWith('abcd')).toBe(true);
        expect(result).toContain('truncated 6 of 10 chars');
        expect(result).toContain('DATALENS_MAX_RESPONSE_CHARS');
    });
});
