# Changelog

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
