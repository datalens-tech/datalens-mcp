import {createPrivateKey} from 'node:crypto';
import type {KeyObject} from 'node:crypto';
import {readFile} from 'node:fs/promises';

import jwt from 'jsonwebtoken';

import {CONTENT_TYPE, HTTP_HEADER} from '../../../constants/http';
import {
    MAX_API_RESPONSE_BYTES,
    readResponseText,
    validateHttpsUrl,
    withRequestTimeout,
} from '../../../utils';
import type {AuthProvider} from '../../auth';
import type {CommonConfig, ServiceAccountAuthConfig} from '../../config';

const CLIENT_JWT_TTL_SECONDS = 60;
const MAX_REFRESH_MARGIN_MS = 60_000;

type ServiceAccountKey = {id: string; serviceAccountId: string; privateKey: KeyObject};
type AccessToken = {value: string; expiresAt: number; refreshAt: number};

const loadKey = async (path: string): Promise<ServiceAccountKey> => {
    try {
        const key = JSON.parse(await readFile(path, 'utf8'));
        if (
            !key ||
            typeof key.id !== 'string' ||
            !key.id.trim() ||
            typeof key.service_account_id !== 'string' ||
            !key.service_account_id.trim() ||
            typeof key.private_key !== 'string'
        ) {
            throw new Error();
        }
        const privateKey = createPrivateKey(key.private_key);
        if (privateKey.asymmetricKeyType !== 'rsa') {
            throw new Error();
        }
        return {id: key.id, serviceAccountId: key.service_account_id, privateKey};
    } catch {
        throw new Error(
            'Cannot load Enterprise service account key: expected JSON with id, service_account_id and an RSA private_key',
        );
    }
};

const createClientJwt = (key: ServiceAccountKey): string =>
    jwt.sign({}, key.privateKey, {
        algorithm: 'PS256',
        keyid: key.id,
        issuer: key.serviceAccountId,
        expiresIn: CLIENT_JWT_TTL_SECONDS,
    });

const parseAccessToken = (data: unknown): AccessToken => {
    try {
        const value = (data as {accessToken?: unknown})?.accessToken;
        if (typeof value !== 'string' || !value.trim()) {
            throw new Error();
        }
        // The server verifies the signature. Decode exp only to schedule renewal.
        const payload = jwt.decode(value);
        const exp = payload && typeof payload === 'object' ? payload.exp : undefined;
        const expiresAt = typeof exp === 'number' ? exp * 1000 : NaN;
        const now = Date.now();
        if (typeof exp !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= now) {
            throw new Error();
        }
        const margin = Math.min(MAX_REFRESH_MARGIN_MS, (expiresAt - now) / 10);
        return {value, expiresAt, refreshAt: expiresAt - margin};
    } catch {
        throw new Error('Enterprise token exchange returned an invalid or expired access token');
    }
};

export const createEnterpriseAuthProvider = async (
    config: ServiceAccountAuthConfig & Pick<CommonConfig, 'apiUrl' | 'apiVersion'>,
): Promise<AuthProvider> => {
    const key = await loadKey(config.keyFile);
    const url = `${config.apiUrl}/rpc/exchangeServiceAccountToken`;
    validateHttpsUrl(url, 'Enterprise token exchange URL');
    let cached: AccessToken | undefined;
    let inflight: Promise<AccessToken> | undefined;

    const exchange = async (): Promise<AccessToken> => {
        let status: number | undefined;
        try {
            return await withRequestTimeout('Enterprise token exchange', async (signal) => {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        [HTTP_HEADER.CONTENT_TYPE]: CONTENT_TYPE.JSON,
                        [HTTP_HEADER.DATALENS_API_VERSION]: config.apiVersion,
                    },
                    body: JSON.stringify({saToken: createClientJwt(key)}),
                    signal,
                    redirect: 'error',
                });
                if (!res.ok) {
                    status = res.status;
                    await res.body?.cancel();
                    throw new Error();
                }
                return parseAccessToken(
                    JSON.parse(await readResponseText(res, MAX_API_RESPONSE_BYTES)),
                );
            });
        } catch {
            // Transport errors and upstream bodies may include credentials. Never forward them.
            throw new Error(
                `Enterprise token exchange failed${status ? ` (HTTP ${status})` : ''}; check connectivity, service account key and access`,
            );
        }
    };

    return {
        getAuthHeader: async () => {
            if (cached && Date.now() < cached.refreshAt) {
                return `Bearer ${cached.value}`;
            }
            if (!inflight) {
                inflight = exchange()
                    .then((token) => {
                        cached = token;
                        return token;
                    })
                    .finally(() => {
                        inflight = undefined;
                    });
            }
            try {
                return `Bearer ${(await inflight).value}`;
            } catch (err) {
                if (cached && Date.now() < cached.expiresAt) {
                    return `Bearer ${cached.value}`;
                }
                throw err;
            }
        },
    };
};
