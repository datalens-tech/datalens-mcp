import {loadConfigCommon} from '../config';
import type {AppConfig, Installation} from '../config';

/** Settings for obtaining an IAM token via the Yandex Cloud `yc` CLI */
export type YcIamConfig = {
    /** `yc` profile name passed as `--profile <name>` (uses the active profile when omitted) */
    profile?: string;
    /** Path to the `yc` binary */
    bin: string;
};

export type StdioConfig = AppConfig & {
    authHeader?: string;
    ycIam?: YcIamConfig;
};

const DEFAULT_YC_BIN = 'yc';

const parseBool = (raw: string | undefined): boolean =>
    raw === '1' || raw?.toLowerCase() === 'true';

const resolveAuthHeader = (installation: Installation): string | undefined => {
    const oauthToken = process.env.DATALENS_OAUTH_TOKEN?.trim();

    if (installation === 'internal' && oauthToken) {
        return `OAuth ${oauthToken}`;
    }

    return process.env.DATALENS_API_AUTH_HEADER;
};

const getYcIamConfig = (): YcIamConfig => ({
    profile: process.env.DATALENS_YC_PROFILE || undefined,
    bin: process.env.DATALENS_YC_BIN || DEFAULT_YC_BIN,
});

export const loadStdioConfig = (): StdioConfig => {
    const config = loadConfigCommon();
    const {installation} = config;
    const isCloud = installation === 'cloud';
    let ycIam: YcIamConfig | undefined;

    if (isCloud && !parseBool(process.env.DATALENS_YC_STATIC_AUTH)) {
        ycIam = getYcIamConfig();
    }

    return {...config, authHeader: resolveAuthHeader(installation), ycIam};
};
