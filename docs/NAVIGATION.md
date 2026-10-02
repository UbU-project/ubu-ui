# Navigation

The app opens on **Today**. `App.tsx` holds ten flat route IDs, in this order:

| id | Label | Component | Purpose |
|---|---|---|---|
| `today` | Today | `src/routes/Today.tsx` | The internal Compact Calendar, plan generation and recalculation. |
| `next-task` | Next Task | `src/routes/NextAction.tsx` | Choose work and record complete, override or snooze. |
| `tasks` | Tasks | `src/routes/Tasks.tsx` | Capture, list and edit Tasks. |
| `priorities` | Priorities | `src/routes/Priorities.tsx` | Create, enable, disable and delete Preferences; explain refusals. |
| `routines` | Routines | `src/routes/Routines.tsx` | List routines with their streaks, create and edit them, override single dates; explain refusals. |
| `universe-state` | UniverseState | `src/routes/UniverseState.tsx` | What a Task's precondition is evaluated against: read it, set and clear facts, set numbers, add and remove set members. |
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


## P1B-51

**Review → Clarify** reads `clarify_no_questions` by the round the run
reports, because the same code means two different things:

- **On round one** nothing has been asked yet. The run result says that this
  is a result from the model and not a finished interview, that the model
  was asked and declined to ask anything, and that
  `advisory.model` in Setup is what to change. **Open Setup** is offered, as
  it is beside every other model remedy.
- **On a later round** the interview is finished. The result says so, names
  the round, and says the Task's notes hold what was asked and answered.
  Setup is not offered.

Neither is an error: both are shown as status, with the orchestrator's own
message verbatim beside them. A run from an orchestrator that reports no
round keeps the earlier neutral wording.

The round is `round` on the run response, added by the orchestrator in
P1B-51. It is one more than the rounds the operator has answered.

## P1B-52

**A diagnostic says whether anything went wrong.** `DiagnosticsList` takes a
tone, and where the diagnostic came from decides it:

- **failure**: it came with a request that failed, a 4xx or a 5xx. It is
  `role="alert"`, in the alarm colours, as every diagnostic used to be.
- **info**: it came with a response that succeeded. Something happened and
  the operator should know; nothing went wrong. It is `role="status"`, and
  visibly quieter.

In both, **the sentence leads and the code follows it**, small and
selectable. The code is what gets quoted in a report; it is not the headline.

The default is `failure`, so a call site that names no tone means what it
always meant. Three kinds of result answer 200 and still carry a status of
their own that can say the thing did not succeed: an advisory run, a Calendar
approval and a GitHub projection batch. For those the tone follows that
status: `ok` or `applied` is info, anything else is a failure.

| screen | list | tone |
|---|---|---|
| Today | a failed load, generate or recalculation | failure |
| Today | diagnostics on a generated or recalculated Plan | info |
| Next Task | a failed load, action or undo | failure |
| Next Task | diagnostics on a recorded action or an undo | info |
| Review | a failed queue action | failure |
| Review | a SuggestTags or Clarify run | by the run's `status` |
| Calendar | a failed request | failure |
| Calendar | a preview, a capture, a reconciliation | info |
| Calendar | an approval | by the approval's `status` |
| GitHub | a failed request | failure |
| GitHub | a projection result | by the result's `status` |
| GitHub | a reconciliation | info |
| Bootstrap | a failed seed | failure |
| Bootstrap | diagnostics on a seeded workspace | info |
| Routines | a failed request | failure |
| Routines | diagnostics on a stored override | info |
| Tasks, Priorities, Setup, advisory Settings, Time by category | a failed request | failure |

Today, Next Task and Bootstrap each held both kinds in one list. They are two
lists now, so a planning diagnostic from a 200 and a transport error are
never the same thing on screen.

**The plan-quality panel says when the affect figures were not measured**,
from P1B-56. With no Snapshot the orchestrator scores a Plan against a
stand-in observation, and until P1B-56 the panel showed that stand-in as
“Affect margin 0.000”, a stretch pressure and “depleted”, beside a Plan that
was fine. `PlanReports` takes an optional `legitimization`. When the Plan's
affect warning says the stand-in observation was used, the three affect rows
read “not recorded” and one line under them says why:

