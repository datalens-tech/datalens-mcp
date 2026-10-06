import {validateHttpsUrl} from '../../utils';

import {INSTALLATION} from './constants';
import type {AppConfig, Installation} from './types';

const DEFAULT_MAX_RESPONSE_CHARS = 100_000;
const DEFAULT_INSTALLATION: Installation = INSTALLATION.CLOUD;
const DEFAULT_CLOUD_API_URL = 'https://api.datalens.tech';
const DEFAULT_API_VERSION = 'latest';
const OPENAPI_SCHEMA_PATH = '/json/';

const parseMaxResponseChars = (raw: string | undefined): number => {
    if (!raw) {
        return DEFAULT_MAX_RESPONSE_CHARS;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_RESPONSE_CHARS;
};

const parseInstallation = (raw: string | undefined): Installation =>
    raw?.trim().toLowerCase() === INSTALLATION.INTERNAL
        ? INSTALLATION.INTERNAL
        : DEFAULT_INSTALLATION;

export const loadConfigCommon = (): AppConfig => {
    const installation = parseInstallation(process.env.DATALENS_INSTALLATION);
    const isCloud = installation === INSTALLATION.CLOUD;

    if (!isCloud && !process.env.DATALENS_API_URL) {
        throw new Error('DATALENS_API_URL env is not set (required for the internal installation)');
    }
    const apiUrl = (process.env.DATALENS_API_URL || DEFAULT_CLOUD_API_URL).replace(/\/$/, '');
    const schemaUrl = process.env.DATALENS_SCHEMA_URL ?? `${apiUrl}${OPENAPI_SCHEMA_PATH}`;
    validateHttpsUrl(apiUrl, 'DATALENS_API_URL');
    validateHttpsUrl(schemaUrl, 'DATALENS_SCHEMA_URL');

    const orgId = process.env.DATALENS_ORG_ID;
    if (isCloud && !orgId) {
        throw new Error('DATALENS_ORG_ID env is not set (required for the cloud installation)');
    }

    return {
        apiUrl,
        installation,
        orgId: isCloud ? orgId : undefined,
        schemaUrl,
        apiVersion: process.env.DATALENS_API_VERSION ?? DEFAULT_API_VERSION,
        maxResponseChars: parseMaxResponseChars(process.env.DATALENS_MAX_RESPONSE_CHARS),
    };
};
