import type { SettingsResponse, SubjectReferenceCounts } from "../api/client";

export const GOVERNED_SUBJECTS = ["operator", "project", "github", "affect", "relationship"] as const;
export const SUBJECT_PREFIX = "universe.subject.";
export const ROOT_RULE = "Choose a singular noun naming an entity or domain, never an instance, an attribute, a provenance or source, or a reverse-DNS authority prefix.";
const RESERVED = ["facts", "numeric_values", "set_memberships", "event_markers", "affect"];
export function rootRefusal(root: string, subjects: string[]): string | null {
  if (RESERVED.includes(root)) return `Subject \`${root}\` is reserved and cannot be minted.`;
  if (GOVERNED_SUBJECTS.some((name) => name === root)) return `Subject \`${root}\` is governed and cannot be minted or retired.`;
  if (root.length > 64 || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(root)) return "A subject must be lowercase ASCII snake_case, start with a letter, contain no dots, and be at most 64 characters.";
  if (subjects.includes(root)) return `Subject \`${root}\` is already provisional; choose it from the subject list.`;
  return null;
}
export function effectiveSubjects(settings: SettingsResponse["settings"]): string[] {
  return Array.from(new Set<string>([...GOVERNED_SUBJECTS, ...settings.flatMap((setting) => {
    if (!setting.name.startsWith(SUBJECT_PREFIX) || setting.value !== true) return [];
    const root = setting.name.slice(SUBJECT_PREFIX.length);
    return rootRefusal(root, []) === null ? [root] : [];
  })])).sort();
}
export function provisionalSubjects(settings: SettingsResponse["settings"]): Array<{
  root: string; version: number; mintedAt: string | null; references: SubjectReferenceCounts | null;
}> {
  return settings.flatMap((setting) => {
    if (!setting.name.startsWith(SUBJECT_PREFIX) || setting.value !== true) return [];
    const root = setting.name.slice(SUBJECT_PREFIX.length);
    if (rootRefusal(root, []) !== null) return [];
    const metadata = setting.subject_metadata;
    const counts = metadata?.references;
    const references = counts && [counts.universe_state_keys, counts.fact_provenance_keys, counts.task_precondition_targets]
      .every((count) => Number.isSafeInteger(count) && count >= 0) ? counts : null;
    return [{ root, version: setting.version, mintedAt: metadata?.minted_at ?? null, references }];
  }).sort((a, b) => a.root.localeCompare(b.root));
}
export function retirementRefusal(counts: SubjectReferenceCounts | null): string | null {
  if (!counts) return "Reference counts are unavailable. Refresh Subjects before retirement.";
  if (counts.universe_state_keys || counts.fact_provenance_keys || counts.task_precondition_targets) {
    return "References exist. Clear removable references first; retirement never cascades. Append-only event markers have no clearing operation.";
  }
  return null;
}
export type TargetDraft = { subject: string; predicate: string; value: string };
export const EMPTY_TARGET: TargetDraft = { subject: "", predicate: "", value: "" };
export function targetKey(draft: TargetDraft): string {
  return `${draft.subject}.${draft.predicate.trim()}`;
}
export function draftFor(key: string, value: string, subjects: string[]): TargetDraft {
  const [subject, ...segments] = key.split(".");
  return subjects.includes(subject) && subject !== "affect" && segments.length > 0
    ? { subject, predicate: segments.join("."), value }
    : { subject: "", predicate: key, value };
}

export function SubjectFields({ name, collection, draft, subjects, busy, onChange }: {
  name: string; collection: string; draft: TargetDraft; subjects: string[]; busy: boolean; onChange: (draft: TargetDraft) => void;
}) {
  return <>
    <label>{name} subject<select value={draft.subject} disabled={busy} onChange={(event) => onChange({ ...draft, subject: event.target.value })}>
      <option value="">Choose a subject</option>
      {subjects.map((root) => <option key={root} value={root} disabled={root === "affect"}>{root === "affect" ? "affect — reserved for intrinsic affect" : root}</option>)}
    </select></label>
    <label>{name} predicate<input type="text" value={draft.predicate} disabled={busy} onChange={(event) => onChange({ ...draft, predicate: event.target.value })} /></label>
    <p className="muted">Name what is recorded about that subject, in lowercase snake_case. If it concerns an entity, put its path before the predicate, such as <code>issue.14.pipeline_state</code>.</p>
    <p aria-label={`${name} target`}>Target: <code>{`${collection}.${targetKey(draft)}`}</code></p>
  </>;
}
