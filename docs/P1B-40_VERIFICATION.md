# P1B-40 verification

## What the agent did not verify

**Nothing in this record shows the app rendered in the Tauri shell.** The
agent cannot open a window. Today as the front door, the Priorities screen
and the Setup screen were exercised in Vitest with jsdom and with the Tauri
HTTP plugin mocked. They have not been seen in a webview.

What was exercised against a real orchestrator is the contract check in
section C, and a probe of the four Preference routes whose responses the
Priorities fixtures copy.

**Operator acceptance, in `npm run tauri:dev` with the orchestrator started
with no port override:**

1. The app opens on Today, with no request for a token.
2. Setup, Orchestrator card: the base URL reads `http://127.0.0.1:7878` and
   the badge reads `health: ok`.
3. Priorities: add a Preference between two Tasks, disable it, delete it.
4. Priorities: state A before B, B before C, then C before A. The third is
   refused, and the refusal names the first two.

## The clean-tree gate did not pass, and the operator authorised proceeding

The ticket says to confirm every repository has a clean working tree and to
stop if not. `ubu-orchestrator` did not: four untracked files were in its
root, left by the P1B-39 acceptance run.

```text
?? ubu-device-registration.json
?? ubu-orchestrator.db
?? ubu-orchestrator.db-shm
?? ubu-orchestrator.db-wal
```

The agent stopped and reported. The operator chose to proceed with the files
in place. They were not opened, moved, changed or committed. Their
modification times were the same after the work as before it. No tracked
file in `ubu-orchestrator` is modified. Every other repository was clean.

`scripts/show-revs.sh` therefore reports `ubu_orchestrator` as `DIRTY` in its
TREE column, with STATUS `OK`. Adding these names to the orchestrator's
`.gitignore` would end that, and is not in this ticket because the
orchestrator does not change.

## Pushed revisions, in landing order

Baseline: `ubu-ui` `7046687`, `ubu-devshell` `d3ba698`, both on `main`. Work
is on `p1b-40-front-door` in both.

| Order | Repository | Sections | Pushed revision |
| --- | --- | --- | --- |
| 1 | `ubu-ui` | A, B, D–H | the commit that carries this file |
| 2 | `ubu-devshell` | A, C, H, I | recorded in `ubu-devshell/docs/P1B-40_PINS.md` |

A file cannot contain the hash of the commit that contains it. The final
`ubu-ui` and `ubu-devshell` revisions and the `scripts/show-revs.sh` output
are recorded in `ubu-devshell/docs/P1B-40_PINS.md`, as in P1B-39.

| Section | Repository | Commit | Change |
| --- | --- | --- | --- |
| A | `ubu-ui` | `ee47db3` | The default port, the README, and the four other places that stated the old one. |
| A | `ubu-devshell` | `e71da83` | The generator's default URL, in the script and its document. |
| B | `ubu-ui` | `088c259` | `src/api/endpoints.ts`, and test 15. |
| C | `ubu-devshell` | `0ff9959` | `scripts/check-ui-contract.sh` and `scripts/check-ui-contract.mjs`. |
| D | `ubu-ui` | `d5f9a9b` | Two renames, three deletions, the six navigation entries, Today as the default. |
| E | `ubu-ui` | `f5839cf` | `src/routes/Setup.tsx`; `Settings.tsx` deleted. |
| F | `ubu-ui` | `0158b4b` | `src/routes/Priorities.tsx` and four client methods. |
| G | `ubu-ui` | `47a4154` | Six tests. |
| H | `ubu-ui` | This commit | `docs/NAVIGATION.md`, `docs/TRANSPORT.md`, the README scope, this record. |
| H | `ubu-devshell` | see `P1B-40_PINS.md` | `docs/CONTRACT_CHECK.md`. |
| I | `ubu-devshell` | see `P1B-40_PINS.md` | The `ubu_ui` pin. |

**`ubu-orchestrator` is untouched at `d047149`**, on `main`. The contract
check builds it with `cargo build --locked`, which cannot change
`Cargo.lock`, and writes only to its ignored `target` directory.

