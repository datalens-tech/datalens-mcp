# Changelog

## Unreleased

### Changed

- Replace `invoke_command` with separate read, write and privileged invocation
  tools, enforcing the declared OpenAPI scope before executing API calls.
- Exclude operations without a supported `x-mcp-scope` and include scope and
  invocation tool names in command discovery results.

### Added

- Support `DATALENS_OAUTH_TOKEN` for internal installations. When configured, it takes
  precedence over `DATALENS_API_AUTH_HEADER`.
