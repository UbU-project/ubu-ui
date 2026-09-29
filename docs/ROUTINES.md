# Routines

The Routines screen lists every routine, creates and edits them, and overrides
single dates. It is `src/routes/Routines.tsx`, route id `routines`, after
Priorities and before Calendar.

## A routine is an evergreen Objective

Per `UBU-D0286`, a routine is an Objective whose `mode` is `evergreen` and
which carries a `recurrence` and a `routine_instance_template`. It is not an
object kind of its own. The screen therefore reads and writes routines through
the Objective routes:

| Route | Used for |
|---|---|
| `GET /objectives` | Which Objectives are routines, with status and version. |
| `GET /objective/:objective_id` | The definition: recurrence and template. |
| `POST /objective` | Create. |
| `PATCH /objective/:objective_id` | Edit, conditional on the version. |
| `GET /routines` | Streaks and counts. |
| `PUT /routine/:objective_id/override/:local_date` | Override one date. |

The list joins the two reads, because the question is always both: what is
this routine, and is it happening. `GET /routines` lists live routines only,
so an abandoned routine shows its definition and no streak.

`mode` is shown and cannot be changed. The orchestrator refuses a routine that
is not evergreen.

**A routine carries no priority.** The orchestrator refuses one with
`routine Objective must not carry priority`, so the form does not offer it.

## Why routines must be authored by hand

The operator bootstraps from the Google Calendar and does not import Quick
UbU. A calendar event carries no recurrence rule that survives capture. A
weekly routine on the calendar is N separate events, and it is captured as N
one-off Static Tasks. Nothing recognises that those Tasks are one routine.

So every routine must be created here. The form is a single form, not a
sequence of steps, because a dozen are created in one sitting.

## The five recurrence kinds

These are the kinds the importer emits and the materializer understands. The
form offers no other.

| Kind | Sent as | Produces an occurrence |
|---|---|---|
| Every day | `{"kind":"daily"}` | On every local date. |
| Every week | `{"kind":"weekly","weekdays":["mon","thu"]}` | On each chosen weekday. At least one is required. |
| Every month | `{"kind":"monthly_day","days":[1,15]}` | On each chosen day of the month. At least one is required. |
| First workday of the month | `{"kind":"first_workday_of_month"}` | Once a month, on its first workday. |
| First workday of the quarter | `{"kind":"first_workday_of_quarter"}` | Once a quarter, on its first workday. |

Dates are local dates in the recurrence's timezone. The timezone field starts
as this computer's timezone.

## The template

Each occurrence is a Task made from the template.

| Field | Editable | Notes |
|---|---|---|
| Occurrence title | yes | Blank means the routine's title. |
| Duration | yes | Whole minutes. |
| Nominal start | yes | A local time of day. |
| Placement | yes | Static runs at the nominal start. Dynamic is placed by the planner. |
| Allowed range | yes | Dynamic only, and required for it. The orchestrator refuses a range on a Static routine. |
| Occupies capacity | yes | |
| Category | yes | **Chosen from the palette** read from `GET /settings`, not typed. A category no colour maps to would give events that never carry a colour. The category is always sent as one of the tags. |
| Tags | yes | |
| Reminder minutes | yes | |
| Effects | **read-only** | |
| Preconditions | **read-only** | |

`effects` and `preconditions` are shown as stored and cannot be edited. They
are what Quick UbU called `establishes` and `requires`. A wrong edit changes
planning in ways this screen cannot yet explain, so authoring them is a later
ticket.

The orchestrator replaces the whole template on an edit. The screen therefore
sends back what it does not show exactly as stored: `effects`,
`preconditions` and `after`. The same holds for the recurrence: the enabled
range, excluded dates and stored overrides are sent back unchanged.

## A template edit applies at the next materialize

This sentence is beside the save button at all times:

> A template change applies at the next materialize. Occurrences already
> created, including today's, keep the template they were created with.

After a save that changed the template, the orchestrator's own notice is shown
as well.

An edit is conditional on the version the list returned. If the routine
changed in the meantime the orchestrator answers 409, the list reloads, and
the operator's edit is kept on screen to review and save again.

## Overlap is refused at write time

Two Static routines must not overlap. The orchestrator checks a write against
every live routine over the next year, and refuses with
`objective_routine_overlap`. Nothing is written. Dynamic routines are placed
by the planner and are not checked this way.

The refusal is shown in full:

- the orchestrator's summary, which says how many overlaps there are and what
  to do: stagger the start time, shorten the routine, or set
  `occupies_capacity` to false;
- for each overlap, the orchestrator's message as written;
- and, set out beneath it, **this routine**, the routine it **conflicts
  with**, the **first colliding date**, and how many dates are affected in the
  next year.

A routine can also overlap itself, when one occurrence runs into the next.
That is shown the same way, with "Its own next occurrence" as the conflict.

`objective_routine_fields_incomplete` and
`objective_routine_requires_evergreen` are shown in the same place, each under
its own heading. The form always sends both routine fields and always sends
`evergreen`, so neither is expected.

The operator's entries are kept after a refusal.

## Overriding one date

Open a routine with Edit. Below the form, "Override one date" takes the
occurrence's date, a start and an end. It moves that one occurrence and does
not change the routine. The answer shows `overridden` and any diagnostics, and
the overrides stored on the routine are listed.

Each override stored on the routine is listed with a **Clear** button. Clearing
sends `DELETE` to the same dated path; the occurrence returns to the routine's
nominal time and the routine is otherwise unchanged.

The date must be one the routine occurs on. Otherwise the orchestrator refuses
with `routine_override_no_occurrence`.

**Times are entered in this computer's timezone**, not the routine's. When
the two differ, enter the time as this computer would show it.

## Routines are abandoned, not deleted

Objectives cannot be deleted. A routine is withdrawn by setting its status to
`abandoned`. It stays in the list with its definition, and stops producing
occurrences and streaks.

## Limits

1. `effects` and `preconditions` are read-only.
2. Only five recurrence kinds.
3. Routines cannot be deleted, only abandoned.
4. A template edit does not reach today's occurrence.
5. Cleared in P1B-47: each stored override has a Clear button, which calls the
   orchestrator's `DELETE` on the same path. The occurrence returns to the
   routine's nominal time.
6. The enabled range and excluded dates of a recurrence are kept and not
   editable.
7. Override times are in this computer's timezone.
8. The list makes one read per routine.