**No dependency pin moved.** No `Cargo.toml`, `Cargo.lock`, `package.json` or
`package-lock.json` changed in any repository. The one pin that changes is
`ubu_ui` in `ubu-devshell/pinned-revs.toml`, which section I requires. See
the ambiguities below.

`ubu-core` `c77c0a2`, `ubu-store` `7b24cd8`, `ubu-schemas` `4974166`,
`ubu-planning-kernel` `84b6d0d`, `ubu-github-adapter` `4c7e3b6`, `quick-ubu`
`9ccc8b8`, `ubu-design` `f7c4a1d`, `ubu-brand` `faf2005` and
`model-committee` `4359c55` are at their initial heads with clean trees.

## Tests

| | Test files | Tests |
| --- | --- | --- |
| Before, at `7046687` | 3 | **13** passed |
| After | 6 | **20** passed |

`npx tsc --noEmit` is clean at every commit. `npx vite build` succeeds at the
final code state.

The suite was run at every commit under a Node preload that refuses every
socket connect, DNS lookup and real `fetch`, and records each attempt. It
recorded **0 attempts** at every commit.

| Commit | Tests passing |
| --- | --- |
| A `ee47db3` | 13 |
| B `088c259` | 14 |
| D `d5f9a9b` | 14 |
| E `f5839cf` | 14 |
| F `0158b4b` | 14 |
| G `47a4154` | 20 |

| # | Test | File |
| --- | --- | --- |
| 14 | renders Today by default and lists the six screens in order | `tests/navigation.test.tsx` |
| 15 | imports no Tauri module, while the client that re-exports it does | `tests/endpoints.test.ts` |
| 16 | resolves the orchestrator's own default port when nothing overrides it | `tests/navigation.test.tsx` |
| 17 | lists Preferences with both Task titles and the order | `tests/priorities.test.tsx` |
| 18 | creates a Preference with the expected body and reloads the list | `tests/priorities.test.tsx` |
| 19 | renders the orchestrator's reason for a rejected cycle and names the conflicting Preferences | `tests/priorities.test.tsx` |
| 20 | shows the resolved base URL and the health status in Setup | `tests/navigation.test.tsx` |

**Not covered by a kept test:** enabling, disabling and deleting a
Preference. The ticket fixes the count at 20. The three were run once in a
throwaway test, which passed and was deleted: the `PATCH` carried
`expected_version` from the list, no `DELETE` was sent before the
confirmation, and the 204 was handled.

### The lock files are byte-identical

```text
f17aa89a8b2770b7c28e1aa38fe5a9a1b71c938f58a6bd87cb3666fd448d330f  package-lock.json
4225e62a5930e8d9347d34b2454eaccf39d2738a7a129cba3f2c5bdfce3d5f56  src-tauri/Cargo.lock
```

These SHA-256 values were taken at `7046687` and are the same at the final
commit. `package.json` and everything under `src-tauri` are unchanged.

## The contract check, full output

`ubu-devshell/scripts/check-ui-contract.sh`, run once at the final code
state. Exit status 0.

