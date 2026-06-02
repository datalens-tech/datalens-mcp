import type { AppConfig } from "@gravity-ui/nodekit";

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

const apiUrl = (
  process.env.DATALENS_API_URL ?? "http://localhost:8080"
).replace(/\/$/, "");

export default {
  appName: "datalens-mcp",
  appPort: parseInt(process.env.MCP_PORT ?? "8090", 10),

  mcpApiUrl: apiUrl,
  mcpApiToken: process.env.DATALENS_API_TOKEN,
  mcpSchemaUrl: process.env.DATALENS_SCHEMA_URL ?? `${apiUrl}/json/`,
  mcpExtraHeaders: parseExtraHeaders(process.env.DATALENS_HEADERS),
  mcpExcludedTags: (process.env.DATALENS_EXCLUDED_TAGS ?? "Wizard,QL")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean),
  mcpApiVersion: process.env.DATALENS_API_VERSION ?? "latest",
} satisfies Partial<AppConfig>;
