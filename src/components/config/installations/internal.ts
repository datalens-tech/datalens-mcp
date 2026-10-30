import {loadCommonConfig, requireApiUrl} from '../common';
import {INSTALLATION} from '../constants';
import type {CommonConfig, StaticAuthConfig} from '../types';

export type InternalConfig = CommonConfig & {
    installation: typeof INSTALLATION.INTERNAL;
    auth: StaticAuthConfig;
};

export const loadInternalConfig = (): InternalConfig => {
    const common = loadCommonConfig(requireApiUrl(INSTALLATION.INTERNAL));
    const oauthToken = process.env.DATALENS_OAUTH_TOKEN?.trim();
    return {
        ...common,
        installation: INSTALLATION.INTERNAL,
        auth: {
            type: 'static',
            header: oauthToken ? `OAuth ${oauthToken}` : process.env.DATALENS_API_AUTH_HEADER,
        },
    };
};
