/** Supplies the current Authorization header value for outgoing API requests. */
export type AuthProvider = {
    /** Returns the Authorization header value, or undefined when no auth is configured. */
    getAuthHeader: () => string | undefined;
};
