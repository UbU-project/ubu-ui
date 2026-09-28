# P1B-39 verification

## The end-to-end round trip is unverified by the agent

**The end-to-end round trip is unverified by the agent.** Nothing in this
record shows the app reaching the orchestrator from inside the Tauri shell.
That needs a webview that enforces CORS and a Tauri runtime that provides the
plugin, and the agent has neither: it cannot open a window.

What the agent proved is configuration and wiring: the shell builds with the
plugin registered, the capability compiles and carries the scope, the scope
pattern admits the loopback address and refuses everything else tried, and
the client calls the plugin and never the global `fetch`. Every one of those
can be true while the app still fails in the shell.

**The operator acceptance steps are outstanding:**

1. Start the orchestrator; run `npm run tauri:dev` in `ubu-ui`.
2. The Next Task screen loads real data — the `GET` path.
3. Capture a Task on the Tasks screen — the preflighted `POST` path.
4. Edit it inline — the preflighted `PATCH`.
5. In the webview devtools console, confirm no CORS error appears.
6. If any step fails, report the console error verbatim before anything else
   is changed.

Until they are run, Track A is built and tested but not accepted.

## Pushed revisions, in landing order

Baseline: `ubu-orchestrator` `e3749e5`, `ubu-ui` `6d6028c`, `ubu-devshell`
`dde5ef1`, each on `main` with a clean tree, as was every sibling repository.
Work is on `p1b-39-transport-and-overlap` in the three that change.

| Order | Repository | Sections | Pushed revision |
| --- | --- | --- | --- |
| 1 | `ubu-orchestrator` | A–C | `d047149` |
| 2 | `ubu-ui` | D–H | the commit that carries this file |
| 3 | `ubu-devshell` | I | recorded in `ubu-devshell`, see below |

A file cannot contain the hash of the commit that contains it, so this record
cannot name its own revision or anything decided after it. The `ubu-ui` and
`ubu-devshell` revisions, and the `scripts/show-revs.sh` output, are recorded
in `ubu-devshell/docs/P1B-39_PINS.md`, which is committed together with the
pins in section I. `ubu-devshell` is not itself one of the pinned
repositories, so recording the output there does not disturb what it shows.

| Section | Repository | Commit | Change |
| --- | --- | --- | --- |
| A | `ubu-orchestrator` | `5b11d83` | Overlap rejection on create and edit. |
| B | `ubu-orchestrator` | `a8c7a4b` | Native routines named in the import rejection. |
| C | `ubu-orchestrator` | `d047149` | Six tests. |
| D | `ubu-ui` | `9a31267` | Both dependencies, the capability, the plugin registered. |
| E | `ubu-ui` | `6a7af1d` | The client's transport, with the eleven tests converted. |
| F | `ubu-ui` | `9d1f377` | The global `fetch` guard and two transport tests. |
| G | `ubu-ui` | `fd74af0` | `docs/TRANSPORT.md`. |
| H | `ubu-ui` | This commit | This record. |
| I | `ubu-devshell` | see `P1B-39_PINS.md` | All seven pins. |

**No pin moved.** `ubu-orchestrator`'s `Cargo.toml` is unchanged and its
`Cargo.lock` is byte-identical to the baseline, SHA-256
`e7a0ecf2a14949e5d106ffc3d744605225c56c6ca9d049ff5e698790c6641a15`.
`ubu-core`, `ubu-schemas`, `ubu-store`, `ubu-planning-kernel`,
`ubu-github-adapter`, `quick-ubu`, `ubu-design`, `ubu-brand` and
`model-committee` are at their initial heads with clean trees.

## Gates, per repository

### `ubu-orchestrator`

- Tests: **331 → 337**, zero failed, zero ignored. The full suite ran at every
  commit: 331 at A and at B, 337 at C. The six new tests are in
  `tests/objective_authoring.rs`. No existing test was changed.
