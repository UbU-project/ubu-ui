import type {
  ObjectiveStatus,
  RecurrenceRule,
  RoutineObjective,
  RoutinePlacement,
  RoutineRecurrence,
  RoutineTemplate,
  RoutineWeekday
} from "../api/client";
import { durationFromMinutes } from "./TaskFields";

export type RuleKind = RecurrenceRule["kind"];

export type RoutineDraft = {
  title: string;
  description: string;
  status: ObjectiveStatus;
  timezone: string;
  ruleKind: RuleKind;
  weekdays: RoutineWeekday[];
  monthDays: number[];
  // Blank means the occurrence is titled as the routine is.
  occurrenceTitle: string;
  minutes: string;
  nominalStart: string;
  placement: RoutinePlacement;
  occupiesCapacity: boolean;
  category: string;
  tags: string;
  reminders: string;
  earliest: string;
  latest: string;
};

export const WEEKDAYS: Array<{ value: RoutineWeekday; label: string }> = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" }
];

// The five kinds the importer emits and the materializer understands.
export const RULE_KINDS: Array<{ value: RuleKind; label: string }> = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week, on chosen weekdays" },
  { value: "monthly_day", label: "Every month, on chosen days" },
  { value: "first_workday_of_month", label: "First workday of every month" },
  { value: "first_workday_of_quarter", label: "First workday of every quarter" }
];

export const STATUSES: ObjectiveStatus[] = ["open", "active", "satisfied", "abandoned"];

const MONTH_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function emptyRoutineDraft(): RoutineDraft {
  return {
    title: "",
    description: "",
    status: "active",
    timezone: localTimezone(),
    ruleKind: "daily",
    weekdays: [],
    monthDays: [],
    occurrenceTitle: "",
    minutes: "",
    nominalStart: "",
    placement: "static",
    occupiesCapacity: true,
    category: "",
    tags: "",
    reminders: "",
    earliest: "",
    latest: ""
  };
}

// The orchestrator stores HH:MM:SS; a time input gives HH:MM.
function toLocalTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

function fromLocalTime(value: string | undefined): string {
  return value ? value.slice(0, 5) : "";
}

function list(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) {
    return `${day}th`;
  }
  return `${day}${["th", "st", "nd", "rd"][day % 10] ?? "th"}`;
}

