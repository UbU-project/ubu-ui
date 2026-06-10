import { StatusBadge } from "../components/StatusBadge";
import type { LogEntry } from "../state/appState";

type LogReviewProps = {
  entries: LogEntry[];
};

export function LogReview({ entries }: LogReviewProps) {
  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Audit</div>
        <h1>Log review</h1>
        <p className="muted">Review orchestrator-visible session events without exposing secret values.</p>
      </div>
      <div className="log-list">
        {entries.map((entry) => (
          <article className="log-item" key={entry.id}>
            <span className="timestamp">{entry.timestamp}</span>
            <p>{entry.message}</p>
            <StatusBadge label={entry.level} tone={entry.level === "error" ? "danger" : entry.level === "warning" ? "warning" : "neutral"} />
          </article>
        ))}
      </div>
    </section>
  );
}
