# Changelog

## 0.2.0

### Changed

- Replace `invoke_command` with separate read, write and privileged invocation
  tools, enforcing the declared OpenAPI scope before executing API calls.
- Exclude operations without a supported `x-mcp-scope` and include scope and
  invocation tool names in command discovery results.

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
