# Google Calendar surface

Calendar is one screen with four stages, in the order the operator uses them:

1. **Preview** reads the current plan projection, its plan ID, stale flag,
   diagnostics and every proposed operation. It makes no Google call. The
   `no_external_export` toggle defaults off; changing it requires a new preview.
   From P1B-58 one line above the operations says how many there are:
   “Operations proposed: 10. Create 7, update 3, delete 0.” It is there for
   every preview, a preview of nothing included, and it replaced the separate
   “No Calendar operations proposed.” line.
2. **Approve** explicitly sends the reviewed `preview_id`. Nothing is applied
   without this separate approval. The result shows status, applied count,
   operation outcomes, diagnostics and the full returned response. A stale preview
   has a prominent warning; the operator still decides whether to approve it.
3. **Capture** reads phone changes on demand and displays all six counts, including
   zero: `captured`, `updated`, `unchanged`, `skipped`, `moved`, `resized`. Every
   diagnostic is readable, including occurrence-override, observation-resize and
   inactive-Task explanations. Capture invalidates the screen's old preview.
4. **Reconcile and repair** groups observations by ownership conflict, then offers
   one explicit repair of the entire reconciliation. A fresh preview follows
   repair; it still requires separate approval to correct the calendar.

Keeping these on one screen makes the order and the approval boundary visible.
Calendar calls use the existing Tauri HTTP plugin to the local orchestrator. The
screen never handles Google credentials directly and never auto-enables access.

## Colour and window meaning

| | colour means | window change means |
|---|---|---|
| Dynamic | **done** | resize — the Task's duration will change |
| Static | its category | move — the window will follow the event |

The preview shows this meaning per Create or Update, alongside its summary and
window. It is derived from `color_id` because the projection sets a colour only
for Static placements. Following P1B-41's specified response-only partition,
non-null `color_id` renders Static, and null renders Dynamic. There is no join
against `GET /tasks`. The display follows this contract assumption; it does not
independently verify the Task's placement.

A Delete carries no Task, window or placement and therefore no colour meaning.
This is the contract, not a gap: its Task may no longer exist, and the event has
no future gesture meaning. It renders `Delete: <summary>` and `Event will be
removed.` without a colour line or invented placement.

## Repair needs no repair operations

Repair corrects **UbU's record of what it applied**, using the observation saved
by reconciliation. It drops `missing` events from that record and updates
`drifted` events to their observed values. **It never calls Google.** P1B-31's
principle is that **repair needs no repair operations**: the ordinary desired
versus applied diff proposes the calendar corrections in the **next preview**.
Only approving that subsequent preview can send those corrections to Google.

These definitions are P1B-31's own words:

| Conflict | Meaning | Repair effect |
|---|---|---|
| `missing` | An owned event is absent from the observed list. | Drop its applied record. |
| `drifted` | An owned event's observed fields differ from its applied record. | Update its applied record. |
| `unrecorded` | An observed event is not owned, but its ID derives from an active Task UbU knows about. | Excluded; do not adopt it. |
| `foreign` | An observed event is neither owned nor linked by ID to an active Task. | Excluded; do not touch it. |

Ownership comes from an applied record, not the shape of an ID. `foreign` events
belong to the operator and are never repairable. `unrecorded` events are also not
owned. Both survive repair as `remaining_conflicts`. Each group states the
exclusion, and the single repair button states its scope before it is pressed.

Repair returns `dropped_events`, `updated_events`, `applied_event_count` and
`remaining_conflicts`. Its path takes only `reconciliation_id`: no selector or
request body. A second call returns `409 calendar_reconciliation_already_repaired`:

> This Calendar reconciliation has already been repaired; request a new reconciliation

The screen shows that response and points to a new reconciliation. Repair uses
the stored observation; take another reconciliation if events changed after it.

## Enablement and acceptance

The Google Calendar session card lives in Setup beside the desktop session. It
shows the `accepted` and `enabled` response. Calendar links there while disabled.
A session `503` means the credential paths are not configured: set
`UBU_GOOGLE_CREDENTIALS_PATH` and `UBU_GOOGLE_TOKEN_CACHE_PATH` in the orchestrator
environment, restart it, and enable again. `UBU_GOOGLE_CALENDAR_ID` selects the
intended calendar; otherwise it uses primary. The UI accepts no paths or tokens,
stores no credentials, and presents this outcome as a setup instruction.

This surface has never been exercised against a real Google account by the
agent. Only the operator may exercise it against an account. The Google round
trip is **unverified by the agent**; all six dummy-account acceptance steps in
[P1B-41 verification](P1B-41_VERIFICATION.md) remain outstanding.

## Known limits

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



## P1B-68 F: a conditional gesture legend

Create and Update cards keep their two legend paragraphs and layout. They now
say “If you give this event a colour, it means:” and “If you change this window,
it means:”. Static colour still means category and its window gesture is a move;
Dynamic colour still means done for UbU-authored work or a commitment for captured
work, and its window gesture is a resize. Future wording describes a possible
operator gesture, including after approval; it does not claim a duration changed.
No placement, colour, capture or interaction rule changes.
