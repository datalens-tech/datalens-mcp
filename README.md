# datalens-mcp

An [MCP](https://modelcontextprotocol.io) server that exposes the DataLens public API as a compact, policy-aware OpenAPI gateway.

At startup the server loads the DataLens OpenAPI document, validates command schemas, and collects enabled POST operations. It does not register every API operation as a separate MCP tool, so even a large API does not flood the model context.

## MCP tools

| Tool                | Purpose                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `list_commands`     | Discover commands together with access and execution policy.      |
| `describe_commands` | Get descriptions, policy metadata, and input schemas.             |
| `invoke_command`    | Execute commands allowed for direct invocation.                   |
| `read_result`       | Read a large stored result in bounded chunks.                     |
| `plan_command`      | Validate and prepare an immutable write without calling DataLens. |
| `execute_plan`      | Execute a one-time prepared write plan.                           |

`plan_command` and `execute_plan` are published only in `planned` write mode. The typical flows are:

```text
read:  list_commands → describe_commands → invoke_command
write: list_commands → describe_commands → plan_command → approval → execute_plan
large result: invoke_command → read_result → read_result → ...
```

Plans are process-local, expire after five minutes by default, and are consumed before the API request is sent. This prevents accidental replay, but it is not proof of human approval. Configure the MCP client to require approval for `execute_plan`.

## OpenAPI command policy

The authoritative command policy is an OpenAPI operation extension:

```yaml
/rpc/updateWorkbook:
  post:
    x-mcp:
      enabled: true
      access: write
      destructive: false
      idempotent: false
```

Supported fields:

- `enabled` — omit or set to `true` to expose the operation.
- `access` — `read` or `write`; an omitted value becomes `unknown`.
- `destructive` — marks writes that may irreversibly remove or overwrite data.
- `idempotent` — tells the agent whether repeating the same request has additional effects.

The legacy `x-mcp-disabled: true` extension is still supported and takes precedence. No command-name heuristics are used. Defaults are:

| Access    | Idempotent | Destructive |
| --------- | ---------- | ----------- |
| `read`    | `true`     | `false`     |
| `write`   | `false`    | `false`     |
| `unknown` | `false`    | `false`     |

Duplicate command names derived from the final path segment fail startup instead of silently replacing one another. Request parameters are validated against the bundled OpenAPI JSON Schema before any API request.

## Write modes

Set `DATALENS_MCP_WRITE_MODE` once when starting the server:

| Mode                | Read                            | Write/unknown                   | Plan tools |
| ------------------- | ------------------------------- | ------------------------------- | ---------- |
| `planned` (default) | Direct through `invoke_command` | `plan_command` → `execute_plan` | Published  |
| `direct`            | Direct through `invoke_command` | Direct through `invoke_command` | Hidden     |
| `disabled`          | Direct through `invoke_command` | Blocked                         | Hidden     |

In `planned` mode, commands marked `destructive: true` are blocked unless the server starts with:

```text
DATALENS_MCP_ALLOW_DESTRUCTIVE=1
```

`direct` is an explicit compatibility mode and permits destructive commands without that extra flag. Use comma-separated exact command names in `DATALENS_MCP_ALLOW_COMMANDS` and `DATALENS_MCP_DENY_COMMANDS` to narrow the published API. Deny entries take precedence.

See [MIGRATION.md](MIGRATION.md) before upgrading from `0.x`.

## Authorization

### Yandex Cloud via `yc` CLI

Install and configure the [`yc` CLI](https://yandex.cloud/docs/cli/quickstart), then provide the DataLens organization id:

```text
DATALENS_ORG_ID=<org-id>
```

The server obtains IAM tokens lazily, refreshes them before expiry, and refreshes once more if the API returns `401`. Concurrent refreshes share one request.

Optional settings:

- `DATALENS_YC_PROFILE` — a specific `yc` profile.
- `DATALENS_YC_BIN` — path to the `yc` binary; default `yc`.

### Static cloud authorization

```text
DATALENS_ORG_ID=<org-id>
DATALENS_YC_STATIC_AUTH=1
DATALENS_API_AUTH_HEADER="Bearer <iam-token>"
```

Startup fails if static cloud authorization is enabled without a header. Static credentials are never automatically refreshed.

### Internal installation

```text
DATALENS_INSTALLATION=internal
DATALENS_API_URL=https://datalens.example
DATALENS_API_AUTH_HEADER="Bearer <optional-token>"
```

The authorization header is optional for internal servers that permit unauthenticated access.

## Run

The server speaks MCP over stdio.

### `npx`

```json
{
  "mcpServers": {
    "datalens": {
      "command": "npx",
      "args": ["-y", "@datalens-tech/mcp@1"],
      "env": {
        "DATALENS_ORG_ID": "<org-id>",
        "DATALENS_MCP_WRITE_MODE": "planned"
      }
    }
  }
}
```

### Local build

```bash
npm ci
npm run build
node dist/index.js
```

Point the MCP client at the absolute path to `dist/index.js`. All diagnostics are written to stderr; stdout is reserved for MCP messages.

## Configuration reference

| Variable                          | Default                     | Description                                                 |
| --------------------------------- | --------------------------- | ----------------------------------------------------------- |
| `DATALENS_INSTALLATION`           | `cloud`                     | `cloud` or `internal`.                                      |
| `DATALENS_API_URL`                | `https://api.datalens.tech` | DataLens API base URL; required for internal installations. |
| `DATALENS_ORG_ID`                 | —                           | Cloud organization id; required in cloud mode.              |
| `DATALENS_API_VERSION`            | `latest`                    | Value of the `x-dl-api-version` header.                     |
| `DATALENS_API_AUTH_HEADER`        | —                           | Static `Authorization` header.                              |
| `DATALENS_YC_STATIC_AUTH`         | false                       | Use the static header instead of `yc` in cloud mode.        |
| `DATALENS_YC_PROFILE`             | active profile              | `yc` profile name.                                          |
| `DATALENS_YC_BIN`                 | `yc`                        | Path to the `yc` executable.                                |
| `DATALENS_SCHEMA_URL`             | `{API_URL}/json/`           | Remote OpenAPI URL.                                         |
| `DATALENS_SCHEMA_PATH`            | —                           | Local OpenAPI JSON file; takes precedence over the URL.     |
| `DATALENS_SCHEMA_CACHE_PATH`      | —                           | Optional last-known-good remote schema cache and fallback.  |
| `DATALENS_REQUEST_TIMEOUT_MS`     | `30000`                     | OpenAPI and API request timeout.                            |
| `DATALENS_MCP_WRITE_MODE`         | `planned`                   | `direct`, `planned`, or `disabled`.                         |
| `DATALENS_MCP_ALLOW_DESTRUCTIVE`  | false                       | Allow destructive plans in planned mode.                    |
| `DATALENS_MCP_ALLOW_COMMANDS`     | all                         | Comma-separated exact allowlist.                            |
| `DATALENS_MCP_DENY_COMMANDS`      | none                        | Comma-separated exact denylist.                             |
| `DATALENS_MAX_RESPONSE_CHARS`     | `100000`                    | Inline response and `read_result` chunk limit.              |
| `DATALENS_RESULT_TTL_MS`          | `600000`                    | Stored result lifetime.                                     |
| `DATALENS_RESULT_MAX_BYTES`       | `10485760`                  | Maximum UTF-8 size of one stored result.                    |
| `DATALENS_RESULT_STORE_MAX_BYTES` | `52428800`                  | Total in-memory result-store limit with LRU eviction.       |
| `DATALENS_PLAN_TTL_MS`            | `300000`                    | Prepared plan lifetime.                                     |

When `DATALENS_SCHEMA_CACHE_PATH` is configured, a successfully validated remote schema is written atomically with owner-only permissions. Network errors and HTTP `408`, `429`, and `5xx` responses are retried up to three attempts before the cache is used.

## Errors and large results

Tool failures set MCP `isError: true` and return a stable JSON envelope:

```json
{
  "ok": false,
  "error": {
    "code": "WRITE_REQUIRES_PLAN",
    "kind": "policy",
    "message": "...",
    "retryable": false
  }
}
```

Authorization, cookies, tokens, passwords, secrets, credentials, and API keys are redacted from errors and diagnostics.

Responses above the inline threshold are held in a bounded in-memory LRU store and represented by a `stored_result` descriptor. Results above the per-item hard limit return an explicit `RESULT_TOO_LARGE` error with a bounded preview; data is never silently truncated.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run test:package
```

`npm test` builds the CLI and runs unit tests plus a real stdio integration test against a local mock OpenAPI/DataLens server.