> No Snapshot of how you are feeling has been taken, so UbU is not guessing
> at affect margin, stretch pressure or post-Plan state.

Today passes the Plan's legitimization. Next Task has none and passes none,
so its panel is unchanged. The banner in the legitimization summary is not
repeated.

Two predicates read the warning's words, in `src/affect.ts`, because the
report carries no field for either. `usesBootstrapDefaultProfile` is the one
Today always had, moved: it holds when the profile or the observation is a
default, and drives the banner. `usesStandInObservation` is narrower and
drives the rows: it holds only when the observation itself was manufactured.
A real Snapshot scored against default tolerances trips the first and not
the second, and its figures are measurements.

**A duration is said in the unit it is in**, from P1B-57. The Plan-quality
panel printed “Feedback latency” as the orchestrator's number followed by
“min”. The number is planning seconds, so four hours read as “14400 min”,
which is ten days. `formatDuration`, in `src/duration.ts`, reads seconds alone
under a minute, minutes alone under an hour, and hours and minutes above, and
the row uses it. Nothing on the screen labels a number of seconds “min”.

**Today says when fixed commitments collide.** From P1B-54 the orchestrator
plans around two Static Tasks that overlap, and around a Static dependency
that cannot hold, and reports each pair as `static_task_collision`: a warning
on a Plan that was made. When a generated or recalculated Plan carries that
code, Today says so in a sentence of its own, above the diagnostics:

> Two fixed commitments overlap, or one depends on another that ends too
> late. Both of a pair are in the Plan at their own times and both are busy:
> no other work is placed in the time they cover. The Plan was still made.
> Each pair is named below.

With several pairs it gives the count. It is a status in the `info` tone,
never an alert. The orchestrator's own message follows it in the list, and
that is what names the two Tasks, by title and by id.

**Today shows the real times.** A Plan step carries its window twice: `start`
and `end` are Unix seconds, and `start_at` and `end_at` are the same instants
as RFC 3339 strings. The numbers are planner coordinates. Today uses them for
one thing, the order of the placements, and shows neither.

Each placement shows `start_at` and `end_at` in the operator's own timezone,
with the day, as two `<time>` elements whose `dateTime` is the string as it
came. A window that crosses midnight therefore shows both days. Seconds are
shown only when the instant has them. The timezone is named once, above the
placements. The Calendar screen shows the same instants as it always has, as
the ISO strings in UTC.

Until P1B-54 this screen formatted the numbers as if they were minutes, so
every date and time on it was wrong. That formatter is deleted, not repaired:
nothing on this screen formats a planner coordinate.

**Today says what did not fit.** A planning response carries `unplaced_tasks`:
each Task the Plan left out, with its title, a reason, an explanation and
what could be done. Until P1B-52 no screen read it, and a Task that did not
fit appeared only as a `task_unplaceable` code beside its id.

Below the timed placements, and only when something was left out, Today shows
**Not in this Plan**:

- how many Tasks were left out, and that they are in none of the placements;
- each one by **title**, with the orchestrator's explanation as the sentence;
- when the reason is `no_eligible_chunk_large_enough` or
  `outside_allowed_window`, one line: it is longer than any free interval in
  the planning horizon;
- what can be done, in words. The planner's `safe_alternatives` are tokens:
  `decompose_task`, `extend_planning_horizon`, `relax_task_window`,
  `reprioritize_task`, `remove_or_moot_task` and `manual_decision` each have
  a sentence. One this screen does not know is shown as it came;
- the Task's id and the reason token as small print.

It is a section of the Plan, not a diagnostic list, and it is never an alert.

**A Task that was not ready is in the same section**, from P1B-54. A planning
response also carries `blocked_tasks`: each Task whose UniverseState
precondition is false now. The planner did not try to place it. That is a
different thing from not fitting, and the section says which is which:

- the count covers both lists, and when anything is blocked a second line
  says how many did not fit and how many were not ready;
- a blocked Task reads “Not ready”, says the planner did not try to place it,
  and says what it is waiting for in words: `equals`, `member_of` and `absent`
  each have a sentence, joined by “and” and “or” for `all_of` and `any_of`. A
  predicate this screen does not know is shown as it came;
