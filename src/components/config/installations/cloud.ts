import {loadCommonConfig} from '../common';
import {INSTALLATION} from '../constants';
import type {CommonConfig, StaticAuthConfig} from '../types';

const DEFAULT_CLOUD_API_URL = 'https://api.datalens.tech';
const DEFAULT_YC_BIN = 'yc';

export type YcIamConfig = {
    /** Active yc profile is used when omitted. */
    profile?: string;
    bin: string;
};

export type CloudConfig = CommonConfig & {
    installation: typeof INSTALLATION.CLOUD;
    /** Organization id sent in the x-dl-org-id header. */
    orgId: string;
    auth: (YcIamConfig & {type: 'yc-iam'}) | StaticAuthConfig;
};

export const loadCloudConfig = (): CloudConfig => {
    const common = loadCommonConfig(process.env.DATALENS_API_URL || DEFAULT_CLOUD_API_URL);
    const orgId = process.env.DATALENS_ORG_ID;
    if (!orgId) {
        throw new Error('DATALENS_ORG_ID env is not set (required for the cloud installation)');
    }
    const staticAuth = process.env.DATALENS_YC_STATIC_AUTH;
    const useStaticAuth = staticAuth === '1' || staticAuth?.toLowerCase() === 'true';
    return {
        ...common,
        installation: INSTALLATION.CLOUD,
        orgId,
        auth: useStaticAuth
            ? {type: 'static', header: process.env.DATALENS_API_AUTH_HEADER}
            : {
                  type: 'yc-iam',
                  profile: process.env.DATALENS_YC_PROFILE || undefined,
                  bin: process.env.DATALENS_YC_BIN || DEFAULT_YC_BIN,
              },
    };
};