- Clippy: **9 → 9**, the same nine. Counting method:
  `cargo clippy --locked --offline --all-targets --message-format=json`,
  keeping `compiler-message` records at level `warning` that have a span and
  deduplicating by lint code, message, and the primary span's file, line and
  column. Both measurements were taken in this run, on this checkout, with
  that command and that script: the first at `e3749e5` before any edit, the
  second at `d047149`. The two sets were compared by lint, message and file,
  since edits move line numbers.
- `rustfmt --check --edition 2021 --config skip_children=true` passes for
  every Rust file edited. Two of those files, `quick_ubu_import.rs` and
  `routine_service.rs`, were not rustfmt-clean beforehand; the instruction to
  format edited files was followed, so their diffs carry reformatting of
  lines this ticket did not otherwise touch.
- The final suite ran under a seccomp filter that denies `AF_INET` and
  `AF_INET6` socket creation: 337 passed.
- The OpenAPI document is unchanged. No route, request or response changed.

### `ubu-ui`

- Tests: **11 → 13**. 11 at D and at E, 13 at F, G and H.
- `npx tsc --noEmit` is clean at every commit.
- `npm run build` succeeds, and `npx tauri build --no-bundle` builds the
  release binary. Bundling was not attempted.
- `cargo build --locked` succeeds in `src-tauri` with the plugin registered.
  The crate has no tests of its own: `cargo test` runs zero.
- Clippy on `src-tauri`: **0 → 0**, same method, without `--offline`. The
  "before" was measured on a detached checkout of `6d6028c`.
- `package-lock.json` and `src-tauri/Cargo.lock` change, as authorised.

### `ubu-devshell`

- One file changes and one is added. There is no test suite that this ticket
  ran; `scripts/show-revs.sh` is the check.

## The two new dependencies

| Dependency | Where | Requirement | Resolved |
| --- | --- | --- | --- |
| `@tauri-apps/plugin-http` | `package.json` | `~2.6.1` | **2.6.1** |
| `tauri-plugin-http` | `src-tauri/Cargo.toml` | `~2.6` | **2.6.1** |

**No third was added.** `package.json` gains one line and
`src-tauri/Cargo.toml` gains one line.

- `package-lock.json` gains exactly one package,
  `node_modules/@tauri-apps/plugin-http` 2.6.1. No other entry was added,
  removed or changed. `@tauri-apps/api` stays at 2.11.0.
- `src-tauri/Cargo.lock` gains 45 packages: the plugin and what it
  depends on, including `tauri-plugin`, `tauri-plugin-fs` 2.5.2, `reqwest`
  0.12.28 and their TLS and HTTP stack. **No package that was already locked
  changed version or was removed.** `tauri` stays at 2.11.2.

**Why 2.6 and not the newest 2.x.** The ticket authorises "v2". The newest
JavaScript release, 2.7.0, requires `@tauri-apps/api` `^2.12.0` and moved it
from 2.11.0 to 2.12.0 when tried, while the `tauri` crate stayed at 2.11.2.
That is an existing dependency moving, and the two halves of Tauri on
different minor versions. 2.6.1 requires `^2.11.0` and moves nothing. The
Rust crate was held to the same line so that both halves of the plugin match.

Left to itself, Cargo also resolved the plugin's `tauri-plugin-fs`
dependency to 2.6.0, which requires `tauri` 2.12 and moved 49 locked
packages. The lockfile was therefore resolved once with `tauri` and
`tauri-plugin-fs` pinned exactly, and the pins were then removed from
`Cargo.toml`; `cargo build --locked` passes against the result. `npx tauri
info` reports `tauri` 2.11.2 with `@tauri-apps/api` 2.11.0, and both halves
of the plugin at 2.6.1.

## The capability

