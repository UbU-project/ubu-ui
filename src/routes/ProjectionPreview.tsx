import { FormEvent, useState } from "react";

import {
  orchestratorClient,
  OrchestratorError,
  type BootstrapDiagnostic,
  type BootstrapSelectedRepo,
  type ProjectionAcceptExternalResponse,
  type ProjectionConflict,
  type ProjectionPreviewResponse,
  type ProjectionReconcileResponse,
  type ProjectionResultResponse
} from "../api/client";
import { DiagnosticsList } from "../components/DiagnosticsList";
import { ProjectionOperationList } from "../components/ProjectionOperationList";
import { StatusBadge } from "../components/StatusBadge";

type ProjectionPreviewProps = {
  selectedRepo: BootstrapSelectedRepo | null;
};

type ProjectionFormState = {
  owner: string;
  repo: string;
  issueNumber: string;
  desiredLabels: string;
  observedLabels: string;
  existingRepositoryLabels: string;
  reason: string;
  noExternalExport: boolean;
};

type ConflictDecision = {
  choice: "accept-external" | "keep-ubu";
  response?: ProjectionAcceptExternalResponse;
};

const defaultLabels = "ubu-managed";

function labelsFromText(value: string): string[] {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}

function issueNumberFromText(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toneForStatus(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "applied" || status === "matched" || status === "accepted") {
    return "success";
  }

  if (status === "partial" || status === "drifted" || status === "missing" || status === "skipped" || status === "needs_review") {
    return "warning";
  }

  if (status === "failed" || status === "rejected") {
    return "danger";
  }

  return "neutral";
}

function initialForm(selectedRepo: BootstrapSelectedRepo | null): ProjectionFormState {
  return {
    owner: selectedRepo?.owner ?? "UbU-project",
    repo: selectedRepo?.repo ?? "ubu-orchestrator",
    issueNumber: "7",
    desiredLabels: defaultLabels,
    observedLabels: "",
    existingRepositoryLabels: "ubu, ubu-managed",
    reason: "User-reviewed managed-label export preview",
    noExternalExport: false
  };
}

function asDiagnostics(error: unknown, fallback: string): { message: string; diagnostics: BootstrapDiagnostic[] } {
  if (error instanceof OrchestratorError) {
    return { message: error.message, diagnostics: error.diagnostics };
  }

  return { message: fallback, diagnostics: [] };
}

