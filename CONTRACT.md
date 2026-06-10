# Contract

The UbU Phase 1 desktop UI talks to `ubu-orchestrator` through the local HTTP API first.

## Transport

- The orchestrator binds `127.0.0.1` only.
- The UI targets `http://127.0.0.1:<port>`.
- The default development port is `17890`.
- The UI does not contact GitHub directly.
- The UI does not mutate the store directly.

TODO: add Tauri command bridge once local HTTP API stabilizes; it supersedes the HTTP surface.

## Generated Inputs

- `src/api/generated` comes from `ubu-orchestrator`'s `openapi.generated.json`.
- `src/types/generated` comes from `ubu-schemas` JSON Schema.
- `ubu-devshell` owns the scripts that copy or generate these artifacts from pinned source revisions.

## Session Token Flow

The desktop UI may collect a GitHub personal access token and send it to the orchestrator over loopback for in-memory session use.

Rules:

- The UI must not persist the token.
- The UI must not log the token.
- The UI must not send the token anywhere except the loopback orchestrator session endpoint.
- Developer mode may rely on `GITHUB_TOKEN` configured in the orchestrator process.

TODO(security): loopback-only binding does not fully protect mutating endpoints such as projection approval; Phase 1 defers per-run bearer-token/CSRF work because this surface is temporary and test-heavy.

## Projection Approval

Projection approval is a `ProjectionPreview` batch operation. The UI must present writes as a batch and make approval explicit before sending a mutating request to the orchestrator.

## Non-Goals

- No mobile app.
- No cloud login.
- No multi-device sync.
- No direct GitHub mutation from UI.
- No direct store mutation from UI.
- No hidden local filesystem scanning.
- No full visual brand system.