```text
build: cargo build --locked --offline in /home/sean/ubu-phase1b/ubu-orchestrator
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.16s
built: /home/sean/ubu-phase1b/ubu-orchestrator/target/debug/ubu_orchestrator
start: orchestrator on ephemeral port 38765, store in /tmp/ubu-contract-check.jcKJu8
defaults:
  ubu-ui            DEFAULT_ORCHESTRATOR_PORT = 7878
  ubu-orchestrator  UBU_ORCHESTRATOR_PORT unwrap_or = 7878
  the two defaults agree
requests against http://127.0.0.1:38765:
  200 GET http://127.0.0.1:38765/health
  201 POST http://127.0.0.1:38765/task
  200 GET http://127.0.0.1:38765/tasks?schema_version=ubu.orchestrator.task_read.v1&status=active
  200 PATCH http://127.0.0.1:38765/task/task_01a0e636520576c29479380c95bbd21c
  200 POST http://127.0.0.1:38765/planning/generate
  200 GET http://127.0.0.1:38765/next-action?schema_version=ubu.orchestrator.next_action.v1
paths in the live /openapi.json:
  200 GET http://127.0.0.1:38765/openapi.json
  ok      BOOTSTRAP_SEED_PATH = /bootstrap/seed
  ok      CALENDAR_CURRENT_PATH = /calendar/current
  ok      DESKTOP_TOKEN_PATH = /desktop/session/github-token
  ok      HEALTH_PATH = /health
  ok      NEXT_ACTION_PATH = /next-action
  ok      PLANNING_GENERATE_PATH = /planning/generate
  ok      PLANNING_RECALCULATE_PATH = /planning/recalculate
  ok      PREFERENCE_CREATE_PATH = /preference
  ok      PREFERENCE_LIST_PATH = /preferences
  ok      PREFERENCE_PATH = /preference/{preference_id}
  ok      PROJECTION_ACCEPT_EXTERNAL_PATH = /projection/reconciliation/accept-external
  ok      PROJECTION_APPROVE_PATH = /projection/approve
  ok      PROJECTION_PREVIEW_PATH = /projection/preview
  ok      PROJECTION_RECONCILE_PATH = /projection/reconcile
  ok      RECORD_TASK_ACTION_PATH = /task/{task_id}/action
  ok      TASK_CAPTURE_PATH = /task
  ok      TASK_LIST_PATH = /tasks
  ok      TASK_PATH = /task/{task_id}
PASS: ubu-ui contract check: defaults agree on 7878, 7 requests succeeded, 18 of 18 path constants are live
stopped: orchestrator pid 754013
removed: /tmp/ubu-contract-check.jcKJu8
```

The build line reports no compilation because the binary was already built
from the same source.

### It fails when it should

The check was also run against altered copies of `endpoints.ts`, and
interrupted mid-run. Lines for passing requests and paths are omitted. The
altered copies were in a scratch directory; `ubu-ui` was not changed.

```text
### negative control: port
build: cargo build --locked --offline in /home/sean/ubu-phase1b/ubu-orchestrator
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.11s
built: /home/sean/ubu-phase1b/ubu-orchestrator/target/debug/ubu_orchestrator
start: orchestrator on ephemeral port 45987, store in /tmp/ubu-contract-check.ai1nc6
defaults:
  ubu-ui            DEFAULT_ORCHESTRATOR_PORT = 17890
  ubu-orchestrator  UBU_ORCHESTRATOR_PORT unwrap_or = 7878
FAIL: ubu-ui contract check: DEFAULT PORTS DIFFER: ubu-ui defaults to 17890 but ubu-orchestrator defaults to 7878. With no override the app would call a port nothing is listening on.
--- orchestrator log (last 40 lines) ---
2026-09-28T04:04:01.713562Z  WARN NEW Device registered; preserve this registration file to retain Device continuity device_id="dev_01a0e62f1a317e008842077e31663789" path=/tmp/ubu-contract-check.ai1nc6/device-registration.json
2026-09-28T04:04:01.718659Z  INFO ubu-orchestrator listening addr=127.0.0.1:45987
--- end of orchestrator log ---
stopped: orchestrator pid 742265
removed: /tmp/ubu-contract-check.ai1nc6
exit=1
### negative control: path
build: cargo build --locked --offline in /home/sean/ubu-phase1b/ubu-orchestrator
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.12s
built: /home/sean/ubu-phase1b/ubu-orchestrator/target/debug/ubu_orchestrator
start: orchestrator on ephemeral port 34873, store in /tmp/ubu-contract-check.mYXNE9
defaults:
  ubu-ui            DEFAULT_ORCHESTRATOR_PORT = 7878
  ubu-orchestrator  UBU_ORCHESTRATOR_PORT unwrap_or = 7878
  the two defaults agree
requests against http://127.0.0.1:34873:
  404 GET http://127.0.0.1:34873/task-list?schema_version=ubu.orchestrator.task_read.v1&status=active
FAIL: ubu-ui contract check: GET http://127.0.0.1:34873/task-list?schema_version=ubu.orchestrator.task_read.v1&status=active returned 404
  body: 
--- orchestrator log (last 40 lines) ---
2026-09-28T04:04:02.054982Z  WARN NEW Device registered; preserve this registration file to retain Device continuity device_id="dev_01a0e62f1b867b72b96a088ae1d8e0fd" path=/tmp/ubu-contract-check.mYXNE9/device-registration.json
2026-09-28T04:04:02.064070Z  INFO ubu-orchestrator listening addr=127.0.0.1:34873
--- end of orchestrator log ---
stopped: orchestrator pid 742333
removed: /tmp/ubu-contract-check.mYXNE9
exit=1
### SIGINT to the process group, as Ctrl-C does
orchestrator processes while the check is mid-run: 1
build: cargo build --locked --offline in /home/sean/ubu-phase1b/ubu-orchestrator
built: /home/sean/ubu-phase1b/ubu-orchestrator/target/debug/ubu_orchestrator
start: orchestrator on ephemeral port 34939, store in /tmp/ubu-contract-check.ZEBXeX
interrupted
stopped: orchestrator pid 742879
removed: /tmp/ubu-contract-check.ZEBXeX
exit=130
orchestrator processes afterwards: 0
temp dirs afterwards: 0
### SIGTERM to the script alone
orchestrator processes while the check is mid-run: 1
build: cargo build --locked --offline in /home/sean/ubu-phase1b/ubu-orchestrator
built: /home/sean/ubu-phase1b/ubu-orchestrator/target/debug/ubu_orchestrator
start: orchestrator on ephemeral port 35037, store in /tmp/ubu-contract-check.UhgOoH
interrupted
stopped: orchestrator pid 742946
removed: /tmp/ubu-contract-check.UhgOoH
exit=130
orchestrator processes afterwards: 0
temp dirs afterwards: 0
```

