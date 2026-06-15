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

| Variable                      | Required | Default                    | Description                                                                                        |
| ----------------------------- | -------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| `DATALENS_API_URL`            | ✅       | —                          | Base URL of the DataLens public API.                                                               |
| `DATALENS_ORG_ID`             | ✅       | —                          | Organization id, sent in the `x-dl-org-id` header.                                                |
| `DATALENS_YC_STATIC_AUTH`     |          | —                          | Set to `1` or `true` to use `DATALENS_API_AUTH_HEADER` instead of the `yc` CLI.                   |
| `DATALENS_API_AUTH_HEADER`    |          | —                          | Static value for the `Authorization` header (e.g. `Bearer <token>`). Used when `DATALENS_YC_STATIC_AUTH` is set. |
| `DATALENS_YC_PROFILE`         |          | —                          | `yc` profile name (`yc ... --profile <name>`). Defaults to the active profile.                    |
| `DATALENS_YC_BIN`             |          | `yc`                       | Path to the `yc` binary.                                                                           |
| `DATALENS_SCHEMA_URL`         |          | `{DATALENS_API_URL}/json/` | URL of the OpenAPI JSON spec.                                                                      |
| `DATALENS_API_VERSION`        |          | `latest`                   | Sent in the `x-dl-api-version` header.                                                             |
| `DATALENS_MAX_RESPONSE_CHARS` |          | `100000`                   | Responses longer than this are truncated before reaching the client.                               |

### Authorization

#### Recommended: IAM token via `yc` (default)

The server calls `yc iam create-token` on startup and sends the result as
`Authorization: Bearer <token>`. The token is automatically refreshed every hour,
so a long-running server never sends an expired token.

**Setup:**

1. [Install the `yc` CLI](https://yandex.cloud/docs/cli/quickstart) and run `yc init` to authenticate.
2. Pass `DATALENS_API_URL` and `DATALENS_ORG_ID` — that's all.
3. Optionally set `DATALENS_YC_PROFILE` to the profile name you want to use.
   If omitted, the currently active `yc` profile is used.

The `yc` binary must be on `PATH`, or point `DATALENS_YC_BIN` at its full path.

#### Alternative: static token (`DATALENS_YC_STATIC_AUTH`)

If you prefer to manage the IAM token yourself, set `DATALENS_YC_STATIC_AUTH=1`
and put the token in `DATALENS_API_AUTH_HEADER`:

```
DATALENS_YC_STATIC_AUTH=1
DATALENS_API_AUTH_HEADER="Bearer <iam-token>"
```

The token is sent as-is on every request. `yc` is never called.

> **Note:** IAM tokens expire after 12 hours. With this approach you are
> responsible for refreshing `DATALENS_API_AUTH_HEADER` and restarting the server
> before the token expires.

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

Or point it at a locally built copy:

```json
{
  "mcpServers": {
    "datalens": {
      "command": "node",
      "args": ["/absolute/path/to/datalens-mcp/dist/index.js"],
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
