# P1B-41 verification

## Landing and scope

Branch: `p1b-41-calendar-surface` in all three changed repositories. One commit
per lettered section: A in orchestrator, B–G in UI, H in devshell. No force-push.
The repository-qualified revisions land in this order:

| Order | Repository | Pushed revision |
|---|---|---|
| 1 | ubu-orchestrator, A | `b5b74c1a1f33d58f4ac73cc46b7650980f78905d` |
| 2 | ubu-ui, G | `origin/p1b-41-calendar-surface`, subject `P1B-41 G: document Calendar behavior and verification` (the commit containing this report) |
| 3 | ubu-devshell, H | `origin/p1b-41-calendar-surface`, subject `P1B-41 H: record the final Calendar surface revisions` |

The UI's tested functional revision F is `0ef0a483f898bcfb91005f8b9c2ab785a483a6f0`.
G changes documentation only. A report cannot embed its own commit hash, or the
hash of H which pins that report, without creating a circular hash dependency.
The two exact Git revision references above avoid extra commits or history
rewrites. The final response supplies all three concrete landing SHAs; the local
[landing record](../../.p1b-41-results/landing.json) records them too.

No **dependency pin** moved, no dependency was added and no manifest changed.
H updates the explicit devshell checkout inventory, as requested. Existing
unpinned design and brand checkouts are recorded at their unchanged heads so
all repositories listed by `show-revs.sh` read OK. Core, store, schemas, kernel,
adapter, Quick UbU and design remain at the supplied baselines; brand is also
unchanged. Commits use the requested existing Co-Authored-By trailer in UI and
devshell, none in orchestrator. Signing is disabled per commit; no signing key
was requested or inspected.

### Orchestrator

Baseline `d047149b09a78d01f748f3b6f40bf597cc1f9b2f` to A:

```text
.gitignore | 7 +++++++
 1 file changed, 7 insertions(+)
```

No source diff. `Cargo.lock` is byte-identical. Before A, the four permitted
untracked names were `ubu-device-registration.json`, `ubu-orchestrator.db`,
`ubu-orchestrator.db-shm`, and `ubu-orchestrator.db-wal`; their contents were not
read or changed. Ignore entries cover them and SQLite's rollback journal.
The unchanged binary was started **from the repository root**, but with database
and registration paths explicitly set in a fresh `/tmp` directory. This literal
reading meets the root-run check without touching the pre-existing runtime data.
After startup, loopback health 200, termination and cleanup, `git status --short`
was empty. `git check-ignore` confirmed all five runtime filenames. Evidence:

```text
ubu-orchestrator.db
ubu-orchestrator.db-shm
ubu-orchestrator.db-wal
ubu-orchestrator.db-journal
ubu-device-registration.json
PASS: binary started from repository root; health 200; synthetic state in /tmp
```

### Tests and locks

Baseline: **20 passed**, six files. Final: **30 passed**, seven files. Every
section B–E retained 20 passing tests and a clean TypeScript check; F has 30.
`npx --no-install tsc --noEmit` passes; this invokes the installed compiler without
permitting a package download. `npm run build` passes (51 modules transformed).
No Rust compiler concurrency or memory cap was introduced.

The following SHA-256 values match the baseline **and Git's original lockfile
bytes**, not just dependency resolution:

| File | SHA-256 |
|---|---|
| `ubu-ui/package-lock.json` | `f17aa89a8b2770b7c28e1aa38fe5a9a1b71c938f58a6bd87cb3666fd448d330f` |
| `ubu-ui/src-tauri/Cargo.lock` | `4225e62a5930e8d9347d34b2454eaccf39d2738a7a129cba3f2c5bdfce3d5f56` |
| `ubu-orchestrator/Cargo.lock` | `e7a0ecf2a14949e5d106ffc3d744605225c56c6ca9d049ff5e698790c6641a15` |

Tests 21–23 verify Preference PATCH bodies with listed versions, reload order,
disabled-row retention, and confirmed DELETE removal (including cancelling the
confirmation). Existing GitHub projection coverage still passes after its rename.
All existing tests remain, with only navigation/name expectations adjusted.

## Contract output

The initial sandbox attempt could build but could not bind a loopback socket
(`EPERM`). Both successful runs below use the required script with permission for
its temporary loopback listener. They build with `--locked --offline`, clear the
child environment, use `/tmp` state, and contact only `127.0.0.1`. They do not
exercise the Calendar routes against Google: the new paths are checked in the
actual orchestrator's `/openapi.json`.

Before (18 constants):

