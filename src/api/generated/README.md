# Generated API Client

This directory is generated from `ubu-orchestrator`'s `openapi.generated.json`.

Phase 1 generation is handled by `ubu-devshell` from a pinned `ubu-orchestrator` source revision. It is a manual/scripted copy step, not a build-time network fetch.

Use:

```sh
npm run generate:api
```

`ubu-devshell` owns the transport script `generate-ui-api-client.sh`.

Hand-written app code should import through `src/api/client.ts` where possible so the generated client can be replaced without spreading transport details through the UI.
