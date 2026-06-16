import {afterEach, describe, expect, it, vi} from 'vitest';

import type {YcIamConfig} from '../config';

const {execFileMock} = vi.hoisted(() => ({execFileMock: vi.fn()}));

vi.mock('child_process', async () => {
    const {promisify} = await import('util');
    return {
        execFile: Object.assign(() => {}, {
            [promisify.custom]: (...args: unknown[]) => execFileMock(...args),
        }),
    };
});

import {createYcIamAuthProvider, fetchYcToken} from './yc-iam-auth-provider';

const baseConfig: YcIamConfig = {
    bin: 'yc',
};

// Builds the JSON `yc iam create-token --format json` prints.
const ycJson = (iamToken: string, expiresAt: string) =>
    JSON.stringify({iam_token: iamToken, expires_at: expiresAt});

// Far enough in the future that the token never expires during a test.
const FAR_FUTURE = '2099-01-01T00:00:00.000Z';

describe('fetchYcToken', () => {
    afterEach(() => {
        execFileMock.mockReset();
    });

    it('calls `yc iam create-token --format json` and returns the token with its expiry', async () => {
        // yc reports expires_at with nanosecond precision.
        execFileMock.mockResolvedValue({
            stdout: ycJson('t1.tok123', '2026-06-16T21:55:23.890404478Z'),
            stderr: '',
        });

        const result = await fetchYcToken(baseConfig);

        expect(result).toEqual({
            token: 't1.tok123',
            expiresAt: Date.parse('2026-06-16T21:55:23.890Z'),
        });
        expect(execFileMock).toHaveBeenCalledWith('yc', [
            'iam',
            'create-token',
            '--format',
            'json',
        ]);
    });

    it('passes --profile when a profile is configured', async () => {
        execFileMock.mockResolvedValue({stdout: ycJson('t1.tok', FAR_FUTURE), stderr: ''});

        await fetchYcToken({...baseConfig, profile: 'prod', bin: '/usr/local/bin/yc'});

        expect(execFileMock).toHaveBeenCalledWith('/usr/local/bin/yc', [
            'iam',
            'create-token',
            '--format',
            'json',
            '--profile',
            'prod',
        ]);
    });

    it('throws on invalid JSON', async () => {
        execFileMock.mockResolvedValue({stdout: 'not json', stderr: ''});

        await expect(fetchYcToken(baseConfig)).rejects.toThrow('invalid JSON');
    });

    it('throws on an empty token', async () => {
        execFileMock.mockResolvedValue({stdout: ycJson('   ', FAR_FUTURE), stderr: ''});

        await expect(fetchYcToken(baseConfig)).rejects.toThrow('empty token');
    });

    it('throws on an invalid expires_at', async () => {
        execFileMock.mockResolvedValue({stdout: ycJson('t1.tok', 'not-a-date'), stderr: ''});

        await expect(fetchYcToken(baseConfig)).rejects.toThrow('invalid expires_at');
    });
});

describe('createYcIamAuthProvider', () => {
    afterEach(() => {
        execFileMock.mockReset();
        vi.useRealTimers();
    });

    it('fetches the token lazily on the first getAuthHeader call', async () => {
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin (version)
        execFileMock.mockResolvedValueOnce({stdout: ycJson('t1.lazy', FAR_FUTURE), stderr: ''});

        const provider = await createYcIamAuthProvider(baseConfig);
        // No token is fetched until the first request needs it.
        expect(execFileMock).toHaveBeenCalledTimes(1);

        expect(await provider.getAuthHeader()).toBe('Bearer t1.lazy');
        expect(execFileMock).toHaveBeenCalledTimes(2);
    });

    it('throws a helpful message when the yc binary is not found', async () => {
        const enoent = Object.assign(new Error('spawn yc ENOENT'), {code: 'ENOENT'});
        execFileMock.mockRejectedValue(enoent);

        await expect(createYcIamAuthProvider(baseConfig)).rejects.toThrow('yc CLI not found');
        await expect(createYcIamAuthProvider({...baseConfig, bin: '/custom/yc'})).rejects.toThrow(
            '/custom/yc',
        );
    });

    it('re-throws non-ENOENT errors from the version check', async () => {
        const permissionDenied = Object.assign(new Error('spawn yc EACCES'), {code: 'EACCES'});
        execFileMock.mockRejectedValue(permissionDenied);

        await expect(createYcIamAuthProvider(baseConfig)).rejects.toThrow('EACCES');
    });

    it('propagates a fetch failure when there is no cached token to fall back to', async () => {
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin succeeds
        execFileMock.mockRejectedValueOnce(new Error('auth error'));

        const provider = await createYcIamAuthProvider(baseConfig);

        await expect(provider.getAuthHeader()).rejects.toThrow('auth error');
    });

    it('reuses the cached token until it is about to expire, then refreshes', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin (version)
        // First token expires at t=600s.
        execFileMock.mockResolvedValueOnce({
            stdout: ycJson('t1.first', new Date(600_000).toISOString()),
            stderr: '',
        });

        const provider = await createYcIamAuthProvider(baseConfig);
        expect(await provider.getAuthHeader()).toBe('Bearer t1.first');

        // t=530s, deadline is expiry(600s) - margin(60s) = 540s: still cached, no new fetch.
        await vi.advanceTimersByTimeAsync(530_000);
        expect(await provider.getAuthHeader()).toBe('Bearer t1.first');
        expect(execFileMock).toHaveBeenCalledTimes(2);

        // t=550s, past the deadline: a fresh token is fetched.
        execFileMock.mockResolvedValueOnce({stdout: ycJson('t1.second', FAR_FUTURE), stderr: ''});
        await vi.advanceTimersByTimeAsync(20_000);
        expect(await provider.getAuthHeader()).toBe('Bearer t1.second');
        expect(execFileMock).toHaveBeenCalledTimes(3);
    });

    it('propagates an invalid token from the first fetch', async () => {
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin (version)
        execFileMock.mockResolvedValueOnce({stdout: ycJson('t1.x', 'not-a-date'), stderr: ''});

        const provider = await createYcIamAuthProvider(baseConfig);

        await expect(provider.getAuthHeader()).rejects.toThrow('invalid expires_at');
    });

    it('only fetches once when concurrent requests trigger a refresh', async () => {
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin (version)
        execFileMock.mockResolvedValueOnce({stdout: ycJson('t1.shared', FAR_FUTURE), stderr: ''});

        const provider = await createYcIamAuthProvider(baseConfig);

        const [a, b] = await Promise.all([provider.getAuthHeader(), provider.getAuthHeader()]);

        expect(a).toBe('Bearer t1.shared');
        expect(b).toBe('Bearer t1.shared');
        expect(execFileMock).toHaveBeenCalledTimes(2); // version + a single token fetch
    });

    it('keeps the previous token when a refresh fails', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin (version)
        // Token expires at t=600s.
        execFileMock.mockResolvedValueOnce({
            stdout: ycJson('t1.good', new Date(600_000).toISOString()),
            stderr: '',
        });

        const provider = await createYcIamAuthProvider(baseConfig);
        expect(await provider.getAuthHeader()).toBe('Bearer t1.good');

        // Past expiry, but the refresh fetch fails transiently: keep the cached token.
        execFileMock.mockRejectedValueOnce(new Error('transient'));
        await vi.advanceTimersByTimeAsync(600_000);

        expect(await provider.getAuthHeader()).toBe('Bearer t1.good');
        expect(errorSpy).toHaveBeenCalled();
    });
});
