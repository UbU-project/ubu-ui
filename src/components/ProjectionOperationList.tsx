import type { ProjectionOperation } from "../api/client";
import { StatusBadge } from "./StatusBadge";

type ProjectionOperationListProps = {
  operations: ProjectionOperation[];
};

function labelFromPayload(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  if ("label" in payload && typeof payload.label === "string") {
    return payload.label;
  }

  if ("missing_labels" in payload && Array.isArray(payload.missing_labels)) {
    return payload.missing_labels.filter((label): label is string => typeof label === "string").join(", ");
  }

  return null;
}

function formatTarget(operation: ProjectionOperation): string {
  const issue = operation.target.issue_number == null ? "" : `#${operation.target.issue_number}`;
  return `${operation.target.owner}/${operation.target.repo}${issue}`;
}

function renderPayload(payload: unknown) {
  const label = labelFromPayload(payload);

  if (label) {
    return (
      <p className="operation-detail">
        Managed label: <code>{label}</code>
      </p>
    );
  }

  if (payload == null) {
    return null;
  }

  return <pre className="operation-payload">{JSON.stringify(payload, null, 2)}</pre>;
}

export function ProjectionOperationList({ operations }: ProjectionOperationListProps) {
  return (
    <div className="operation-list">
      {operations.map((operation) => (
        <article className="operation-item" key={operation.operation_id}>
          <div>
            <h3>{formatTarget(operation)}</h3>
            <p>{operation.summary}</p>
            <p className="operation-detail">
              Operation: <code>{operation.operation_id}</code>
            </p>
            {renderPayload(operation.payload)}
          </div>
          <StatusBadge label={operation.kind} tone="warning" />
        </article>
      ))}
    </div>
  );
}
