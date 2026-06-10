import { useState } from "react";

import { orchestratorClient } from "../api/client";
import { ProjectionOperationList } from "../components/ProjectionOperationList";
import type { ProjectionBatch } from "../state/appState";

type ProjectionPreviewProps = {
  batch: ProjectionBatch;
};

export function ProjectionPreview({ batch }: ProjectionPreviewProps) {
  const [approved, setApproved] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "failed">("idle");

  async function approveBatch() {
    setStatus("submitting");
    try {
      await orchestratorClient.approveProjectionBatch(batch.id);
      setApproved(true);
      setStatus("idle");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">ProjectionPreview</div>
        <h1>Projection preview and approval</h1>
        <p className="muted">
          Writes are approved only as a ProjectionPreview batch. Review every operation before approving this batch.
        </p>
      </div>
      <div className="batch-banner">
        <strong>{batch.title}</strong>
        <span>{batch.operations.length} proposed writes</span>
      </div>
      <ProjectionOperationList operations={batch.operations} />
      <div className="actions-row">
        <button type="button" className="primary-action" disabled={approved || status === "submitting"} onClick={approveBatch}>
          {approved ? "Batch approved" : status === "submitting" ? "Approving batch" : "Approve ProjectionPreview batch"}
        </button>
        {status === "failed" && <span className="error-text">Could not reach the local orchestrator.</span>}
      </div>
    </section>
  );
}