```text
build: cargo build --locked --offline in /home/sean/ubu-phase1b/ubu-orchestrator
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.16s
built: /home/sean/ubu-phase1b/ubu-orchestrator/target/debug/ubu_orchestrator
start: orchestrator on ephemeral port 39377, store in /tmp/ubu-contract-check.NvXwGs
defaults:
  ubu-ui            DEFAULT_ORCHESTRATOR_PORT = 7878
  ubu-orchestrator  UBU_ORCHESTRATOR_PORT unwrap_or = 7878
  the two defaults agree
requests against http://127.0.0.1:39377:
  200 GET http://127.0.0.1:39377/health
  201 POST http://127.0.0.1:39377/task
  200 GET http://127.0.0.1:39377/tasks?schema_version=ubu.orchestrator.task_read.v1&status=active
  200 PATCH http://127.0.0.1:39377/task/task_01a0e7ef9d0d76f2b2ddda6cfed827d0
  200 POST http://127.0.0.1:39377/planning/generate
  200 GET http://127.0.0.1:39377/next-action?schema_version=ubu.orchestrator.next_action.v1
paths in the live /openapi.json:
  200 GET http://127.0.0.1:39377/openapi.json
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
stopped: orchestrator pid 122702
removed: /tmp/ubu-contract-check.NvXwGs
```

After the six client additions (24 constants, **+6**):

```text
build: cargo build --locked --offline in /home/sean/ubu-phase1b/ubu-orchestrator
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.24s
built: /home/sean/ubu-phase1b/ubu-orchestrator/target/debug/ubu_orchestrator
start: orchestrator on ephemeral port 41759, store in /tmp/ubu-contract-check.UGxpc7
defaults:
  ubu-ui            DEFAULT_ORCHESTRATOR_PORT = 7878
  ubu-orchestrator  UBU_ORCHESTRATOR_PORT unwrap_or = 7878
  the two defaults agree
requests against http://127.0.0.1:41759:
  200 GET http://127.0.0.1:41759/health
  201 POST http://127.0.0.1:41759/task
  200 GET http://127.0.0.1:41759/tasks?schema_version=ubu.orchestrator.task_read.v1&status=active
  200 PATCH http://127.0.0.1:41759/task/task_01a0e7f7fa2c776199e2d0369f7da71f
  200 POST http://127.0.0.1:41759/planning/generate
  200 GET http://127.0.0.1:41759/next-action?schema_version=ubu.orchestrator.next_action.v1
paths in the live /openapi.json:
  200 GET http://127.0.0.1:41759/openapi.json
  ok      BOOTSTRAP_SEED_PATH = /bootstrap/seed
  ok      CALENDAR_APPROVE_PATH = /projection/calendar/approve
  ok      CALENDAR_CAPTURE_PATH = /projection/calendar/capture
  ok      CALENDAR_CURRENT_PATH = /calendar/current
  ok      CALENDAR_PREVIEW_PATH = /projection/calendar/preview
  ok      CALENDAR_RECONCILE_PATH = /projection/calendar/reconcile
  ok      CALENDAR_REPAIR_PATH = /projection/calendar/reconcile/{reconciliation_id}/repair
  ok      DESKTOP_TOKEN_PATH = /desktop/session/github-token
  ok      GOOGLE_CALENDAR_SESSION_PATH = /desktop/session/google-calendar
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
PASS: ubu-ui contract check: defaults agree on 7878, 7 requests succeeded, 24 of 24 path constants are live
stopped: orchestrator pid 145803
removed: /tmp/ubu-contract-check.UGxpc7
```

H repeats the same contract check after inventory updates. Its complete raw
output is in [contract-after-H.log](../../.p1b-41-results/contract-after-H.log);
the required result is again `24 of 24 path constants are live`.

## Verbatim mocked rendering

Test 24 renders these strings; both event windows are also shown:

```text
Create: Synthetic appointment
Window: 2026-09-28T13:00:00Z → 2026-09-28T14:00:00Z
Placement: Static
Colour means: its category
Window change means: move — the window follows the event

Update: Synthetic focus
Window: 2026-09-28T13:00:00Z → 2026-09-28T14:00:00Z
Placement: Dynamic
Colour means: done
Window change means: resize — the duration changed

Delete: Synthetic old event
Event will be removed.
```

The test asserts the Delete has no colour, placement, window or absent-metadata
text; it also verifies there is no `/tasks` lookup, no approval on preview, and
both `no_external_export=false` and `true` query values. Changing that toggle
invalidates the preview and disables approval until another preview returns.

Test 25 verifies the prominent alert:

```text
Stale preview — the plan may have changed. Review before approving.
```

Test 26 verifies the separate approve gate, exact `preview_id`, user authority,
live export mode and displayed partial-result outcomes/diagnostics.