In the first control the default was set back to `17890`. In the second
`TASK_LIST_PATH` was set to `/task-list`. In the last two the run was held
open for four seconds so that the signal arrived mid-run. After each, no
orchestrator process and no temporary directory remained.

## Surviving `17890` and `8080` after section A

Searched in both repositories, outside `node_modules`, `target`, `dist` and
`.git`. The lock files contain neither value.

| Where | Hits | Reason |
| --- | --- | --- |
| `ubu-ui/docs/P1B-39_VERIFICATION.md` lines 228–238 | 9 | The historical record of P1B-39's capability scope probe. Left as recorded. |
| `ubu-ui/docs/TRANSPORT.md` lines 87–94 | 7 | The table of URLs the capability scope allows and denies. It repeats P1B-39's probe. The scope matches any port, so the port in each row is an example and not a default. |
| `ubu-devshell/docs/CONTRACT_CHECK.md` | 4 | The three-port table from the ticket, verbatim, and one sentence about it. Added by section H. |
| `ubu-ui/docs/P1B-40_VERIFICATION.md` | this file | This record quotes the hits above, the negative control and the old default. It is not in the listing below, which was taken before it was written. |

```text
ubu-ui/docs/TRANSPORT.md:87:| `http://127.0.0.1:17890/tasks?status=active` | allowed |
ubu-ui/docs/TRANSPORT.md:88:| `http://127.0.0.1:8080/health` | allowed |
ubu-ui/docs/TRANSPORT.md:90:| `https://127.0.0.1:17890/health` | denied |
ubu-ui/docs/TRANSPORT.md:91:| `http://localhost:17890/health` | denied |
ubu-ui/docs/TRANSPORT.md:92:| `http://127.0.0.2:17890/health` | denied |
ubu-ui/docs/TRANSPORT.md:93:| `http://127.0.0.1.example.com:17890/health` | denied |
ubu-ui/docs/TRANSPORT.md:94:| `http://[::1]:17890/health` | denied |
ubu-devshell/docs/CONTRACT_CHECK.md:15:| `ubu-ui/src/api/client.ts` | `DEFAULT_ORCHESTRATOR_PORT = "17890"` |
ubu-devshell/docs/CONTRACT_CHECK.md:16:| `ubu-ui/README.md` | instructs `VITE_UBU_ORCHESTRATOR_URL=http://127.0.0.1:17890` |
ubu-devshell/docs/CONTRACT_CHECK.md:17:| `ubu-devshell/scripts/generate-ui-api-client.sh` | `ORCHESTRATOR_URL` default `http://127.0.0.1:8080` |
ubu-devshell/docs/CONTRACT_CHECK.md:20:Three ports and no source of truth. `17890` appeared nowhere in
ubu-ui/docs/P1B-39_VERIFICATION.md:228:ALLOW http://127.0.0.1:17890/tasks?schema_version=x&status=active
ubu-ui/docs/P1B-39_VERIFICATION.md:229:ALLOW http://127.0.0.1:17890/task/task_01
ubu-ui/docs/P1B-39_VERIFICATION.md:230:ALLOW http://127.0.0.1:8080/health
ubu-ui/docs/P1B-39_VERIFICATION.md:232:DENY  https://127.0.0.1:17890/health
ubu-ui/docs/P1B-39_VERIFICATION.md:233:DENY  http://localhost:17890/health
ubu-ui/docs/P1B-39_VERIFICATION.md:234:DENY  http://127.0.0.2:17890/health
ubu-ui/docs/P1B-39_VERIFICATION.md:235:DENY  http://127.0.0.1.example.com:17890/health
ubu-ui/docs/P1B-39_VERIFICATION.md:237:DENY  http://[::1]:17890/health
ubu-ui/docs/P1B-39_VERIFICATION.md:238:ALLOW http://user@127.0.0.1:17890/health
```

Changed in section A beyond the three places the ticket names, because each
stated the old default as a fact: `ubu-ui/CONTRACT.md`, line 13 of
`ubu-ui/docs/TRANSPORT.md`, `tests/tasks.test.tsx`, `tests/transport.test.tsx`,
and `ubu-devshell/docs/codegen-workflow.md`.

## How test 15 establishes that `endpoints.ts` pulls in no Tauri module

It does not read the source. It observes what the module graph loads.

Vitest runs a `vi.mock` factory only when some module in the graph imports
the mocked module. The test registers factories for `@tauri-apps/plugin-http`
and `@tauri-apps/api/core`, each of which records its own name when it runs.
It then resets the module registry and imports `src/api/endpoints`. The
record must be empty.

The same test then imports `src/api/client` and requires the record to
contain `@tauri-apps/plugin-http`. That is the control: it shows the probe
does see the plugin when the plugin is imported, including transitively.

The test was also checked by breaking it. With
`import "@tauri-apps/plugin-http";` added to `endpoints.ts`, it failed:

```text
AssertionError: expected [ '@tauri-apps/plugin-http' ] to deeply equal []
```

Independently, `check-ui-contract.mjs` imports `endpoints.ts` in plain Node,
where `@tauri-apps/plugin-http` is not installed. That import would fail if
the module reached for it.

The generated OpenAPI document is imported with `import type`, because
`endpoints.ts` uses it only as a type. A value import of JSON would not load
in Node without an import attribute.

## The rejection rendered in test 19

The orchestrator's answer in the fixture, status 400:

```json
{
  "error": "Preference cycle among Tasks [task-a -> task-b -> task-c -> task-a]; disable or delete a conflicting Preference first",
  "diagnostics": [
    {
      "code": "preference_cycle_rejected",
      "message": "Preference cycle among Tasks [task-a -> task-b -> task-c -> task-a]; disable or delete a conflicting Preference first"
    }
  ]
}
```

What the screen renders, inside one `role="alert"`, verbatim:

```text
preference_cycle_rejected
Preference cycle among Tasks [task-a -> task-b -> task-c -> task-a]; disable or delete a conflicting Preference first

