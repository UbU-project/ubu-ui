type HumanCompleteSummaryProps = {
  completed: number;
  pending: number;
};

export function HumanCompleteSummary({ completed, pending }: HumanCompleteSummaryProps) {
  return (
    <div className="summary-strip">
      <div>
        <span className="metric">{completed}</span>
        <span className="metric-label">Human complete</span>
      </div>
      <div>
        <span className="metric">{pending}</span>
        <span className="metric-label">Pending review</span>
      </div>
    </div>
  );
}
