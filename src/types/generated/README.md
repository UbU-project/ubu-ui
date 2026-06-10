# Generated Schema Types

This directory is generated from `ubu-schemas` JSON Schema.

Phase 1 generation is handled by `ubu-devshell` from a pinned `ubu-schemas` source revision. It is a manual/scripted copy step, not a build-time network fetch.

Use:

```sh
npm run generate:types
```

`ubu-devshell` owns the transport script `generate-ui-schema-types.sh`.