The cycle
Synthetic write-up → Buy hinges → Hang the gate → Synthetic write-up

Conflicts with
Synthetic write-up comes before Buy hinges (pref-1)

Conflicts with
Buy hinges comes before Hang the gate (pref-2)
```

The first two lines are the orchestrator's code and reason, unchanged. The
test asserts that no generic failure text is shown, that the list is not
reloaded, and that the operator's two choices are still selected.

**The orchestrator does not name the conflicting Preference for a cycle.** It
names the Tasks on the cycle, by id. This was confirmed against the real
orchestrator:

```text
POST /preference 400 {"error":"Preference cycle among Tasks [task_01a0e633e4eb7cf2a50d95e1e94b9eb3 -> task_01a0e633e4ef7120b896cc605e75ceb9 -> task_01a0e633e4f173908b65b746aa6b59ba -> task_01a0e633e4eb7cf2a50d95e1e94b9eb3]; disable or delete a conflicting Preference first", ...}
```

So the naming is done by the screen. It takes the Task ids from the reason
and lists every enabled Preference it has loaded whose two Tasks are both on
the cycle. For a contradiction or a duplicate the orchestrator does name the
Preference, by id, and the screen looks that id up:

```text
Preference `pref_01a0e633e4f478b18f5f1d3cb35e6959` contradicts this pair; disable or delete it first
Preference `pref_01a0e633e4f478b18f5f1d3cb35e6959` already states this pair and order
```

The fixture differs from the real message only in the Task ids.

## The navigation as `App.tsx` declares it

```ts
export type RouteId = "today" | "next-task" | "tasks" | "priorities" | "calendar" | "setup";

