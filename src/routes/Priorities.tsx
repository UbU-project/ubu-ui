import { FormEvent, useEffect, useState } from "react";

import {
  orchestratorClient,
  OrchestratorError,
  type BootstrapDiagnostic,
  type PreferenceOrder,
  type PreferenceSummary,
  type TaskSummary
} from "../api/client";
import { DiagnosticsList } from "../components/DiagnosticsList";
import { StatusBadge } from "../components/StatusBadge";

const ORDERS: Array<{ value: PreferenceOrder; label: string }> = [
  { value: "a_preferred_to_b", label: "comes before" },
  { value: "a_indifferent_to_b", label: "is level with" }
];

type Draft = {
  taskA: string;
  taskB: string;
  order: PreferenceOrder;
};

const emptyDraft: Draft = { taskA: "", taskB: "", order: "a_preferred_to_b" };

// What the orchestrator said when it refused, and the Preferences it refused because of.
type Rejection = {
  code: string;
  reason: string;
  cycle: string[];
  conflicting: PreferenceSummary[];
};

function subject(title: string | null, id: string | null | undefined): string {
  return title ?? id ?? "unknown";
}

function describe(preference: PreferenceSummary): string {
  const a = subject(preference.task_a_title, preference.task_a ?? preference.objective_a);
  const b = subject(preference.task_b_title, preference.task_b ?? preference.objective_b);
  const order = ORDERS.find((option) => option.value === preference.order)?.label ?? preference.order;
  return `${a} ${order} ${b}`;
}

function acquiredDate(value: string): string {
  return value.slice(0, 10);
}