- its id and `task_precondition_blocked` are the small print.

**A blocked Task is shown by id, not by title.** `blocked_tasks` carries
`task_id` and `precondition` and nothing else, so the id is the only name this
screen has. Showing the title needs the orchestrator to send it.

`blocked_tasks` is left out of the response when it is empty.

The list is shown only for the Plan it was reported with. Only
`POST /planning/generate` reports it: `GET /calendar/current` and
`POST /planning/recalculate` carry no `unplaced_tasks`. Loading the current
Calendar on entry therefore shows no such section, and after a recalculation
the section is cleared and the recalculation summary says that a
recalculation does not report which Tasks it left out.

**Calendar states both halves of the colour rule**, from P1B-55. The export
half was already on each operation of the preview: “Colour means: its
category” or “done”. The capture half is in the Capture panel, beside “Run
capture”:

> An event with no colour is taken as work for UbU to schedule. An event with
> a colour is taken as a commitment at its own time, and the colour is its
> category.

Under it the panel says that a Task which came from the calendar keeps to
that rule afterwards, and that an event which repeats stays a commitment
whatever its colour, because UbU cannot move it. The gesture sentence now
reads “A colour on Dynamic work you made in UbU means done”: a to-do that
came from the calendar is pinned by a colour, not completed by it.

On the preview, a Dynamic operation says “Colour means: done” for work made
in UbU, and “a commitment at the time it then has, in that colour's category”
for a to-do that came from the calendar. No field of the operation says which
it is. The screen reads it from the two ids: an event UbU exports for a Task
of its own has that Task's id without its `task_` prefix, and a captured Task
keeps the id its event already had.

**`capture_colour_absent` is information, and many of them are one fact.**
It is the ordinary case for a to-do, and a real week has dozens. After a
capture the events with no colour are counted in one sentence, which says
that it is not something missing, and listed under it in the `info` tone. Up
to three are shown; more are behind a closed “The N events with no colour”.
Every other capture diagnostic stays in the list below, as before.

Setup's Colours card says, under “Colour to category at capture”, that an
event with no colour is not a row of that table and is not a fault.

**Calendar no longer says a recurring event cannot be captured.** From
P1B-51 capture records an event UbU cannot own as occupied time. The
reconcile group that was "foreign, cannot be captured" is **foreign, occupied
time only**: it says UbU cannot own these commitments and that capture
records each as a Static Task UbU never writes back to. Each entry shows the
event's title and id. The orchestrator's reconciliation message for such an
event still reads "cannot be captured"; that sentence is not shown, and
`capture_event_not_ownable` is used only to decide which group an event
belongs to. The line under the group counts those commitments inside the
horizon and says to run capture, because one that has not been captured is
not seen when planning.

Capture reports such an event as `capture_occupancy_only`, as a status.

**Round one of Clarify says only what is true.** When the model asks nothing
on round one, the result says that the model was asked and declined to ask
anything. It no longer says the model knows nothing about the Task, which
was false for a Task that already had notes.

## P1B-53

**Calendar reads an event's placement from the orchestrator.** Each create
and update in a preview carries `static_anchor`, and the three lines under an
operation follow it:

| | Static | Dynamic |
|---|---|---|
| Placement | Static | Dynamic |
| Colour means | its category | **done** |
| Window change means | move — the window follows the event | resize — the duration changed |

Until P1B-53 the screen inferred placement from the colour: an event with a
colour was Static. A colour comes from a category, so a Static Task with no
category has none. A night block, and every captured event whose colour maps
to nothing, therefore previewed as Dynamic with a Dynamic event's gestures,
all three lines the opposite of the truth. The orchestrator never acted on
that reading; the screen was only teaching the wrong rule.

A colour on a Dynamic event still means done, and does not make it Static. A
Delete has no event and no placement.

## P1B-58

**UniverseState** is the tenth screen, after Routines and before Review. It
shapes the Plan, so it sits with the screens that do. UbU has evaluated a
Task's precondition against a `UniverseState` for a long time, and Today has
named a blocked Task's precondition in words since P1B-54. Until this screen
there was nowhere to see what the precondition was evaluated against, or to
change it.

