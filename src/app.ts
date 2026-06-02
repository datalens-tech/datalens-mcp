import { ExpressKit } from "@gravity-ui/expresskit";
import type { NodeKit } from "@gravity-ui/nodekit";

import type { CollectedTool } from "./components/mcp/tools";
import { getRoutes } from "./routes";

export type AppOptions = {
  tools: CollectedTool[];
};

export const getApp = (nodekit: NodeKit, options: AppOptions): ExpressKit => {
  const routes = getRoutes({ ctx: nodekit.ctx, tools: options.tools });
  return new ExpressKit(nodekit, routes);
};
