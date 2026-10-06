import type {INSTALLATION} from './constants';

/** DataLens installation type; cloud is the default. */
export type Installation = (typeof INSTALLATION)[keyof typeof INSTALLATION];

export type AppConfig = {
    /** Base URL of the DataLens public API */
    apiUrl: string;
    /** Installation type that selects API defaults and required settings */
    installation: Installation;
    /** Organization id sent in the x-dl-org-id header (required for the `cloud` installation) */
    orgId?: string;
    /** Full URL of the OpenAPI JSON spec endpoint */
    schemaUrl: string;
    /** Value for the x-dl-api-version header */
    apiVersion: string;
    /** Max characters of a command response forwarded to the client before truncation */
    maxResponseChars: number;
};