It reads `GET /universe-state` once on entry and writes through
`PATCH /universe-state`. After a write it shows the state the orchestrator
answered with. It does not read again.

**What it says it is for**, at the top:

> A Task can ask that something be true before UbU will plan it. This is where
> that something is recorded. A Task whose condition is not met here is left
> out of the Plan as not ready, and Today names what it is waiting for by the
> names on this screen.

**One line gives the names and the counts and no value:**

> Entries: `facts` 2, `numeric_values` 1, `set_memberships` 0, `event_markers` 0.

A count is the number of keys in the collection. A set with five members is
one entry. This is the line the live rehearsal asks to be copied back. The
values on this screen are the operator's private facts and no step may ask
for them.

**The four collections**, each a panel with its own heading, its name as the
orchestrator spells it, and its count:

| Panel | Collection | Each entry shows | Can be changed here |
|---|---|---|---|
| Facts | `facts` | target, value | set, change, clear |
| Numbers | `numeric_values` | target, value | set, change |
| Sets | `set_memberships` | target, each member | add a member, remove a member |
| Event markers | `event_markers` | target, each marker, oldest first | no |

An entry is shown by its **target**: the collection, a dot, then the key. That
is the spelling a precondition uses, so the name on this screen is the name on
Today. A value is shown as it is stored, as JSON, so the text `"true"` and the
value `true` are told apart. They are different to a precondition.

**What is typed is read as JSON when it is JSON, and as text when it is not**
(`readValue`). `true` is the boolean, `3` the number, `"3"` the text, `ready`
the text. The screen says so under the fact form.

**A number is set by sending a difference.** The orchestrator has
`increment_numeric` and `decrement_numeric` and no operation that sets a
number. The screen sends the difference between the value shown and the value
entered, and a key that is not there counts from zero. For whole numbers that
is exact. For some fractions it is not: from 0.7, asking for 0.1 lands on
0.09999999999999998. When the number that comes back is not the number asked
for, the screen says so and shows where it landed. A number cannot be
removed, and the screen says that too.

**Event markers are read-only here**, and the panel says why: they can only be
added to, and this screen does not add them.

**The route is the one validator.** A key is sent as it was typed. A key the
orchestrator does not accept, or a member that is a list, comes back as a
refusal. The screen stops only what it cannot send at all: an empty value, and
a number that is not a number.

**A refusal changes nothing on the screen.** The state is replaced only by a
successful answer. A refusal shows "The orchestrator refused this, and nothing
was changed." and the orchestrator's own message with its code, in the
`failure` tone, and what was typed stays in the form. A 409 says the state
changed while this was being saved, and reloads.

**Two empty states, which are different things:**

- The store holds no UniverseState. The answer has `version: null`. The screen
  says "Nothing is recorded here yet", that a Task waiting on something is
  therefore not ready, and that the first entry creates it. It shows no version
  and no time, because the orchestrator makes both up at each read.
- A UniverseState is stored and has nothing in it: "This UniverseState holds no
  entries."

Each empty collection says so in its own panel: "No facts." and so on.

**Today links to it from a blocked Task.** Each "Not ready" Task in "Not in
this Plan" now has one more line, after what it is waiting for:

> Whether it is so is recorded in the UniverseState, under that name.
> **Open UniverseState**

`Today` takes `onOpenUniverseState`, as `Review` takes `onOpenSetup`.

**This screen authors no precondition.** A Task's `preconditions` stay as
`RoutineFields` has them: read-only, and sent back unchanged.

**What it does not show.** The orchestrator records no provenance for a single
fact, so the screen cannot say whether a fact was measured or asserted. The
"First recorded" time and the summary sentence describe the whole state, and
an edit moves neither.

**The Calendar preview says how much it proposes.** The Preview panel rendered
one card per operation and no count, beside an Approve panel that says
“Operations applied in this run: 90 of 90”. A preview of ninety operations
could only be tallied by eye. One line now sits above the cards, counted by
each operation's `kind`:

> Operations proposed: 10. Create 7, update 3, delete 0.

It is shown whenever a preview is present. A preview of nothing reads
“Operations proposed: 0. Create 0, update 0, delete 0.”, and the old “No
Calendar operations proposed.” line is gone, so the empty case is said once.
