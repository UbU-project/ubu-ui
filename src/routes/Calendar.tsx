import { useState } from "react";

import {
  orchestratorClient,
  OrchestratorError,
  type BootstrapDiagnostic,
  type CalendarCaptureResponse,
  type CalendarConflict,
  type CalendarOperation,
  type CalendarProjectionPreviewResponse,
  type CalendarProjectionResultResponse,
  type CalendarReconcileResponse,
  type CalendarRepairResponse
} from "../api/client";
import { DiagnosticsList } from "../components/DiagnosticsList";
import { StatusBadge } from "../components/StatusBadge";

const conflictKinds: Array<{ kind: CalendarConflict["conflict_type"]; meaning: string }> = [
  { kind: "missing", meaning: "An owned event is absent from the observed list." },
  { kind: "drifted", meaning: "An owned event's observed fields differ from its applied record." },
  { kind: "unrecorded", meaning: "An observed event is not owned, but its ID derives from an active Task UbU knows about." },
  { kind: "foreign", meaning: "An observed event is neither owned nor linked by ID to an active Task." }
];

function ConflictGroups({ conflicts }: { conflicts: CalendarConflict[] }) {
  return <div className="operation-list">
    {conflictKinds.map(({ kind, meaning }) => <section key={kind} aria-label={`${kind} conflicts`} className="settings-panel">
      <h3>{kind}</h3>
      <p>{meaning}</p>
      {(kind === "foreign" || kind === "unrecorded") && <p>Excluded from repair; remains unchanged.</p>}
      {conflicts.filter((conflict) => conflict.conflict_type === kind).length === 0 && <p>No {kind} conflicts.</p>}
      {conflicts.filter((conflict) => conflict.conflict_type === kind).map((conflict) => <article key={conflict.external_id}>
        <h4>{conflict.summary}</h4>
        <p>{conflict.message}</p>
      </article>)}
    </section>)}
  </div>;
}

function Operation({ operation }: { operation: CalendarOperation }) {
  if (operation.kind === "delete") {
    return <article className="operation-item" aria-label={`Delete ${operation.summary}`}>
      <div><h3>Delete: {operation.summary}</h3><p>Event will be removed.</p></div>
    </article>;
  }
  const event = operation.event;
  // P1B-41's response-only partition: only Static placements export a colour.
  const isStatic = event.color_id !== null;
  const verb = operation.kind === "create" ? "Create" : "Update";
  return <article className="operation-item" aria-label={`${verb} ${event.summary}`}>
    <div>
      <h3>{verb}: {event.summary}</h3>
      <p>Window: <time dateTime={event.start_at}>{event.start_at}</time> → <time dateTime={event.end_at}>{event.end_at}</time></p>
      <p>Placement: {isStatic ? "Static" : "Dynamic"}</p>
      <p>Colour means: {isStatic ? "its category" : <strong>done</strong>}</p>
      <p>Window change means: {isStatic ? "move — the window follows the event" : "resize — the duration changed"}</p>
    </div>
  </article>;
}

type CalendarProps = {
  sessionEnabled: boolean;
  onOpenSetup: () => void;
  onSessionDisabled: () => void;
};

