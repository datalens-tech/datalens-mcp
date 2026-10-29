# datalens-mcp

An [MCP](https://modelcontextprotocol.io) server that exposes the **DataLens public API** to LLM agents.

On startup it fetches the API's OpenAPI spec and turns every RPC endpoint into a
callable command when the operation declares a supported `x-mcp-scope`. Instead
of registering hundreds of individual MCP tools (which would flood the model's
context), it exposes a small **gateway** of five tools:

| Tool                        | Purpose                                                                |
| --------------------------- | ---------------------------------------------------------------------- |
| `list_commands`             | List all command names with one-line summaries. Call this first.       |
| `describe_commands`         | Return the full description and input schema for one or more commands. |
| `invoke_read_command`       | Call a command classified as `read`.                                   |
| `invoke_write_command`      | Call a command classified as `write`.                                  |
| `invoke_privileged_command` | Call a command classified as `privileged`.                             |

The typical agent flow is: `list_commands` → `describe_commands` for the ones it
needs → the invocation tool indicated by `invoke_tool`.

Both discovery tools include each command's `scope` and `invoke_tool`. Invocation
checks the scope on the server before executing the API call.

Configure client approval policies for read, write, and privileged tools separately.
Privileged calls require explicit user approval; descriptions and MCP annotations are hints,
not an approval mechanism. Clients must enforce approvals themselves, and DataLens
continues to enforce the user's permissions for every API call.

## Setup

Choose the guide for your DataLens installation:

| Installation | Guide                                  |
| ------------ | -------------------------------------- |
| Yandex Cloud | [Cloud setup](docs/cloud.md)           |
| Internal     | [Internal setup](docs/internal.md)     |
| Enterprise   | [Enterprise setup](docs/enterprise.md) |

Each guide covers authorization, required variables, and a complete MCP client
configuration. The server speaks MCP over stdio. Set environment variables in your
client's server configuration.

## Run

The setup guides use `npx` to fetch the published package on demand, without a
separate install or build step.

`--prefer-online` asks npm to revalidate cached package metadata. It does not
upgrade an already running MCP process; restart the server to pick up updates.

The server checks npm for updates in the background and notifies you when a newer
stable version is available. Update the package yourself and restart the MCP server
to use the new version.

### Via a global install

```bash
npm install -g @datalens-tech/mcp
```

In the MCP client configuration from your installation guide, set `command` to
`datalens-mcp`, remove `args`, and keep the guide's `env` settings.

### From a local build

```bash
npm ci
npm run build
```

In the MCP client configuration from your installation guide, set `command` to
`node` and `args` to `["/absolute/path/to/datalens-mcp/dist/index.js"]`.
Keep the guide's `env` settings.

## Configuration reference

Installation-specific credentials and defaults are documented in the
[Cloud](docs/cloud.md#configuration), [Internal](docs/internal.md#configuration),
and [Enterprise](docs/enterprise.md#configuration) guides.

These settings apply to every installation:

| Variable                      | Default                                   | Purpose                                                                            |
| ----------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `DATALENS_SCHEMA_URL`         | Derived from the installation and API URL | Overrides the OpenAPI JSON URL.                                                    |
| `DATALENS_API_VERSION`        | `latest`                                  | Sent in the `x-dl-api-version` header. Keep the schema version consistent with it. |
| `DATALENS_MAX_RESPONSE_CHARS` | `100000`                                  | Truncates responses before forwarding them to the client.                          |

`DATALENS_INSTALLATION` defaults to `cloud`; supported values are `cloud`,
`internal`, and `enterprise`. Unknown values are rejected.

## Security boundaries

API and schema URLs must use HTTPS without embedded credentials. HTTP is also
allowed for `localhost`, `127.0.0.1`, and `[::1]` endpoints only when
`NODE_ENV=development` (set by `npm run dev`). Redirects are rejected.

Response bodies are limited before JSON parsing: 10 MiB for API calls and 20 MiB
for OpenAPI, measured after decompression. The 30-second request timeout includes
reading the body.
`DATALENS_MAX_RESPONSE_CHARS` remains a separate limit on API data and error details
sent to the agent.

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