// The orchestrator names a contradicted or duplicated Preference by id, and a
// cycle by the Tasks on it. Either way the operator is shown Preferences.
function readRejection(error: OrchestratorError, preferences: PreferenceSummary[], exceptId?: string): Rejection | null {
  const diagnostic = error.diagnostics.find((candidate) => candidate.code.startsWith("preference_"));
  if (!diagnostic) {
    return null;
  }
  const named = [...diagnostic.message.matchAll(/`(pref_[^`]+)`/g)].map((match) => match[1]);
  const cycle = diagnostic.code === "preference_cycle_rejected" ? (diagnostic.message.match(/\[([^\]]*)\]/)?.[1].split(" -> ") ?? []) : [];
  const conflicting = preferences.filter(
    (preference) =>
      preference.preference_id !== exceptId &&
      (named.includes(preference.preference_id) ||
        (preference.enabled &&
          preference.task_a !== null &&
          preference.task_b !== null &&
          cycle.includes(preference.task_a) &&
          cycle.includes(preference.task_b)))
  );
  return { code: diagnostic.code, reason: diagnostic.message, cycle, conflicting };
}

export function Priorities() {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [preferences, setPreferences] = useState<PreferenceSummary[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [formError, setFormError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);

  function reportFailure(error: unknown, fallback: string, exceptId?: string) {
    if (error instanceof OrchestratorError) {
      const refused = readRejection(error, preferences, exceptId);
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
    setFormError("");
    setDiagnostics([]);
  }

  async function load() {
    setLoadState("loading");
    try {
      const [listed, active] = await Promise.all([orchestratorClient.listPreferences(), orchestratorClient.listTasks("active")]);
      setPreferences(listed.data.preferences);
      setTasks(active.data.tasks);
      setLoadState("ready");
    } catch (error) {
      reportFailure(error, "Could not load Preferences from the local orchestrator.");
      setLoadState("failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function taskTitle(taskId: string): string {
    const task = tasks.find((candidate) => candidate.task_id === taskId);
    if (task) {
      return task.title;
    }
    const preference = preferences.find((candidate) => candidate.task_a === taskId || candidate.task_b === taskId);
    const title = preference?.task_a === taskId ? preference.task_a_title : preference?.task_b_title;
    return title ?? taskId;
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    if (!draft.taskA || !draft.taskB) {
      setFormError("Choose two Tasks to compare.");
      return;
    }
    if (draft.taskA === draft.taskB) {
      setFormError("Choose two different Tasks.");
      return;
    }

    setSubmitting(true);
    try {
      await orchestratorClient.createPreference(draft);
      setDraft(emptyDraft);
      await load();
    } catch (error) {
      reportFailure(error, "Could not create the Preference through the local orchestrator.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(preference: PreferenceSummary) {
    clearMessages();
    setSubmitting(true);
    try {
      await orchestratorClient.setPreferenceEnabled({
        preferenceId: preference.preference_id,
        expectedVersion: preference.version,
        enabled: !preference.enabled
      });
      await load();
    } catch (error) {
      if (error instanceof OrchestratorError && error.status === 409) {
        setFormError("This Preference changed since the list was loaded, so nothing was saved. The list has been reloaded.");
        await load();
      } else {
        reportFailure(error, "Could not change the Preference through the local orchestrator.", preference.preference_id);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(preference: PreferenceSummary) {
    clearMessages();
    setSubmitting(true);
    try {
      await orchestratorClient.deletePreference(preference.preference_id);
      setConfirmingDelete(null);
      await load();
    } catch (error) {
      reportFailure(error, "Could not delete the Preference through the local orchestrator.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderPreference(preference: PreferenceSummary) {
    const description = describe(preference);
    const confirming = confirmingDelete === preference.preference_id;
    const isTaskPair = preference.task_a !== null && preference.task_b !== null;

    return (
      <div className="plan-item" role="listitem" key={preference.preference_id}>
        <div>
          <strong>{description}</strong>
          <dl className="task-meta">
            <div>
              <dt>First</dt>
              <dd>{subject(preference.task_a_title, preference.task_a ?? preference.objective_a)}</dd>
            </div>
            <div>
              <dt>Order</dt>
              <dd>{preference.order}</dd>
            </div>
            <div>
              <dt>Second</dt>
              <dd>{subject(preference.task_b_title, preference.task_b ?? preference.objective_b)}</dd>
            </div>
            <div>
              <dt>Acquired</dt>
              <dd>{acquiredDate(preference.acquired_date)}</dd>
            </div>
          </dl>
          {!isTaskPair && <p className="muted">An imported Objective pair. Planning does not consume it yet.</p>}
          {confirming && (
            <div className="actions-row" role="group" aria-label={`Confirm deleting ${description}`}>
              <span>Delete this Preference? It is removed, not disabled, and cannot be restored.</span>
              <button type="button" className="primary-action" disabled={submitting} onClick={() => void remove(preference)}>
                Delete Preference
              </button>
              <button type="button" className="secondary-action" disabled={submitting} onClick={() => setConfirmingDelete(null)}>
                Keep
              </button>
            </div>
          )}
        </div>
        <StatusBadge label={preference.enabled ? "enabled" : "disabled"} tone={preference.enabled ? "success" : "neutral"} />
        <div className="actions-row">
          <button
            type="button"
            className="secondary-action"
            aria-label={`${preference.enabled ? "Disable" : "Enable"} ${description}`}
            disabled={submitting}
            onClick={() => void toggle(preference)}
          >
            {preference.enabled ? "Disable" : "Enable"}
          </button>
          {!confirming && (
            <button
              type="button"
              className="secondary-action"
              aria-label={`Delete ${description}`}
              disabled={submitting}
              onClick={() => setConfirmingDelete(preference.preference_id)}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Priorities</div>
        <h1>Priorities</h1>
        <p className="muted">Say which of two Tasks comes first. Only enabled Preferences shape the Plan.</p>
      </div>
      <div className="settings-panel">
        <h2>Add a Preference</h2>
        <form className="bootstrap-form" aria-label="Add a Preference" onSubmit={submitCreate}>
          <label htmlFor="preference-task-a">First Task</label>
          <select id="preference-task-a" value={draft.taskA} onChange={(event) => setDraft({ ...draft, taskA: event.target.value })}>
            <option value="">Choose a Task</option>
            {tasks.map((task) => (
              <option key={task.task_id} value={task.task_id}>
                {task.title}
              </option>
            ))}
          </select>
          <label htmlFor="preference-order">Order</label>
          <select
            id="preference-order"
            value={draft.order}
            onChange={(event) => setDraft({ ...draft, order: event.target.value as PreferenceOrder })}
          >
            {ORDERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor="preference-task-b">Second Task</label>
          <select id="preference-task-b" value={draft.taskB} onChange={(event) => setDraft({ ...draft, taskB: event.target.value })}>
            <option value="">Choose a Task</option>
            {tasks.map((task) => (
              <option key={task.task_id} value={task.task_id}>
                {task.title}
              </option>
            ))}
          </select>
          <button type="submit" className="primary-action fit" disabled={submitting}>
            {submitting ? "Saving" : "Add Preference"}
          </button>
        </form>
      </div>
      {rejection && (
        <div className="diagnostics-list" role="alert">
          <div className="diagnostic-item">
            <strong>{rejection.code}</strong>
            <span>{rejection.reason}</span>
          </div>
          {rejection.cycle.length > 0 && (
            <div className="diagnostic-item">
              <strong>The cycle</strong>
              <span>{rejection.cycle.map(taskTitle).join(" → ")}</span>
            </div>
          )}
          {rejection.conflicting.map((preference) => (
            <div className="diagnostic-item" key={preference.preference_id}>
              <strong>Conflicts with</strong>
              <span>
                {describe(preference)} (<code>{preference.preference_id}</code>)
              </span>
            </div>
          ))}
        </div>
      )}
      {formError && <span className="error-text">{formError}</span>}
      <DiagnosticsList diagnostics={diagnostics} />
      <div className="settings-panel">
        <div className="title-row">
          <h2>Preferences</h2>
          <StatusBadge label={`${preferences.length} stated`} />
        </div>
        {loadState === "loading" && <p className="muted">Loading Preferences...</p>}
        {loadState === "failed" && (
          <button type="button" className="secondary-action fit" onClick={() => void load()}>
            Retry
          </button>
        )}
        {loadState === "ready" && preferences.length === 0 && <p className="muted">No Preferences stated.</p>}
        <div className="plan-list" role="list">
          {preferences.map(renderPreference)}
        </div>
      </div>
    </section>
  );
}
