/** Supplies the current Authorization header value for outgoing API requests. */
export type AuthProvider = {
    /**
     * Returns the Authorization header value, or undefined when no auth is configured.
     * May be async when the value has to be (re)fetched lazily (e.g. an expired IAM token).
     */
    getAuthHeader: () => Promise<string | undefined> | string | undefined;
    /** Drops a refreshable credential after the API rejects it. Static providers omit this. */
    invalidate?: () => void;
};
