import type {AuthProvider} from '../../auth';
import type {StdioConfig} from '../config';

import {createStaticAuthProvider} from './static-auth-provider';
import {createYcIamAuthProvider} from './yc-iam-auth-provider';

export const createAuthProvider = async (config: StdioConfig): Promise<AuthProvider> => {
    if (config.installation === 'cloud' && config.ycIam) {
        return createYcIamAuthProvider(config.ycIam);
    }

    return createStaticAuthProvider(config.authHeader);
};
