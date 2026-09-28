import type { TaskDurationEstimate, TaskSummary } from "../api/client";

export type TaskDraft = {
  title: string;
  minutes: string;
  category: string;
  dueDate: string;
};

export const emptyDraft: TaskDraft = { title: "", minutes: "", category: "", dueDate: "" };

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

export function draftFromTask(task: TaskSummary): TaskDraft {
  const estimate = task.duration_estimate;
  return {
    title: task.title,
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
    </>
  );
}
