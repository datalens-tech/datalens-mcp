import {execFile} from 'child_process';
import {promisify} from 'util';

import type {YcIamConfig} from '../config';

import type {AuthProvider} from './types';

const execFileAsync = promisify(execFile);

const REFRESH_INTERVAL_MS = 3_600_000;

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
 * Auth provider that fetches an IAM token via the `yc` CLI on startup and refreshes
 * it on a timer. The initial fetch failing is fatal (no token to use); later refresh
 * failures are logged and the previous token is kept.
 */
export const createYcIamAuthProvider = async (config: YcIamConfig): Promise<AuthProvider> => {
    await checkYcBin(config.bin);
    let authHeader = `Bearer ${await fetchYcToken(config)}`;

    const refresh = async () => {
        try {
            authHeader = `Bearer ${await fetchYcToken(config)}`;
        } catch (err) {
            console.error('Failed to refresh yc IAM token, keeping the previous one:', err);
        }
    };

    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    // Don't let the refresh timer keep the process alive on its own.
    timer.unref();

    return {
        getAuthHeader: () => authHeader,
    };
};
