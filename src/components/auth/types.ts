/** Supplies the current Authorization header value for outgoing API requests. */
export type AuthProvider = {
    /**
     * Returns the Authorization header value, or undefined when no auth is configured.
     * May be async when the value has to be (re)fetched lazily (e.g. an expired IAM token).
     * HTTP providers read the incoming request; stdio providers ignore this argument.
     */
    getAuthHeader: (request?: Request) => Promise<string | undefined> | string | undefined;
};
