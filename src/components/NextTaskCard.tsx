import type { NextActionRecommendation, RecordedTaskActionKind } from "../api/client";
import { StatusBadge } from "./StatusBadge";

type NextTaskCardProps = {
  recommendation: NextActionRecommendation;
  actionStatus: RecordedTaskActionKind | null;
  note: string;
  onNoteChange: (note: string) => void;
  onRecordAction: (action: RecordedTaskActionKind) => void;
};

function sourceLabel(sourceKind: string, sourceId: string) {
  return `${sourceKind}: ${sourceId}`;
}

export function NextTaskCard({ recommendation, actionStatus, note, onNoteChange, onRecordAction }: NextTaskCardProps) {
  const parentObjective = recommendation.parent_objective ?? recommendation.explanation.parent_objective;
  const sourceRefs = recommendation.source_refs.length > 0 ? recommendation.source_refs : recommendation.explanation.source_refs;
  const isSubmitting = actionStatus !== null;

  return (
    <section className="focus-panel" aria-labelledby="next-task-heading">
      <div className="section-kicker">Readiness-based recommendation</div>
      <div className="title-row">
        <h1 id="next-task-heading">{recommendation.title}</h1>
        <StatusBadge label={recommendation.readiness} tone={recommendation.readiness === "ready" ? "success" : "warning"} />
      </div>
      <dl className="task-meta">
        <div>
          <dt>Task</dt>
          <dd>{recommendation.task_id}</dd>
        </div>
        <div>
          <dt>Parent Objective</dt>
          <dd>{parentObjective ? parentObjective.title : "No parent Objective recorded"}</dd>
        </div>
      </dl>
      <p className="body-copy">{recommendation.explanation.message}</p>
      <div className="recommendation-details">
        <div>
          <h2>Readiness Explanation</h2>
          <p>{recommendation.explanation.label}</p>
          <span className="muted">Selection: {recommendation.selection.rule}</span>
        </div>
        <div>
          <h2>Provenance</h2>
          {sourceRefs.length > 0 ? (
            <ul className="source-list">
              {sourceRefs.map((source) => (
                <li key={`${source.source_kind}:${source.source_id}`}>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {sourceLabel(source.source_kind, source.source_id)}
                    </a>
                  ) : (
                    <span>{sourceLabel(source.source_kind, source.source_id)}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No provenance source recorded.</p>
          )}
        </div>
      </div>
      <label className="note-field" htmlFor="task-action-note">
        Action note
        <textarea
          id="task-action-note"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Optional note for complete or override"
          rows={3}
        />
      </label>
      <div className="actions-row">
        <button type="button" className="primary-action" disabled={isSubmitting} onClick={() => onRecordAction("complete")}>
          {actionStatus === "complete" ? "Recording complete" : "Complete"}
        </button>
        <button type="button" className="secondary-action" disabled={isSubmitting} onClick={() => onRecordAction("override")}>
          {actionStatus === "override" ? "Recording override" : "Override"}
        </button>
      </div>
    </section>
  );
}
