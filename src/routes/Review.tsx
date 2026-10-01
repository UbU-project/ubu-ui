import { useEffect, useState } from "react";
import { isClarification, orchestratorClient, OrchestratorError, type AdvisoryCandidate, type AdvisoryQueueResponse, type AdvisoryRunResponse, type BootstrapDiagnostic, type TaskPlacement, type TaskSummary } from "../api/client";
import { ClarificationCard } from "../components/ClarificationCard";
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
// The orchestrator exports a colour for a Static placement only. On a Dynamic
// event a colour means done, so a category must not produce one.
const NO_COLOUR =
  "This Task is Dynamic, so admitting the category will not produce a calendar colour: a colour on a Dynamic event means done.";
function isCategoryProposal(candidate: AdvisoryCandidate) {
  return candidate.candidate_kind === "tag" && candidate.normalized_proposal.operation === "set_category";
}
// The three failures have three different remedies: the model name, the budget, and the flag or the model choice.
function remedy({ code, message }: BootstrapDiagnostic): string | null {
  switch (code) {
    case "advisory_http_failed":
      return "What to change: the model name. Check advisory.model in Setup, and that the model has been pulled into your local server.";
    case "advisory_timeout":
      return "What to change: the budget. Raise advisory.timeout_ms in Setup.";
    case "advisory_empty_response":
      return message.includes("thinking_present: true")
        ? "What to change: the model. It thought and did not answer. Set advisory.model in Setup to a model that honours think: false, or to a non-reasoning model."
        : "What to change: the model. It returned nothing at all. Run again, or set advisory.model in Setup to another model.";
    case "advisory_connection_failed":
      return "What to change: the server or the endpoint. Start the local model server, or correct advisory.endpoint in Setup.";
    default:
      return null;
  }
}
// None of these is a failure: each is the interview saying where it stands.
// The orchestrator's message states the condition; what is added is the remedy.
// The same code means two things. On a later round the interview is finished. On round one nothing has
// been asked yet, so "nothing to ask" is the model declining, and reading it as "the feature works,
// nothing to test" is the mistake this split exists to prevent.
function declinedOnRoundOne({ code }: BootstrapDiagnostic, round: number | null | undefined): boolean {
  return code === "clarify_no_questions" && round === 1;
}
function clarifyNote({ code, message }: BootstrapDiagnostic, round?: number | null): string | null {
  switch (code) {
    case "clarify_already_queued":
      return "That Task already has questions waiting in the queue below. Answer, defer or reject them first. No model was asked.";
    case "clarify_no_task":
      // Four conditions share the code; the remedy follows the condition the orchestrator named.
      if (message.startsWith("There is no active Task")) return "Capture a Task in Tasks first. Clarify interviews an active Task, and there is none.";
      if (message.startsWith("Every active Task already has a description")) return "Choose a Task in the selector above to interview it again. On its default, Clarify only takes a Task with no description.";
      if (message.includes("is an occurrence of a routine")) return "Choose another Task, or set the description on the routine's template in Routines. An occurrence is rebuilt from its template, so answers written to it would not last.";
      return "Choose an active Task in the selector above. That one is not active, or no longer exists.";
    case "clarify_no_questions":
      if (round === 1) return "This is round one, so nothing has been asked yet: this is a result from the model, not a finished interview. The model declined to ask anything about a Task it knows nothing about. What to change: the model. Set advisory.model in Setup to another model, then run Clarify again.";
      if (typeof round === "number" && round > 1) return `The interview is finished: on round ${round} the model has nothing further to ask. The Task's notes hold what was asked and answered. Nothing was enqueued and the Task is unchanged.`;
      // An orchestrator that does not report the round: say only what is known.
      return "The model has nothing further to ask about this Task. Nothing was enqueued and the Task is unchanged.";
    default:
      return null;
  }
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
  // Placement by Task id, for the active Tasks; null when it could not be read.
  const [placements, setPlacements] = useState<Record<string, TaskPlacement> | null>(null);
  // The same read gives Clarify its choices, so the operator never copies a Task id.
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  // Only a list that was read says anything about what there is to interview.
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [clarifyTask, setClarifyTask] = useState("");
  const [clarifyResult, setClarifyResult] = useState<AdvisoryRunResponse | null>(null);
  const [saved, setSaved] = useState("");

  async function load() {
    setQueue((await orchestratorClient.advisoryQueue()).data);
    // The queue is what matters; a placement that cannot be read is said to be unavailable.
    try {
      const tasks = (await orchestratorClient.listTasks("active")).data.tasks;
      setPlacements(Object.fromEntries(tasks.map((task) => [task.task_id, task.placement])));
      setTasks(tasks);
      setTasksLoaded(true);
    } catch { setPlacements(null); setTasks([]); setTasksLoaded(false); }
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setDiagnostics([]); setSaved("");
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
  function rejection(candidate: AdvisoryCandidate) {
    return <div role="group" aria-label="Confirm rejection">
      <p>Rejection is durable. This same proposal will not return on another run; a different proposal for the Task can still arrive.</p>
      <label>Reason<input value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="actions-row">
        <button type="button" className="primary-action" disabled={busy || !reason.trim()} onClick={() => decide(candidate, "reject")}>Confirm reject</button>
        <button type="button" className="secondary-action" disabled={busy} onClick={() => setConfirming(null)}>Keep for review</button>
      </div>
    </div>;
  }
  function renderCandidate(candidate: AdvisoryCandidate) {
    const id = candidate.advisory_candidate_id;
    const deferred = candidate.lifecycle_state === "deferred";
    if (isClarification(candidate)) {
      const title = queue?.target_titles[candidate.target_refs[0]?.id] ?? "Title unavailable";
      return <div key={id}>
        <ClarificationCard candidate={candidate} title={title} busy={busy} age={age(candidate.proposed_at)}
          onAnswer={(answers) => void run(async () => {
            await orchestratorClient.answerAdvisory(id, candidate.version, answers);
            await load();
            setSaved(`Your answers were saved to the description of ${title}.`);
          })}
          onDefer={() => decide(candidate, "defer")} onResurface={() => decide(candidate, "resurface")}
          onReject={() => { setConfirming(id); setReason("Not useful"); }} />
        {confirming === id && rejection(candidate)}
      </div>;
    }
    return <article className="settings-panel" key={id} aria-label={`Proposal ${id}`}>
      <h3>{candidate.candidate_kind} proposal</h3>
      {candidate.target_refs.map((target) => <p key={target.id}>Target: <strong>{queue?.target_titles[target.id] ?? "Title unavailable"}</strong> — <code>{target.id}</code></p>)}
      {proposal(candidate)}
      {candidate.candidate_kind === "tag" && candidate.target_refs.map((target) => {
        const placement = placements?.[target.id];
        return <div key={target.id}>
          <p>Placement: <strong>{placement === "static" ? "Static" : placement === "planned" ? "Dynamic" : "unavailable"}</strong></p>
          {placement === "planned" && isCategoryProposal(candidate) && <p>{NO_COLOUR}</p>}
        </div>;
      })}
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
      {confirming === id && rejection(candidate)}
    </article>;
  }
  const runDiagnostics = result?.diagnostics ?? [];
  const remedies = runDiagnostics.map(remedy).filter((text): text is string => text !== null);
  // Every remedy is a Setting, so Setup is offered with it.
  const needsSetup = remedies.length > 0 || [...diagnostics, ...runDiagnostics].some(({ code }) => code === "advisory_unconfigured" || code === "advisory_endpoint_invalid");
  // A clarify run goes through the same remedies. What is not a failure is kept apart from what is.
  const clarifyDiagnostics = clarifyResult?.diagnostics ?? [];
  const clarifyRound = clarifyResult?.round;
  const clarifyNotes = clarifyDiagnostics.filter((diagnostic) => clarifyNote(diagnostic) !== null);
  const clarifyFailures = clarifyDiagnostics.filter((diagnostic) => clarifyNote(diagnostic) === null);
  const clarifyRemedies = clarifyFailures.map(remedy).filter((text): text is string => text !== null);
  // A model that declines on round one is not a failure, and its remedy is still a Setting, so Setup is offered.
  const clarifyNeedsSetup = clarifyRemedies.length > 0 || clarifyFailures.some(({ code }) => code === "advisory_unconfigured" || code === "advisory_endpoint_invalid")
    || clarifyNotes.some((diagnostic) => declinedOnRoundOne(diagnostic, clarifyRound));
  const interviewable = tasks.filter((task) => !task.is_routine_occurrence);
  // A run that cannot succeed is not offered: with no active, non-occurrence Task there is nothing to interview.
  const nothingToInterview = tasksLoaded && interviewable.length === 0;
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
        {runDiagnostics.some(({ code }) => code === "suggest_tags_occurrence_skipped") && <p>A skipped routine occurrence is not a failure. An occurrence is rebuilt from its routine's template, so a category set on it would not last. Set the category on the template, in Routines.</p>}
        {remedies.map((text) => <p key={text}>{text}</p>)}
      </div>}
      {needsSetup && <button type="button" className="secondary-action" onClick={onOpenSetup}>Open Setup</button>}
    </section>
    <section className="settings-panel" aria-labelledby="clarify-heading">
      <h2 id="clarify-heading">Clarify</h2>
      <p>Interview one active Task, to turn a short capture into something plannable. That Task's ID, title, category, tags and description are sent to your configured local model, and nowhere else. The description includes the answers you have already given. Runs are manual.</p>
      <form className="actions-row" onSubmit={(event) => {
        event.preventDefault();
        void run(async () => { setClarifyResult(null); setClarifyResult((await orchestratorClient.runClarify(clarifyTask || undefined)).data); await load(); });
      }}>
        <label>Task to interview<select value={clarifyTask} disabled={busy || nothingToInterview} onChange={(event) => setClarifyTask(event.target.value)}>
          {nothingToInterview ? <option value="" disabled>No Tasks to interview</option> : <option value="">The first Task without a description</option>}
          {interviewable.map((task) => <option key={task.task_id} value={task.task_id}>{task.title}</option>)}
        </select></label>
        <button type="submit" className="primary-action" disabled={busy || nothingToInterview}>Run Clarify</button>
      </form>
      {nothingToInterview && <p>There is no active Task to interview. Capture a Task in Tasks first.</p>}
      {clarifyResult && <div role="region" aria-label="Clarify run result">
        <p>Run status: {clarifyResult.status}</p><p>Candidates enqueued: {clarifyResult.candidates_enqueued}</p>
        <h3>Selected Task</h3>
        {clarifyResult.selected.length ? <ul>{clarifyResult.selected.map((task) => <li key={task.id}>{task.title} — <code>{task.id}</code></li>)}</ul> : <p>No Task selected.</p>}
        {clarifyResult.candidates_enqueued > 0 && <p>Its questions are in the queue below.</p>}
        {clarifyNotes.map((diagnostic) => <div role="status" key={diagnostic.code}><p>{diagnostic.message}</p><p>{clarifyNote(diagnostic, clarifyRound)}</p><p className="muted"><code>{diagnostic.code}</code></p></div>)}
        <DiagnosticsList diagnostics={clarifyFailures} />
        {clarifyRemedies.map((text) => <p key={text}>{text}</p>)}
      </div>}
      {clarifyNeedsSetup && <button type="button" className="secondary-action" onClick={onOpenSetup}>Open Setup</button>}
    </section>
    {saved && <p role="status">{saved}</p>}
    <section aria-labelledby="review-queue-heading">
      <h2 id="review-queue-heading">Decision queue</h2>
      <button type="button" className="secondary-action fit" disabled={busy} onClick={() => void run(load)}>Reload queue</button>
      {!queue && busy && <p role="status">Loading proposals...</p>}
      {queue && queue.candidates.length === 0 && <p>No proposals awaiting review. Run SuggestTags or Clarify to request proposals; nothing is admitted automatically.</p>}
      {queue?.candidates.map(({ candidate }) => renderCandidate(candidate))}
      {queue && queue.deferred_candidates.length > 0 && <><h2>Deferred proposals</h2><p>Resurface a proposal when you are ready to review it.</p>{queue.deferred_candidates.map(({ candidate }) => renderCandidate(candidate))}</>}
    </section>
  </section>;
}
