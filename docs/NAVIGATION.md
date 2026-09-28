# Navigation

The app opens on **Today**. `App.tsx` holds eight flat route IDs, in this order:

| id | Label | Component | Purpose |
|---|---|---|---|
| `today` | Today | `src/routes/Today.tsx` | The internal Compact Calendar, plan generation and recalculation. |
| `next-task` | Next Task | `src/routes/NextAction.tsx` | Choose work and record complete, override or snooze. |
| `tasks` | Tasks | `src/routes/Tasks.tsx` | Capture, list and edit Tasks. |
| `priorities` | Priorities | `src/routes/Priorities.tsx` | Create, enable, disable and delete Preferences; explain refusals. |
| `routines` | Routines | `src/routes/Routines.tsx` | List routines with their streaks, create and edit them, override single dates; explain refusals. |
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

Setup contains five cards: Orchestrator, Desktop session, Google Calendar session,
Colours, and GitHub. Colours shows the effective category palette and its origin,
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

**Routines** sits after Priorities and before Calendar, from P1B-43. Priorities
and Routines are the two screens that shape the Plan, and they come before the
screens that project it. See [Routines](ROUTINES.md).

Review has no screen yet. Quick UbU import remains available only
over HTTP and is not part of the calendar bootstrap plan. Reports and Log review
remain absent. Preferences can be authored between Tasks only; imported Objective
pairs can still be listed.
