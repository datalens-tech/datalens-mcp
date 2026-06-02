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

const parseExtraHeaders = (
  headersStr: string | undefined,
): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!headersStr) {
    return result;
  }

  for (const pair of headersStr.split(",")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) {
      result[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
    }
  }

  return result;
};

export const loadConfig = (): Config => {
  const apiUrl = (
    process.env.DATALENS_API_URL ?? "http://localhost:8080"
  ).replace(/\/$/, "");

  return {
    apiUrl,
    apiToken: process.env.DATALENS_API_TOKEN,
    extraHeaders: parseExtraHeaders(process.env.DATALENS_HEADERS),
    schemaUrl: process.env.DATALENS_SCHEMA_URL ?? `${apiUrl}/json/`,
    excludedTags: (process.env.DATALENS_EXCLUDED_TAGS ?? "Wizard,QL,Audit")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    apiVersion: process.env.DATALENS_API_VERSION ?? "latest",
  };
};
