/** Settings for obtaining an IAM token via the Yandex Cloud `yc` CLI */
export type YcIamConfig = {
    /** `yc` profile name passed as `--profile <name>` (uses the active profile when omitted) */
    profile?: string;
    /** How often to re-fetch the IAM token, in milliseconds */
    refreshIntervalMs: number;
    /** Path to the `yc` binary */
    bin: string;
};

/**
 * DataLens installation type, decides how requests are authorized:
 * - `cloud` (default): Authorization is an IAM token fetched via the `yc` CLI.
 * - `yandex`: Authorization is taken verbatim from DATALENS_API_AUTH_HEADER.
 */
export type Installation = 'cloud' | 'yandex';

export type AppConfig = {
    /** Base URL of the DataLens public API */
    apiUrl: string;
    /** Installation type that selects the authorization strategy */
    installation: Installation;
    /** Organization id sent in the x-dl-org-id header (required for the `cloud` installation) */
    orgId?: string;
    /** Authorization header on every API request (used when installation is `yandex`) */
    authHeader?: string;
    /** IAM-token settings, present when installation is `cloud` */
    ycIam?: YcIamConfig;
    /** Full URL of the OpenAPI JSON spec endpoint */
    schemaUrl: string;
    /** Value for the x-dl-api-version header */
    apiVersion: string;
    /** Max characters of a command response forwarded to the client before truncation */
    maxResponseChars: number;
};
