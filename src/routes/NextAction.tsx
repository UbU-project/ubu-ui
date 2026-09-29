import { useEffect, useState } from "react";

import {
  orchestratorClient,
  OrchestratorError,
  type ActionDiagnostic,
  type NextActionDiagnostic,
  type NextActionResponse,
  type RecordedTaskActionKind,
  type RecordedTaskActionResponse
} from "../api/client";
import { DiagnosticsList } from "../components/DiagnosticsList";
import { NextTaskCard } from "../components/NextTaskCard";
import { PlanReports } from "../components/PlanReports";
import { StatusBadge } from "../components/StatusBadge";

function BoundedDiagnostic({ diagnostic }: { diagnostic: NextActionDiagnostic }) {
  return (
    <div className="blocked-diagnostic">
      <div className="title-row">
        <h2>No ready Task</h2>
        <StatusBadge label={diagnostic.code} tone="warning" />
      </div>
      <p>{diagnostic.message}</p>
      <div className="summary-grid diagnostic-summary">
        <div>
          <span className="metric">{diagnostic.blocked_task_count}</span>
          <span className="metric-label">Blocked Tasks</span>
        </div>
        <div>
          <span className="metric">{diagnostic.sampled_task_ids.length}</span>
          <span className="metric-label">Sampled IDs</span>
        </div>
      </div>
      {diagnostic.sampled_task_ids.length > 0 && (
        <ul className="source-list">
          {diagnostic.sampled_task_ids.map((taskId) => (
            <li key={taskId}>
              <code>{taskId}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NextAction() {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [nextAction, setNextAction] = useState<NextActionResponse | null>(null);
  const [formError, setFormError] = useState("");
  const [diagnostics, setDiagnostics] = useState<ActionDiagnostic[]>([]);
  const [note, setNote] = useState("");
  const [actionStatus, setActionStatus] = useState<RecordedTaskActionKind | null>(null);
  const [lastAction, setLastAction] = useState<RecordedTaskActionResponse | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState("");

  async function loadNextAction() {
    setStatus("loading");
    setFormError("");
    try {
      const response = await orchestratorClient.nextAction();
      setNextAction(response.data);
      setDiagnostics([]);
      setStatus("ready");
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setDiagnostics(error.diagnostics);
        setFormError(error.message);
      } else {
        setFormError("Could not load the next Task from the local orchestrator.");
      }
      setStatus("failed");
    }
  }

  useEffect(() => {
    void loadNextAction();
  }, []);

  async function recordAction(action: RecordedTaskActionKind) {
    const taskId = nextAction?.recommendation?.task_id;
    if (!taskId) {
      setFormError("There is no ready Task to record an action for.");
      return;
    }

    setActionStatus(action);
    setFormError("");
    setDiagnostics([]);
    setUndone("");
    try {
      const response = await orchestratorClient.recordTaskAction({ taskId, action, note });
      setLastAction(response.data);
      setDiagnostics(response.data.diagnostics);
      setNote("");
      await loadNextAction();
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setDiagnostics(error.diagnostics);
        setFormError(error.message);
      } else {
        setFormError("Could not record the Task action through the local orchestrator.");
      }
    } finally {
      setActionStatus(null);
    }
  }

  // Undo of the completion just made, named by the log id that completion returned.
  async function undoCompletion(completion: RecordedTaskActionResponse) {
    setUndoing(true);
    setFormError("");
    setDiagnostics([]);
    setUndone("");
    try {
      const response = await orchestratorClient.reopenTask(completion.task_id, completion.log_id);
      // The offer is used up, whatever comes next.
      setLastAction(null);
      await loadNextAction();
      setUndone("The completion was undone. The Task is active again.");
      // After the reload, which clears diagnostics: what was and was not undone stays on screen.
      setDiagnostics(response.data.diagnostics);
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setDiagnostics(error.diagnostics);
        setFormError(error.message);
      } else {
        setFormError("Could not undo the completion through the local orchestrator.");
      }
    } finally {
      setUndoing(false);
    }
  }

  function renderLoopState() {
    return (
      <div className="explanation-drawer">
        <h2>Loop State</h2>
        <p className="muted">Response schema: {nextAction?.schema_version}</p>
        {lastAction && (
          <div className="action-result">
            <strong>Last action</strong>
            <span>
              {lastAction.action} recorded; Task status is {lastAction.task_status}.
            </span>
            <span className="muted">Log: {lastAction.log_id}</span>
            {lastAction.action === "complete" && lastAction.task_status === "completed" && (
              <button
                type="button"
                className="secondary-action fit"
                disabled={undoing || actionStatus !== null}
                onClick={() => void undoCompletion(lastAction)}
              >
                {undoing ? "Undoing" : "Undo completion"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const recommendation = nextAction?.recommendation ?? null;
  const blockedDiagnostics = nextAction?.diagnostics ?? [];

  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Next Task</div>
        <h1>Recommended Task</h1>
        <p className="muted">This is a readiness-based skeleton recommendation from the local orchestrator.</p>
      </div>
      {status === "loading" && <p className="muted">Loading readiness recommendation...</p>}
      {formError && <span className="error-text">{formError}</span>}
      {undone && <p role="status">{undone}</p>}
      <DiagnosticsList diagnostics={diagnostics} />
      {status === "ready" && recommendation && (
        <section className="next-action-grid">
          <NextTaskCard
            recommendation={recommendation}
            actionStatus={actionStatus}
            note={note}
            onNoteChange={setNote}
            onRecordAction={recordAction}
          />
          <aside className="side-stack">{renderLoopState()}</aside>
        </section>
      )}
      {status === "ready" && !recommendation && (
        <div className="side-stack">
          {/* Completing the last ready Task leaves nothing to recommend; the undo must still be there. */}
          {lastAction && renderLoopState()}
          {blockedDiagnostics.map((diagnostic) => (
            <BoundedDiagnostic key={`${diagnostic.code}:${diagnostic.message}`} diagnostic={diagnostic} />
          ))}
          {blockedDiagnostics.length === 0 && <p className="muted">The orchestrator returned no ready Task and no diagnostic.</p>}
        </div>
      )}
      {status === "ready" && (
        <PlanReports riskReport={nextAction?.risk_report} planQuality={nextAction?.human_complete_plan_quality} compact />
      )}
      {status === "failed" && (
        <button type="button" className="secondary-action fit" onClick={loadNextAction}>
          Retry
        </button>
      )}
    </section>
  );
}
