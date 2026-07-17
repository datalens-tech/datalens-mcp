/** Settings for obtaining an IAM token via the Yandex Cloud `yc` CLI */
export type YcIamConfig = {
    /** `yc` profile name passed as `--profile <name>` (uses the active profile when omitted) */
    profile?: string;
    /** Path to the `yc` binary */
    bin: string;
};

/**
 * DataLens installation type, decides how requests are authorized:
 * - `cloud` (default): Authorization is an IAM token fetched via the `yc` CLI.
 * - `internal`: Authorization is taken from DATALENS_API_AUTH_HEADER.
 */
export type Installation = 'cloud' | 'internal';

/** Controls whether commands that can mutate DataLens may be executed. */
export type WriteMode = 'direct' | 'planned' | 'disabled';

export type AppConfig = {
    /** Base URL of the DataLens public API */
    apiUrl: string;
    /** Installation type that selects the authorization strategy */
    installation: Installation;
    /** Organization id sent in the x-dl-org-id header (required for the `cloud` installation) */
    orgId?: string;
    /** Authorization header on every API request */
    authHeader?: string;
    /** IAM-token settings, present when installation is `cloud` */
    ycIam?: YcIamConfig;
    /** Full URL of the OpenAPI JSON spec endpoint */
    schemaUrl: string;
    /** Optional local OpenAPI document. Takes precedence over schemaUrl. */
    schemaPath?: string;
    /** Optional last-known-good OpenAPI cache used for remote schema fallback. */
    schemaCachePath?: string;
    /** Value for the x-dl-api-version header */
    apiVersion: string;
    /** Max characters returned inline or by one read_result call */
    maxResponseChars: number;
    /** Timeout for OpenAPI and DataLens API requests */
    requestTimeoutMs: number;
    /** Server-side write policy */
    writeMode: WriteMode;
    /** Allows commands explicitly marked as destructive in planned mode */
    allowDestructive: boolean;
    /** Optional exact command allowlist. An empty list means all commands. */
    allowCommands: string[];
    /** Exact command denylist. Takes precedence over allowCommands. */
    denyCommands: string[];
    /** Lifetime of stored large command results */
    resultTtlMs: number;
    /** Maximum UTF-8 byte size of one stored result */
    resultMaxBytes: number;
    /** Maximum combined UTF-8 byte size of stored results */
    resultStoreMaxBytes: number;
    /** Lifetime of a prepared write plan */
    planTtlMs: number;
};
