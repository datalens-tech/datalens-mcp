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

| Variable                      | Required | Default                    | Description                                                                    |
| ----------------------------- | -------- | -------------------------- | ------------------------------------------------------------------------------ |
| `DATALENS_API_URL`            | ✅       | —                          | Base URL of the DataLens public API.                                           |
| `DATALENS_ORG_ID`             | ✅       | —                          | Organization id, sent in the `x-dl-org-id` header.                            |
| `DATALENS_YC_PROFILE`         |          | —                          | `yc` profile name (`yc ... --profile <name>`). Defaults to the active profile. |
| `DATALENS_YC_IAM_REFRESH_SEC` |          | `3600`                     | How often to refresh the IAM token, in seconds.                                |
| `DATALENS_YC_BIN`             |          | `yc`                       | Path to the `yc` binary.                                                       |
| `DATALENS_SCHEMA_URL`         |          | `{DATALENS_API_URL}/json/` | URL of the OpenAPI JSON spec.                                                  |
| `DATALENS_API_VERSION`        |          | `latest`                   | Sent in the `x-dl-api-version` header.                                         |
| `DATALENS_MAX_RESPONSE_CHARS` |          | `100000`                   | Responses longer than this are truncated before reaching the client.           |

### Authorization

The server runs `yc iam create-token` on startup and sends the result as
`Authorization: Bearer <token>`. The token is re-fetched every
`DATALENS_YC_IAM_REFRESH_SEC` seconds, so a long-running server keeps a valid
token without a restart. The `yc` CLI must be installed and authenticated in the
environment where the server runs (it must be on `PATH`, or point
`DATALENS_YC_BIN` at it). Any extra environment variables you pass to the server
are inherited by the `yc` subprocess.

## Install & build

```bash
npm ci
npm run build
```

## Run

The server speaks MCP over stdio. You can run it with `npx` from your MCP client:

```json
{
  "mcpServers": {
    "datalens": {
      "command": "npx",
      "args": ["-y", "datalens-mcp@latest"],
      "env": {
        "DATALENS_API_URL": "https://datalens.example.com",
        "DATALENS_ORG_ID": "<org-id>"
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
