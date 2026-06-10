# UbU UI

Desktop UI for UbU Phase 1.

This repository contains the public desktop client for `UbU-project/ubu-ui`. Phase 1 is a Tauri v2 application using React, Vite, and TypeScript. It talks to `ubu-orchestrator` over a loopback-only HTTP API at `http://127.0.0.1:<port>`.

The default work surface is the one-next-Task focus view. The full Plan remains inspectable from the Plan inspector.

## Scope

Included in Phase 1:

- Bootstrap and GitHub import flow.
- Calendar preview.
- Next Task focus as the main working screen.
- Full Plan inspection.
- Log review.
- Projection preview and batch approval.
- Reports and Settings screens.
- Generated OpenAPI client handoff from `ubu-orchestrator`.
- Generated TypeScript schema type handoff from `ubu-schemas`.

Not included in Phase 1:

- Mobile app.
- Cloud login.
- Multi-device sync.
- Direct GitHub mutation from the UI.
- Direct store mutation from the UI.
- Hidden local filesystem scanning.
- Full visual brand system. Brand assets live in `ubu-brand`.

## Development

Prerequisites:

- Node.js 20 or newer.
- Rust stable.
- Linux Tauri system dependencies when building or checking `src-tauri`.

Install dependencies:

```sh
npm install
```

Run the web UI:

```sh
npm run dev
```

Run the desktop app:

```sh
npm run tauri:dev
```

Build and test:

```sh
npm run build
npm run test
```

## Local Orchestrator API

By default the UI targets:

```text
http://127.0.0.1:17890
```

Override the port or base URL with:

```sh
VITE_UBU_ORCHESTRATOR_PORT=17890
VITE_UBU_ORCHESTRATOR_URL=http://127.0.0.1:17890
```

The orchestrator must bind to `127.0.0.1` only. The UI does not call GitHub directly and does not mutate the store directly.

## Session Tokens

For desktop sessions, a user may paste a GitHub personal access token into the UI. The UI sends it over loopback to the orchestrator for in-memory session use only. The UI must not persist or log the token.

Developer mode may rely on `GITHUB_TOKEN` being set in the orchestrator process instead.

## Code Generation

Generated sources are intentionally not fetched during the app build. See [CODEGEN.md](./CODEGEN.md).

## License

MIT
