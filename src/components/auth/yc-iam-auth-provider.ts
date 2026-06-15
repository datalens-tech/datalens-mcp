import {execFile} from 'child_process';
import {promisify} from 'util';

import type {YcIamConfig} from '../config';

import type {AuthProvider} from './types';

const execFileAsync = promisify(execFile);

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
    let authHeader = `Bearer ${await fetchYcToken(config)}`;

    const refresh = async () => {
        try {
            authHeader = `Bearer ${await fetchYcToken(config)}`;
        } catch (err) {
            console.error('Failed to refresh yc IAM token, keeping the previous one:', err);
        }
    };

    const timer = setInterval(refresh, config.refreshIntervalMs);
    // Don't let the refresh timer keep the process alive on its own.
    timer.unref();

    return {
        getAuthHeader: () => authHeader,
    };
};
