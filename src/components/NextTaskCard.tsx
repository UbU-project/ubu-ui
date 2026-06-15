import type { Task } from "../state/appState";
import { RiskSummary } from "./RiskSummary";
import { StatusBadge } from "./StatusBadge";

type NextTaskCardProps = {
  task: Task;
  onInspectPlan: () => void;
};

export function NextTaskCard({ task, onInspectPlan }: NextTaskCardProps) {
  return (
    <section className="focus-panel" aria-labelledby="next-task-heading">
      <div className="section-kicker">One-next-Task</div>
      <div className="title-row">
        <h1 id="next-task-heading">{task.title}</h1>
        <StatusBadge label={task.derived_readiness ? "Ready" : task.status} tone={task.derived_readiness ? "success" : "warning"} />
      </div>
      <p className="muted">{task.repository}</p>
      <p className="body-copy">{task.rationale}</p>
      <RiskSummary risk={task.risk} />
      <div className="actions-row">
        <button type="button" className="primary-action">
          Mark Human Complete
        </button>
        <button type="button" className="secondary-action" onClick={onInspectPlan}>
          Inspect Plan
        </button>
      </div>
    </section>
  );
}