Test 27's counts and synthetic diagnostic messages are rendered verbatim:

```text
captured: 2
updated: 1
unchanged: 0
skipped: 3
moved: 0
resized: 1
calendar_move_needs_occurrence_override
Synthetic occurrence move needs an occurrence override.
calendar_resize_overridden_by_observations
Synthetic resize is overridden by observations.
calendar_gesture_on_inactive_task
Synthetic inactive Task cannot take this gesture.
```

Test 28 groups all four kinds with P1B-31's exact explanations:

```text
missing
An owned event is absent from the observed list.
Synthetic missing event
UbU applied this event and the calendar no longer has it

drifted
An owned event's observed fields differ from its applied record.
Synthetic drifted event
the calendar's copy of this event differs from what UbU applied

unrecorded
An observed event is not owned, but its ID derives from an active Task UbU knows about.
Excluded from repair; remains unchanged.
Synthetic unrecorded event
this event matches a known Task but UbU has no applied record; it will not be adopted

foreign
An observed event is neither owned nor linked by ID to an active Task.
Excluded from repair; remains unchanged.
Synthetic personal event
this event was not created by UbU and will not be touched
```

Exactly **one** repair button is present: `Repair applied record`. No conflict
contains its own control. Before pressing it, the following text is visible:

```text
Repair corrects UbU's record of what it applied. It addresses missing and drifted only and does not call Google. The calendar corrections appear in the next preview, which needs a separate approval.
foreign events belong to the operator and are never repairable. foreign and unrecorded are excluded from repair and remain unchanged.
```

Test 29's complete synthetic repair response:

```json
{
  "schema_version": "ubu.orchestrator.calendar_repair.v1",
  "reconciliation_id": "synthetic/reconciliation",
  "dropped_events": 1,
  "updated_events": 1,
  "applied_event_count": 2,
  "remaining_conflicts": [
    {
      "external_id": "synthetic-unrecorded",
      "conflict_type": "unrecorded",
      "summary": "Synthetic unrecorded event",
      "message": "this event matches a known Task but UbU has no applied record; it will not be adopted"
    },
    {
      "external_id": "synthetic-foreign",
      "conflict_type": "foreign",
      "summary": "Synthetic personal event",
      "message": "this event was not created by UbU and will not be touched"
    }
  ]
}
```

The screen renders all three counts and both remaining conflicts, followed by:

```text
The calendar corrections appear in the next preview. Review and approve it separately.
Take fresh preview
```

The test takes that fresh preview without any approval request. Both repair
requests have no body/selector, and the synthetic slash in the reconciliation ID
is encoded as `%2F`. The second response is HTTP 409 and renders:

```text
calendar_reconciliation_already_repaired
This Calendar reconciliation has already been repaired; request a new reconciliation
Take a new reconciliation before repairing again.
```

Test 30 verifies the disabled session's `Open Setup` navigation, disabled live
actions, and the session 503 instruction in a status region, with no error alert.
It names `UBU_GOOGLE_CREDENTIALS_PATH`, `UBU_GOOGLE_TOKEN_CACHE_PATH`, restart and
reenablement. The successful setup path in tests 24–29 also verifies `accepted:
true`, `enabled: true`, and enablement survives navigation into Calendar.

## Isolation

No test contacted Google or read/wrote a credential. All Calendar responses are
synthetic `Response` objects returned by `vi.mock("@tauri-apps/plugin-http", ...)`.
Unexpected requests are collected and asserted empty. The shared test setup
rejects any global fetch and asserts zero calls. In addition, the full Vitest
suite and production build ran through the existing offline seccomp wrapper,
which denies IPv4 and IPv6 socket creation. No test enables a real orchestrator
Calendar session. The required contract/root-run checks use empty temporary
state and scrubbed environments with no Google paths, mock GitHub modes and
loopback-only requests. Git is the user's standing network exception.

All task inputs, edits, fixtures and verification-artifact reads/writes stayed
inside `/home/sean/ubu-phase1b` and `/tmp`. No operator home data or Google OAuth
pickle was listed, opened, moved or written. This is a task-data boundary, not a
claim that installed tools never load libraries, package caches, Git configuration
or authentication outside those directories. No credential material was requested,
inspected, logged, stored in fixtures, or added to any commit. Existing runtime
files were identified only by Git status, never opened.

## Final navigation and inventory

`App.tsx` declares, in order: **Today**, **Next Task**, **Tasks**, **Priorities**,
**Calendar**, **GitHub**, **Setup**. The former Calendar was the GitHub label
projection; its renamed implementation is unchanged apart from its name/kicker.

