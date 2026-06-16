import {execFile} from 'child_process';
import {promisify} from 'util';

import type {YcIamConfig} from '../config';

import type {AuthProvider} from './types';

const execFileAsync = promisify(execFile);

/** We refresh a token once we get within this margin of its expiry. */
const EXPIRY_MARGIN_MS = 60_000;

const getTokenExpiryMs = (token: string): number => {
    const payload = token.split('.')[1];
    if (payload) {
        try {
            const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
            if (typeof claims.exp === 'number') {
                return claims.exp * 1000;
            }
        } catch {}
    }
    throw new Error('Failed to parse the `exp` claim from the yc IAM token');
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
    }
};

/** Runs `yc iam create-token` and returns the raw IAM token. */
export const fetchYcToken = async (config: YcIamConfig): Promise<string> => {
    const args = ['iam', 'create-token'];
    if (config.profile) {
        args.push('--profile', config.profile);
    }

    const {stdout} = await execFileAsync(config.bin, args);
    const token = stdout.trim();
    if (!token) {
        throw new Error('`yc iam create-token` returned an empty token');
    }
    return token;
};

/**
 * Auth provider that fetches an IAM token via the `yc` CLI lazily: the token is fetched
 * on the first request and re-fetched only once it is about to expire (read from the token's
 * JWT `exp` claim). Expiry is checked on every request, so a
 * token is never renewed while the server sits idle. Concurrent requests that trigger a refresh
 * share a single in-flight fetch. A transient fetch failure falls back to the cached token if it
 * still exists.
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
                    // Read the expiry first so a parse failure leaves the cached token untouched.
                    expiresAt = getTokenExpiryMs(fetched);
                    token = fetched;
                    return fetched;
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
