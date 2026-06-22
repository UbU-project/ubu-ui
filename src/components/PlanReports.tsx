import type { HumanCompletePlanQuality, RiskFinding, RiskLevel, RiskReport } from "../api/client";
import { StatusBadge } from "./StatusBadge";

type PlanReportsProps = {
  riskReport?: RiskReport | null;
  planQuality?: HumanCompletePlanQuality | null;
  compact?: boolean;
};

function formatSignal(value: string): string {
  return value.replaceAll("_", " ");
}

function riskTone(level: RiskLevel): "success" | "warning" | "danger" {
  if (level === "high") return "danger";
  if (level === "medium") return "warning";
  return "success";
}

function FindingList({ findings, blocking }: { findings: RiskFinding[]; blocking: boolean }) {
  if (findings.length === 0) return null;

  return (
    <section className={blocking ? "risk-findings blocking" : "risk-findings advisory"}>
      <h4>{blocking ? "Blocking model findings" : "Advisory model findings"}</h4>
      {blocking && (
        <p className="risk-recalculation-note">These findings drive recalculation before this Plan can be relied on.</p>
      )}
      <div className="risk-finding-list">
        {findings.map((finding, index) => (
          <article className="risk-finding" key={`${finding.category}:${finding.subject_ref ?? "plan"}:${index}`}>
            <div className="title-row">
              <strong>{formatSignal(finding.category)}</strong>
              <StatusBadge label={finding.severity} tone={riskTone(finding.severity)} />
            </div>
            <p>{finding.detail}</p>
            {finding.subject_ref && <code>{finding.subject_ref}</code>}
          </article>
        ))}
      </div>
    </section>
  );
}

export function PlanReports({ riskReport, planQuality, compact = false }: PlanReportsProps) {
  if (!riskReport && !planQuality) {
    return <p className="muted">Risk and plan-quality reports were not returned for this Plan.</p>;
  }

  const blockingFindings = riskReport?.findings.filter((finding) => finding.blocking) ?? [];
  const advisoryFindings = riskReport?.findings.filter((finding) => !finding.blocking) ?? [];

  return (
    <div className={`plan-reports${compact ? " compact" : ""}`}>
      {riskReport && (
        <section className="report-surface risk-report">
          <div className="title-row">
            <div>
              <h3>Plan risk</h3>
              <p className="muted">Model findings about this Plan, grouped by whether recalculation is required.</p>
            </div>
            <StatusBadge label={`${riskReport.level} risk`} tone={riskTone(riskReport.level)} />
          </div>
          {riskReport.findings.length === 0 ? (
            <p className="muted">The model returned no risk findings.</p>
          ) : (
            <>
              <FindingList findings={blockingFindings} blocking />
              <FindingList findings={advisoryFindings} blocking={false} />
            </>
          )}
        </section>
      )}

      {planQuality && (
        <section className="report-surface plan-quality-report">
          <div>
            <h3>Plan-quality signals</h3>
            <p className="muted">Model assessment for <code>{planQuality.plan_ref}</code>.</p>
          </div>
          <dl className="quality-signal-grid">
            <div>
              <dt>Feedback latency</dt>
              <dd>{planQuality.feedback_latency} min</dd>
            </div>
            <div>
              <dt>Checkpoint coverage</dt>
              <dd>{formatSignal(planQuality.checkpoint_coverage)}</dd>
            </div>
            <div>
              <dt>Affect margin</dt>
              <dd>{planQuality.affect_margin.toFixed(3)}</dd>
            </div>
            <div>
              <dt>Model failure pattern</dt>
              <dd>{formatSignal(planQuality.failure_pattern)}</dd>
            </div>
            <div>
              <dt>Stretch pressure</dt>
              <dd>{formatSignal(planQuality.stretch_pressure)}</dd>
            </div>
            <div>
              <dt>Post-Plan state delta</dt>
              <dd>{formatSignal(planQuality.post_plan_state_delta)}</dd>
            </div>
          </dl>
          {planQuality.violated_dimensions && planQuality.violated_dimensions.length > 0 && (
            <p className="quality-violations">
              <strong>Affect dimensions in the model:</strong> {planQuality.violated_dimensions.map(formatSignal).join(", ")}
            </p>
          )}
          <section className="model-repairs">
            <h4>Model repair suggestions</h4>
            {planQuality.revision_suggestions.length > 0 ? (
              <ul>
                {planQuality.revision_suggestions.map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">The model returned no repair suggestions.</p>
            )}
          </section>
        </section>
      )}
    </div>
  );
}
