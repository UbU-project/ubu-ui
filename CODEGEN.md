# Code Generation

Phase 1 consumes generated code from sibling UbU repositories, but this app does not fetch those sources during build.

## API Client

`src/api/generated` is generated from `ubu-orchestrator`'s `openapi.generated.json`.

The Phase 1 mechanism is a manual or scripted copy from a pinned `ubu-orchestrator` source revision. `ubu-devshell` owns the transport script:

```sh
npm run generate:api
```

That script delegates to:

```sh
generate-ui-api-client.sh
```

The generated client should target the local loopback orchestrator API. The hand-written wrapper in `src/api/client.ts` is the stable app-facing boundary.

## Schema Types

`src/types/generated` is generated from `ubu-schemas` JSON Schema.

The Phase 1 mechanism is a manual or scripted copy from a pinned `ubu-schemas` source revision. `ubu-devshell` owns the transport script:

```sh
npm run generate:types
```

That script delegates to:

```sh
generate-ui-schema-types.sh
```

## Build Policy

The Vite/Tauri build must not perform network fetches to generate code. CI should fail fast if generated code required by the checked-in app is missing.

## Future Bridge

The local HTTP surface is temporary for Phase 1.

TODO: add Tauri command bridge once local HTTP API stabilizes; it supersedes the HTTP surface.
