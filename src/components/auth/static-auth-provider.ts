import type {AuthProvider} from './types';

/** Auth provider backed by a fixed header value (the DATALENS_API_AUTH_HEADER env). */
export const createStaticAuthProvider = (authHeader: string | undefined): AuthProvider => ({
    getAuthHeader: () => authHeader,
});
