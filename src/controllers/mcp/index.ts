import type { Request, Response } from "@gravity-ui/expresskit";
import type { AppContext } from "@gravity-ui/nodekit";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { registerLazyMetaTools } from "../../components/mcp/meta-tools";
import type { CollectedTool } from "../../components/mcp/tools";

const MCP_SERVER_NAME = "datalens-public-api";
const MCP_SERVER_VERSION = "0.1.0";

export type CreateMcpControllerOptions = {
  tools: CollectedTool[];
};

export const createMcpController = (
  _ctx: AppContext,
  { tools }: CreateMcpControllerOptions,
) => {
  const toolsByName = new Map(tools.map((t) => [t.name, t]));

  return async function mcpController(req: Request, res: Response) {
    const server = new Server(
      { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
      { capabilities: { tools: {} } },
    );

    registerLazyMetaTools({ server, tools, toolsByName });

    // Stateless mode: no session persistence across requests
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      req.ctx.logError("mcpController internal error", err as Error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal MCP server error" },
          id: null,
        });
      }
    }
  };
};
