# Changelog

## 0.3.0

### Added

- Support DataLens Enterprise installations with service account JSON keys,
  automatic access token renewal, or a static Bearer token.
- Add separate setup guides for Cloud, Internal and Enterprise installations
  and include them in the npm package.

### Changed

- Reject unsupported `DATALENS_INSTALLATION` values instead of silently selecting Cloud.
- Rename `.env.example` to `.env.cloud.example` and add `.env.enterprise.example`.

## 0.2.1

### Added

- Publish npm releases from GitHub Actions using OIDC trusted publishing.
- Validate package archives before publication and create version tags and
  GitHub Releases, with support for recovering failed release runs.

## 0.2.0

### Changed

- Replace `invoke_command` with separate read, write and privileged invocation
  tools, enforcing the declared OpenAPI scope before executing API calls.
- Exclude operations without a supported `x-mcp-scope` and include scope and
  invocation tool names in command discovery results.

### Upgrading

- Before upgrading to 0.2.0, update DataLens to provide an OpenAPI schema with
  `x-mcp-scope` classifications. The MCP server cannot start without classified commands.
- Update client approval policies to use `invoke_read_command`, `invoke_write_command`,
  and `invoke_privileged_command` instead of the removed `invoke_command` tool.

### Added

- Notify clients about newer stable npm releases without blocking commands or
  installing updates; use the package version in MCP server metadata.

## 0.1.4

### Changed

- Require HTTPS API and schema endpoints except for local HTTP endpoints when
  `NODE_ENV=development`; reject redirects.
- Mark command results as untrusted API data.

### Fixed

- Bound decompressed response sizes and OpenAPI structure complexity; keep request
  timeouts active while reading response bodies.
- Avoid exposing CLI output and upstream schema HTTP error bodies in diagnostics.
- Apply the configured response character limit to API error details as well.

### Added

- Support `DATALENS_OAUTH_TOKEN` for internal installations. When configured, it takes
  precedence over `DATALENS_API_AUTH_HEADER`.
