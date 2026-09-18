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
- Support `DATALENS_OAUTH_TOKEN` for internal installations. When configured, it takes
  precedence over `DATALENS_API_AUTH_HEADER`.
