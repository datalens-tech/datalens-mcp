# Internal installation setup

[Back to README](../README.md)

## Authorization

For an internal DataLens installation, set the installation type, API URL and OAuth token:

```bash
DATALENS_INSTALLATION=internal
DATALENS_API_URL=https://datalens.example.com
DATALENS_OAUTH_TOKEN=<oauth-token>
```

The token is sent as `Authorization: OAuth <oauth-token>`.
Alternatively, set `DATALENS_API_AUTH_HEADER` to a complete Authorization header value.
When both variables are set, `DATALENS_OAUTH_TOKEN` takes precedence.

## MCP client setup

```json
{
  "mcpServers": {
    "datalens-internal": {
      "command": "npx",
      "args": ["-y", "--prefer-online", "@datalens-tech/mcp@latest"],
      "env": {
        "DATALENS_INSTALLATION": "internal",
        "DATALENS_API_URL": "https://datalens.example.com",
        "DATALENS_OAUTH_TOKEN": "<oauth-token>"
      }
    }
  }
}
```

For a global installation, see [Run](../README.md#via-a-global-install).

## Configuration

| Variable                   | Default              | Purpose                                              |
| -------------------------- | -------------------- | ---------------------------------------------------- |
| `DATALENS_INSTALLATION`    | Required: `internal` | Selects internal authentication.                     |
| `DATALENS_API_URL`         | Required             | API base URL.                                        |
| `DATALENS_OAUTH_TOKEN`     | —                    | Token sent with the `OAuth` prefix.                  |
| `DATALENS_API_AUTH_HEADER` | —                    | Full static header, used when no OAuth token is set. |

The default OpenAPI URL is `{DATALENS_API_URL}/json/`. Tokens are static;
restart the MCP server after changing them.
See [shared configuration](../README.md#configuration-reference) for overrides.
