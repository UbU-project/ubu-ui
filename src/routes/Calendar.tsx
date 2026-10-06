import { matchingPlacementsSentence } from "../presentation/calendar-preview";
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

function ConflictGroups({ conflicts, diagnostics }: { conflicts: CalendarConflict[]; diagnostics: BootstrapDiagnostic[] }) {
  // The backend supplies both the classification and which foreign events UbU cannot own.
  // Matching its reason avoids maintaining a second event-ID ownership rule here.
  // From P1B-51 such an event is captured all the same, as occupied time. The orchestrator's
  // reconciliation message still says it "cannot be captured", which is no longer so, and is
  // therefore not shown for this group: the group says what is true instead.
  const unownable = new Set(diagnostics.filter(({ code }) => code === "capture_event_not_ownable").map(({ message }) => message));
  const occupiedOnly = (conflict: CalendarConflict) => conflict.conflict_type === "foreign" && unownable.has(conflict.message);
  const occupancy = conflicts.filter(occupiedOnly);
  const groups = conflictKinds.map(({ kind, meaning }) => ({
    label: kind as string, meaning,
    entries: conflicts.filter((conflict) => conflict.conflict_type === kind && !occupiedOnly(conflict)),
    excluded: kind === "foreign" || kind === "unrecorded",
    occupancy: false
  }));
  if (occupancy.length > 0) groups.push({
    label: "foreign, occupied time only",
    meaning: "UbU cannot own these observed commitments. Capture records each one as occupied time: a Static Task that UbU never writes back to and never exports.",
    entries: occupancy, excluded: true, occupancy: true
  });
  return <div className="operation-list">
    {groups.map(({ label, meaning, entries, excluded, occupancy: occupied }) => <section key={label} aria-label={`${label} conflicts`} className="settings-panel">
      <h3>{label}</h3>
      <p>{meaning}</p>
      {excluded && <p>Excluded from repair; remains unchanged.</p>}
      {entries.length === 0 && <p>No {label} conflicts.</p>}
      {entries.map((conflict) => <article key={conflict.external_id}>
        <h4>{conflict.summary}</h4>
        {occupied
          ? <><p>UbU cannot own this event. Capture records its time as occupied.</p><p className="small-print"><code>{conflict.external_id}</code></p></>
          : <p>{conflict.message}</p>}
      </article>)}
      {occupied && <p className="warning-text" role="status">{entries.length} {entries.length === 1 ? "such commitment falls" : "such commitments fall"} inside the current planning horizon. Run capture to record {entries.length === 1 ? "its" : "their"} time as occupied. Until a capture has, UbU does not see {entries.length === 1 ? "it" : "them"} when planning, and work may be placed over {entries.length === 1 ? "it" : "them"}.</p>}
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
  // The orchestrator says what the placement is. It is not inferred from the colour: a colour
  // comes from a category, and a Static Task with no category, a night block or a captured event
  // whose colour maps to nothing, has none. Inferring called those Dynamic and taught the wrong gestures.
  const isStatic = operation.static_anchor;
  // An event UbU exports for a Task of its own carries that Task's id: the event id is the Task id
  // without its `task_` prefix. A Task that came from the calendar keeps the id its event already had.
  // No field says which it is, so it is read from the two ids. It matters for one line: a colour on
  // Dynamic work made in UbU means done, and a colour on a to-do that came from the calendar makes it
  // a commitment.
  const fromCalendar = event.task_id.startsWith("task_") && event.task_id.slice(5) !== event.external_id;
  const verb = operation.kind === "create" ? "Create" : "Update";
  return <article className="operation-item" aria-label={`${verb} ${event.summary}`}>
    <div>
      <h3>{verb}: {event.summary}</h3>
      <p>Window: <time dateTime={event.start_at}>{event.start_at}</time> → <time dateTime={event.end_at}>{event.end_at}</time></p>
      <p>Placement: {isStatic ? "Static" : "Dynamic"}</p>
      <p>If you give this event a colour, it means: {isStatic ? "its category" : fromCalendar ? "a commitment at the time it then has, in that colour's category" : <strong>done</strong>}</p>
      <p>If you change this window, it means: {isStatic ? "move — the window will follow the event" : "resize — the Task's duration will change"}</p>
    </div>
  </article>;
}

const NO_COLOUR = "capture_colour_absent";
/// How many uncoloured events are listed without being asked for.
const UNCOLOURED_SHOWN = 3;

/// The events that had no colour. That is the ordinary case for a to-do, not something missing, and a
/// real week has dozens. They are counted in one sentence and listed under it, so that a long list of
/// them does not read as a list of faults.
function UncolouredEvents({ diagnostics }: { diagnostics: BootstrapDiagnostic[] }) {
  const uncoloured = diagnostics.filter(({ code }) => code === NO_COLOUR);
  if (uncoloured.length === 0) {
    return null;
  }
  const one = uncoloured.length === 1;
  return (
    <section className="capture-uncoloured" aria-label="Events with no colour">
      <p>
        {one ? "1 event had no colour." : `${uncoloured.length} events had no colour.`} That is not something missing: an event with no colour is taken as
        work for UbU to schedule. {one ? "It is" : "Each is"} listed here with what was done with it.
      </p>
      <details open={uncoloured.length <= UNCOLOURED_SHOWN}>
        <summary>{one ? "The event with no colour" : `The ${uncoloured.length} events with no colour`}</summary>
        <DiagnosticsList diagnostics={uncoloured} tone="info" />
      </details>
    </section>
  );
}

type CalendarProps = {
  sessionEnabled: boolean;
  onOpenSetup: () => void;
  onSessionDisabled: () => void;
};

/// How much the preview proposes, in the shape the Approve panel reports what was applied. One line
/// for a preview of any size, none included: a long preview is read here, not tallied from its cards.
function ProposedCounts({ operations, matchingPlacements }: { operations: CalendarOperation[]; matchingPlacements: number }) {
  const count = (kind: CalendarOperation["kind"]) => operations.filter((operation) => operation.kind === kind).length;
  return <p>Operations proposed: {operations.length}. Create {count("create")}, update {count("update")}, delete {count("delete")}.{` ${matchingPlacementsSentence(matchingPlacements)}`}</p>;
}

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
      <p><strong>Take preview writes nothing and captures nothing.</strong> It compares the Plan with what UbU has already applied and proposes changes; it does not read your calendar, so an event you made there will not appear here.</p>
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
        <ProposedCounts operations={preview.operations} matchingPlacements={preview.matching_placements} />
        <DiagnosticsList diagnostics={preview.diagnostics} tone="info" />
        <div className="operation-list">
          {preview.operations.map((operation) => <Operation key={`${operation.kind}:${operation.kind === "delete" ? operation.external_id : operation.event.external_id}`} operation={operation} />)}
        </div>
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
        <p>Operations applied in this run: {approval.operation_results.filter((result) => result.status === "applied").length} of {approval.operation_results.length}</p>
        <p>Applied record: {approval.applied_events.length} {approval.applied_events.length === 1 ? "event" : "events"} in total. This is the size of UbU's record of everything it has applied, not a count of events pushed in this run.</p>
        {approval.operation_results.map((operation) => <p key={operation.operation_id}>{operation.operation_id}: {operation.status}{operation.message ? ` — ${operation.message}` : ""}</p>)}
        {/* An approval that did not apply everything answers 200 too; its own status says which it was. */}
        <DiagnosticsList diagnostics={approval.diagnostics} tone={approval.status === "applied" ? "info" : "failure"} />
        <details><summary>Full approval response</summary><pre>{JSON.stringify(approval, null, 2)}</pre></details>
      </div>}
    </section>

    <section className="calendar-panel" aria-labelledby="calendar-capture-heading">
      <h2 id="calendar-capture-heading">3. Capture</h2>
      <p>Read phone changes on demand. A colour on Dynamic work you made in UbU means done; a Static window change means move.</p>
      <p><strong>Run capture is the control that reads your calendar and writes to UbU.</strong> It makes a Task for each event there that UbU did not create, and applies your changes to the events it did.</p>
      {/* The capture half of the colour rule. The export half is on each operation of the preview. */}
      <p className="capture-rule">An event with no colour is taken as work for UbU to schedule. An event with a colour is taken as a commitment at its own time, and the colour is its category.</p>
      <p className="capture-rule">An event's own notes become the Task's notes when it is first captured; a Task that already has notes keeps them. Read and change a Task's notes afterwards on the Tasks screen.</p>
      <p className="muted">A Task that came from your calendar keeps to that rule afterwards: take its event's colour away and UbU schedules it, give it a colour and it is a commitment at the time it then has. An event that repeats cannot be moved by UbU, so it stays a commitment whatever its colour.</p>
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
        <UncolouredEvents diagnostics={capture.diagnostics} />
        <DiagnosticsList diagnostics={capture.diagnostics.filter(({ code }) => code !== NO_COLOUR)} tone="info" showCounts />
      </>}
    </section>

    <section className="calendar-panel" aria-labelledby="calendar-reconcile-heading">
      <h2 id="calendar-reconcile-heading">4. Reconcile and repair</h2>
      <button type="button" className="secondary-action fit" disabled={busy || !sessionEnabled} onClick={() => void takeReconciliation()}>Run reconciliation</button>
      {reconciliation && <>
        <p>Reconciliation: <code>{reconciliation.reconciliation_id}</code> — {reconciliation.status}</p>
        <DiagnosticsList diagnostics={reconciliation.diagnostics.filter(({ code }) => code !== "capture_event_not_ownable")} tone="info" />
        <ConflictGroups conflicts={reconciliation.conflicts} diagnostics={reconciliation.diagnostics} />
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
