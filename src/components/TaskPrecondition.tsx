import { useState } from "react";
import { orchestratorClient, OrchestratorError, type BootstrapDiagnostic, type UniverseStateResponse } from "../api/client";
import { DiagnosticsList } from "./DiagnosticsList";
import { PreconditionWords } from "./PreconditionWords";

const COLLECTIONS = ["facts", "numeric_values", "set_memberships", "event_markers"] as const;
const COMPARISONS = ["at_least", "at_most", "greater_than", "less_than"];
const WORDS: Record<string, string> = { equals: "is", absent: "is not recorded", member_of: "contains this member", at_least: "is at least", at_most: "is at most", greater_than: "is greater than", less_than: "is less than" };
export const CLEAR_PRECONDITION = "Removing this requirement allows the Task to be planned when this condition is false.";
export function recordedTargets(world: UniverseStateResponse): string[] {
  return COLLECTIONS.flatMap((collection) => Object.keys(world[collection]).map((key) => `${collection}.${key}`))
    .filter((target) => target.length <= 128 && /^(facts|numeric_values|set_memberships|event_markers)\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/.test(target)).sort();
}
export function offeredPredicates(target: string): string[] {
  const collection = target.split(".")[0];
  return ["equals", "absent", ...(collection === "numeric_values" ? COMPARISONS : collection === "set_memberships" ? ["member_of"] : [])];
}
function scalar(raw: string): { valid: boolean; value?: unknown } {
  if (!raw.trim()) return { valid: false };
  try { const value: unknown = JSON.parse(raw); return { valid: value !== null && ["string", "boolean", "number"].includes(typeof value), value }; }
  catch { return { valid: true, value: raw }; }
}

type Props = { taskId: string; version: number; precondition: unknown; readOnly: boolean; onSaved: () => Promise<void> };
export function TaskPrecondition({ taskId, version, precondition, readOnly, onSaved }: Props) {
  const [targets, setTargets] = useState<string[] | null>(null);
  const [target, setTarget] = useState("");
  const [predicate, setPredicate] = useState("equals");
  const [expected, setExpected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);
  const [notice, setNotice] = useState("");
  const current = (precondition ?? {}) as { all_of?: unknown; any_of?: unknown; target?: unknown; predicate?: unknown; expected?: unknown };
  const tree = Array.isArray(current.all_of) || Array.isArray(current.any_of);
  const numeric = COMPARISONS.includes(predicate) || (predicate === "equals" && target.startsWith("numeric_values."));
  const parsed = numeric ? { valid: expected.trim() !== "" && Number.isFinite(Number(expected)), value: Number(expected) } : scalar(expected);
  const valid = targets?.includes(target) && offeredPredicates(target).includes(predicate) && (predicate === "absent" || parsed.valid);
  function fail(error: unknown) {
    if (error instanceof OrchestratorError) { setError(error.message); setDiagnostics(error.diagnostics); }
    else setError("Could not read or save this Task's precondition through the local orchestrator.");
  }
  async function open() {
    setBusy(true); setError(""); setDiagnostics([]); setNotice("");
    try {
      const names = recordedTargets((await orchestratorClient.readUniverseState()).data);
      setTargets(names);
      const name = typeof current.target === "string" && names.includes(current.target) ? current.target : "";
      const selected = typeof current.predicate === "string" && offeredPredicates(name).includes(current.predicate) ? current.predicate : "equals";
      setTarget(name); setPredicate(selected);
      setExpected(current.expected === undefined ? "" : JSON.stringify(current.expected));
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  }
  async function save(value: unknown) {
    setBusy(true); setError(""); setDiagnostics([]); setNotice("");
    try {
      await orchestratorClient.editTask({ taskId, expectedVersion: version, fields: { preconditions: value } });
      setTargets(null); await onSaved(); setNotice(value === null ? "Precondition cleared." : "Precondition saved.");
    } catch (error) {
      fail(error);
      if (error instanceof OrchestratorError && error.status === 409) await onSaved();
    } finally { setBusy(false); }
  }
  return <section aria-label="Task precondition">
    <h3>Precondition</h3>
    {precondition == null ? <p>This Task has no precondition.</p> : <p>Before this Task can be planned: <PreconditionWords precondition={precondition} />.</p>}
    {error && <p role="alert">{error}</p>}
    <DiagnosticsList diagnostics={diagnostics} />
    {notice && <p role="status">{notice}</p>}
    {!readOnly && <>
      {tree ? <p>This requirement combines conditions. The form writes a single condition; this tree can still be cleared.</p> : <button type="button" className="secondary-action" disabled={busy} onClick={() => void open()}>Write precondition</button>}
      {!tree && targets !== null && <form className="bootstrap-form" aria-label="Write precondition" onSubmit={(event) => {
        event.preventDefault(); if (valid) void save({ target, predicate, ...(predicate === "absent" ? {} : { expected: parsed.value }) });
      }}>
        {targets.length === 0 && <p>No recorded targets are available. Record a fact or number in UniverseState first.</p>}
        <label>Recorded target<select value={target} disabled={busy} onChange={(event) => { const name = event.target.value; setTarget(name); if (!offeredPredicates(name).includes(predicate)) { setPredicate("equals"); setExpected(""); } }}>
          <option value="">Choose a recorded target</option>{targets.map((name) => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <label>Requirement<select value={predicate} disabled={busy || !target} onChange={(event) => { setPredicate(event.target.value); setExpected(""); }}>
          {offeredPredicates(target).map((name) => <option key={name} value={name}>{WORDS[name]}</option>)}
        </select></label>
        {predicate !== "absent" && <><label>Expected value<input type={numeric ? "number" : "text"} step={numeric ? "any" : undefined} value={expected} disabled={busy} onChange={(event) => setExpected(event.target.value)} /></label>
          <p>{numeric ? "Enter a finite number." : "Enter text, a number, true or false. Lists, objects and null are not offered by this form."}</p></>}
        <div className="actions-row"><button type="submit" className="primary-action" disabled={busy || !valid}>Save precondition</button><button type="button" className="secondary-action" disabled={busy} onClick={() => setTargets(null)}>Cancel precondition edit</button></div>
      </form>}
      {precondition != null && <><p>{CLEAR_PRECONDITION}</p><button type="button" className="secondary-action" disabled={busy} onClick={() => void save(null)}>Clear precondition</button></>}
    </>}
  </section>;
}
