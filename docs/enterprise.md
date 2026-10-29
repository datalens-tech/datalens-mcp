# Enterprise setup

[Back to README](../README.md)

Choose the MCP version supported by your installed DataLens Enterprise release
and pin that exact version in the client configuration. The example below uses
MCP `0.3.0`; replace it with the version supported by your Enterprise release.

Set your API URL and key file path in your MCP client's server configuration
as shown below.

In the DataLens administration UI, create a service account, give it the required
roles and access to your workbooks/collections, create a key, and download its JSON
file. Use the downloaded file in the configuration below:

```json
{
  "mcpServers": {
    "datalens-enterprise": {
      "command": "npx",
      "args": ["-y", "@datalens-tech/mcp@0.3.0"],
      "env": {
        "DATALENS_INSTALLATION": "enterprise",
        "DATALENS_API_URL": "https://datalens.example.com",
        "DATALENS_SERVICE_ACCOUNT_KEY_FILE": "/absolute/path/sa-key.json"
      }
    }
  }
}
```

The API URL is the installation's base URL, without `/rpc` or the Swagger path.
The key file must be readable by the MCP process. It contains `id`,
`service_account_id`, and `private_key`; other exported fields are optional.
Keep it outside the repository and restrict file access to your user.
Requests run with the service account's permissions.

The server obtains an access token automatically using the service account key
and renews it before expiration.

Enterprise OpenAPI defaults to `{DATALENS_API_URL}/api/docs/swagger/json/`.
If `DATALENS_API_VERSION` is pinned, its versioned schema is selected automatically
(`.../api/docs/swagger/2/json/`, for example). `DATALENS_SCHEMA_URL` overrides this;
keep its API version consistent with `DATALENS_API_VERSION`.

To use a static token instead, omit `DATALENS_SERVICE_ACCOUNT_KEY_FILE` and set
`DATALENS_API_AUTH_HEADER="Bearer <access-token>"`. Exactly one credential
source is required. Static tokens are not renewed; restart the server after
updating them.

Restart the MCP server after rotating the key file. Deleting a key prevents new
exchanges; an already issued access token may remain valid until expiration.

For installations using a corporate CA, set `NODE_EXTRA_CA_CERTS` to the CA PEM
file in the MCP server's environment before launching it. TLS verification remains enabled.

For a global installation, install the same pinned version:

```bash
npm install -g @datalens-tech/mcp@0.3.0
```

Set `command` to `datalens-mcp` and remove `args` from the client configuration
above. Keep the `env` settings. When upgrading MCP, choose a version supported
by your Enterprise release.

## Configuration

| Variable                            | Default                | Purpose                                                |
| ----------------------------------- | ---------------------- | ------------------------------------------------------ |
| `DATALENS_INSTALLATION`             | Required: `enterprise` | Selects Enterprise authentication.                     |
| `DATALENS_API_URL`                  | Required               | Installation base URL.                                 |
| `DATALENS_SERVICE_ACCOUNT_KEY_FILE` | —                      | Path to the downloaded JSON key.                       |
| `DATALENS_API_AUTH_HEADER`          | —                      | Static `Bearer <access-token>` alternative to the key. |

Exactly one credential source is required. See
[shared configuration](../README.md#configuration-reference) for API version,
schema URL, and response size settings.
