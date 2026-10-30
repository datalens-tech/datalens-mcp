import type {CloudConfig} from './installations/cloud';
import type {EnterpriseConfig} from './installations/enterprise';
import type {InternalConfig} from './installations/internal';

export type {CloudConfig, YcIamConfig} from './installations/cloud';
export type {EnterpriseConfig, ServiceAccountAuthConfig} from './installations/enterprise';
export type {InternalConfig} from './installations/internal';

export type CommonConfig = {
    /** Base URL of the DataLens public API. */
    apiUrl: string;
    /** Full URL of the OpenAPI JSON spec. */
    schemaUrl: string;
    /** Value for the x-dl-api-version header. */
    apiVersion: string;
    /** Maximum response characters forwarded to the MCP client. */
    maxResponseChars: number;
};

export type StaticAuthConfig = {
    type: 'static';
    header?: string;
};

export type AppConfig = CloudConfig | InternalConfig | EnterpriseConfig;
export type Installation = AppConfig['installation'];
