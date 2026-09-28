import { FormEvent, useEffect, useState } from "react";

import {
  orchestratorClient,
  OrchestratorError,
  type BootstrapDiagnostic,
  type ObjectiveEditFields,
  type ObjectiveSummary,
  type RoutineObjective,
  type RoutineOverrideResponse,
  type RoutineSummary
} from "../api/client";
import { DiagnosticsList } from "../components/DiagnosticsList";
import {
  draftFromRoutine,
  draftProblem,
  emptyRoutineDraft,
  recurrenceFromDraft,
  recurrenceInWords,
  RoutineFields,
  templateFromDraft,
  type RoutineDraft
} from "../components/RoutineFields";
import { StatusBadge } from "../components/StatusBadge";

// P1B-38's judgment call 7, stated beside every save.
const NEXT_MATERIALIZE =
  "A template change applies at the next materialize. Occurrences already created, including today's, keep the template they were created with.";

const CONFLICT_MESSAGE =
  "This routine changed since the list was loaded, so your edit was not saved. The list has been reloaded; your edit is kept here so you can review it and save again.";

const REJECTION_TITLES: Record<string, string> = {
  objective_routine_overlap: "Routine overlap",
  objective_routine_fields_incomplete: "Routine fields incomplete",
  objective_routine_requires_evergreen: "A routine must be evergreen"
};

type Row = {
  summary: ObjectiveSummary;
  definition: RoutineObjective;
  // Absent when the routine is not live: GET /routines lists live routines only.
  streak: RoutineSummary | undefined;
};

type Editing = {
  objectiveId: string;
  // The version the list returned; the edit is conditional on it.
  version: number;
  stored: RoutineObjective;
  original: RoutineDraft;
};

type OverlapSide = { id: string; title: string; window: string };

type Refusal = {
  code: string;
  title: string;
  message: string;
  overlap: { own: OverlapSide; other: OverlapSide | null; firstDate: string; extent: string } | null;
};

type Rejection = { summary: string; refusals: Refusal[] };

type OverrideDraft = { localDate: string; start: string; end: string };

const SIDE = "routine `([^`]+)` \\((.*?)\\) (\\d{2}:\\d{2}:\\d{2}-\\d{2}:\\d{2}:\\d{2})";
const OVERLAP = new RegExp(`${SIDE} would overlap ${SIDE}, first on (\\d{4}-\\d{2}-\\d{2}) \\((.*)\\)$`);
const SELF_OVERLAP = new RegExp(`${SIDE} would run into its own next occurrence, first on (\\d{4}-\\d{2}-\\d{2}) \\((.*)\\)$`);

// The orchestrator's message is always shown as written. When it has the shape
// P1B-39 gave it, the routines and the date are also set out one by one.
function readOverlap(message: string): Refusal["overlap"] {
  const pair = message.match(OVERLAP);
  if (pair) {
    return {
      own: { id: pair[1], title: pair[2], window: pair[3] },
      other: { id: pair[4], title: pair[5], window: pair[6] },
      firstDate: pair[7],
      extent: pair[8]
    };
  }
  const own = message.match(SELF_OVERLAP);
  if (own) {
    return { own: { id: own[1], title: own[2], window: own[3] }, other: null, firstDate: own[4], extent: own[5] };
  }
  return null;
}

function readRejection(error: OrchestratorError): Rejection | null {
  const refusals = error.diagnostics
    .filter((diagnostic) => diagnostic.code in REJECTION_TITLES)
    .map((diagnostic) => ({
      code: diagnostic.code,
      title: REJECTION_TITLES[diagnostic.code],
      message: diagnostic.message,
      overlap: diagnostic.code === "objective_routine_overlap" ? readOverlap(diagnostic.message) : null
    }));
  return refusals.length > 0 ? { summary: error.message, refusals } : null;
}