function sentence(items: string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function ruleInWords(rule: RecurrenceRule): string {
  switch (rule.kind) {
    case "daily":
      return "Every day";
    case "weekly":
      return `Every week on ${sentence(
        WEEKDAYS.filter((day) => rule.weekdays.includes(day.value)).map((day) => day.label)
      )}`;
    case "monthly_day":
      return `Every month on the ${sentence([...rule.days].sort((a, b) => a - b).map(ordinal))}`;
    case "first_workday_of_month":
      return "First workday of every month";
    case "first_workday_of_quarter":
      return "First workday of every quarter";
  }
}

export function recurrenceInWords(recurrence: RoutineRecurrence, template: RoutineTemplate): string {
  const range = template.allowed_local_range;
  const when =
    template.placement === "planned" && range
      ? `between ${fromLocalTime(range.earliest)} and ${fromLocalTime(range.latest)}`
      : `at ${fromLocalTime(template.nominal_start)}`;
  return `${ruleInWords(recurrence.rule)}, ${when} (${recurrence.timezone})`;
}

export function draftFromRoutine(routine: RoutineObjective): RoutineDraft {
  const recurrence = routine.recurrence;
  const template = routine.routine_instance_template;
  const rule = recurrence?.rule;
  const estimate = template?.duration_estimate;
  return {
    ...emptyRoutineDraft(),
    title: routine.title,
    description: routine.description ?? "",
    status: routine.status,
    timezone: recurrence?.timezone ?? localTimezone(),
    ruleKind: rule?.kind ?? "daily",
    weekdays: rule?.kind === "weekly" ? rule.weekdays : [],
    monthDays: rule?.kind === "monthly_day" ? rule.days : [],
    occurrenceTitle: template?.title ?? "",
    // A distribution has no single figure; blank leaves it as stored.
    minutes: estimate?.type === "fixed" && estimate.seconds % 60 === 0 ? String(estimate.seconds / 60) : "",
    nominalStart: fromLocalTime(template?.nominal_start),
    placement: template?.placement ?? "static",
    occupiesCapacity: template?.occupies_capacity ?? true,
    category: template?.category_tag ?? "",
    tags: (template?.tags ?? []).filter((tag) => tag !== template?.category_tag).join(", "),
    reminders: (template?.reminder_minutes ?? []).join(", "),
    earliest: fromLocalTime(template?.allowed_local_range?.earliest),
    latest: fromLocalTime(template?.allowed_local_range?.latest)
  };
}

export function reminderMinutes(value: string): number[] | null {
  const minutes = list(value).map(Number);
  return minutes.every((minute) => Number.isInteger(minute) && minute >= 0) ? minutes : null;
}

// What the form cannot send; the orchestrator's own rejections cover the rest.
export function draftProblem(draft: RoutineDraft, stored?: RoutineTemplate): string | null {
  if (!draft.title.trim()) {
    return "Enter a title for the routine.";
  }
  if (!draft.timezone.trim()) {
    return "Enter the timezone the routine is scheduled in.";
  }
  if (draft.ruleKind === "weekly" && draft.weekdays.length === 0) {
    return "Choose at least one weekday.";
  }
  if (draft.ruleKind === "monthly_day" && draft.monthDays.length === 0) {
    return "Choose at least one day of the month.";
  }
  if (!durationFromMinutes(draft.minutes) && !(stored && !draft.minutes.trim())) {
    return "Enter the duration as a whole number of minutes.";
  }
  if (!draft.nominalStart) {
    return "Enter the nominal start time.";
  }
  if (reminderMinutes(draft.reminders) === null) {
    return "Enter reminders as whole minutes, separated by commas.";
  }
  if (draft.placement === "planned" && (!draft.earliest || !draft.latest || draft.earliest >= draft.latest)) {
    return "A Dynamic routine needs an allowed range whose earliest time is before its latest.";
  }
  return null;
}

export function ruleFromDraft(draft: RoutineDraft): RecurrenceRule {
  switch (draft.ruleKind) {
    case "weekly":
      return { kind: "weekly", weekdays: WEEKDAYS.map((day) => day.value).filter((day) => draft.weekdays.includes(day)) };
    case "monthly_day":
      return { kind: "monthly_day", days: [...draft.monthDays].sort((a, b) => a - b) };
    default:
      return { kind: draft.ruleKind };
  }
}

// Everything the form does not show is carried over from what is stored:
// the enabled range, exdates and per-date overrides.
export function recurrenceFromDraft(draft: RoutineDraft, stored?: RoutineRecurrence): RoutineRecurrence {
  const { schedule_version: _counter, ...kept } = stored ?? { timezone: "", rule: { kind: "daily" } };
  return { ...kept, timezone: draft.timezone.trim(), rule: ruleFromDraft(draft) };
}

// `after`, `effects` and `preconditions` are not editable here and are sent back
// as stored, because the orchestrator replaces the whole template.
export function templateFromDraft(draft: RoutineDraft, stored?: RoutineTemplate): RoutineTemplate {
  const {
    template_version: _counter,
    category_tag: _category,
    allowed_local_range: _range,
    ...kept
  } = stored ?? ({} as Partial<RoutineTemplate>);
  const category = draft.category;
  const tags = list(draft.tags);
  const template: RoutineTemplate = {
    ...kept,
    title: draft.occurrenceTitle.trim() || draft.title.trim(),
    duration_estimate: durationFromMinutes(draft.minutes) ?? (stored as RoutineTemplate).duration_estimate,
    nominal_start: toLocalTime(draft.nominalStart),
    placement: draft.placement,
    occupies_capacity: draft.occupiesCapacity,
    // The category is always one of the tags, as the importer writes it.
    tags: category && !tags.includes(category) ? [category, ...tags] : tags,
    reminder_minutes: reminderMinutes(draft.reminders) ?? []
  };
  if (category) {
    template.category_tag = category;
  }
  if (draft.placement === "planned") {
    template.allowed_local_range = { earliest: toLocalTime(draft.earliest), latest: toLocalTime(draft.latest) };
  }
  return template;
}

type RoutineFieldsProps = {
  draft: RoutineDraft;
  // The palette's categories, from GET /settings.
  categories: string[];
  editing: boolean;
  onChange: (draft: RoutineDraft) => void;
};

function toggled<T>(items: T[], item: T): T[] {
  return items.includes(item) ? items.filter((candidate) => candidate !== item) : [...items, item];
}

export function RoutineFields({ draft, categories, editing, onChange }: RoutineFieldsProps) {
  // A stored category the palette no longer lists is kept selectable, and said to have no colour.
  const orphan = draft.category && !categories.includes(draft.category) ? draft.category : null;

  return (
    <>
      <label htmlFor="routine-title">Title</label>
      <input
        id="routine-title"
        autoComplete="off"
        type="text"
        value={draft.title}
        onChange={(event) => onChange({ ...draft, title: event.target.value })}
      />
      <label htmlFor="routine-description">Description</label>
      <input
        id="routine-description"
        autoComplete="off"
        type="text"
        value={draft.description}
        onChange={(event) => onChange({ ...draft, description: event.target.value })}
        placeholder="Optional"
      />
      {editing && (
        <>
          <label htmlFor="routine-status">Status</label>
          <select
            id="routine-status"
            value={draft.status}
            onChange={(event) => onChange({ ...draft, status: event.target.value as ObjectiveStatus })}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </>
      )}
      <label htmlFor="routine-mode">Mode</label>
      <input id="routine-mode" type="text" value="evergreen" readOnly />
      <p className="muted">
        Priority is not offered: the orchestrator refuses a routine that carries one. A routine is withdrawn by setting its
        status to abandoned; it cannot be deleted.
      </p>

      <h3>Recurrence</h3>
      <label htmlFor="routine-timezone">Timezone</label>
      <input
        id="routine-timezone"
        autoComplete="off"
        spellCheck={false}
        type="text"
        value={draft.timezone}
        onChange={(event) => onChange({ ...draft, timezone: event.target.value })}
      />
      <label htmlFor="routine-rule">Repeats</label>
      <select id="routine-rule" value={draft.ruleKind} onChange={(event) => onChange({ ...draft, ruleKind: event.target.value as RuleKind })}>
        {RULE_KINDS.map((kind) => (
          <option key={kind.value} value={kind.value}>
            {kind.label}
          </option>
        ))}
      </select>
      {draft.ruleKind === "weekly" && (
        <fieldset>
          <legend>Weekdays</legend>
          {WEEKDAYS.map((day) => (
            <label className="checkbox-row" key={day.value}>
              <input
                type="checkbox"
                checked={draft.weekdays.includes(day.value)}
                onChange={() => onChange({ ...draft, weekdays: toggled(draft.weekdays, day.value) })}
              />
              {day.label}
            </label>
          ))}
        </fieldset>
      )}
      {draft.ruleKind === "monthly_day" && (
        <fieldset>
          <legend>Days of the month</legend>
          {MONTH_DAYS.map((day) => (
            <label className="checkbox-row" key={day}>
              <input
                type="checkbox"
                aria-label={`Day ${day}`}
                checked={draft.monthDays.includes(day)}
                onChange={() => onChange({ ...draft, monthDays: toggled(draft.monthDays, day) })}
              />
              {day}
            </label>
          ))}
        </fieldset>
      )}

      <h3>Template</h3>
      <label htmlFor="routine-occurrence-title">Occurrence title</label>
      <input
        id="routine-occurrence-title"
        autoComplete="off"
        type="text"
        value={draft.occurrenceTitle}
        onChange={(event) => onChange({ ...draft, occurrenceTitle: event.target.value })}
        placeholder="Same as the title"
      />
      <label htmlFor="routine-minutes">Duration (minutes)</label>
      <input
        id="routine-minutes"
        autoComplete="off"
        inputMode="numeric"
        type="text"
        value={draft.minutes}
        onChange={(event) => onChange({ ...draft, minutes: event.target.value })}
      />
      <label htmlFor="routine-start">Nominal start</label>
      <input
        id="routine-start"
        type="time"
        value={draft.nominalStart}
        onChange={(event) => onChange({ ...draft, nominalStart: event.target.value })}
      />
      <label htmlFor="routine-placement">Placement</label>
      <select
        id="routine-placement"
        value={draft.placement}
        onChange={(event) => onChange({ ...draft, placement: event.target.value as RoutinePlacement })}
      >
        <option value="static">Static: at the nominal start</option>
        <option value="planned">Dynamic: placed by the planner within a range</option>
      </select>
      {draft.placement === "planned" && (
        <>
          <label htmlFor="routine-earliest">Allowed range, earliest</label>
          <input
            id="routine-earliest"
            type="time"
            value={draft.earliest}
            onChange={(event) => onChange({ ...draft, earliest: event.target.value })}
          />
          <label htmlFor="routine-latest">Allowed range, latest</label>
          <input
            id="routine-latest"
            type="time"
            value={draft.latest}
            onChange={(event) => onChange({ ...draft, latest: event.target.value })}
          />
        </>
      )}
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={draft.occupiesCapacity}
          onChange={(event) => onChange({ ...draft, occupiesCapacity: event.target.checked })}
        />
        Occupies capacity
      </label>
      <label htmlFor="routine-category">Category</label>
      <select id="routine-category" value={draft.category} onChange={(event) => onChange({ ...draft, category: event.target.value })}>
        <option value="">No category</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
        {orphan && <option value={orphan}>{orphan} (not in the palette, no colour)</option>}
      </select>
      <label htmlFor="routine-tags">Tags</label>
      <input
        id="routine-tags"
        autoComplete="off"
        type="text"
        value={draft.tags}
        onChange={(event) => onChange({ ...draft, tags: event.target.value })}
        placeholder="Optional, separated by commas"
      />
      <label htmlFor="routine-reminders">Reminder minutes</label>
      <input
        id="routine-reminders"
        autoComplete="off"
        type="text"
        value={draft.reminders}
        onChange={(event) => onChange({ ...draft, reminders: event.target.value })}
        placeholder="Optional, such as 10, 0"
      />
    </>
  );
}
