# Migrating from 0.x to 1.0

DataLens MCP 1.0 keeps the compact `list_commands → describe_commands → invoke_command` gateway, but introduces an intentionally safer write contract.

## Breaking changes

### Planned writes are now the default

`DATALENS_MCP_WRITE_MODE` defaults to `planned`. Commands marked `write` and commands without an explicit access class (`unknown`) can no longer be executed through `invoke_command`.

Annotate every exposed OpenAPI operation:

```yaml
x-mcp:
  access: read # or write
  destructive: false
  idempotent: true
```

Until the schema is annotated, restore the old behavior explicitly:

```text
DATALENS_MCP_WRITE_MODE=direct
```

Treat this as a temporary compatibility setting. In planned mode, perform writes with `plan_command` and then `execute_plan`. Configure the MCP client to require approval for `execute_plan`.

### Destructive writes require server permission

In planned mode, an operation with `destructive: true` cannot produce an executable plan unless the server starts with:

```text
DATALENS_MCP_ALLOW_DESTRUCTIVE=1
```

### Parameters are validated locally

`invoke_command` and `plan_command` validate `parameters` against the OpenAPI request-body schema. Invalid requests now fail with `INVALID_COMMAND_PARAMETERS` before reaching DataLens.

### Errors use a structured envelope

Tool errors still set `isError: true`, but the text content is now JSON with `code`, `kind`, `message`, and `retryable`. Clients that parsed the old human-readable string must read the new envelope.

### Large responses are recoverable

Responses over `DATALENS_MAX_RESPONSE_CHARS` are no longer silently cut off. `invoke_command` returns a `stored_result` descriptor; call `read_result` with its `result_id` and successive offsets to retrieve the remaining data.

## Recommended upgrade sequence

1. Add `x-mcp.access` to every enabled POST operation and validate this in the API schema pipeline.
2. Run MCP 1.0 with `DATALENS_MCP_WRITE_MODE=direct` and verify discovery and parameter validation.
3. Configure approval for `execute_plan` in the MCP client.
4. Switch to `planned` and test representative read, write, destructive, and unknown operations.
5. Add command allow/deny lists where the MCP installation needs a narrower API surface.
6. Remove the explicit write mode after `planned` is established; it is the 1.0 default.
