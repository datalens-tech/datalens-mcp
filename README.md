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

## Authorization

### Setup in Yandex Cloud (recommended)

> **Prerequisite:** the [`yc` CLI](https://yandex.cloud/docs/cli/quickstart)
> **must be installed and configured.** Install it, then run `yc init` to log in
> and select your cloud and folder.

That's the whole setup. The server runs `yc iam create-token` to obtain an IAM
token and sends it as `Authorization: Bearer <token>`. The token is fetched
lazily on the first request and re-fetched only once it is about to expire.

Once `yc` works, you only need one environment variable — your organization id:

```
DATALENS_ORG_ID=<org-id>
```

Optional `yc` tweaks:

- `DATALENS_YC_PROFILE` — use a specific `yc` profile instead of the active one.
- `DATALENS_YC_BIN` — full path to the `yc` binary if it isn't on `PATH`.

### Alternative: static token

If you can't run `yc` (e.g. in a sandboxed environment), you can manage the IAM
token yourself: set `DATALENS_YC_STATIC_AUTH=1` and put the token in
`DATALENS_API_AUTH_HEADER`. The value is sent as-is on every request and `yc` is
never called.

```
DATALENS_YC_STATIC_AUTH=1
DATALENS_API_AUTH_HEADER="Bearer <iam-token>"
```

> **Note:** IAM tokens expire after 12 hours. With this approach you are
> responsible for refreshing `DATALENS_API_AUTH_HEADER` and restarting the server
> before the token expires.

### Internal installation

For an internal DataLens installation, set the installation type, API URL and OAuth token:

```bash
DATALENS_INSTALLATION=internal
DATALENS_API_URL=https://datalens.example.com
DATALENS_OAUTH_TOKEN=<oauth-token>
```

The token is sent as `Authorization: OAuth <oauth-token>`. For backward compatibility,
`DATALENS_API_AUTH_HEADER` is still supported as a complete Authorization header value.
When both variables are set, `DATALENS_OAUTH_TOKEN` takes precedence.

## Run

The server speaks MCP over stdio. Add it to your MCP client config in one of the
ways below.

### Via `npx` (recommended)

No install or build step — `npx` fetches the published package on demand:

```json
{
  "mcpServers": {
    "datalens": {
      "command": "npx",
      "args": ["-y", "@datalens-tech/mcp@latest"],
      "env": {
        "DATALENS_ORG_ID": "<org-id>"
      }
    }
  }
}
```

### Via a global install

Install the package once, then reference the `datalens-mcp` command:

```bash
npm install -g @datalens-tech/mcp
```

```json
{
  "mcpServers": {
    "datalens": {
      "command": "datalens-mcp",
      "env": {
        "DATALENS_ORG_ID": "<org-id>"
      }
    }
  }
}
```

### From a local build

Use this if you've cloned the repo. **Build it
first:**

```bash
npm ci
npm run build
```

Then point your client at the built file:

```json
{
  "mcpServers": {
    "datalens": {
      "command": "node",
      "args": ["/absolute/path/to/datalens-mcp/dist/index.js"],
      "env": {
        "DATALENS_ORG_ID": "<org-id>"
      }
    }
  }
}
```

## Configuration reference

All configuration is via environment variables (see [.env.example](.env.example)):

| Variable                      | Required | Default                            | Description                                                                                                    |
| ----------------------------- | -------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DATALENS_ORG_ID`             | Cloud    | —                                  | Organization id, sent in the `x-dl-org-id` header.                                                             |
| `DATALENS_INSTALLATION`       |          | `cloud`                            | Installation type: `cloud` or `internal`.                                                                      |
| `DATALENS_API_URL`            | Internal | Cloud: `https://api.datalens.tech` | Base URL of the DataLens API.                                                                                  |
| `DATALENS_OAUTH_TOKEN`        |          | —                                  | OAuth token for an internal installation. Takes precedence over `DATALENS_API_AUTH_HEADER`.                    |
| `DATALENS_YC_STATIC_AUTH`     |          | —                                  | Set to `1` or `true` to use `DATALENS_API_AUTH_HEADER` instead of the `yc` CLI.                                |
| `DATALENS_API_AUTH_HEADER`    |          | —                                  | Complete static `Authorization` header. Used as an internal fallback or when `DATALENS_YC_STATIC_AUTH` is set. |
| `DATALENS_YC_PROFILE`         |          | —                                  | `yc` profile name (`yc ... --profile <name>`). Defaults to the active profile.                                 |
| `DATALENS_YC_BIN`             |          | `yc`                               | Path to the `yc` binary.                                                                                       |
| `DATALENS_SCHEMA_URL`         |          | `{DATALENS_API_URL}/json/`         | URL of the OpenAPI JSON spec.                                                                                  |
| `DATALENS_API_VERSION`        |          | `latest`                           | Sent in the `x-dl-api-version` header.                                                                         |
| `DATALENS_MAX_RESPONSE_CHARS` |          | `100000`                           | Responses longer than this are truncated before reaching the client.                                           |

## Security boundaries

API and schema URLs must use HTTPS without embedded credentials. Redirects are
rejected. Local development endpoints must also provide HTTPS.

Response bodies are limited before JSON parsing: 10 MiB for API calls and 20 MiB
for OpenAPI, measured after decompression. The 30-second request timeout includes
reading the body. OpenAPI documents are limited to a depth of 100 and 100,000 nodes.
Bundling command input schemas has a shared budget of 1,000,000 nodes.
`DATALENS_MAX_RESPONSE_CHARS` remains a separate limit on API data sent to the agent.

Command results are returned in a JSON envelope with `trust: "untrusted_data"`
and a `data` string containing the serialized, potentially truncated API response.
Tool descriptions instruct agents to treat API content and command metadata as
data, never as instructions or authorization for subsequent actions. This reduces
the risk of indirect prompt injection but does not guarantee protection; the MCP
client must enforce its own approval and trust boundaries.

CLI failures do not expose child-process output. DataLens API errors preserve
the upstream response details within the response size and timeout limits;
schema diagnostics include the URL origin and path, without query or fragment.

## Development

```bash
npm run lint        # prettier + eslint
npm run typecheck   # tsc --noEmit
npm test            # vitest
```
