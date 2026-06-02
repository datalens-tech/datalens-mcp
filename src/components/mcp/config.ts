import type { AppConfig } from "@gravity-ui/nodekit";

export type Config = {
  /** Base URL of the DataLens public API, e.g. http://localhost:8080 */
  apiUrl: string;
  /** Bearer token sent as Authorization header on every API request */
  apiToken?: string;
  /** Extra headers to forward on every API request */
  extraHeaders: Record<string, string>;
  /** Full URL of the OpenAPI JSON spec endpoint */
  schemaUrl: string;
  /** OpenAPI tags whose operations must not be exposed as MCP tools */
  excludedTags: string[];
  /** Value for the x-dl-api-version header */
  apiVersion: string;
};

export const loadConfig = (appConfig: AppConfig): Config => {
  return {
    apiUrl: appConfig.mcpApiUrl,
    apiToken: appConfig.mcpApiToken,
    extraHeaders: appConfig.mcpExtraHeaders,
    schemaUrl: appConfig.mcpSchemaUrl,
    excludedTags: appConfig.mcpExcludedTags,
    apiVersion: appConfig.mcpApiVersion,
  };
};
