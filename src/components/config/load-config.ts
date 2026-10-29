import {INSTALLATION} from './constants';
import {loadCloudConfig} from './installations/cloud';
import {loadEnterpriseConfig} from './installations/enterprise';
import {loadInternalConfig} from './installations/internal';
import type {AppConfig} from './types';

export const loadConfig = (): AppConfig => {
    switch (process.env.DATALENS_INSTALLATION?.trim().toLowerCase() || INSTALLATION.CLOUD) {
        case INSTALLATION.CLOUD:
            return loadCloudConfig();
        case INSTALLATION.INTERNAL:
            return loadInternalConfig();
        case INSTALLATION.ENTERPRISE:
            return loadEnterpriseConfig();
        default:
            throw new Error('DATALENS_INSTALLATION must be cloud, internal or enterprise');
    }
};
