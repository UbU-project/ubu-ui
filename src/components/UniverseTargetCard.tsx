import { useState } from "react";
import type { UniverseTargetCandidate } from "../api/client";

type Props = {
  candidate: UniverseTargetCandidate; title: string; busy: boolean; age: string;
  onAdmit: (value: unknown) => void; onDefer: () => void;
  onResurface: () => void; onReject: () => void;
};

// Text is a scalar too. JSON spelling allows explicit false, zero, null and
// quoted text; arrays and objects belong to the manual UniverseState editor.
function scalar(raw: string): { valid: boolean; value?: unknown } {
  if (!raw.trim()) return { valid: false };
  try {
    const value: unknown = JSON.parse(raw);
    return { valid: value === null || typeof value !== "object", value };
  } catch { return { valid: true, value: raw }; }
}

export function UniverseTargetCard({ candidate, title, busy, age, onAdmit, onDefer, onResurface, onReject }: Props) {
  const [raw, setRaw] = useState("");
  const number = candidate.normalized_proposal.target.startsWith("numeric_values.");
  const parsed = number
    ? { valid: raw.trim() !== "" && Number.isFinite(Number(raw)), value: Number(raw) }
    : scalar(raw);
  const deferred = candidate.lifecycle_state === "deferred";
  return <article className="settings-panel" aria-label={`Target-name proposal ${candidate.advisory_candidate_id}`}>
    <h3>Record a target name</h3>
    <p>Suggested target: <code>{candidate.normalized_proposal.target}</code></p>
    <p>Prompted by Task: <strong>{title}</strong> — <code>{candidate.target_refs[0]?.id}</code></p>
    <p>UbU suggested the name; the value is yours.</p>
    <label>{number ? "Number value" : "Fact value"}<input type={number ? "number" : "text"} step={number ? "any" : undefined} value={raw} disabled={busy || deferred} onChange={(event) => setRaw(event.target.value)} /></label>
    <p>{number ? "Enter the number you assert." : "Enter text, a number, true, false or null. Quote text to keep its JSON spelling."}</p>
    {raw.trim() && !parsed.valid && <p role="status">{number ? "Enter a finite number." : "Enter a single value; arrays and objects belong in UniverseState."}</p>}
    <p>Proposing actor: {candidate.proposing_actor.model_or_tool_name} ({candidate.proposing_actor.version})</p>
    <p>Age: <time dateTime={candidate.proposed_at}>{age}</time>. State: {candidate.lifecycle_state}.</p>
    <p>Evidence refs: {candidate.evidence_refs.length ? candidate.evidence_refs.join(", ") : "None supplied"}</p>
    <div className="actions-row">
      {deferred ? <button type="button" className="secondary-action" disabled={busy} onClick={onResurface}>Resurface</button> : <>
        <button type="button" className="primary-action" disabled={busy || !parsed.valid} onClick={() => { if (parsed.valid) onAdmit(parsed.value); }}>Admit</button>
        <button type="button" className="secondary-action" disabled={busy} onClick={onDefer}>Defer</button>
      </>}
      <button type="button" className="secondary-action" disabled={busy} onClick={onReject}>Reject</button>
    </div>
  </article>;
}
