# Navigation

The app opens on **Today**. `App.tsx` holds nine flat route IDs, in this order:

| id | Label | Component | Purpose |
|---|---|---|---|
| `today` | Today | `src/routes/Today.tsx` | The internal Compact Calendar, plan generation and recalculation. |
| `next-task` | Next Task | `src/routes/NextAction.tsx` | Choose work and record complete, override or snooze. |
| `tasks` | Tasks | `src/routes/Tasks.tsx` | Capture, list and edit Tasks. |
| `priorities` | Priorities | `src/routes/Priorities.tsx` | Create, enable, disable and delete Preferences; explain refusals. |
| `routines` | Routines | `src/routes/Routines.tsx` | List routines with their streaks, create and edit them, override single dates; explain refusals. |
| `review` | Review | `src/routes/Review.tsx` | Explicit SuggestTags runs and durable candidate admission, rejection, deferral and resurfacing. |
| `calendar` | Calendar | `src/routes/Calendar.tsx` | Google Calendar preview, explicit approval, manual capture, reconciliation and applied-record repair. |
| `github` | GitHub | `src/routes/GitHub.tsx` | The GitHub label projection and its existing reconciliation flow. |
| `setup` | Setup | `src/routes/Setup.tsx` | Orchestrator health, desktop session, Google Calendar session, GitHub onboarding. |

**The screen previously labelled Calendar in P1B-40 was the GitHub label
projection.** Its owner, repository and label form is now named **GitHub**, last
before Setup. It was renamed, not rewritten. The new Calendar screen drives
`/projection/calendar/*`; see [Calendar surface](CALENDAR_SURFACE.md).

Before P1B-40, the screen called Calendar showed the internal plan. That screen
remains **Today**, with heading **Compact Calendar**, using `/calendar/current`.
The P1B-40 documentation's claim that its renamed projection was Google Calendar
was incorrect; P1B-41 supplies that missing surface.

Setup contains seven cards: Orchestrator, Self-check, Desktop session, Google Calendar session,
Colours, Advisory configuration, and GitHub. Colours shows the effective category palette and its origin,
plus the inverse colour-to-category mapping with collisions and unmapped colours.
Edits and reverts take effect on the next Calendar preview and capture without
restart. Review that inverse before bootstrapping from the calendar. Opening the app requests no GitHub token or repository. Google session
enablement is explicit in Setup; the UI sends no Google credential. Calendar links
to Setup when not enabled, and preview remains available without enablement.
Approval, capture and reconciliation require enablement; repair uses only the
stored reconciliation and needs no Google access.

Setup retains its GitHub session and repository state while hidden after first
opening. App holds only the Google enablement boolean shared with Calendar; none
of this state persists across app restarts. There is no session-status GET, so the
UI starts conservatively disabled and can explicitly enable again. A Calendar
session/configuration rejection resets its enabled belief. The GitHub projection
still starts from its own defaults, rather than Setup's selected repository.

**Routines** sits after Priorities and before Review. Review sits before Calendar. Priorities
and Routines are the two screens that shape the Plan, and they come before the
screens that project it. See [Routines](ROUTINES.md).

**Review** loads the decision queue on entry and after explicit actions; it does
not poll or start models automatically. Each proposal shows its target title and
ID, normalized change, confidence, evidence refs, model actor and age. Admit is
explicit; Reject confirms durable suppression of that same proposal. Deferred
proposals have a Resurface action. Run accepts an optional Task limit (default 5,
maximum 25), names the selected Tasks and created candidates, and reports model
failures as diagnostics. Missing advisory configuration names the Setting and
links to Setup. An empty queue is normal.

From P1B-46, a tag proposal also shows its target Task's **placement**, Static
or Dynamic, read from `GET /tasks` beside the queue. For a Dynamic Task it says
that admitting the category will not produce a calendar colour, because a
colour on a Dynamic event means done. A failed run shows what to change:
the model name for `advisory_http_failed`, the budget for `advisory_timeout`,
and the model for `advisory_empty_response`. Each links to Setup.

Setup's Advisory configuration has `advisory.model` and `advisory.endpoint` rows,
with their value and `setting` or `unconfigured` origin. Save and Revert use the
existing Setting routes. The endpoint must be `http://127.0.0.1:<port>` with no
path; a rejection is displayed beside the rows. Neither has a built-in default.
From P1B-46 a third row, `advisory.timeout_ms`, sets the budget for one run. It
is entered and shown in seconds and sent in milliseconds. Its default is 120
seconds and its origin is `setting` or `default`. A value outside 5 to 3600
seconds is refused, and the refusal is shown with the bounds.
Only Task IDs and titles are sent as Task data to the local model. See the
[advisory boundary and operator acceptance](https://github.com/UbU-project/ubu-orchestrator/blob/p1b-45-advisory-producers/docs/ADVISORY.md).

Quick UbU import remains available only
over HTTP and is not part of the calendar bootstrap plan. Reports and Log review
remain absent. Preferences can be authored between Tasks only; imported Objective
pairs can still be listed.

## P1B-47

**Self-check** is a card in Setup, after Orchestrator. One button makes three
read-only requests through the app's own transport: `GET /health`,
`GET /tasks?status=active` and `GET /calendar/current`. It reports each one
and the base URL it resolved, and it writes nothing. It exists for the one
layer `ubu-devshell/scripts/check-ui-contract.sh` cannot see: the Tauri
transport and its capability scope.

The third read is the current Plan and not the Calendar preview.
`GET /projection/calendar/preview` stores a preview record each time it is
called, so it is not a read that leaves the store as it was.

**Tasks** can pin a Task to a fixed window, on capture and on edit, and clear
it again. A Task with a fixed window plans as Static, so its calendar event
carries its category colour. Times are entered in this computer's timezone.

**Routines** can clear a stored override. **Calendar** reports, after an
approval, how many operations were applied in that run and, separately, the
size of the applied record. **Review** explains a skipped routine occurrence.

## P1B-48

**Review** has a second panel, **Clarify**, beside SuggestTags. It interviews
one Task. The operator chooses the Task by title from the active Tasks, with
routine occurrences left out, or leaves the selector on its default, the first
Task without a description. No Task id is ever typed or copied.

The panel says what is sent: that Task's ID, title, category, tags and
description, to the configured local model and nowhere else, and that the
description includes the answers already given. SuggestTags sends ids and
titles only, and still says so.

A run's questions arrive in the decision queue as a card of their own:

- Its heading names the Task and the round.
- A yes/no question is two radio buttons, Yes and No. A short-text question is
  a text field.
- **A question that depends on another is hidden until that one is answered as
  it requires**, and hidden again when the answer changes. The answer to a
  hidden question is dropped, so it can never be sent.
- **Save answers** sends the visible, non-blank answers. Saving is what admits
  the proposal: the questions answered, and the answers, are written to the
  Task's description. There is no Admit button on this card.
- Defer and Reject are as on every card. A deferred question set is
  resurfaced before it is answered.

Three outcomes of a run are information and are shown as such, not as errors:
the Task already has questions waiting, there is no Task to interview, and the
model has nothing further to ask. A real failure goes through the same
remedies as a SuggestTags failure.

**Next Task** offers **Undo completion** after a Task is completed there. It
names the completion it undoes. The offer is there even when completing the
Task left nothing to recommend, and it disappears once used. If the Task's
effects were not reversed, the screen says so.

**Calendar** says, beside the two buttons, that Take preview writes nothing
and does not read the calendar, and that Run capture is the control that reads
the calendar and writes to UbU.

