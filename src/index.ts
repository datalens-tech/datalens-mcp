import path from "path";

import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

dotenv.config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

import { loadConfig, fetchOpenAPISpec, collectTools } from "./components/mcp";
import { registerLazyMetaTools } from "./components/mcp/meta-tools";

const MCP_SERVER_NAME = "datalens-public-api";
const MCP_SERVER_VERSION = "0.1.0";

async function main() {
  const config = loadConfig();

  let tools;
  try {
    const spec = await fetchOpenAPISpec(config);
    tools = collectTools(spec, config);
  } catch (err) {
    console.error("Failed to load OpenAPI schema", err);
    process.exit(1);
  }

  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const server = new Server(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  registerLazyMetaTools({ server, tools, toolsByName });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("DataLens MCP server running on stdio");
}

main().catch((err) => {
  console.error("Failed to start datalens-mcp:", err);
  process.exit(1);
});
