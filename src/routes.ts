import { AuthPolicy } from "@gravity-ui/expresskit";
import type { AppContext } from "@gravity-ui/nodekit";

import { createMcpController } from "./controllers/mcp";
import type { CollectedTool } from "./components/mcp/tools";

export interface RoutesOptions {
  ctx: AppContext;
  tools: CollectedTool[];
}

export function getRoutes({ ctx, tools }: RoutesOptions) {
  const mcpController = createMcpController(ctx, { tools });

  return {
    "POST /mcp": {
      handler: mcpController,
      beforeAuth: [],
      afterAuth: [],
      authPolicy: AuthPolicy.disabled,
    },
    "GET /ping": {
      handler: (_req: unknown, res: { send: (s: string) => void }) =>
        res.send("ok"),
      beforeAuth: [],
      afterAuth: [],
      authPolicy: AuthPolicy.disabled,
    },
  };
}
