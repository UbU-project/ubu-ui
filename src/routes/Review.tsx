import { useEffect, useState } from "react";
import { orchestratorClient, OrchestratorError, type AdvisoryCandidate, type AdvisoryQueueResponse, type AdvisoryRunResponse, type BootstrapDiagnostic } from "../api/client";
import { DiagnosticsList } from "../components/DiagnosticsList";

function age(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (!Number.isFinite(minutes)) return "Age unavailable";
  if (minutes === 0) return "Just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hours ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}
function proposal(candidate: AdvisoryCandidate) {
  const p = candidate.normalized_proposal;
  if (p.operation === "set_category" && typeof p.category_tag === "string") return <p>Set category to <strong>{p.category_tag}</strong></p>;
  if (p.operation === "add_tag" && typeof p.tag === "string") return <p>Add tag <strong>{p.tag}</strong></p>;
  return <pre>{JSON.stringify(p, null, 2)}</pre>;
}

export function Review({ onOpenSetup }: { onOpenSetup: () => void }) {
  const [queue, setQueue] = useState<AdvisoryQueueResponse | null>(null);
  const [result, setResult] = useState<AdvisoryRunResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);
  const [limit, setLimit] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reason, setReason] = useState("Not useful");

  async function load() { setQueue((await orchestratorClient.advisoryQueue()).data); }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setDiagnostics([]);
    try { await action(); }
    catch (error) {
      if (error instanceof OrchestratorError) {
        setError(error.message); setDiagnostics(error.diagnostics);
      } else setError("Could not reach the local orchestrator for this Review action.");
    } finally { setBusy(false); }
  }
  useEffect(() => { void run(load); }, []);

  function decide(candidate: AdvisoryCandidate, action: "admit" | "reject" | "defer" | "resurface") {
    void run(async () => {
      const id = candidate.advisory_candidate_id; const version = candidate.version;
      if (action === "admit") await orchestratorClient.admitAdvisory(id, version);
      if (action === "reject") await orchestratorClient.rejectAdvisory(id, version, reason.trim());
      if (action === "defer") await orchestratorClient.deferAdvisory(id, version);
      if (action === "resurface") await orchestratorClient.resurfaceAdvisory(id, version);
      setConfirming(null); await load();
    });
  }
  function renderCandidate(candidate: AdvisoryCandidate) {
    const id = candidate.advisory_candidate_id;
    const deferred = candidate.lifecycle_state === "deferred";
    return <article className="settings-panel" key={id} aria-label={`Proposal ${id}`}>
      <h3>{candidate.candidate_kind} proposal</h3>
      {candidate.target_refs.map((target) => <p key={target.id}>Target: <strong>{queue?.target_titles[target.id] ?? "Title unavailable"}</strong> — <code>{target.id}</code></p>)}
      {proposal(candidate)}
      <dl className="task-meta">
        <div><dt>Confidence</dt><dd>{candidate.confidence == null ? "Not supplied" : `${Math.round(candidate.confidence * 100)}%`}</dd></div>
        <div><dt>Proposing actor</dt><dd>{candidate.proposing_actor.model_or_tool_name} ({candidate.proposing_actor.version})</dd></div>
        <div><dt>Age</dt><dd><time dateTime={candidate.proposed_at} title={candidate.proposed_at}>{age(candidate.proposed_at)}</time></dd></div>
        <div><dt>State</dt><dd>{candidate.lifecycle_state}</dd></div>
      </dl>
      <p>Evidence refs: {candidate.evidence_refs.length ? candidate.evidence_refs.join(", ") : "None supplied"}</p>
      <details><summary>Normalized proposal</summary><pre>{JSON.stringify(candidate.normalized_proposal, null, 2)}</pre></details>
      <div className="actions-row">
        {deferred ? <button type="button" className="secondary-action" disabled={busy} onClick={() => decide(candidate, "resurface")}>Resurface</button> : <>
          <button type="button" className="primary-action" disabled={busy} onClick={() => decide(candidate, "admit")}>Admit</button>
          <button type="button" className="secondary-action" disabled={busy} onClick={() => decide(candidate, "defer")}>Defer</button>
        </>}
        <button type="button" className="secondary-action" disabled={busy} onClick={() => { setConfirming(id); setReason("Not useful"); }}>Reject</button>
      </div>
      {confirming === id && <div role="group" aria-label="Confirm rejection">
        <p>Rejection is durable. This same proposal will not return on another run; a different proposal for the Task can still arrive.</p>
        <label>Reason<input value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="actions-row">
          <button type="button" className="primary-action" disabled={busy || !reason.trim()} onClick={() => decide(candidate, "reject")}>Confirm reject</button>
          <button type="button" className="secondary-action" disabled={busy} onClick={() => setConfirming(null)}>Keep for review</button>
        </div>
      </div>}
    </article>;
  }
  const runDiagnostics = result?.diagnostics ?? [];
  const needsSetup = [...diagnostics, ...runDiagnostics].some(({ code }) => code === "advisory_unconfigured" || code === "advisory_endpoint_invalid");
  return <section className="route-stack">
    <div><div className="section-kicker">Review</div><h1>Review</h1><p>Proposals change nothing until you explicitly admit them.</p></div>
    {error && <p className="error-text" role="alert">{error}</p>}
    <DiagnosticsList diagnostics={diagnostics} />
    <section className="settings-panel" aria-labelledby="suggest-tags-heading">
      <h2 id="suggest-tags-heading">SuggestTags</h2>
      <p>Suggest categories for active Tasks without a category. Only their IDs and titles are sent to your configured local model. Runs are manual.</p>
      <form className="actions-row" onSubmit={(event) => {
        event.preventDefault();
        const value = limit.trim() ? Number(limit) : undefined;
        if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 25)) { setError("Limit must be between 1 and 25."); return; }
        void run(async () => { setResult(null); setResult((await orchestratorClient.runAdvisory(value)).data); await load(); });
      }}>
        <label>Task limit (optional)<input type="number" min="1" max="25" step="1" placeholder="5" value={limit} disabled={busy} onChange={(event) => setLimit(event.target.value)} /></label>
        <button type="submit" className="primary-action" disabled={busy}>Run</button>
      </form>
      {result && <div role="region" aria-label="Advisory run result">
        <p>Run status: {result.status}</p><p>Candidates enqueued: {result.candidates_enqueued}</p>
        <h3>Selected Tasks</h3>
        {result.selected.length ? <ul>{result.selected.map((task) => <li key={task.id}>{task.title} — <code>{task.id}</code></li>)}</ul> : <p>No Tasks selected.</p>}
        {result.candidate_ids.length > 0 && <><h3>Created candidates</h3><ul>{result.candidate_ids.map((id) => <li key={id}><code>{id}</code></li>)}</ul></>}
        <DiagnosticsList diagnostics={runDiagnostics} />
      </div>}
      {needsSetup && <button type="button" className="secondary-action" onClick={onOpenSetup}>Open Setup</button>}
    </section>
    <section aria-labelledby="review-queue-heading">
      <h2 id="review-queue-heading">Decision queue</h2>
      <button type="button" className="secondary-action fit" disabled={busy} onClick={() => void run(load)}>Reload queue</button>
      {!queue && busy && <p role="status">Loading proposals...</p>}
      {queue && queue.candidates.length === 0 && <p>No proposals awaiting review. Run SuggestTags to request proposals; nothing is admitted automatically.</p>}
      {queue?.candidates.map(({ candidate }) => renderCandidate(candidate))}
      {queue && queue.deferred_candidates.length > 0 && <><h2>Deferred proposals</h2><p>Resurface a proposal when you are ready to review it.</p>{queue.deferred_candidates.map(({ candidate }) => renderCandidate(candidate))}</>}
    </section>
  </section>;
}
