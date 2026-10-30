import type {AuthProvider} from '../../auth';

/** Auth provider backed by a fixed Authorization header configured at startup. */
export const createStaticAuthProvider = (authHeader: string | undefined): AuthProvider => ({
    getAuthHeader: () => authHeader,
});
