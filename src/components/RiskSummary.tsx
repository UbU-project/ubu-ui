import type { Task } from "../state/appState";
import { StatusBadge } from "./StatusBadge";

type RiskSummaryProps = {
  risk: Task["risk"];
};

export function RiskSummary({ risk }: RiskSummaryProps) {
  const tone = risk === "high" ? "danger" : risk === "medium" ? "warning" : "success";

  return (
    <div className="risk-summary">
      <span>Risk</span>
      <StatusBadge label={risk} tone={tone} />
    </div>
  );
}
