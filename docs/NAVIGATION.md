# Navigation

The app opens on **Today**. The navigation lists six screens in the order the
operator's day uses them. It is a flat route id held in `App.tsx`; there is no
router.

## The six screens

| id | Label | Component | What it is for | Quick UbU command it replaces |
|---|---|---|---|---|
| `today` | Today | `src/routes/Today.tsx` | The Plan for the day: timed placements, the Plan's legitimization, role-tagged alternatives, generation and recalculation. | `quick-ubu generate`, `quick-ubu replan` |
| `next-task` | Next Task | `src/routes/NextAction.tsx` | One Task to work on now, why it was chosen, and recording complete, override or snooze. | `quick-ubu next`, `quick-ubu done`, `quick-ubu defer` |
| `tasks` | Tasks | `src/routes/Tasks.tsx` | Capture a Task, review the backlog by status, edit what has not started. | `quick-ubu add`, `quick-ubu list` |
| `priorities` | Priorities | `src/routes/Priorities.tsx` | State that one Task comes before, or is level with, another; enable, disable and delete those Preferences; see why one is refused. | `quick-ubu pref-add`, `quick-ubu pref-rm`, `quick-ubu pref-list` |
| `calendar` | Calendar | `src/routes/Calendar.tsx` | The external projection: preview what would be written outside UbU, approve the batch, reconcile what is observed. | `quick-ubu export`, in intent. See the limit below. |
| `setup` | Setup | `src/routes/Setup.tsx` | Where the app is pointing, the desktop session token, and GitHub onboarding. | None. Quick UbU had no equivalent screen. |

## Today is the Compact Calendar. Calendar is the Google projection.

This is the opposite of what the names meant before P1B-40, so it is stated
plainly for anyone who saw the old app:

| Before P1B-40 | From P1B-40 | What it shows |
|---|---|---|
| **Calendar** (`CalendarPreview.tsx`, route `calendar`) | **Today** (`Today.tsx`, route `today`) | The internal Compact Calendar: the Plan, from `/calendar/current`, `/planning/generate` and `/planning/recalculate`. |
| **Projection** (`ProjectionPreview.tsx`, route `projection`) | **Calendar** (`Calendar.tsx`, route `calendar`) | The external projection. |

The route id `calendar` still exists and now means a different screen. The
operator reads "Calendar" as Google Calendar, so the word now goes with the
projection; the plan for the day is "Today". Today's heading still reads
"Compact Calendar", which is the name of what it renders.

The two files were renamed, not rewritten. Apart from the exported component
name and the small label above each heading, their contents are as they were.

## GitHub onboarding is a Setup card, not a prerequisite

The app used to open on Onboarding, which asked for a GitHub personal access
token and a repository before offering anything. It no longer does. Nothing
on Today, Next Task, Tasks, Priorities or Calendar requires a token, a
repository or a seeded workspace, and opening the app makes no request about
GitHub.

Setup holds three cards:

- **Orchestrator** shows the base URL the app resolved and what `/health`
  answered there. If nothing answers, it says which address was called.
- **Desktop session** takes the GitHub token and sends it to the orchestrator
  over loopback. The field is cleared after every submit. The token is not
  stored or logged by the UI.
- **GitHub** is the old onboarding sequence: choose the repository, seed the
  workspace, and read what the import admitted.

Setup owns the session and repository state. `App.tsx` holds neither. Once
Setup has been opened it stays mounted while other screens are shown, so the
state survives navigation. It does not survive closing the app.

## Screens that are still missing

These are later tickets. None of them is in the navigation, so the operator
is not shown an empty screen.

| Screen | State |
|---|---|
| Routines | Authoring has been possible over HTTP since P1B-38. There is no screen. |
| Review | The advisory queue has four routes and no surface. Nothing produces candidates yet. |
| Reports | The stub was deleted in P1B-40. |
| Log review | The stub was deleted in P1B-40. |

`PlanInspector.tsx` was deleted with the Reports and Log review stubs. All
three were placeholders reachable from nothing. They are in `git` history at
`7046687`.

## Limits

1. **Calendar still drives the generic `/projection/*` routes**, which
   project managed labels to GitHub. It does not yet drive the
   `/projection/calendar/*` chain from P1B-29 to P1B-35. The screen was
   renamed only; the rewire is its own ticket. Until then the label says
   Calendar and the form asks for an owner, a repository and labels.
2. **Calendar no longer receives the repository chosen in Setup.** `App.tsx`
   gave up that state, so the form starts from its defaults and the operator
   types the repository.
3. **Preferences are between two Tasks only.** Objective pairs are listed
   when imported and cannot be authored.