`src-tauri/capabilities/default.json`, as committed:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "The main window may use the core defaults and may fetch from the loopback orchestrator, on any port, and from nowhere else.",
  "windows": ["main"],
  "permissions": [
    "core:default",
    {
      "identifier": "http:allow-fetch",
      "allow": [{ "url": "http://127.0.0.1:*" }]
    },
    "http:allow-fetch-send",
    "http:allow-fetch-read-body",
    "http:allow-fetch-cancel",
    "http:allow-fetch-cancel-body"
  ]
}
```

`src-tauri/gen/schemas/capabilities.json` was `{}` before. After a build it
is, on one line as generated:

```json
{"default":{"identifier":"default","description":"The main window may use the core defaults and may fetch from the loopback orchestrator, on any port, and from nowhere else.","local":true,"windows":["main"],"permissions":["core:default",{"identifier":"http:allow-fetch","allow":[{"url":"http://127.0.0.1:*"}]},"http:allow-fetch-send","http:allow-fetch-read-body","http:allow-fetch-cancel","http:allow-fetch-cancel-body"]}}
```

The same, indented for reading:

```json
{
  "default": {
    "identifier": "default",
    "description": "The main window may use the core defaults and may fetch from the loopback orchestrator, on any port, and from nowhere else.",
    "local": true,
    "windows": [
      "main"
    ],
    "permissions": [
      "core:default",
      {
        "identifier": "http:allow-fetch",
        "allow": [
          {
            "url": "http://127.0.0.1:*"
          }
        ]
      },
      "http:allow-fetch-send",
      "http:allow-fetch-read-body",
      "http:allow-fetch-cancel",
      "http:allow-fetch-cancel-body"
    ]
  }
}
```

It is non-empty and the scope `http://127.0.0.1:*` is present on
`http:allow-fetch`. The build also regenerated `acl-manifests.json`,
`desktop-schema.json` and `linux-schema.json` in the same directory, which
now describe the plugin's permissions; all four are committed.

**What was found in the plugin at the pinned version.** Read from the source
of `tauri-plugin-http` 2.6.1 rather than from the website:

- `http:default` is a set of five permissions — `allow-fetch`,
  `allow-fetch-cancel`, `allow-fetch-send`, `allow-fetch-read-body`,
  `allow-fetch-cancel-body` — and allows no URL until a scope is given.
- One call to the JavaScript `fetch` uses several of those commands, so
  granting `allow-fetch` alone would not work.
- Only the `fetch` command checks the URL. The scope is therefore attached
  to `http:allow-fetch`, and the other four are granted plainly.
- A scope entry is `{"url": "<pattern>"}`, parsed as a URL pattern. An empty
  path, query or fragment in the pattern is treated as a wildcard.

The capability lists the five individually rather than writing
`http:default` with a scope. The two are equivalent in effect; judgment call
2 asked for an explicit scope and not `http:default`, and this form shows
which command the scope governs.

The pattern was tested with the plugin's own parsing function and the same
`urlpattern` version, 0.3.0, in a throwaway program outside the repository:

```text
ALLOW http://127.0.0.1:17890/tasks?schema_version=x&status=active
ALLOW http://127.0.0.1:17890/task/task_01
ALLOW http://127.0.0.1:8080/health
ALLOW http://127.0.0.1/health
DENY  https://127.0.0.1:17890/health
DENY  http://localhost:17890/health
DENY  http://127.0.0.2:17890/health
DENY  http://127.0.0.1.example.com:17890/health
DENY  http://example.com/
DENY  http://[::1]:17890/health
ALLOW http://user@127.0.0.1:17890/health
```

This shows what the pattern means. It does not show the running app
enforcing it; that is part of the operator's acceptance.

## Test 1: the lockout, closed

One native Static routine at 03:00 exists. A second at 03:02 is refused,
verbatim:

