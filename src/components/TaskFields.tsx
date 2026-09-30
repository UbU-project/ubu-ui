import type { TaskDurationEstimate, TaskStaticWindow, TaskSummary } from "../api/client";

export type TaskDraft = {
  title: string;
  // Kept byte for byte: it is the operator's own words, and Clarify's Q:/A: narrative.
  description: string;
  minutes: string;
  category: string;
  dueDate: string;
  // Local date and time, as a datetime-local input holds them. Both blank means no fixed window.
  windowStart: string;
  windowEnd: string;
};

export const emptyDraft: TaskDraft = { title: "", description: "", minutes: "", category: "", dueDate: "", windowStart: "", windowEnd: "" };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

// A due date is the end of that local day; the orchestrator stores the instant.
export function dueAtFromDate(date: string): string {
  return new Date(`${date}T23:59:59`).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function dateFromDueAt(dueAt: string | undefined): string {
  if (!dueAt) {
    return "";
  }
  const value = new Date(dueAt);
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

// The orchestrator stores the instant; the field shows this computer's local time.
export function localFromInstant(instant: string | undefined): string {
  if (!instant) {
    return "";
  }
  const value = new Date(instant);
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function instantFromLocal(local: string): string | null {
  const value = new Date(local);
  return Number.isNaN(value.getTime()) ? null : value.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function hasWindow(draft: TaskDraft): boolean {
  return draft.windowStart !== "" || draft.windowEnd !== "";
}

// What is wrong with the fixed window as entered, or null.
export function windowProblem(draft: TaskDraft): string | null {
  if (!hasWindow(draft)) {
    return null;
  }
  const start = instantFromLocal(draft.windowStart);
  const end = instantFromLocal(draft.windowEnd);
  if (!start || !end) {
    return "Enter both the start and the end of the fixed window, or clear both.";
  }
  if (end <= start) {
    return "The fixed window must end after it starts.";
  }
  return null;
}

export function windowFromDraft(draft: TaskDraft): TaskStaticWindow | null {
  const start = instantFromLocal(draft.windowStart);
  const end = instantFromLocal(draft.windowEnd);
  return hasWindow(draft) && start && end ? { start, end } : null;
}

export function durationFromMinutes(minutes: string): TaskDurationEstimate | null {
  const value = Number(minutes);
  if (!minutes.trim() || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return { type: "fixed", seconds: value * 60 };
}

export function isValidMinutes(minutes: string): boolean {
  return !minutes.trim() || durationFromMinutes(minutes) !== null;
}

function minutesLabel(seconds: number) {
  return `${Math.round(seconds / 60)} min`;
}

export function durationLabel(estimate: TaskDurationEstimate | undefined): string {
  if (!estimate) {
    return "No estimate";
  }
  if (estimate.type === "fixed") {
    return minutesLabel(estimate.seconds);
  }
  return `about ${minutesLabel(estimate.mode_seconds)}, up to ${minutesLabel(estimate.p95_seconds)}`;
}

export function draftFromTask(task: TaskSummary, window?: TaskStaticWindow, description?: string): TaskDraft {
  const estimate = task.duration_estimate;
  return {
    windowStart: localFromInstant(window?.start),
    windowEnd: localFromInstant(window?.end),
    title: task.title,
    description: description ?? "",
    // A distribution has no single figure; blank leaves it as stored.
    minutes: estimate?.type === "fixed" && estimate.seconds % 60 === 0 ? String(estimate.seconds / 60) : "",
    category: task.category_tag ?? "",
    dueDate: dateFromDueAt(task.due_at)
  };
}

type TaskFieldsProps = {
  idPrefix: string;
  labelPrefix?: string;
  draft: TaskDraft;
  onChange: (draft: TaskDraft) => void;
};

export function TaskFields({ idPrefix, labelPrefix = "", draft, onChange }: TaskFieldsProps) {
  const label = (text: string) => (labelPrefix ? `${labelPrefix} ${text.toLowerCase()}` : text);

  return (
    <>
      <label htmlFor={`${idPrefix}-title`}>{label("Title")}</label>
      <input
        id={`${idPrefix}-title`}
        autoComplete="off"
        type="text"
        value={draft.title}
        onChange={(event) => onChange({ ...draft, title: event.target.value })}
      />
      <label htmlFor={`${idPrefix}-notes`}>{label("Notes")}</label>
      <textarea
        id={`${idPrefix}-notes`}
        value={draft.description}
        // Enough to read a few interview rounds, and one more row than there are lines, so it grows.
        rows={Math.max(8, draft.description.split("\n").length + 1)}
        onChange={(event) => onChange({ ...draft, description: event.target.value })}
        placeholder="Optional. Clarify writes its questions and your answers here, as Q: and A: lines."
      />
      <label htmlFor={`${idPrefix}-minutes`}>{label("Duration (minutes)")}</label>
      <input
        id={`${idPrefix}-minutes`}
        autoComplete="off"
        inputMode="numeric"
        type="text"
        value={draft.minutes}
        onChange={(event) => onChange({ ...draft, minutes: event.target.value })}
        placeholder="Optional"
      />
      <label htmlFor={`${idPrefix}-category`}>{label("Category")}</label>
      <input
        id={`${idPrefix}-category`}
        autoComplete="off"
        type="text"
        value={draft.category}
        onChange={(event) => onChange({ ...draft, category: event.target.value })}
        placeholder="Optional"
      />
      <label htmlFor={`${idPrefix}-due`}>{label("Due date")}</label>
      <input
        id={`${idPrefix}-due`}
        type="date"
        value={draft.dueDate}
        onChange={(event) => onChange({ ...draft, dueDate: event.target.value })}
      />
      <label htmlFor={`${idPrefix}-window-start`}>{label("Fixed window start")}</label>
      <input
        id={`${idPrefix}-window-start`}
        type="datetime-local"
        value={draft.windowStart}
        onChange={(event) => onChange({ ...draft, windowStart: event.target.value })}
      />
      <label htmlFor={`${idPrefix}-window-end`}>{label("Fixed window end")}</label>
      <input
        id={`${idPrefix}-window-end`}
        type="datetime-local"
        value={draft.windowEnd}
        onChange={(event) => onChange({ ...draft, windowEnd: event.target.value })}
      />
      <p className="muted">
        A fixed window pins the Task to that time, so it plans as Static. Leave both blank for a Task the planner places. Times
        are in this computer's time zone.
      </p>
      {hasWindow(draft) && (
        <button type="button" className="secondary-action fit" onClick={() => onChange({ ...draft, windowStart: "", windowEnd: "" })}>
          {labelPrefix ? "Clear the fixed window" : "Clear fixed window"}
        </button>
      )}
    </>
  );
}
