import { usesStandInObservation } from "../affect";
import { formatDuration } from "../duration";
import type { HumanCompletePlanQuality, LegitimizationReport, RiskFinding, RiskLevel, RiskReport } from "../api/client";
import { StatusBadge } from "./StatusBadge";

type PlanReportsProps = {
  riskReport?: RiskReport | null;
  planQuality?: HumanCompletePlanQuality | null;
  /**
   * The Plan's affect legitimization, where the screen has it. It says whether the affect figures
   * were measured. Without it the panel shows the figures as they came.
   */
  legitimization?: LegitimizationReport | null;
  compact?: boolean;
};

/// What an affect row reads when nothing was measured.
const NOT_RECORDED = "not recorded";

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

export function PlanReports({ riskReport, planQuality, legitimization, compact = false }: PlanReportsProps) {
  if (!riskReport && !planQuality) {
    return <p className="muted">Risk and plan-quality reports were not returned for this Plan.</p>;
  }
  // With no Snapshot the orchestrator scores the Plan against a stand-in, and the three affect
  // figures below are that stand-in's. They are not shown as a number and two words they never were.
  const affectRecorded = !(legitimization && usesStandInObservation(legitimization));

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
              {/* Planning seconds, from the Plan's start to its first checkpoint or its last placement. */}
              <dd>{formatDuration(planQuality.feedback_latency)}</dd>
            </div>
            <div>
              <dt>Checkpoint coverage</dt>
              <dd>{formatSignal(planQuality.checkpoint_coverage)}</dd>
            </div>
            <div>
              <dt>Affect margin</dt>
              <dd>{affectRecorded ? planQuality.affect_margin.toFixed(3) : NOT_RECORDED}</dd>
            </div>
            <div>
              <dt>Model failure pattern</dt>
              <dd>{formatSignal(planQuality.failure_pattern)}</dd>
            </div>
            <div>
              <dt>Stretch pressure</dt>
              <dd>{affectRecorded ? formatSignal(planQuality.stretch_pressure) : NOT_RECORDED}</dd>
            </div>
            <div>
              <dt>Post-Plan state delta</dt>
              <dd>{affectRecorded ? formatSignal(planQuality.post_plan_state_delta) : NOT_RECORDED}</dd>
            </div>
          </dl>
          {!affectRecorded && (
            <p className="quality-not-recorded">
              No Snapshot of how you are feeling has been taken, so UbU is not guessing at affect margin, stretch pressure or post-Plan state.
            </p>
          )}
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
