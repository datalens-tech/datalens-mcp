import type {AppConfig} from '../config';

import {createStaticAuthProvider} from './static-auth-provider';
import type {AuthProvider} from './types';
import {createYcIamAuthProvider} from './yc-iam-auth-provider';

export const createAuthProvider = async (config: AppConfig): Promise<AuthProvider> => {
    if (config.installation === 'cloud' && config.ycIam) {
        return createYcIamAuthProvider(config.ycIam);
    }

    return createStaticAuthProvider(config.authHeader);
};
