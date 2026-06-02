import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import type { CollectedTool } from "./tools";

// Names follow the lazy-mcp contract used in datalens-ui-private.
const LAZY_TOOLS = {
  LIST_COMMANDS: "list_commands",
  DESCRIBE_COMMANDS: "describe_commands",
  INVOKE_COMMAND: "invoke_command",
} as const;

const META_TOOL_DEFS = [
  {
    name: LAZY_TOOLS.LIST_COMMANDS,
    description:
      "List all available command names and one-line summaries. Call this first to discover what commands exist before using describe_commands or invoke_command.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: LAZY_TOOLS.DESCRIBE_COMMANDS,
    description:
      "Return the full description and input schema for one or more commands.",
    inputSchema: {
      type: "object" as const,
      properties: {
        command_names: {
          type: "array",
          items: { type: "string" },
          description: "Names of the commands to describe.",
        },
      },
      required: ["command_names"],
    },
  },
  {
    name: LAZY_TOOLS.INVOKE_COMMAND,
    description:
      "Invoke a command by name, passing optional parameters. Put all command inputs inside the parameters field.",
    inputSchema: {
      type: "object" as const,
      properties: {
        command_name: {
          type: "string",
          description: "The command to invoke.",
        },
        parameters: {
          type: "object",
          description:
            "Arguments for the command. Put downstream inputs here, not at the top level.",
        },
      },
      required: ["command_name"],
    },
  },
];

const toToolResult = (data: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
    },
  ],
});

const toErrorResult = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

export const registerLazyMetaTools = ({
  server,
  tools,
  toolsByName,
}: {
  server: Server;
  tools: CollectedTool[];
  toolsByName: Map<string, CollectedTool>;
}): void => {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: META_TOOL_DEFS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {}) as Record<string, unknown>;

    switch (name) {
      case LAZY_TOOLS.LIST_COMMANDS: {
        return toToolResult(
          tools.map(({ name: commandName, summary }) => ({
            command_name: commandName,
            summary,
          })),
        );
      }

      case LAZY_TOOLS.DESCRIBE_COMMANDS: {
        const commandNames = args["command_names"];
        if (!Array.isArray(commandNames)) {
          return toErrorResult(
            "describe_commands requires a command_names array",
          );
        }
        const results = commandNames.map((cmdName) => {
          const tool = toolsByName.get(String(cmdName));
          if (!tool) {
            return {
              command_name: cmdName,
              error: `Unknown command: ${cmdName}`,
            };
          }
          return {
            command_name: tool.name,
            description: tool.description,
            inputSchema: tool.rawInputSchema,
          };
        });
        return toToolResult(results);
      }

      case LAZY_TOOLS.INVOKE_COMMAND: {
        const commandName = args["command_name"];
        if (typeof commandName !== "string" || !commandName) {
          return toErrorResult("invoke_command requires a command_name string");
        }

        const tool = toolsByName.get(commandName);
        if (!tool) {
          return toErrorResult(`Unknown command: ${commandName}`);
        }

        const parameters = (args["parameters"] ?? {}) as Record<
          string,
          unknown
        >;

        try {
          const data = await tool.invoke(parameters);
          return toToolResult(data);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return toErrorResult(message);
        }
      }

      default:
        return toErrorResult(`Unknown meta-tool: ${name}`);
    }
  });
};
