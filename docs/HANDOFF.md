# Handoff refresh

`ubu-ui` does not define its own contract. It carries two generated artifacts
copied from sibling repositories, and the rest of the client is written against
them. This page records where they come from, the order they must be refreshed
in, and why the refresh is a gate rather than housekeeping.

## The two generators

Both npm scripts live in this repository's `package.json` and call a script
from `ubu-devshell/scripts` by bare name, so that directory must be on `PATH`.
Run them from the `ubu-ui` checkout, with the repositories as siblings:

```sh
# 1. ubu-schemas: emit the declarations (ephemeral there, see below)
(cd ../ubu-schemas && npm ci && npm run generate:typescript)

# 2. ubu-orchestrator: regenerate the OpenAPI document after any route change
(cd ../ubu-orchestrator && cargo run --locked --offline --example generate_openapi)

# 3. ubu-ui: copy both artifacts in
PATH="$PWD/../ubu-devshell/scripts:$PATH" npm run generate:types
PATH="$PWD/../ubu-devshell/scripts:$PATH" npm run generate:api

# 4. prove the refresh alone changed nothing observable
npx tsc --noEmit && npm test
```

| npm script | devshell script | source | destination |
| --- | --- | --- | --- |
| `generate:types` | `generate-ui-schema-types.sh` | `ubu-schemas/generated/typescript/` | `src/types/generated/` |
| `generate:api` | `generate-ui-api-client.sh` | `ubu-orchestrator/openapi/openapi.generated.json` | `src/api/generated/` |

Neither script fetches anything; both copy files between local checkouts and
rewrite the destination's `README.md` with the source path they used.

### Order

1. **The sources first.** `generate:types` fails with
   `no TypeScript schema types found` until `ubu-schemas` has generated its
   output, and `generate:api` copies whatever OpenAPI document the
   orchestrator checkout holds, stale or not.
2. **The orchestrator before the client.** A route must be served, and the
   document regenerated, before any client method can name it.
3. **The refresh before any client change**, confirmed by `tsc` and the test
   suite, so that a later failure is attributable to the client change and
   not to the refresh.

The two copies are independent of each other; `generate:types` then
`generate:api` is the conventional order.

## The OpenAPI document is a compile-time gate

`src/api/client.ts` derives a type from the copied document:

```ts
type GeneratedPath = keyof typeof openApiSpec.paths;

const TASK_LIST_PATH = "/tasks" satisfies GeneratedPath;
```

`type GeneratedPath = keyof typeof openApiSpec.paths` makes the OpenAPI
document a compile-time gate. Every path constant in the client is checked
with `satisfies GeneratedPath`, so a client method **cannot exist before the
document carries its route**: the constant does not compile. Measured during
P1B-38 by misspelling one constant:

```text
src/api/client.ts(524,33): error TS1360: Type '"/taskz"' does not satisfy the expected type
'"/advisory/candidate/{candidate_id}" | ... 44 more ... | "/tasks"'.
```

Two consequences follow.

- **A refresh on its own changes nothing observable.** Copying a newer
  document adds members to a union that existing constants already satisfy.
  `npx tsc --noEmit` stays clean and the test count does not move. That is
  the expected result, not a sign the refresh failed.
- **A stale document lies quietly.** The gate checks that a path *exists*, not
  that its body is current. Before P1B-38 the copied document still described
  `/task/{task_id}/decompose` with the log-only body that P1B-37 replaced, and
  nothing failed, because the client never named that route.

The document is the contract; the client is the subset in use. Paths the
client does not call are left in the document deliberately.

## Schema declarations are regenerated, never committed upstream

`ubu-schemas/generated/typescript/` is gitignored in `ubu-schemas` by design.
The declarations there are ephemeral: they are produced by
`npm run generate:typescript` from the JSON Schemas and are never committed in
that repository. The copy under `src/types/generated/` in this repository is
the committed one. `npm ci` in `ubu-schemas` needs the network; nothing else
in the refresh does.

## Measured counts, P1B-38

| | before | after |
| --- | --- | --- |
| Paths in `src/api/generated/openapi.generated.json` | 23 (`ubu-ui` `7c1007e`) | **49** |
| Paths served by `ubu-orchestrator` | 45 (`6c84778`) | **49** (`df8f400`) |
| Operations served by `ubu-orchestrator` | 47 | **53** |
| `src/types/generated/index.d.ts` | 20,432 bytes | 31,786 bytes, from 83 schemas |
| `npx tsc --noEmit` immediately after the refresh | clean | clean |
| `npm test` immediately after the refresh | 6 passing | 6 passing |

P1B-38 added six routes to the orchestrator. They are six *operations* on four
new path keys, because `GET /task/{task_id}` shares a key with the existing
`PATCH`, and `GET` and `PATCH /objective/{objective_id}` share one with each
other. The path count therefore rose from 45 to 49, not to 51. The copy here
is byte-identical to the orchestrator's document at `df8f400`.

## What the client uses

After P1B-38 the client names fifteen path keys, three of them new:
`/task`, `/task/{task_id}` and `/tasks`, behind `captureTask`, `editTask`,
`listTasks` and `getTask`. The remaining paths in the document have no client
method yet.
