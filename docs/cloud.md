# Yandex Cloud setup

[Back to README](../README.md)

## Authorization

> **Prerequisite:** the [`yc` CLI](https://yandex.cloud/docs/cli/quickstart)
> **must be installed and configured.** Install it, then run `yc init` to log in
> and select your cloud and folder.

The server runs `yc iam create-token` to obtain an IAM
token and sends it as `Authorization: Bearer <token>`. The token is fetched
lazily on the first request and re-fetched only once it is about to expire.

Once `yc` works, you only need one environment variable — your organization id:

```
DATALENS_ORG_ID=<org-id>
```

Optional `yc` tweaks:

- `DATALENS_YC_PROFILE` — use a specific `yc` profile instead of the active one.
- `DATALENS_YC_BIN` — full path to the `yc` binary if it isn't on `PATH`.

## Alternative: static token

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

## MCP client setup

The server speaks MCP over stdio. Add it to your MCP client configuration:

### Via `npx` (recommended)

No install or build step — `npx` fetches the published package on demand:

```json
{
  "mcpServers": {
    "datalens": {
      "command": "npx",
      "args": ["-y", "--prefer-online", "@datalens-tech/mcp@latest"],
      "env": {
        "DATALENS_ORG_ID": "<org-id>"
      }
    }
  }
}
```

For a global installation, see [Run](../README.md#via-a-global-install).

## Configuration

Set the variables in your MCP client's server configuration. For automatic `yc`
authentication, omit `DATALENS_YC_STATIC_AUTH` and `DATALENS_API_AUTH_HEADER`.

| Variable                   | Default                     | Purpose                                 |
| -------------------------- | --------------------------- | --------------------------------------- |
| `DATALENS_INSTALLATION`    | `cloud`                     | Selects Cloud authentication.           |
| `DATALENS_ORG_ID`          | Required                    | Organization id, sent as `x-dl-org-id`. |
| `DATALENS_API_URL`         | `https://api.datalens.tech` | API base URL.                           |
| `DATALENS_YC_PROFILE`      | Active profile              | Profile used by `yc`.                   |
| `DATALENS_YC_BIN`          | `yc`                        | Path to the `yc` binary.                |
| `DATALENS_YC_STATIC_AUTH`  | Disabled                    | `1` or `true` selects a static token.   |
| `DATALENS_API_AUTH_HEADER` | —                           | Full static `Authorization` header.     |

The default OpenAPI URL is `{DATALENS_API_URL}/json/`.
Setting `DATALENS_API_VERSION=2` selects `{DATALENS_API_URL}/2/json/` automatically.
`DATALENS_SCHEMA_URL` overrides the URL; keep its schema version consistent with
`DATALENS_API_VERSION`.
See [shared configuration](../README.md#configuration-reference) for overrides.