The post-H `show-revs.sh` output below normalizes only the self-referential UI G
hash to `<UI-G>`. The finishing check compares the actual output against this
block byte-for-byte after that substitution. Full literal output, including the
resolved G revision, is preserved in
[show-revs-after-H.log](../../.p1b-41-results/show-revs-after-H.log).

```text
Recorded R_* baseline: post-O20 R_orchestrator, post-GA2 R_adapter, post-S17 R_schemas, post-C12 R_core, post-ST7 R_store

REPO                     BRANCH         HEAD      SIG                 TREE   PINNED    STATUS
----                     ------         ----      ---                 ----   ------    ------
ubu_design               main           f7c4a1db  signed-ok           clean  f7c4a1db  OK
ubu_schemas              main           4974166a  signed-ok           clean  4974166a  OK
ubu_core                 main           c77c0a2d  signed-ok           clean  c77c0a2d  OK
ubu_store                main           7b24cd82  signed-ok           clean  7b24cd82  OK
ubu_github_adapter       main           4c7e3b6d  signed-ok           clean  4c7e3b6d  OK
ubu_planning_kernel      main           84b6d0d9  signed-ok           clean  84b6d0d9  OK
ubu_orchestrator         p1b-41-calendar-surface b5b74c1a  unsigned            clean  b5b74c1a  OK
ubu_ui                   p1b-41-calendar-surface <UI-G>    unsigned            DIRTY  <UI-G>    OK
ubu_brand                main           faf2005a  signed-ok           clean  faf2005a  OK
```

Every listed repository is OK and clean, including orchestrator. Quick UbU is
not listed by that script; its unchanged clean baseline is checked separately.
The devshell commit itself is likewise checked clean after H.

## Operator acceptance remains outstanding

**The Google round trip is unverified by the agent.** No dummy-account or real
Google operation was performed. The operator still needs to do all six steps:

1. In Setup, enable the Google Calendar session. If it reports 503, confirm the
   card says what to configure.
2. On Calendar, take a preview and confirm each create/update shows placement
   and colour meaning; deletions show removal only.
3. Approve and confirm events appear on the dummy calendar.
4. On the phone/web calendar, colour one Dynamic event and drag one Static event.
5. Capture; confirm Dynamic completion and the Static Task's moved window.
6. Reconcile; confirm a hand-created event is foreign and excluded from repair.

## Judgment calls and literal readings

No disagreement with the twelve **amended** judgment calls. Calls 4 and 6 are
implemented literally: the response-only `color_id` partition (no Task join),
deletions as removal only, and one whole-reconciliation applied-record repair.

Ambiguities resolved without widening application scope:

- Section F says “nine” but numbers tests 21–30 and explicitly expects 30. Added
  the ten enumerated tests, preserving all twenty existing tests.
- “No pin moves” means no dependency pin moves; H expressly requires updating
  the checkout inventory. Previously unset design/brand entries are recorded at
  their existing heads to satisfy “every repo OK”; their checkouts do not change.
- “No network” for tests is enforced for Vitest. The separately required contract
  check necessarily binds loopback; it has no external service traffic. Git is
  the pre-existing explicit exception.
- “Run from repo root” changes the working directory, not authorization to modify
  existing operator state. Synthetic paths under `/tmp` protect that state.
- The report's self-revision and the later inventory commit use exact branch and
  commit-subject references, with resolved hashes in the final landing record.
  Post-H evidence normalizes the self-revision only, as explained above. This
  preserves one commit per section and the required landing order.
- No status GET exists for Google enablement. App starts disabled, explicit Setup
  enablement shares a boolean in memory, and backend enablement rejections reset
  it. The backend remains authoritative across process restarts.

## Known limits (verbatim)

1. **No Routines screen.** P1B-38 made authoring possible over HTTP; the screen is the next ticket.
2. **No Quick UbU import screen.** `POST /import/quick-ubu` takes a snapshot path and a `dry_run` flag and has no surface; next ticket.
3. **No Review screen**, and nothing produces advisory candidates yet either.
4. **Capture is manual.** Nothing polls; a colour or a drag lands at the next capture the operator runs.
5. **`syncToken` incremental sync is unused**, as P1B-32 left it.
6. **Occurrence overrides are never garbage-collected.**
7. **The GitHub projection screen is unchanged behind its new name**, including its own reconciliation flow.
8. **Nothing here is exercised against a real Google account by the agent**, by construction.
9. **Repair is all-or-nothing and addresses `missing` and `drifted` only.** There is no per-conflict repair and no way to decline one correction while accepting another; `foreign` and `unrecorded` are returned as remaining conflicts.
10. **A `Delete` preview carries no Task, window or placement.** The screen shows the removal and nothing more.