const navItems: NavItem[] = [
  { id: "today", label: "Today" },
  { id: "next-task", label: "Next Task" },
  { id: "tasks", label: "Tasks" },
  { id: "priorities", label: "Priorities" },
  { id: "calendar", label: "Calendar" },
  { id: "setup", label: "Setup" }
];
```

`useState<RouteId>("today")`.

| Renamed | To |
| --- | --- |
| `src/routes/CalendarPreview.tsx` | `src/routes/Today.tsx` |
| `src/routes/ProjectionPreview.tsx` | `src/routes/Calendar.tsx` |

Git records both as renames, with 4 and 6 changed lines.

Three stub files were deleted: `src/routes/LogReview.tsx`,
`src/routes/PlanInspector.tsx` and `src/routes/Reports.tsx`.
`src/routes/Settings.tsx` was deleted in section E after its token intake
moved into Setup.

Before the route ids changed, `src`, `tests` and `src-tauri` were searched
for every old id. They appeared only in `App.tsx`, in the stale `navItems`
fixture in `src/state/appState.ts`, and as button names in
`tests/smoke.test.tsx` and `tests/tasks.test.tsx`. No diagnostic code string
was changed or removed.

## No `ubu-ui` test calls the global `fetch`

- `tests/setup.ts` replaces the global `fetch` before every test with a
  function that throws, and fails any test after which it was called. It is
  unchanged from P1B-39 and applies to all six test files.
- The only mentions of the global `fetch` in `tests` are three assertions in
  `tests/transport.test.tsx` that it was not called.
- Every test file mocks `@tauri-apps/plugin-http`. The Priorities, Tasks and
  navigation stubs throw on any request they do not expect.
- The network preload recorded 0 attempts.

## `scripts/show-revs.sh`

Recorded in `ubu-devshell/docs/P1B-40_PINS.md`, with the final revisions.

## History before the push

Commits E, F and G were rewritten once, locally, before anything was pushed:
a two-line change to `Setup.tsx` was folded into E so that its help text
reads the port from `DEFAULT_ORCHESTRATOR_PORT` instead of repeating it. The
suite and `tsc` were then re-run at every commit, with the results in the
table above. Nothing was force-pushed.

## Commit trailers

Every P1B-40 commit in `ubu-ui` and in `ubu-devshell` ends with
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, as their P1B-39
commits do. All are signed.

## Judgment calls

Twelve of the thirteen were followed without disagreement.

**Call 8 is followed, and the agent disagrees with its effect.** The screen
now labelled Calendar is the GitHub managed-label projection. Its form asks
for an owner, a repository, an issue number and labels. Call 7 renames the
plan to Today because the operator reads "Calendar" as Google. After call 8
the operator who opens Calendar finds GitHub labels. Until the rewire
lands, the old label "Projection" described the screen more accurately.
The rename was made as instructed. `docs/NAVIGATION.md` states the mismatch.

## Ambiguities, and the reading taken

1. **"No pin moves" and section I.** The workflow says no pin moves; section
   I says to update `pinned-revs.toml`. Read as: no dependency pin between
   repositories moves, and the devshell record of `ubu_ui` is updated last.
2. **Where the new tests land.** Section B says to assert its property in a
   test, so test 15 is in commit B. Tests 14 and 16–20 are in commit G.
3. **Commit D is an interim state.** Its navigation lists Priorities and
   Setup before their screens exist. In that one commit Setup showed the old
   onboarding sequence and Priorities showed a heading. E and F replaced
   both. Tests were green at D.
4. **The existing first test was rewritten, not counted as new.** It asserted
   that the app opens on Onboarding. It now asserts that onboarding is
   reached from Setup and is absent on entry. The count of existing tests
   stays 13.
5. **"Do not rewrite their contents."** In each renamed file the exported
   component name changed, and the small label above the heading changed to
   match the navigation: "Today" and "Calendar". Nothing else. Today's
   heading still reads "Compact Calendar".
6. **One token field, not two.** Settings and Onboarding each had a field
   labelled "GitHub personal access token" posting to the same route. Read
   literally, Setup would hold both. It holds one, in the Desktop session
   card. The GitHub card begins at the repository. `Onboarding.tsx` no
   longer takes a token.
7. **Seeding no longer moves the operator to Next Task.** Setup owns the
   sequence and does not navigate. The result is shown in the card.
8. **`GitHubImport.tsx` shows the real import.** The stub rendered fixed
   numbers from `appState.ts`: 18 issues and 4 pull requests. Folded into
   Setup as it was, it would have shown the operator invented counts. It
   now shows what the seeding response reported. The unused `importSummary`
   and `navItems` fixtures were removed from `appState.ts`.
9. **Setup stays mounted once opened.** "Setup owns them" would otherwise
   mean the session badge and the chosen repository reset on every visit.
   `App.tsx` holds one boolean for this and neither piece of state.
10. **Calendar receives no repository.** It took `selectedRepo` from
    `App.tsx`, which no longer has it. It is passed `null` and uses its
    defaults.
11. **A 204 has no body.** `request<T>` in `client.ts` parsed every response
    as JSON. `DELETE /preference/:id` answers 204, so it now skips parsing
    for that status.
12. **The check's build is offline.** The script runs
    `cargo build --locked --offline`, so the check cannot contact a registry.
13. **The check also compares response schema versions.** The ticket asks
    for status checks. Where a response carries `schema_version`, the script
    requires the value `endpoints.ts` holds.
14. **The order of the check's steps.** It follows the ticket's numbering:
    build and start, then the default comparison, then traffic.

## Known limits

1. **`Calendar` still drives the old generic `/projection/*` routes**, not the `/projection/calendar/*` chain from P1B-29…35. Renamed only; the rewire is its own ticket.
2. **No Routines screen.** P1B-38 made authoring possible over HTTP; the screen is next.
3. **No Review screen.** The advisory queue has four routes and no surface, and nothing produces candidates yet either.
4. **No Reports, no Log review.** Their stubs were deleted rather than wired.
5. **The contract check does not exercise the Tauri transport.** It cannot; that is the operator acceptance surface and it is now the only one.
6. **The check runs on demand, not in CI.** There is no CI in this constellation yet.
7. **Preferences are Task-pairwise only**, as P1B-36 left them; Objective pairs are still rejected.
8. **The port is aligned by two defaults agreeing, not by a shared source.** Nothing generates one from the other; §C asserts they match.

Found during the work, beyond the eight:

9. **Setup's state is lost when the app closes.** The orchestrator has no route the UI can ask whether a session token is held.
10. **The orchestrator's untracked runtime files are not ignored by its `.gitignore`.** Running it from its repository root will make the tree dirty again.