export function Calendar({ sessionEnabled, onOpenSetup, onSessionDisabled }: CalendarProps) {
  const [noExternalExport, setNoExternalExport] = useState(false);
  const [preview, setPreview] = useState<CalendarProjectionPreviewResponse | null>(null);
  const [approval, setApproval] = useState<CalendarProjectionResultResponse | null>(null);
  const [capture, setCapture] = useState<CalendarCaptureResponse | null>(null);
  const [reconciliation, setReconciliation] = useState<CalendarReconcileResponse | null>(null);
  const [repair, setRepair] = useState<CalendarRepairResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFormError("");
    setDiagnostics([]);
    setNeedsReconciliation(false);
    try {
      await action();
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setFormError(error.message);
        setDiagnostics(error.diagnostics);
        if (error.diagnostics.some(({ code }) => code === "calendar_live_export_not_enabled" || code === "calendar_live_export_unconfigured")) {
          onSessionDisabled();
        }
        setNeedsReconciliation(error.diagnostics.some(({ code }) => code === "calendar_reconciliation_already_repaired"));
      } else {
        setFormError("Could not reach the local orchestrator for this Calendar action.");
      }
    } finally {
      setBusy(false);
    }
  }

  function takePreview() {
    return run(async () => {
      setPreview(null);
      setApproval(null);
      setPreview((await orchestratorClient.previewCalendar(noExternalExport)).data);
    });
  }

  function takeReconciliation() {
    return run(async () => {
      setReconciliation(null);
      setRepair(null);
      setReconciliation((await orchestratorClient.reconcileCalendar()).data);
    });
  }

  return <section className="route-stack">
    <div>
      <div className="section-kicker">Calendar</div>
      <h1>Google Calendar</h1>
      <p className="muted">Preview the plan, approve its export, capture phone gestures, then reconcile what changed.</p>
    </div>
    {!sessionEnabled && <div className="settings-panel" role="status">
      <p>Google Calendar session is not enabled. Enable it in Setup before approving, capturing or reconciling.</p>
      <button type="button" className="secondary-action fit" onClick={onOpenSetup}>Open Setup</button>
    </div>}
    {formError && <p className="error-text" role="alert">{formError}</p>}
    <DiagnosticsList diagnostics={diagnostics} />
    {needsReconciliation && <p className="warning-text">Take a new reconciliation before repairing again.</p>}

    <section className="calendar-panel" aria-labelledby="calendar-preview-heading">
      <h2 id="calendar-preview-heading">1. Preview</h2>
      <p>Review each operation before approving. Taking a preview does not call Google.</p>
      <label className="checkbox-row">
        <input type="checkbox" checked={noExternalExport} disabled={busy} onChange={(event) => {
          setNoExternalExport(event.target.checked);
          setPreview(null);
          setApproval(null);
        }} />
        No external export
      </label>
      <button type="button" className="primary-action fit" disabled={busy} onClick={() => void takePreview()}>Take preview</button>
      {preview && <>
        <p>Plan: <code>{preview.plan_id ?? "No plan"}</code></p>
        <p>Preview: <code>{preview.preview_id}</code></p>
        {preview.stale ? <div className="batch-banner" role="alert"><strong>Stale preview — the plan may have changed. Review before approving.</strong></div> : <StatusBadge label="Current preview" tone="success" />}
        <DiagnosticsList diagnostics={preview.diagnostics} />
        <div className="operation-list">
          {preview.operations.map((operation) => <Operation key={`${operation.kind}:${operation.kind === "delete" ? operation.external_id : operation.event.external_id}`} operation={operation} />)}
        </div>
        {preview.operations.length === 0 && <p>No Calendar operations proposed.</p>}
      </>}
    </section>

    <section className="calendar-panel" aria-labelledby="calendar-approve-heading">
      <h2 id="calendar-approve-heading">2. Approve</h2>
      <p>Only this explicit approval sends the reviewed preview to Google Calendar.</p>
      <button type="button" className="primary-action fit" disabled={busy || !preview || !sessionEnabled} onClick={() => {
        if (preview) void run(async () => {
          setApproval(null);
          setApproval((await orchestratorClient.approveCalendar(preview.preview_id)).data);
          setReconciliation(null);
          setRepair(null);
        });
      }}>Approve preview</button>
      {approval && <div>
        <p>Approval status: <strong>{approval.status}</strong></p>
        <p>Approved preview: <code>{approval.preview_id}</code></p>
        <p>Applied events: {approval.applied_events.length}</p>
        {approval.operation_results.map((operation) => <p key={operation.operation_id}>{operation.operation_id}: {operation.status}{operation.message ? ` — ${operation.message}` : ""}</p>)}
        <DiagnosticsList diagnostics={approval.diagnostics} />
        <details><summary>Full approval response</summary><pre>{JSON.stringify(approval, null, 2)}</pre></details>
      </div>}
    </section>

    <section className="calendar-panel" aria-labelledby="calendar-capture-heading">
      <h2 id="calendar-capture-heading">3. Capture</h2>
      <p>Read phone changes on demand. A colour on Dynamic work means done; a Static window change means move.</p>
      <button type="button" className="secondary-action fit" disabled={busy || !sessionEnabled} onClick={() => void run(async () => {
        setCapture(null);
        setCapture((await orchestratorClient.captureCalendar()).data);
        setPreview(null);
        setApproval(null);
        setReconciliation(null);
        setRepair(null);
      })}>Run capture</button>
      {capture && <>
        <dl className="task-meta" aria-label="Capture counts">
          {(["captured", "updated", "unchanged", "skipped", "moved", "resized"] as const).map((key) => <div key={key}><dt>{key}</dt><dd>{capture[key]}</dd></div>)}
        </dl>
        <DiagnosticsList diagnostics={capture.diagnostics} />
      </>}
    </section>

    <section className="calendar-panel" aria-labelledby="calendar-reconcile-heading">
      <h2 id="calendar-reconcile-heading">4. Reconcile and repair</h2>
      <button type="button" className="secondary-action fit" disabled={busy || !sessionEnabled} onClick={() => void takeReconciliation()}>Run reconciliation</button>
      {reconciliation && <>
        <p>Reconciliation: <code>{reconciliation.reconciliation_id}</code> — {reconciliation.status}</p>
        <DiagnosticsList diagnostics={reconciliation.diagnostics} />
        <ConflictGroups conflicts={reconciliation.conflicts} />
        <p>Repair corrects UbU's record of what it applied. It addresses missing and drifted only and does not call Google. The calendar corrections appear in the next preview, which needs a separate approval.</p>
        <p>foreign events belong to the operator and are never repairable. foreign and unrecorded are excluded from repair and remain unchanged.</p>
        <button type="button" className="secondary-action fit" disabled={busy} onClick={() => void run(async () => {
          setRepair((await orchestratorClient.repairCalendarReconciliation(reconciliation.reconciliation_id)).data);
          setPreview(null);
          setApproval(null);
        })}>Repair applied record</button>
      </>}
      {repair && <section aria-label="Repair result">
        <h3>Repair result</h3>
        <dl className="task-meta">
          {(["dropped_events", "updated_events", "applied_event_count"] as const).map((key) => <div key={key}><dt>{key}</dt><dd>{repair[key]}</dd></div>)}
        </dl>
        <h4>remaining_conflicts</h4>
        {repair.remaining_conflicts.length === 0 ? <p>No remaining conflicts.</p> : <ul>{repair.remaining_conflicts.map((conflict) => <li key={conflict.external_id}>{conflict.conflict_type}: {conflict.summary} — {conflict.message}</li>)}</ul>}
        <p>The calendar corrections appear in the next preview. Review and approve it separately.</p>
        <button type="button" className="primary-action fit" disabled={busy} onClick={() => void takePreview()}>Take fresh preview</button>
      </section>}
    </section>
  </section>;
}
