# datalens-mcp

An [MCP](https://modelcontextprotocol.io) server that exposes the **DataLens public API** to LLM agents.

On startup it fetches the API's OpenAPI spec and turns every RPC endpoint into a
callable command. Instead of registering hundreds of individual MCP tools (which
would flood the model's context), it exposes a small **gateway** of three tools:

| Tool                | Purpose                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `list_commands`     | List all command names with one-line summaries. Call this first.       |
| `describe_commands` | Return the full description and input schema for one or more commands. |
| `invoke_command`    | Call a command by name, passing its parameters.                        |

The typical agent flow is: `list_commands` → `describe_commands` for the ones it
needs → `invoke_command`.

## Configuration

All configuration is via environment variables (see [.env.example](.env.example)):

| Variable                      | Required | Default                    | Description                                                                                             |
| ----------------------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `DATALENS_API_URL`            | ✅       | —                          | Base URL of the DataLens public API.                                                                    |
| `DATALENS_API_AUTH_HEADER`    |          | —                          | Value sent verbatim in the `Authorization` header. Include the scheme yourself (e.g. `Bearer <token>`). |
| `DATALENS_HEADERS`            |          | —                          | Extra headers on every request, as `KEY=VALUE` pairs separated by `;`.                                  |
| `DATALENS_SCHEMA_URL`         |          | `{DATALENS_API_URL}/json/` | URL of the OpenAPI JSON spec.                                                                           |
| `DATALENS_API_VERSION`        |          | `latest`                   | Sent in the `x-dl-api-version` header.                                                                  |
| `DATALENS_MAX_RESPONSE_CHARS` |          | `100000`                   | Responses longer than this are truncated before reaching the client.                                    |

## Install & build

```bash
npm ci
npm run build
```

## Run

The server speaks MCP over stdio. Configure it in your MCP client, for example:

```json
{
  "mcpServers": {
    "datalens": {
      "command": "node",
      "args": ["/absolute/path/to/datalens-mcp/dist/index.js"],
      "env": {
        "DATALENS_API_URL": "https://datalens.example.com",
        "DATALENS_API_AUTH_HEADER": "Bearer <token>"
      }
    }
  }
}
```

For local development with a `.env` file:

```bash
npm run dev
```

## Development

```bash
npm run lint        # prettier + eslint
npm run typecheck   # tsc --noEmit
npm test            # vitest
```
