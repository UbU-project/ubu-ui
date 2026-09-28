# UbU UI

Desktop UI for UbU Phase 1.

This repository contains the public desktop client for `UbU-project/ubu-ui`. Phase 1 is a Tauri v2 application using React, Vite, and TypeScript. It talks to `ubu-orchestrator` over a loopback-only HTTP API at `http://127.0.0.1:<port>`.

The app opens on Today, the Plan for the day. Next Task is the one-next-Task focus view. See [docs/NAVIGATION.md](./docs/NAVIGATION.md).

## Scope

Included in Phase 1:

- Today: the Plan, its generation and recalculation.
- Next Task focus.
- Tasks: capture, backlog and edit.
- Priorities: pairwise Preferences between Tasks.
- Routines: evergreen Objectives with a recurrence and a template, their streaks, and per-date overrides.
- Calendar: projection preview and batch approval.
- Setup: the orchestrator address, the desktop session, and the GitHub bootstrap and import flow.
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
http://127.0.0.1:7878
```

`7878` is the orchestrator's own default: it is what `ubu-orchestrator` binds when `UBU_ORCHESTRATOR_PORT` is not set. The UI's default is a copy of that value, not a second decision.

Override the port or base URL with:

```sh
VITE_UBU_ORCHESTRATOR_PORT=7878
VITE_UBU_ORCHESTRATOR_URL=http://127.0.0.1:7878
```

Override both sides or neither. Setting `UBU_ORCHESTRATOR_PORT` for the orchestrator without the matching `VITE_UBU_ORCHESTRATOR_PORT` for the UI, or the reverse, leaves the two halves listening and calling on different ports. That is what broke three acceptance runs in a row: this file used to instruct a port the orchestrator has never used.

`ubu-devshell/scripts/check-ui-contract.sh` fails when the two defaults differ.

The orchestrator must bind to `127.0.0.1` only. The UI does not call GitHub directly and does not mutate the store directly.

## Session Tokens

For desktop sessions, a user may paste a GitHub personal access token into the UI. The UI sends it over loopback to the orchestrator for in-memory session use only. The UI must not persist or log the token.

Developer mode may rely on `GITHUB_TOKEN` being set in the orchestrator process instead.

## Code Generation

Generated sources are intentionally not fetched during the app build. See [CODEGEN.md](./CODEGEN.md).

## License

MIT
