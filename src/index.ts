import path from "path";

import dotenv from "dotenv";
import { NodeKit } from "@gravity-ui/nodekit";

// Load .env before NodeKit reads process.env for the configs.
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import { loadConfig, fetchOpenAPISpec, collectTools } from "./components/mcp";
import { getApp } from "./app";

async function main() {
  const nodekit = new NodeKit({
    // src/configs/ in dev (ts-node), dist/configs/ in prod (node dist/index.js)
    configsPath: path.resolve(__dirname, "configs"),
  });

  const config = loadConfig(nodekit.config);

  nodekit.ctx.log("Config loaded", {
    apiUrl: config.apiUrl,
    schemaUrl: config.schemaUrl,
    apiVersion: config.apiVersion,
    hasToken: Boolean(config.apiToken),
    extraHeaders: Object.keys(config.extraHeaders),
  });

  nodekit.ctx.log("Fetching OpenAPI schema", { url: config.schemaUrl });

  let tools;
  try {
    const spec = await fetchOpenAPISpec(config);
    tools = collectTools(spec, config);
  } catch (err) {
    nodekit.ctx.logError("Failed to load OpenAPI schema", err as Error);
    process.exit(1);
  }

  nodekit.ctx.log("MCP tools loaded", {
    count: tools.length,
    excludedTags: config.excludedTags,
  });

  const app = getApp(nodekit, { tools });
  app.run();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start datalens-mcp:", err);
  process.exit(1);
});