function PolicySummary({ preview }: { preview: ProjectionPreviewResponse }) {
  return (
    <section className="projection-panel">
      <div className="title-row">
        <div>
          <h2>Policy summary</h2>
          <p className="muted">Schema: {preview.schema_version}</p>
        </div>
        <StatusBadge label={preview.policy_summary.legitimization} tone={toneForStatus(preview.policy_summary.legitimization)} />
      </div>
      <dl className="policy-grid">
        <div>
          <dt>Checked</dt>
          <dd>{preview.policy_summary.checked_at}</dd>
        </div>
        <div>
          <dt>Requires approval</dt>
          <dd>{preview.requires_approval ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>No external export</dt>
          <dd>{preview.policy_summary.no_external_export ? "Yes" : "No"}</dd>
        </div>
      </dl>
      <ul className="source-list">
        {preview.policy_summary.adjudication_reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </section>
  );
}

function ProjectionResult({ result }: { result: ProjectionResultResponse }) {
  return (
    <section className="projection-panel">
      <div className="title-row">
        <div>
          <h2>Projection result</h2>
          <p className="muted">Schema: {result.schema_version}</p>
        </div>
        <StatusBadge label={result.status} tone={toneForStatus(result.status)} />
      </div>
      <div className="operation-list">
        {result.operation_results.map((operation) => (
          <article className="operation-item" key={operation.operation_id}>
            <div>
              <h3>{operation.operation_id}</h3>
              {operation.message && <p>{operation.message}</p>}
              {operation.authority_source && (
                <p className="operation-detail">
                  Authority source: <code>{operation.authority_source}</code>
                </p>
              )}
            </div>
            <StatusBadge label={operation.status} tone={toneForStatus(operation.status)} />
          </article>
        ))}
      </div>
      <DiagnosticsList diagnostics={result.diagnostics} />
    </section>
  );
}

function ReconciliationResult({
  reconciliation,
  decisions,
  onAcceptExternal,
  onKeepUbu
}: {
  reconciliation: ProjectionReconcileResponse;
  decisions: Record<string, ConflictDecision>;
  onAcceptExternal: (conflict: ProjectionConflict) => void;
  onKeepUbu: (conflict: ProjectionConflict) => void;
}) {
  return (
    <section className="projection-panel">
      <div className="title-row">
        <div>
          <h2>Reconciliation</h2>
          <p className="muted">Schema: {reconciliation.schema_version}</p>
        </div>
        <StatusBadge label={reconciliation.status} tone={toneForStatus(reconciliation.status)} />
      </div>
      <p className="muted">
        Reconciliation ID: <code>{reconciliation.reconciliation_id}</code>
      </p>
      <DiagnosticsList diagnostics={reconciliation.diagnostics} />
      {reconciliation.conflicts.length === 0 && <p>No projection conflicts surfaced.</p>}
      {reconciliation.conflicts.length > 0 && (
        <div className="operation-list">
          {reconciliation.conflicts.map((conflict) => {
            const decision = decisions[conflict.operation_id];
            return (
              <article className="operation-item conflict-item" key={conflict.operation_id}>
                <div>
                  <h3>{conflict.conflict_type}</h3>
                  <p>{conflict.message}</p>
                  <p className="operation-detail">
                    Operation: <code>{conflict.operation_id}</code>
                  </p>
                  <p className="operation-detail">
                    Expected label: <code>{conflict.expected_label}</code>
                  </p>
                  <p className="operation-detail">
                    Observed labels: <code>{conflict.observed_labels.length > 0 ? conflict.observed_labels.join(", ") : "none"}</code>
                  </p>
                  {decision?.choice === "accept-external" && (
                    <p className="success-text">
                      External change accepted as <code>{decision.response?.admitted_object_id}</code>.
                    </p>
                  )}
                  {decision?.choice === "keep-ubu" && (
                    <p className="warning-text">UbU state kept for review. No overwrite request was sent.</p>
                  )}
                </div>
                <div className="button-column">
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={Boolean(decision)}
                    onClick={() => onAcceptExternal(conflict)}
                  >
                    Accept external
                  </button>
                  <button type="button" className="secondary-action" disabled={Boolean(decision)} onClick={() => onKeepUbu(conflict)}>
                    Keep UbU state
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ProjectionPreview({ selectedRepo }: ProjectionPreviewProps) {
  const [form, setForm] = useState<ProjectionFormState>(() => initialForm(selectedRepo));
  const [preview, setPreview] = useState<ProjectionPreviewResponse | null>(null);
  const [result, setResult] = useState<ProjectionResultResponse | null>(null);
  const [reconciliation, setReconciliation] = useState<ProjectionReconcileResponse | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ConflictDecision>>({});
  const [status, setStatus] = useState<"idle" | "previewing" | "approving" | "reconciling">("idle");
  const [formError, setFormError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);
  const canReconcile = result?.status === "applied" || result?.status === "partial";

  function setField<K extends keyof ProjectionFormState>(field: K, value: ProjectionFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setDiagnostics([]);
    setResult(null);
    setReconciliation(null);
    setDecisions({});

    if (!form.owner.trim() || !form.repo.trim()) {
      setFormError("Repository owner and name are required.");
      return;
    }

    const issueNumber = issueNumberFromText(form.issueNumber);
    if (form.issueNumber.trim() && issueNumber === null) {
      setFormError("Issue number must be a non-negative integer.");
      return;
    }

    setStatus("previewing");
    try {
      const response = await orchestratorClient.previewProjectionBatch({
        owner: form.owner.trim(),
        repo: form.repo.trim(),
        issue_number: issueNumber,
        desired_labels: labelsFromText(form.desiredLabels),
        observed_labels: labelsFromText(form.observedLabels),
        existing_repository_labels: labelsFromText(form.existingRepositoryLabels),
        no_external_export: form.noExternalExport,
        reason: form.reason.trim() ? form.reason.trim() : null
      });
      setPreview(response.data);
    } catch (error) {
      const next = asDiagnostics(error, "Could not create the projection preview through the local orchestrator.");
      setFormError(next.message);
      setDiagnostics(next.diagnostics);
    } finally {
      setStatus("idle");
    }
  }

  async function approvePreview() {
    if (!preview) {
      return;
    }

    setFormError("");
    setDiagnostics([]);
    setStatus("approving");
    try {
      const response = await orchestratorClient.approveProjectionBatch(preview.preview_id);
      setResult(response.data);
    } catch (error) {
      const next = asDiagnostics(error, "Could not approve the projection batch through the local orchestrator.");
      setFormError(next.message);
      setDiagnostics(next.diagnostics);
    } finally {
      setStatus("idle");
    }
  }

  async function reconcileProjection() {
    setFormError("");
    setDiagnostics([]);
    setStatus("reconciling");
    try {
      const response = await orchestratorClient.reconcileProjection({
        observed_labels: labelsFromText(form.observedLabels)
      });
      setReconciliation(response.data);
      setDecisions({});
    } catch (error) {
      const next = asDiagnostics(error, "Could not reconcile the projection through the local orchestrator.");
      setFormError(next.message);
      setDiagnostics(next.diagnostics);
    } finally {
      setStatus("idle");
    }
  }

  async function acceptExternal(conflict: ProjectionConflict) {
    if (!reconciliation) {
      return;
    }

    setFormError("");
    setDiagnostics([]);
    try {
      const response = await orchestratorClient.acceptExternalProjectionChange(reconciliation.reconciliation_id, conflict.operation_id);
      setDecisions((current) => ({
        ...current,
        [conflict.operation_id]: { choice: "accept-external", response: response.data }
      }));
    } catch (error) {
      const next = asDiagnostics(error, "Could not accept the external projection change through the local orchestrator.");
      setFormError(next.message);
      setDiagnostics(next.diagnostics);
    }
  }

  function keepUbu(conflict: ProjectionConflict) {
    setDecisions((current) => ({
      ...current,
      [conflict.operation_id]: { choice: "keep-ubu" }
    }));
  }

  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Projection Preview</div>
        <h1>Projection preview and approval</h1>
        <p className="muted">Review managed-label writes before approving any export through the local orchestrator.</p>
      </div>
      <form className="projection-form" onSubmit={submitPreview}>
        <div className="form-grid">
          <label>
            Owner
            <input type="text" value={form.owner} onChange={(event) => setField("owner", event.target.value)} />
          </label>
          <label>
            Repository
            <input type="text" value={form.repo} onChange={(event) => setField("repo", event.target.value)} />
          </label>
          <label>
            Issue number
            <input type="number" min={0} value={form.issueNumber} onChange={(event) => setField("issueNumber", event.target.value)} />
          </label>
        </div>
        <label>
          Desired managed labels
          <input type="text" value={form.desiredLabels} onChange={(event) => setField("desiredLabels", event.target.value)} />
        </label>
        <label>
          Observed labels
          <input type="text" value={form.observedLabels} onChange={(event) => setField("observedLabels", event.target.value)} />
        </label>
        <label>
          Existing repository labels
          <input
            type="text"
            value={form.existingRepositoryLabels}
            onChange={(event) => setField("existingRepositoryLabels", event.target.value)}
          />
        </label>
        <label>
          Approval reason
          <input type="text" value={form.reason} onChange={(event) => setField("reason", event.target.value)} />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.noExternalExport}
            onChange={(event) => setField("noExternalExport", event.target.checked)}
          />
          No external export policy
        </label>
        <button type="submit" className="primary-action fit" disabled={status === "previewing"}>
          {status === "previewing" ? "Creating preview" : "Create projection preview"}
        </button>
      </form>
      {formError && <span className="error-text">{formError}</span>}
      <DiagnosticsList diagnostics={diagnostics} />
      {preview && (
        <>
          <div className="batch-banner">
            <strong>Proposed export pending approval</strong>
            <span>{preview.operations.length} managed-label operation(s)</span>
          </div>
          <ProjectionOperationList operations={preview.operations} />
          <PolicySummary preview={preview} />
          <div className="actions-row">
            <button type="button" className="primary-action" disabled={status === "approving"} onClick={approvePreview}>
              {status === "approving" ? "Approving batch" : "Approve this batch"}
            </button>
            <button type="button" className="secondary-action" disabled={!canReconcile || status === "reconciling"} onClick={reconcileProjection}>
              {status === "reconciling" ? "Reconciling" : "Run reconciliation"}
            </button>
          </div>
        </>
      )}
      {result && <ProjectionResult result={result} />}
      {reconciliation && (
        <ReconciliationResult
          reconciliation={reconciliation}
          decisions={decisions}
          onAcceptExternal={acceptExternal}
          onKeepUbu={keepUbu}
        />
      )}
    </section>
  );
}
