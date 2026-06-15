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
    refreshIntervalMs: 60_000,
    bin: 'yc',
};

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

    it('exposes the initial token as a Bearer header', async () => {
        execFileMock.mockResolvedValue({stdout: 'initial', stderr: ''});

        const provider = await createYcIamAuthProvider(baseConfig);

        expect(provider.getAuthHeader()).toBe('Bearer initial');
    });

    it('propagates a failure of the initial fetch', async () => {
        execFileMock.mockRejectedValue(new Error('yc not found'));

        await expect(createYcIamAuthProvider(baseConfig)).rejects.toThrow('yc not found');
    });

    it('refreshes the token on the configured interval', async () => {
        vi.useFakeTimers();
        execFileMock.mockResolvedValueOnce({stdout: 'first', stderr: ''});

        const provider = await createYcIamAuthProvider(baseConfig);
        expect(provider.getAuthHeader()).toBe('Bearer first');

        execFileMock.mockResolvedValueOnce({stdout: 'second', stderr: ''});
        await vi.advanceTimersByTimeAsync(baseConfig.refreshIntervalMs);

        expect(provider.getAuthHeader()).toBe('Bearer second');
    });

    it('keeps the previous token when a refresh fails', async () => {
        vi.useFakeTimers();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        execFileMock.mockResolvedValueOnce({stdout: 'good', stderr: ''});

        const provider = await createYcIamAuthProvider(baseConfig);

        execFileMock.mockRejectedValueOnce(new Error('transient'));
        await vi.advanceTimersByTimeAsync(baseConfig.refreshIntervalMs);

        expect(provider.getAuthHeader()).toBe('Bearer good');
        expect(errorSpy).toHaveBeenCalled();
    });
});
