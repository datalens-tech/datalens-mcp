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

// Builds a minimal JWT whose `exp` claim (seconds since epoch) the provider reads. Distinct
// `expSeconds` values produce distinct token strings, which lets tests tell tokens apart.
const jwt = (expSeconds: number) =>
    `h.${Buffer.from(JSON.stringify({exp: expSeconds})).toString('base64url')}.s`;

// Far enough in the future that the token never expires during a test.
const FAR_FUTURE_EXP = 9_999_999_999;

describe('fetchYcToken', () => {
    afterEach(() => {
        execFileMock.mockReset();
    });

    it('calls `yc iam create-token` and returns the trimmed token', async () => {
        execFileMock.mockResolvedValue({stdout: 'tok123\n', stderr: ''});

        const token = await fetchYcToken(baseConfig);

        expect(token).toBe('tok123');
        expect(execFileMock).toHaveBeenCalledWith('yc', ['iam', 'create-token']);
    });

    it('passes --profile when a profile is configured', async () => {
        execFileMock.mockResolvedValue({stdout: 'tok', stderr: ''});

        await fetchYcToken({...baseConfig, profile: 'prod', bin: '/usr/local/bin/yc'});

        expect(execFileMock).toHaveBeenCalledWith('/usr/local/bin/yc', [
            'iam',
            'create-token',
            '--profile',
            'prod',
        ]);
    });

    it('throws on an empty token', async () => {
        execFileMock.mockResolvedValue({stdout: '   \n', stderr: ''});

        await expect(fetchYcToken(baseConfig)).rejects.toThrow('empty token');
    });
});

describe('createYcIamAuthProvider', () => {
    afterEach(() => {
        execFileMock.mockReset();
        vi.useRealTimers();
    });

    it('fetches the token lazily on the first getAuthHeader call', async () => {
        const token = jwt(FAR_FUTURE_EXP);
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin (version)
        execFileMock.mockResolvedValueOnce({stdout: token, stderr: ''});

        const provider = await createYcIamAuthProvider(baseConfig);
        // No token is fetched until the first request needs it.
        expect(execFileMock).toHaveBeenCalledTimes(1);

        expect(await provider.getAuthHeader()).toBe(`Bearer ${token}`);
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

    it('propagates a fetch failure when there is no cached token to fall back to', async () => {
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin succeeds
        execFileMock.mockRejectedValueOnce(new Error('auth error'));

        const provider = await createYcIamAuthProvider(baseConfig);

        await expect(provider.getAuthHeader()).rejects.toThrow('auth error');
    });

    it('reuses the cached token until it is about to expire', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const first = jwt(3600); // expires at t=3600s
        const second = jwt(99999);
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin (version)
        execFileMock.mockResolvedValueOnce({stdout: first, stderr: ''});

        const provider = await createYcIamAuthProvider(baseConfig);
        expect(await provider.getAuthHeader()).toBe(`Bearer ${first}`);

        // Still well within the token lifetime: no new fetch, same token.
        await vi.advanceTimersByTimeAsync(1_800_000);
        expect(await provider.getAuthHeader()).toBe(`Bearer ${first}`);
        expect(execFileMock).toHaveBeenCalledTimes(2);

        // Past the expiry (minus the safety margin): a fresh token is fetched.
        execFileMock.mockResolvedValueOnce({stdout: second, stderr: ''});
        await vi.advanceTimersByTimeAsync(3_600_000);
        expect(await provider.getAuthHeader()).toBe(`Bearer ${second}`);
    });

    it('refreshes based on the JWT exp claim when present', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin (version)
        execFileMock.mockResolvedValueOnce({stdout: jwt(600), stderr: ''}); // expires at t=600s

        const provider = await createYcIamAuthProvider(baseConfig);
        await provider.getAuthHeader();
        expect(execFileMock).toHaveBeenCalledTimes(2);

        // t=530s, deadline is exp(600s) - margin(60s) = 540s: still cached.
        await vi.advanceTimersByTimeAsync(530_000);
        await provider.getAuthHeader();
        expect(execFileMock).toHaveBeenCalledTimes(2);

        // t=550s, past the deadline: a fresh token is fetched.
        execFileMock.mockResolvedValueOnce({stdout: jwt(1200), stderr: ''});
        await vi.advanceTimersByTimeAsync(20_000);
        await provider.getAuthHeader();
        expect(execFileMock).toHaveBeenCalledTimes(3);
    });

    it('fails when the token expiry cannot be parsed', async () => {
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin (version)
        execFileMock.mockResolvedValueOnce({stdout: 'not-a-jwt', stderr: ''});

        const provider = await createYcIamAuthProvider(baseConfig);

        await expect(provider.getAuthHeader()).rejects.toThrow('Failed to parse the `exp` claim');
    });

    it('only fetches once when concurrent requests trigger a refresh', async () => {
        const shared = jwt(FAR_FUTURE_EXP);
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin (version)
        execFileMock.mockResolvedValueOnce({stdout: shared, stderr: ''});

        const provider = await createYcIamAuthProvider(baseConfig);

        const [a, b] = await Promise.all([provider.getAuthHeader(), provider.getAuthHeader()]);

        expect(a).toBe(`Bearer ${shared}`);
        expect(b).toBe(`Bearer ${shared}`);
        expect(execFileMock).toHaveBeenCalledTimes(2); // version + a single token fetch
    });

    it('keeps the previous token when a refresh fails', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const good = jwt(3600); // expires at t=3600s
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        execFileMock.mockResolvedValueOnce({stdout: '', stderr: ''}); // checkYcBin (version)
        execFileMock.mockResolvedValueOnce({stdout: good, stderr: ''});

        const provider = await createYcIamAuthProvider(baseConfig);
        expect(await provider.getAuthHeader()).toBe(`Bearer ${good}`);

        // Past expiry, but the refresh fetch fails transiently: keep the cached token.
        execFileMock.mockRejectedValueOnce(new Error('transient'));
        await vi.advanceTimersByTimeAsync(3_600_000);

        expect(await provider.getAuthHeader()).toBe(`Bearer ${good}`);
        expect(errorSpy).toHaveBeenCalled();
    });
});