```json
{
  "diagnostics": [
    {
      "code": "objective_routine_overlap",
      "message": "Conflict with another routine: routine `obj_01a0e5d84eab7493a498183e0f6859d7` (Synthetic walk) 03:02:00-03:07:00 would overlap routine `obj_01a0e5d84ea37fe3a5984d8509c4a05a` (Synthetic stretch) 03:00:00-03:05:00, first on 2026-09-29 (up to 366 dates in the next year)"
    }
  ],
  "error": "1 routine overlap; nothing was written. Routines must not overlap: stagger the start time, shorten the routine, or set occupies_capacity to false."
}
```

Nothing was admitted: one object and the same number of mutation receipts
before and after. The import of the clean fixture that followed **succeeded**,
verbatim:

```json
{
  "body": {
    "diverged": [],
    "dry_run": false,
    "objectives_not_imported": 1,
    "preferences": {
      "created": 0,
      "unchanged": 0,
      "updated": 0
    },
    "resolved": [],
    "routines": {
      "created": 5,
      "unchanged": 0,
      "updated": 0
    },
    "schema_version": "quick-ubu-import/1",
    "skipped": [
      {
        "kind": "routine",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000001",
        "reason": "negative_reminder"
      },
      {
        "kind": "routine",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000002",
        "reason": "after_reference_missing"
      },
      {
        "kind": "routine",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000002",
        "reason": "after_self_reference"
      },
      {
        "kind": "routine",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000002",
        "reason": "negative_after_offset"
      },
      {
        "kind": "task",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000011",
        "reason": "past_static_window"
      },
      {
        "kind": "task",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000012",
        "reason": "past_static_window"
      },
      {
        "kind": "task",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000013",
        "reason": "completed"
      },
      {
        "kind": "task",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000014",
        "reason": "task_after_unsupported"
      },
      {
        "kind": "task",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000015",
        "reason": "past_static_window"
      },
      {
        "kind": "task",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000016",
        "reason": "routine_occurrence"
      },
      {
        "kind": "task",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000017",
        "reason": "orphaned_routine_occurrence"
      },
      {
        "kind": "task",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000018",
        "reason": "partial_allowed_range"
      },
      {
        "kind": "task",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000019",
        "reason": "invalid_allowed_range"
      },
      {
        "kind": "task",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000020",
        "reason": "invalid: Task tags must not contain empty strings"
      },
      {
        "kind": "task",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000014",
        "reason": "dependency_not_imported"
      },
      {
        "kind": "task",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000014",
        "reason": "dependency_not_imported"
      },
      {
        "kind": "preference",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000031|00000000-0000-4000-8000-000000000032",
        "reason": "task_not_imported"
      },
      {
        "kind": "preference",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000032|00000000-0000-4000-8000-000000000035",
        "reason": "task_not_imported"
      },
      {
        "kind": "preference",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000033|00000000-0000-4000-8000-000000000032",
        "reason": "non_singleton_bundle"
      },
      {
        "kind": "preference",
        "quick_ubu_id": "00000000-0000-4000-8000-000000000034|00000000-0000-4000-8000-000000000031",
        "reason": "task_not_imported"
      }
    ],
    "stale": [],
    "tasks": {
      "created": 3,
      "unchanged": 0,
      "updated": 0
    }
  },
  "status": 200
}
```

The test asserts HTTP 200 and five routines created, and that six Objectives
exist afterwards: the one native routine and five imported.

## Test 2: the lockout, reproduced

The same two routines were admitted at the store boundary with
`queries::admit_object`, which is how any writer that does not pass through
`objective_authoring` would admit them. No switch was added to production
code to make this possible. The same fixture import then fails, verbatim:

