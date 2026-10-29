import {loadCommonConfig, requireApiUrl} from '../common';
import {INSTALLATION} from '../constants';
import type {CommonConfig, StaticAuthConfig} from '../types';

export type ServiceAccountAuthConfig = {
    type: 'service-account';
    /** JSON key downloaded from the Enterprise service account UI. */
    keyFile: string;
};

export type EnterpriseConfig = CommonConfig & {
    installation: typeof INSTALLATION.ENTERPRISE;
    auth: ServiceAccountAuthConfig | (StaticAuthConfig & {header: string});
};

export const loadEnterpriseConfig = (): EnterpriseConfig => {
    const common = loadCommonConfig(requireApiUrl(INSTALLATION.ENTERPRISE), '/api/docs/swagger');
    const keyFile = process.env.DATALENS_SERVICE_ACCOUNT_KEY_FILE?.trim();
    const header = process.env.DATALENS_API_AUTH_HEADER;
    if (Boolean(keyFile) === Boolean(header?.trim())) {
        throw new Error(
            'Enterprise requires exactly one of DATALENS_SERVICE_ACCOUNT_KEY_FILE and DATALENS_API_AUTH_HEADER',
        );
    }
    if (keyFile) {
        return {
            ...common,
            installation: INSTALLATION.ENTERPRISE,
            auth: {type: 'service-account', keyFile},
        };
    }
    if (!header || !/^Bearer \S+$/.test(header)) {
        throw new Error('Enterprise DATALENS_API_AUTH_HEADER must be Bearer <access-token>');
    }
    return {...common, installation: INSTALLATION.ENTERPRISE, auth: {type: 'static', header}};
};