// Times are entered in this computer's time zone; the orchestrator stores the instant.
function instant(localDate: string, time: string): string {
  return new Date(`${localDate}T${time}:00`).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function sameDraft(a: RoutineDraft, b: RoutineDraft, keys: Array<keyof RoutineDraft>): boolean {
  return keys.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

const RECURRENCE_KEYS: Array<keyof RoutineDraft> = ["timezone", "ruleKind", "weekdays", "monthDays"];
const TEMPLATE_KEYS: Array<keyof RoutineDraft> = [
  "occurrenceTitle",
  "minutes",
  "nominalStart",
  "placement",
  "occupiesCapacity",
  "category",
  "tags",
  "reminders",
  "earliest",
  "latest"
];

function editFields({ stored, original }: Editing, draft: RoutineDraft): ObjectiveEditFields {
  const fields: ObjectiveEditFields = {};
  if (draft.title.trim() !== original.title) {
    fields.title = draft.title.trim();
  }
  if (draft.description.trim() !== original.description) {
    fields.description = draft.description.trim() || null;
  }
  if (draft.status !== original.status) {
    fields.status = draft.status;
  }
  if (!sameDraft(draft, original, RECURRENCE_KEYS)) {
    fields.recurrence = recurrenceFromDraft(draft, stored.recurrence);
  }
  if (!sameDraft(draft, original, TEMPLATE_KEYS)) {
    fields.routine_instance_template = templateFromDraft(draft, stored.routine_instance_template);
  }
  return fields;
}

function ReadOnlyJson({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value === undefined || value === null ? "None" : <code>{JSON.stringify(value)}</code>}</dd>
    </div>
  );
}

export function Routines() {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState<RoutineDraft>(emptyRoutineDraft);
  const [submitting, setSubmitting] = useState<"save" | "override" | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [conflict, setConflict] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);
  const [overrideDraft, setOverrideDraft] = useState<OverrideDraft>({ localDate: "", start: "", end: "" });
  const [overrideResult, setOverrideResult] = useState<RoutineOverrideResponse | null>(null);

  function reportFailure(error: unknown, fallback: string) {
    if (error instanceof OrchestratorError) {
      const refused = readRejection(error);
      if (refused) {
        setRejection(refused);
        return;
      }
      setDiagnostics(error.diagnostics);
      setFormError(error.message);
    } else {
      setFormError(fallback);
    }
  }

  function clearMessages() {
    setRejection(null);
    setConflict("");
    setNotice("");
    setFormError("");
    setDiagnostics([]);
    setOverrideResult(null);
  }

  async function load(): Promise<Row[] | null> {
    setLoadState("loading");
    try {
      const [objectives, streaks, settings] = await Promise.all([
        orchestratorClient.listObjectives(),
        orchestratorClient.listRoutines(),
        orchestratorClient.listSettings()
      ]);
      const routines = objectives.data.objectives.filter((objective) => objective.is_routine);
      const definitions = await Promise.all(routines.map((routine) => orchestratorClient.getObjective(routine.objective_id)));
      const loaded = routines.map((summary, index) => ({
        // The read is the later of the two, so its version is the one an edit must name.
        summary: { ...summary, version: definitions[index].data.version },
        definition: definitions[index].data.payload,
        streak: streaks.data.routines.find((streak) => streak.objective_id === summary.objective_id)
      }));
      setRows(loaded);
      setCategories(settings.data.palette.map((entry) => entry.category));
      setLoadState("ready");
      return loaded;
    } catch (error) {
      reportFailure(error, "Could not load routines from the local orchestrator.");
      setLoadState("failed");
      return null;
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startCreate() {
    clearMessages();
    setEditing(null);
    setDraft(emptyRoutineDraft());
  }

  function startEdit(row: Row) {
    clearMessages();
    const original = draftFromRoutine(row.definition);
    setEditing({ objectiveId: row.summary.objective_id, version: row.summary.version, stored: row.definition, original });
    setDraft(original);
    setOverrideDraft({ localDate: "", start: "", end: "" });
  }

  // After a write elsewhere the draft stays; only what it is compared with moves on.
  async function refreshEditing(objectiveId: string) {
    const loaded = await load();
    const current = loaded?.find((row) => row.summary.objective_id === objectiveId);
    if (current) {
      setEditing({
        objectiveId,
        version: current.summary.version,
        stored: current.definition,
        original: draftFromRoutine(current.definition)
      });
    }
  }

  async function submitRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    const problem = draftProblem(draft, editing?.stored.routine_instance_template);
    if (problem) {
      setFormError(problem);
      return;
    }

    setSubmitting("save");
    try {
      if (!editing) {
        const description = draft.description.trim();
        await orchestratorClient.createRoutine({
          title: draft.title.trim(),
          ...(description ? { description } : {}),
          recurrence: recurrenceFromDraft(draft),
          routine_instance_template: templateFromDraft(draft)
        });
        setDraft(emptyRoutineDraft());
        await load();
        return;
      }
      const fields = editFields(editing, draft);
      if (Object.keys(fields).length === 0) {
        setFormError("Nothing was changed.");
        return;
      }
      const response = await orchestratorClient.editObjective({
        objectiveId: editing.objectiveId,
        expectedVersion: editing.version,
        fields
      });
      await refreshEditing(editing.objectiveId);
      setNotice(response.data.notice ?? "Saved.");
    } catch (error) {
      if (editing && error instanceof OrchestratorError && error.status === 409) {
        setConflict(CONFLICT_MESSAGE);
        await refreshEditing(editing.objectiveId);
      } else {
        reportFailure(error, "Could not save the routine through the local orchestrator.");
      }
    } finally {
      setSubmitting(null);
    }
  }

  async function submitOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) {
      return;
    }
    clearMessages();
    const { localDate, start, end } = overrideDraft;
    if (!localDate || !start || !end) {
      setFormError("Enter the date, the start and the end of the override.");
      return;
    }
    if (start >= end) {
      setFormError("The override must end after it starts.");
      return;
    }

    setSubmitting("override");
    try {
      const response = await orchestratorClient.overrideRoutineOccurrence({
        objectiveId: editing.objectiveId,
        localDate,
        start: instant(localDate, start),
        end: instant(localDate, end)
      });
      // An override is stored on the routine and advances its version.
      await refreshEditing(editing.objectiveId);
      setOverrideResult(response.data);
    } catch (error) {
      reportFailure(error, "Could not override the occurrence through the local orchestrator.");
    } finally {
      setSubmitting(null);
    }
  }

  function renderRow({ summary, definition, streak }: Row) {
    const recurrence = definition.recurrence;
    const template = definition.routine_instance_template;
    const last = streak?.last_occurrence;

    return (
      <div className="plan-item" role="listitem" key={summary.objective_id}>
        <div>
          <strong>{summary.title}</strong>
          <p>{recurrence && template ? recurrenceInWords(recurrence, template) : "No recurrence is stored for this routine."}</p>
          {streak ? (
            <dl className="task-meta">
              <div>
                <dt>Current streak</dt>
                <dd>{streak.current_streak}</dd>
              </div>
              <div>
                <dt>Done</dt>
                <dd>{streak.done}</dd>
              </div>
              <div>
                <dt>Skipped</dt>
                <dd>{streak.skipped}</dd>
              </div>
              <div>
                <dt>Missed</dt>
                <dd>{streak.missed}</dd>
              </div>
              <div>
                <dt>Pending</dt>
                <dd>{streak.pending}</dd>
              </div>
              <div>
                <dt>Last occurrence</dt>
                <dd>{last ? `${last.local_date}, ${last.outcome}` : "None yet"}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">No streak: this routine is not live, so no occurrences are counted for it.</p>
          )}
        </div>
        <StatusBadge label={summary.status} tone={summary.status === "abandoned" ? "warning" : "neutral"} />
        <button
          type="button"
          className="secondary-action"
          aria-label={`Edit ${summary.title}`}
          disabled={submitting !== null}
          onClick={() => startEdit({ summary, definition, streak })}
        >
          Edit
        </button>
      </div>
    );
  }

  const storedTemplate = editing?.stored.routine_instance_template;
  const overrides = editing?.stored.recurrence?.overrides ?? [];

  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Routines</div>
        <h1>Routines</h1>
        <p className="muted">
          A routine is an evergreen Objective with a recurrence and a template. What it is and whether it is happening are
          shown together.
        </p>
      </div>
      <div className="settings-panel">
        <div className="title-row">
          <h2>Routines</h2>
          <StatusBadge label={`${rows.length} defined`} />
        </div>
        {loadState === "loading" && <p className="muted">Loading routines...</p>}
        {loadState === "failed" && (
          <button type="button" className="secondary-action fit" onClick={() => void load()}>
            Retry
          </button>
        )}
        {loadState === "ready" && rows.length === 0 && <p className="muted">No routines defined.</p>}
        <div className="plan-list" role="list">
          {rows.map(renderRow)}
        </div>
      </div>
      <div className="settings-panel">
        <div className="title-row">
          <h2>{editing ? `Edit ${editing.original.title}` : "Create a routine"}</h2>
          {editing && (
            <button type="button" className="secondary-action" disabled={submitting !== null} onClick={startCreate}>
              Create another instead
            </button>
          )}
        </div>
        <form className="bootstrap-form" aria-label={editing ? "Edit the routine" : "Create a routine"} onSubmit={submitRoutine}>
          <RoutineFields draft={draft} categories={categories} editing={editing !== null} onChange={setDraft} />
          <h3>Effects and preconditions</h3>
          <dl className="task-meta">
            <ReadOnlyJson label="Effects" value={storedTemplate?.effects} />
            <ReadOnlyJson label="Preconditions" value={storedTemplate?.preconditions} />
          </dl>
          <p className="muted">Read-only here. They are kept as stored when the template is saved.</p>
          <div className="actions-row">
            <button type="submit" className="primary-action" disabled={submitting !== null}>
              {submitting === "save" ? "Saving" : editing ? "Save routine" : "Create routine"}
            </button>
            <span className="muted">{NEXT_MATERIALIZE}</span>
          </div>
        </form>
      </div>
      {rejection && (
        <div className="diagnostics-list" role="alert">
          <div className="diagnostic-item">
            <strong>Nothing was written</strong>
            <span>{rejection.summary}</span>
          </div>
          {rejection.refusals.map((refusal, index) => (
            <div className="diagnostic-item" key={`${refusal.code}:${index}`}>
              <strong>
                {refusal.title} (<code>{refusal.code}</code>)
              </strong>
              <span>{refusal.message}</span>
              {refusal.overlap && (
                <dl className="task-meta">
                  <div>
                    <dt>This routine</dt>
                    <dd>
                      {refusal.overlap.own.title}, {refusal.overlap.own.window} (<code>{refusal.overlap.own.id}</code>)
                    </dd>
                  </div>
                  <div>
                    <dt>Conflicts with</dt>
                    <dd>
                      {refusal.overlap.other ? (
                        <>
                          {refusal.overlap.other.title}, {refusal.overlap.other.window} (<code>{refusal.overlap.other.id}</code>)
                        </>
                      ) : (
                        "Its own next occurrence"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>First colliding date</dt>
                    <dd>{refusal.overlap.firstDate}</dd>
                  </div>
                  <div>
                    <dt>Extent</dt>
                    <dd>{refusal.overlap.extent}</dd>
                  </div>
                </dl>
              )}
            </div>
          ))}
        </div>
      )}
      {conflict && (
        <div className="diagnostics-list" role="alert">
          <div className="diagnostic-item">
            <strong>Routine changed</strong>
            <span>{conflict}</span>
          </div>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {formError && <span className="error-text">{formError}</span>}
      <DiagnosticsList diagnostics={diagnostics} />
      {editing && (
        <div className="settings-panel">
          <h2>Override one date</h2>
          <p className="muted">
            Moves one occurrence of {editing.original.title} without changing the routine. Times are in this computer's time
            zone.
          </p>
          <form className="bootstrap-form" aria-label="Override one date" onSubmit={submitOverride}>
            <label htmlFor="override-date">Occurrence date</label>
            <input
              id="override-date"
              type="date"
              value={overrideDraft.localDate}
              onChange={(event) => setOverrideDraft({ ...overrideDraft, localDate: event.target.value })}
            />
            <label htmlFor="override-start">Override start</label>
            <input
              id="override-start"
              type="time"
              value={overrideDraft.start}
              onChange={(event) => setOverrideDraft({ ...overrideDraft, start: event.target.value })}
            />
            <label htmlFor="override-end">Override end</label>
            <input
              id="override-end"
              type="time"
              value={overrideDraft.end}
              onChange={(event) => setOverrideDraft({ ...overrideDraft, end: event.target.value })}
            />
            <button type="submit" className="primary-action fit" disabled={submitting !== null}>
              {submitting === "override" ? "Overriding" : "Override this date"}
            </button>
          </form>
          {overrideResult && (
            <div role="status">
              <StatusBadge
                label={overrideResult.overridden ? "overridden" : "not overridden"}
                tone={overrideResult.overridden ? "success" : "warning"}
              />
              <span>
                {" "}
                {overrideResult.local_date} for <code>{overrideResult.objective_id}</code>
              </span>
              <DiagnosticsList diagnostics={overrideResult.diagnostics} />
            </div>
          )}
          {overrides.length > 0 && (
            <>
              <h3>Overrides stored on this routine</h3>
              <ul>
                {overrides.map((override) => (
                  <li key={override.local_date}>
                    {override.local_date}: {override.start} to {override.end}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