```json
{
  "body": {
    "diagnostics": [
      {
        "code": "overlapping_routines",
        "message": "Routines overlap each other, first 2026-09-29: `obj_01a0e5d84ea27b90b4d203f6fc116adc` (Synthetic stretch; natively authored) 03:00:00-03:05:00; `obj_01a0e5d84ea67213b2398f52243d53d6` (Synthetic walk; natively authored) 03:02:00-03:07:00 (1 pair, up to 366 dates in the next year)"
      }
    ],
    "error": "1 overlapping routine pair in 1 group; nothing was imported. Routines must not overlap: stagger their start times, shorten one, or make one transparent. Routines marked natively authored are not in routine.json: edit them through PATCH /objective/:objective_id."
  },
  "status": 400
}
```

This is the hazard P1B-38 reported. The test keeps passing for as long as
the import-time check remains the backstop.

## Test 6: the import rejection, native beside imported

A native routine overlapping a routine in the snapshot:

```json
{
  "diagnostics": [
    {
      "code": "overlapping_routines",
      "message": "Routines overlap each other, first 2026-09-28: `obj_01a0e5d84ea37fe3a5984d4439275acc` (Synthetic stretch; natively authored) 12:00:00-12:05:00; `00000000-0000-4000-8000-000000000001` (Imported walk) 12:02:00-12:07:00 (1 pair, up to 366 dates in the next year)"
    }
  ],
  "error": "1 overlapping routine pair in 1 group; nothing was imported. Routines must not overlap: stagger their start times, shorten one, or make one transparent. Routines marked natively authored are not in routine.json: edit them through PATCH /objective/:objective_id."
}
```

Two overlapping routines that are both in the snapshot:

```json
{
  "diagnostics": [
    {
      "code": "overlapping_routines",
      "message": "Routines overlap each other, first 2026-09-28: `00000000-0000-4000-8000-000000000002` (Imported stretch) 12:00:00-12:05:00; `00000000-0000-4000-8000-000000000001` (Imported walk) 12:02:00-12:07:00 (1 pair, up to 366 dates in the next year)"
    }
  ],
  "error": "1 overlapping routine pair in 1 group; nothing was imported. Routines must not overlap: stagger their start times, shorten one, or make one transparent."
}
```

The second is the existing wording, unchanged, and the test asserts it
character for character. The native routine is marked `natively authored`
beside its title, and the summary gains one sentence only when a native
routine is named.

## No UI test calls the global `fetch`

Established four ways.

1. **By a guard that fails the test.** `tests/setup.ts` replaces the global
   `fetch` before every test with a function that throws, and after every
   test asserts that it was called zero times. All 13 pass under it.
2. **By mutation.** With the client changed to fall back to the global
   `fetch` when the plugin is unavailable, test 13 failed. With the client
   changed to call the global `fetch` outright, 12 of 13 failed; the one that
   passed makes no request. Both changes were reverted.
3. **By search.** No test file contains `stubGlobal("fetch"`. The only
   `stubGlobal` is the guard, and the only other references to the global
   `fetch` are assertions that it was not called.
4. **By denial.** The suite passes under the seccomp filter that denies
   internet sockets, and under a preload that records and refuses any socket
   connection or DNS lookup, which loaded in 20 Node processes and recorded
   zero attempts.

Test 13 checks the failure two ways: with the mock throwing what the plugin
throws when nothing is behind it, and with the mock handing the call to the
real plugin module, which in the test environment has no Tauri runtime.

## Commit trailers

| Repository | Existing P1B commits | Followed |
| --- | --- | --- |
| `ubu-orchestrator` | 113 commits. 108 carry no trailer; the 5 from P1B-38 carry `Co-Authored-By`. | **No trailer**, the convention of the repository. |
| `ubu-ui` | 4 commits, all from P1B-38, all with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. | **That trailer.** |
| `ubu-devshell` | 1 commit, from P1B-38, with the same trailer. | **That trailer.** |

In `ubu-ui` and `ubu-devshell` the only precedent is P1B-38's own commits,
which the ticket's instruction appears to have been written in response to.
The literal reading was taken. If the intent is no trailer anywhere, those
two repositories now have more commits with one.

## Judgment calls

There is no disagreement with any of the eleven. Three notes.

