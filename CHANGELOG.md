# Changelog

## Unreleased

### Changed

- Require HTTPS API and schema endpoints and reject redirects.
- Mark command results as untrusted API data.

### Fixed

- Bound decompressed response sizes and OpenAPI structure complexity; keep request
  timeouts active while reading response bodies.
- Avoid exposing CLI output and upstream HTTP error bodies in diagnostics.

### Added

- Support `DATALENS_OAUTH_TOKEN` for internal installations. When configured, it takes
  precedence over `DATALENS_API_AUTH_HEADER`.
