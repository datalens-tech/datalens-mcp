import {INSTALLATION} from '../config';
import type {AppConfig} from '../config';

import {createEnterpriseAuthProvider} from './enterprise-auth-provider';
import {createStaticAuthProvider} from './static-auth-provider';
import type {AuthProvider} from './types';
import {createYcIamAuthProvider} from './yc-iam-auth-provider';

export const createAuthProvider = async (config: AppConfig): Promise<AuthProvider> => {
    if (config.installation === INSTALLATION.CLOUD) {
        if (config.auth.type === 'yc-iam') {
            return createYcIamAuthProvider(config.auth);
        }
        return createStaticAuthProvider(config.auth.header);
    }

    if (config.installation === INSTALLATION.ENTERPRISE) {
        if (config.auth.type === 'service-account') {
            return createEnterpriseAuthProvider({
                ...config.auth,
                apiUrl: config.apiUrl,
                apiVersion: config.apiVersion,
            });
        }
        return createStaticAuthProvider(config.auth.header);
    }

    return createStaticAuthProvider(config.auth.header);
};
