import { FormEvent, useEffect, useState } from "react";

import {
  orchestratorClient,
  OrchestratorError,
  type BootstrapDiagnostic,
  type CaptureTaskRequest,
  type TaskEditFields,
  type TaskLifecycleStatus,
  type TaskSummary
} from "../api/client";
import { DiagnosticsList } from "../components/DiagnosticsList";
import { StatusBadge } from "../components/StatusBadge";
import {
  dateFromDueAt,
  draftFromTask,
  dueAtFromDate,
  durationFromMinutes,
  durationLabel,
  emptyDraft,
  isValidMinutes,
  TaskFields,
  windowFromDraft,
  windowProblem,
  type TaskDraft
} from "../components/TaskFields";

const STATUSES: TaskLifecycleStatus[] = ["active", "completed", "failed", "moot"];

const CONFLICT_MESSAGE =
  "This Task changed since the list was loaded, so your edit was not saved. The list is reloading; your edit is kept here so you can review it and save again.";

type Editing = {
  taskId: string;
  // The version the list returned; the edit is conditional on it.
  version: number;
  original: TaskDraft;
  draft: TaskDraft;
  tags: string[];
};

type TaskGroup = { containerId: string | null; tasks: TaskSummary[] };

function groupTasks(tasks: TaskSummary[]): TaskGroup[] {
  const groups: TaskGroup[] = [];
  const containers = new Map<string, TaskGroup>();
  for (const task of tasks) {
    if (!task.container_id) {
      groups.push({ containerId: null, tasks: [task] });
      continue;
    }
    let group = containers.get(task.container_id);
    if (!group) {
      group = { containerId: task.container_id, tasks: [] };
      containers.set(task.container_id, group);
      groups.push(group);
    }
    group.tasks.push(task);
  }
  return groups;
}

function editFields({ original, draft, tags }: Editing): TaskEditFields {
  const fields: TaskEditFields = {};
  if (draft.title.trim() !== original.title) {
    fields.title = draft.title.trim();
  }
  if (draft.minutes.trim() !== original.minutes) {
    fields.duration_estimate = durationFromMinutes(draft.minutes);
  }
  const category = draft.category.trim();
  if (category !== original.category) {
    fields.category_tag = category || null;
    // The orchestrator requires the category to be one of the Task's tags.
    if (category && !tags.includes(category)) {
      fields.tags = [...tags, category];
    }
  }
  if (draft.dueDate !== original.dueDate) {
    fields.due_at = draft.dueDate ? dueAtFromDate(draft.dueDate) : null;
  }
  // Compared as entered, to the minute: a stored window with seconds is left alone unless it is edited.
  if (draft.windowStart !== original.windowStart || draft.windowEnd !== original.windowEnd) {
    fields.static_window = windowFromDraft(draft);
  }
  return fields;
}

