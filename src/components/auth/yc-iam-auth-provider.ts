import {execFile} from 'child_process';
import {promisify} from 'util';

import type {YcIamConfig} from '../config';

import type {AuthProvider} from './types';

const execFileAsync = promisify(execFile);

/** We refresh a token once we get within this margin of its expiry. */
const EXPIRY_MARGIN_MS = 60_000;

/** A freshly fetched IAM token together with its absolute expiry (epoch milliseconds). */
export type YcToken = {
    token: string;
    expiresAt: number;
};

const checkYcBin = async (bin: string): Promise<void> => {
    try {
        await execFileAsync(bin, ['version']);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(
                `yc CLI not found at "${bin}". Install it (https://yandex.cloud/docs/cli/quickstart) or set DATALENS_YC_BIN to the full path.`,
            );
        }
        throw err;
    }
};

/** Runs `yc iam create-token --format json` and returns the IAM token with its expiry. */
export const fetchYcToken = async (config: YcIamConfig): Promise<YcToken> => {
    const args = ['iam', 'create-token', '--format', 'json'];
    if (config.profile) {
        args.push('--profile', config.profile);
    }

    const {stdout} = await execFileAsync(config.bin, args);

    let parsed: {iam_token?: unknown; expires_at?: unknown};
    try {
        parsed = JSON.parse(stdout);
    } catch {
        throw new Error('`yc iam create-token` returned invalid JSON');
    }

    const token = typeof parsed.iam_token === 'string' ? parsed.iam_token.trim() : '';
    if (!token) {
        throw new Error('`yc iam create-token` returned an empty token');
    }

    const expiresAt = typeof parsed.expires_at === 'string' ? Date.parse(parsed.expires_at) : NaN;
    if (Number.isNaN(expiresAt)) {
        throw new Error('`yc iam create-token` returned an invalid expires_at');
    }

    return {token, expiresAt};
};

/**
 * Auth provider that fetches an IAM token via the `yc` CLI lazily: the token is fetched
 * on the first request and re-fetched only once it is about to expire (using the `expiresAt`
 * reported by `yc iam create-token`). Expiry is checked on every request, so a token is never
 * renewed while the server sits idle. Concurrent requests that trigger a refresh share a single
 * in-flight fetch. A transient fetch failure falls back to the cached token if it still exists.
 */
export const createYcIamAuthProvider = async (config: YcIamConfig): Promise<AuthProvider> => {
    await checkYcBin(config.bin);

    let token: string | undefined;
    let expiresAt = 0;
    let inflight: Promise<string> | undefined;

    const refresh = (): Promise<string> => {
        if (!inflight) {
            inflight = fetchYcToken(config)
                .then((fetched) => {
                    token = fetched.token;
                    expiresAt = fetched.expiresAt;
                    return fetched.token;
                })
                .finally(() => {
                    inflight = undefined;
                });
        }
        return inflight;
    };

    const getToken = async (): Promise<string> => {
        if (token && Date.now() < expiresAt - EXPIRY_MARGIN_MS) {
            return token;
        }
        try {
            return await refresh();
        } catch (err) {
            if (token) {
                console.error('Failed to refresh yc IAM token, keeping the previous one:', err);
                return token;
            }
            throw err;
        }
    };

    return {
        getAuthHeader: async () => `Bearer ${await getToken()}`,
    };
};