- **2, the scope.** Implemented as five listed permissions with the scope on
  `http:allow-fetch`, for the reason given under the capability.
- **3, no fallback.** The unavailable-plugin error is an `OrchestratorError`
  with status 0, so that every screen shows its message through the path it
  already uses for orchestrator errors, instead of its generic failure text.
- **11.** Accepted in full. See the first section of this record.

## Ambiguities, and the literal reading taken

- **Commit E carries the conversion of the eleven tests.** The ticket puts
  the conversion in section F and also requires tests green at every commit.
  Once the client calls the plugin, tests that stub the global `fetch` fail,
  so the two cannot be separate commits. The conversion went with E; F adds
  the guard and the two new tests.
- **`show-revs.sh` output is recorded in `ubu-devshell`**, for the reason
  given under the revisions.
- **One addition to `request<T>` beyond the transport.** When the plugin
  fails inside the shell, the client writes the error to the console before
  rethrowing it unchanged. The screens catch such errors and show a generic
  message, and without this the operator's acceptance step 6 would have
  nothing to report.
- **How "unavailable" is detected.** The client calls the plugin; if the call
  throws and `isTauri()` from `@tauri-apps/api/core` is false, it throws the
  `tauri:dev` error. This is the first import of `@tauri-apps/api` in `src/`.
  It is an existing dependency.
- **Which conflicts a write answers for.** Only overlaps involving the
  routine being written are rejected. An existing overlap between two other
  routines does not block an unrelated write. The pair test itself is the
  importer's, so for the routine being written the two paths agree.
- **A write that withdraws a routine is not checked.** A routine set to
  `satisfied` or `abandoned` is no longer live, and withdrawing one of two
  overlapping routines is a remedy that must not be refused.
- **"By bypassing the new check at the service boundary"** in test 2 was read
  as admitting through the store, not as adding a bypass to the service.
- **Orchestrator documentation was updated**, which the ticket does not
  list. `OBJECTIVE_AUTHORING.md` said that overlapping routines are not
  rejected, which became false with section A, and `QUICK_UBU_IMPORT.md`
  describes the rejection text that section B extends.
- **First colliding date.** Under a clock of 09:00 UTC, a routine at 03:00
  New York time first occurs inside the window on the following local day,
  so test 1 reports 2026-09-29 while test 6, at 12:00, reports 2026-09-28.

## Not verified, beyond the round trip

- **Proxy settings.** The plugin's HTTP client honours the system proxy. If
  `http_proxy` is set where the app is started and `no_proxy` does not cover
  `127.0.0.1`, loopback requests may be sent to the proxy. Not tested.
- **Bundling.** `npx tauri info` reports `rsvg2` as not installed on this
  machine. The release binary builds; `deb` and `rpm` bundles were not
  attempted, before or after.

## Known limits

1. **No per-run bearer token.** `commands.rs`'s security TODO stands; the plugin scope narrows who can ask, not what any local process may do.
2. **Browser-only development no longer exercises the app.** `npm run tauri:dev` is the path. Vitest is unaffected.
3. **The command bridge is still unbuilt.** `orchestrator_bridge_status` still reports `command_bridge_ready: false`, and that remains accurate.
4. **The orchestrator still has no CORS and still answers `OPTIONS` with 405.** Nothing needs it now, and adding it would re-expose the port to any page the operator visits.
5. **Overlap is checked for Static routines only**, matching `static_overlaps`. Dynamic routines are placed by the planner and do not collide this way.
6. **The overlap window is one year**, matching the importer. A collision beginning in thirteen months is admitted by both paths.
7. **The UI still covers a small fraction of the route surface.** Preferences, decomposition, Containers, routines, the occurrence override, the advisory queue and the Google Calendar chain remain unreachable from the app.

Gate logs, the evidence extracts, the scope probe and the network harnesses
are retained locally in `../.p1b-39-results/`.
