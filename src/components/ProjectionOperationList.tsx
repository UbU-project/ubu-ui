import type { ProjectionOperation } from "../state/appState";
import { StatusBadge } from "./StatusBadge";

type ProjectionOperationListProps = {
  operations: ProjectionOperation[];
};

const toneByOperation = {
  create: "success",
  update: "warning",
  close: "danger"
} as const;

export function ProjectionOperationList({ operations }: ProjectionOperationListProps) {
  return (
    <div className="operation-list">
      {operations.map((operation) => (
        <article className="operation-item" key={operation.id}>
          <div>
            <h3>{operation.target}</h3>
            <p>{operation.summary}</p>
          </div>
          <StatusBadge label={operation.operation} tone={toneByOperation[operation.operation]} />
        </article>
      ))}
    </div>
  );
}
