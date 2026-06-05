export type AppConfig = {
    /** Base URL of the DataLens public API */
    apiUrl: string;
    /** Authorization header on every API request */
    authHeader?: string;
    /** Extra headers to forward on every API request */
    extraHeaders: Record<string, string>;
    /** Full URL of the OpenAPI JSON spec endpoint */
    schemaUrl: string;
    /** Value for the x-dl-api-version header */
    apiVersion: string;
    /** Max characters of a command response forwarded to the client before truncation */
    maxResponseChars: number;
};