export function Tasks() {
  const [status, setStatus] = useState<TaskLifecycleStatus>("active");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [capture, setCapture] = useState<TaskDraft>(emptyDraft);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [submitting, setSubmitting] = useState<"capture" | "edit" | null>(null);
  const [formError, setFormError] = useState("");
  const [conflict, setConflict] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);

  function reportFailure(error: unknown, fallback: string) {
    if (error instanceof OrchestratorError) {
      setDiagnostics(error.diagnostics);
      setFormError(error.message);
    } else {
      setFormError(fallback);
    }
  }

  function clearMessages() {
    setFormError("");
    setConflict("");
    setDiagnostics([]);
  }

  async function loadTasks(nextStatus: TaskLifecycleStatus): Promise<TaskSummary[] | null> {
    setLoadState("loading");
    try {
      const response = await orchestratorClient.listTasks(nextStatus);
      setTasks(response.data.tasks);
      setLoadState("ready");
      return response.data.tasks;
    } catch (error) {
      reportFailure(error, "Could not load Tasks from the local orchestrator.");
      setLoadState("failed");
      return null;
    }
  }

  useEffect(() => {
    void loadTasks(status);
  }, [status]);

  function changeStatus(nextStatus: TaskLifecycleStatus) {
    clearMessages();
    setEditing(null);
    setStatus(nextStatus);
  }

  async function submitCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    const title = capture.title.trim();
    if (!title) {
      setFormError("Enter a title for the Task.");
      return;
    }
    if (!isValidMinutes(capture.minutes)) {
      setFormError("Enter the duration as a whole number of minutes.");
      return;
    }
    const captureWindowProblem = windowProblem(capture);
    if (captureWindowProblem) {
      setFormError(captureWindowProblem);
      return;
    }

    const fields: CaptureTaskRequest = { title };
    const window = windowFromDraft(capture);
    if (window) {
      fields.static_window = window;
    }
    const duration = durationFromMinutes(capture.minutes);
    if (duration) {
      fields.duration_estimate = duration;
    }
    const category = capture.category.trim();
    if (category) {
      fields.category_tag = category;
      fields.tags = [category];
    }
    if (capture.dueDate) {
      fields.due_at = dueAtFromDate(capture.dueDate);
    }

    setSubmitting("capture");
    try {
      await orchestratorClient.captureTask(fields);
      setCapture(emptyDraft);
      await loadTasks(status);
    } catch (error) {
      reportFailure(error, "Could not capture the Task through the local orchestrator.");
    } finally {
      setSubmitting(null);
    }
  }

  async function startEdit(task: TaskSummary) {
    clearMessages();
    try {
      const response = await orchestratorClient.getTask(task.task_id);
      const draft = draftFromTask(task, response.data.payload.static_window);
      setEditing({
        taskId: task.task_id,
        version: task.version,
        original: draft,
        draft,
        tags: response.data.payload.tags ?? []
      });
    } catch (error) {
      reportFailure(error, "Could not load the Task from the local orchestrator.");
    }
  }

  // After a conflict the operator's draft stays; only what it is compared with moves on.
  async function reloadAfterConflict(stale: Editing) {
    const reloaded = await loadTasks(status);
    const current = reloaded?.find((task) => task.task_id === stale.taskId);
    if (!current || current.is_routine_occurrence) {
      return;
    }
    let tags = stale.tags;
    let window = windowFromDraft(stale.original) ?? undefined;
    try {
      const payload = (await orchestratorClient.getTask(stale.taskId)).data.payload;
      tags = payload.tags ?? [];
      window = payload.static_window;
    } catch {
      // Keep the tags already loaded; a second conflict would surface the same way.
    }
    setEditing((latest) =>
      latest && latest.taskId === stale.taskId
        ? { ...latest, version: current.version, original: draftFromTask(current, window), tags }
        : latest
    );
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) {
      return;
    }
    clearMessages();
    if (!editing.draft.title.trim()) {
      setFormError("A Task needs a title.");
      return;
    }
    if (!isValidMinutes(editing.draft.minutes)) {
      setFormError("Enter the duration as a whole number of minutes.");
      return;
    }
    const editWindowProblem = windowProblem(editing.draft);
    if (editWindowProblem) {
      setFormError(editWindowProblem);
      return;
    }
    const fields = editFields(editing);
    if (Object.keys(fields).length === 0) {
      setFormError("Nothing was changed.");
      return;
    }

    setSubmitting("edit");
    try {
      await orchestratorClient.editTask({ taskId: editing.taskId, expectedVersion: editing.version, fields });
      setEditing(null);
      await loadTasks(status);
    } catch (error) {
      if (error instanceof OrchestratorError && error.status === 409) {
        setConflict(CONFLICT_MESSAGE);
        await reloadAfterConflict(editing);
      } else {
        reportFailure(error, "Could not save the Task through the local orchestrator.");
      }
    } finally {
      setSubmitting(null);
    }
  }

  function renderTask(task: TaskSummary) {
    const isEditing = editing?.taskId === task.task_id;
    const due = dateFromDueAt(task.due_at);

    return (
      <div className="plan-item" role="listitem" key={task.task_id}>
        <div>
          <strong>{task.title}</strong>
          <dl className="task-meta">
            <div>
              <dt>Duration</dt>
              <dd>{durationLabel(task.duration_estimate)}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{task.category_tag ?? "None"}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd>{due || "No due date"}</dd>
            </div>
            <div>
              <dt>Placement</dt>
              <dd>{task.placement}</dd>
            </div>
          </dl>
          {task.is_routine_occurrence && (
            <p className="muted">Read-only: this is an occurrence of a routine. Change the routine, not the occurrence.</p>
          )}
          {isEditing && editing && (
            <form className="bootstrap-form" aria-label={`Edit ${task.title}`} onSubmit={submitEdit}>
              <TaskFields
                idPrefix={`edit-${task.task_id}`}
                labelPrefix="Edit"
                draft={editing.draft}
                onChange={(draft) => setEditing({ ...editing, draft })}
              />
              <div className="actions-row">
                <button type="submit" className="primary-action" disabled={submitting !== null}>
                  {submitting === "edit" ? "Saving" : "Save"}
                </button>
                <button type="button" className="secondary-action" disabled={submitting !== null} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
        {task.is_routine_occurrence && <StatusBadge label="routine" />}
        {!task.is_routine_occurrence && task.status === "active" && !isEditing && (
          <button
            type="button"
            className="secondary-action"
            aria-label={`Edit ${task.title}`}
            disabled={submitting !== null}
            onClick={() => void startEdit(task)}
          >
            Edit
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Tasks</div>
        <h1>Tasks</h1>
        <p className="muted">Capture a Task, review the backlog, and edit what has not started.</p>
      </div>
      <div className="settings-panel">
        <h2>Capture a Task</h2>
        <form className="bootstrap-form" aria-label="Capture a Task" onSubmit={submitCapture}>
          <TaskFields idPrefix="capture" draft={capture} onChange={setCapture} />
          <button type="submit" className="primary-action fit" disabled={submitting !== null}>
            {submitting === "capture" ? "Capturing" : "Capture Task"}
          </button>
        </form>
      </div>
      {conflict && (
        <div className="diagnostics-list" role="alert">
          <div className="diagnostic-item">
            <strong>Task changed</strong>
            <span>{conflict}</span>
          </div>
        </div>
      )}
      {formError && <span className="error-text">{formError}</span>}
      <DiagnosticsList diagnostics={diagnostics} />
      <div className="settings-panel">
        <div className="title-row">
          <h2>Backlog</h2>
          <StatusBadge label={`${tasks.length} ${status}`} />
        </div>
        <div className="bootstrap-form">
          <label htmlFor="task-status-filter">Status</label>
          <select
            id="task-status-filter"
            value={status}
            onChange={(event) => changeStatus(event.target.value as TaskLifecycleStatus)}
          >
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        {loadState === "loading" && <p className="muted">Loading Tasks...</p>}
        {loadState === "failed" && (
          <button type="button" className="secondary-action fit" onClick={() => void loadTasks(status)}>
            Retry
          </button>
        )}
        {loadState === "ready" && tasks.length === 0 && <p className="muted">No {status} Tasks.</p>}
        <div className="plan-list" role="list">
          {groupTasks(tasks).map((group) =>
            group.containerId ? (
              <div className="report-item" role="group" key={group.containerId} aria-label={`Checklist ${group.containerId}`}>
                <div className="section-kicker">Checklist</div>
                <p className="muted">
                  {group.tasks.length} {group.tasks.length === 1 ? "step" : "steps"} in <code>{group.containerId}</code>
                </p>
                <div className="plan-list" role="list">
                  {group.tasks.map(renderTask)}
                </div>
              </div>
            ) : (
              renderTask(group.tasks[0])
            )
          )}
        </div>
      </div>
    </section>
  );
}
