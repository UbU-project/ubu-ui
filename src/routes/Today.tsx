import { PreconditionWords } from "../components/PreconditionWords";
import { useEffect, useMemo, useState } from "react";

import {
  orchestratorClient,
  OrchestratorError,
  type BlockedTask,
  type BootstrapDiagnostic,
  type CalendarResponse,
  type GeneratePlanningResponse,
  type HumanCompletePlanQuality,
  type LegitimizationReport,
  type PlanBody,
  type PlanCandidate,
  type ProbabilityQuality,
  type RecalculationResponse,
  type RecalculationTriggerType,
  type RiskReport,
  type UnplacedTask,
  type ScheduledTask
} from "../api/client";
import { usesBootstrapDefaultProfile } from "../affect";
import { DiagnosticsList } from "../components/DiagnosticsList";
import { PlanReports } from "../components/PlanReports";
import { StatusBadge } from "../components/StatusBadge";
import { TimeByCategory } from "../components/TimeByCategory";

type RequestStatus = "idle" | "loading" | "submitting" | "failed";

type CalendarPlan = {
  id: string | null;
  status: string;
  steps: ScheduledTask[];
  created_at?: string;
  supersedes_plan_id?: string | null;
  legitimization?: LegitimizationReport | null;
  selectedCandidate?: PlanCandidate | null;
  alternatives: PlanCandidate[];
  riskReport?: RiskReport | null;
  planQuality?: HumanCompletePlanQuality | null;
};

type RecalculationState = {
  triggeredAt: string;
  triggerType: RecalculationTriggerType;
  response: RecalculationResponse;
};

const triggerOptions: Array<{ value: RecalculationTriggerType; label: string }> = [
  { value: "user_override", label: "User override" },
  { value: "github_update", label: "GitHub update" },
  { value: "observed_snapshot", label: "Observed snapshot" },
  { value: "external_event", label: "External event" },
  { value: "low_compact_calendar_coverage", label: "Low calendar coverage" },
  { value: "worker_request", label: "Worker request" }
];

function planFromCurrentCalendar(calendar: CalendarResponse): CalendarPlan {
  return {
    id: calendar.plan_id,
    status: calendar.plan_id ? "admitted" : "empty",
    steps: calendar.steps,
    legitimization: calendar.legitimization ?? null,
    selectedCandidate: calendar.selected_candidate ?? null,
    alternatives: calendar.alternatives,
    riskReport: calendar.risk_report ?? null,
    planQuality: calendar.human_complete_plan_quality ?? null
  };
}

function planFromBody(plan: PlanBody): CalendarPlan {
  return {
    id: plan.id,
    status: plan.status,
    steps: plan.steps,
    created_at: plan.created_at,
    supersedes_plan_id: plan.supersedes_plan_id,
    legitimization: plan.legitimization ?? null,
    selectedCandidate: plan.selected_candidate ?? null,
    alternatives: plan.alternatives ?? [],
    riskReport: plan.risk_report ?? null,
    planQuality: plan.human_complete_plan_quality ?? null
  };
}

/// A placement's instant, in the operator's own timezone. The numeric `start` and `end` of a step are
/// planner coordinates and are never shown: what is shown is the instant the orchestrator spelled out.
/// The day is always said, so a window that crosses midnight shows both days, and the seconds are said
/// only when the instant has them.
function formatLocalInstant(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(date.getUTCSeconds() === 0 ? {} : { second: "2-digit" })
  }).format(date);
}

function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function formatIsoTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatTrigger(value: RecalculationTriggerType): string {
  return value.replaceAll("_", " ");
}

function sortedSteps(steps: ScheduledTask[]): ScheduledTask[] {
  return [...steps].sort((left, right) => left.start - right.start || left.index - right.index || left.task_id.localeCompare(right.task_id));
}

function formatLegitimizationMode(value: LegitimizationReport["mode"]): string {
  return value.replaceAll("_", " ");
}

function formatDimension(value: string): string {
  return value.replaceAll("_", " ");
}

function formatAffectMargin(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Not returned";
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3,
    signDisplay: "exceptZero"
  });
}

function formatScore(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3
  });
}

function formatProbability(value: number): string {
  return value.toLocaleString(undefined, {
    style: "percent",
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  });
}

function hasProbabilityEstimate(candidate: PlanCandidate): boolean {
  return (
    candidate.probability_quality !== "not_estimated" &&
    typeof candidate.display_probability === "number" &&
    Number.isFinite(candidate.display_probability) &&
    typeof candidate.probability_interval_low === "number" &&
    Number.isFinite(candidate.probability_interval_low) &&
    typeof candidate.probability_interval_high === "number" &&
    Number.isFinite(candidate.probability_interval_high)
  );
}

function probabilityQualityLabel(quality: ProbabilityQuality): string {
  if (quality === "estimated" || quality === "full") {
    return "Full estimate";
  }
  if (quality === "degraded_numeric_jitter") {
    return "Degraded: numeric jitter";
  }
  if (quality === "degraded_independence") {
    return "Degraded: independence";
  }
  return "Not estimated";
}

function probabilityQualityTone(quality: ProbabilityQuality): "success" | "warning" | "neutral" {
  if (quality === "estimated" || quality === "full") {
    return "success";
  }
  return quality === "not_estimated" ? "neutral" : "warning";
}

function formatCandidateRole(value: PlanCandidate["candidate_role"]): string {
  return value.replaceAll("_", " ");
}

function semiLegitimizationLabel(candidate: PlanCandidate): string {
  const result = candidate.semi_legitimization_summary.result;
  if (result === "reject_obvious") {
    return "Reject obvious";
  }
  if (result === "passes_cheap_checks") {
    return "Passed cheap checks";
  }
  return "Needs full legitimization";
}

function CandidateScoreCard({ candidate, selected = false }: { candidate: PlanCandidate; selected?: boolean }) {
  const rejected = candidate.semi_legitimization_summary.result === "reject_obvious";
  const hasEstimate = hasProbabilityEstimate(candidate);
  const degraded = candidate.probability_quality === "degraded_numeric_jitter" || candidate.probability_quality === "degraded_independence";

  return (
    <article className={`candidate-score-card${selected ? " selected" : ""}${rejected ? " rejected" : ""}`}>
      <div className="title-row">
        <div>
          <div className="candidate-rank">{selected ? "Rank 1 selection" : `Rank ${candidate.rank}`}</div>
          <h3>{selected ? "Selected candidate" : formatCandidateRole(candidate.candidate_role)}</h3>
          <code>{candidate.candidate_id}</code>
          <div className="candidate-role">
            Candidate role: <code>{candidate.candidate_role}</code>
          </div>
        </div>
        <StatusBadge
          label={semiLegitimizationLabel(candidate)}
          tone={rejected ? "danger" : candidate.semi_legitimization_summary.result === "passes_cheap_checks" ? "success" : "warning"}
        />
      </div>
      <section className={`candidate-rollout${degraded ? " degraded" : ""}${candidate.probability_quality === "not_estimated" ? " not-estimated" : ""}`}>
        <div className="title-row">
          <h4>Rollout result</h4>
          <StatusBadge label={probabilityQualityLabel(candidate.probability_quality)} tone={probabilityQualityTone(candidate.probability_quality)} />
        </div>
        {hasEstimate ? (
          <dl className="candidate-rollout-grid">
            <div>
              <dt>Display probability (Wilson range)</dt>
              <dd>
                {formatProbability(candidate.probability_interval_low as number)}–{formatProbability(candidate.probability_interval_high as number)}
              </dd>
            </div>
            <div>
              <dt>Robustness (p10)</dt>
              <dd>{formatScore(candidate.robustness_score)}</dd>
            </div>
          </dl>
        ) : (
          <p className="candidate-rollout-unavailable">Robustness not computed. No rollout probability is available; the score below is the C-1 proxy.</p>
        )}
        {degraded && (
          <p className="candidate-rollout-caution" role="alert">
            Caution: this rollout estimate is degraded ({formatDimension(candidate.probability_quality)}). Treat the Wilson range as uncertain.
          </p>
        )}
      </section>
      <dl className="candidate-score-grid">
        <div>
          <dt>Utility</dt>
          <dd>{formatScore(candidate.score_summary.utility_score)}</dd>
        </div>
        <div>
          <dt>C-1 robustness proxy</dt>
          <dd>{formatScore(candidate.score_summary.robustness_score)}</dd>
        </div>
        <div>
          <dt>Affect margin</dt>
          <dd>{formatScore(candidate.score_summary.affect_margin_score)}</dd>
        </div>
        <div>
          <dt>Schedule diversity</dt>
          <dd>{formatScore(candidate.score_summary.schedule_diversity_score)}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{formatScore(candidate.score_summary.total_score)}</dd>
        </div>
      </dl>
      <p className="candidate-semi-result">
        Semi-legitimization: <strong>{formatDimension(candidate.semi_legitimization_summary.result)}</strong>
        {rejected ? ". This candidate was marked for pruning by the cheap checks." : "."}
      </p>
    </article>
  );
}

function CandidateScores({ selected, alternatives }: { selected?: PlanCandidate | null; alternatives: PlanCandidate[] }) {
  if (!selected) {
    return <p className="muted">Candidate scoring was not returned for this Calendar.</p>;
  }

  return (
    <div className="candidate-scores">
      <div>
        <h2>Why this Plan was selected</h2>
        <p className="muted">Ranked after rollout. Probability is shown as its Wilson interval; robustness is the rollout p10 lower-tail result.</p>
      </div>
      <CandidateScoreCard candidate={selected} selected />
      <div>
        <h2>Role-tagged alternatives</h2>
        <p className="muted">Compare the highest-utility, most-robust, and most-schedule-diverse trade-offs returned by the planner.</p>
      </div>
      {alternatives.length > 0 ? (
        <div className="candidate-alternatives">
          {alternatives.map((candidate) => (
            <CandidateScoreCard candidate={candidate} key={candidate.candidate_id} />
          ))}
        </div>
      ) : (
        <p className="muted">No alternative candidates were returned.</p>
      )}
    </div>
  );
}

function legitimizationTone(legitimization?: LegitimizationReport | null): "neutral" | "success" | "warning" | "danger" {
  if (!legitimization) {
    return "neutral";
  }

  if (legitimization.affect_feasible) {
    return "success";
  }

  return legitimization.mode === "warn_only" ? "warning" : "danger";
}

function legitimizationLabel(legitimization?: LegitimizationReport | null): string {
  if (!legitimization) {
    return "Legitimization missing";
  }

  if (legitimization.affect_feasible) {
    return "Affect feasible";
  }

  return legitimization.mode === "warn_only" ? "Affect warning" : "Affect blocked";
}

function LegitimizationSummary({ legitimization }: { legitimization?: LegitimizationReport | null }) {
  if (!legitimization) {
    return (
      <div className="legitimization-summary missing">
        <div className="title-row">
          <h3>Affect legitimization</h3>
          <StatusBadge label="Not returned" tone="neutral" />
        </div>
        <p className="muted">The current Calendar response did not include an affect legitimization report.</p>
      </div>
    );
  }

  const violatedDimensions = legitimization.violated_dimensions ?? [];
  const staleDimensions = legitimization.stale_dimensions ?? [];
  const hasBootstrapDefaultProfile = usesBootstrapDefaultProfile(legitimization);
  const failureClass = legitimization.affect_feasible ? "" : legitimization.mode === "warn_only" ? " warning" : " blocked";

  return (
    <div className={`legitimization-summary${failureClass}`}>
      <div className="title-row">
        <h3>Affect legitimization</h3>
        <StatusBadge label={legitimizationLabel(legitimization)} tone={legitimizationTone(legitimization)} />
      </div>
      {!legitimization.affect_feasible && legitimization.mode === "enforce" && (
        <p className="error-text">The plan failed affect legitimization in enforce mode.</p>
      )}
      {!legitimization.affect_feasible && legitimization.mode === "warn_only" && (
        <p className="warning-text">The plan violates affect tolerances, but warn_only mode allows review.</p>
      )}
      <dl className="policy-grid calendar-legitimization-meta">
        <div>
          <dt>Feasible</dt>
          <dd>{legitimization.affect_feasible ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Affect margin</dt>
          <dd>{formatAffectMargin(legitimization.affect_margin)}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{formatLegitimizationMode(legitimization.mode)}</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>{formatDimension(legitimization.result)}</dd>
        </div>
        <div>
          <dt>Violated dimensions</dt>
          <dd>{violatedDimensions.length > 0 ? violatedDimensions.map(formatDimension).join(", ") : "None"}</dd>
        </div>
        <div>
          <dt>Stale dimensions</dt>
          <dd>{staleDimensions.length > 0 ? staleDimensions.map(formatDimension).join(", ") : "None"}</dd>
        </div>
      </dl>
      {legitimization.stale_affect_warning && (
        <p className="affect-warning" role="alert">
          {legitimization.stale_affect_warning}
        </p>
      )}
      {hasBootstrapDefaultProfile && (
        <p className="affect-default-warning">
          Bootstrap default profile observation is in use as a temporary review prior, not current measured affect state.
        </p>
      )}
    </div>
  );
}

function CompactCalendar({ plan }: { plan: CalendarPlan }) {
  const steps = useMemo(() => sortedSteps(plan.steps), [plan.steps]);

  if (steps.length === 0) {
    return (
      <div className="calendar-empty">
        <h2>No timed Plan available</h2>
        <p className="muted">Generate a Plan or load the current Calendar after the store has admitted Tasks and Calendar windows.</p>
      </div>
    );
  }

  return (
    <div className="compact-calendar" id={plan.id ? `plan-${plan.id}` : undefined}>
      {steps.map((step) => (
        <article className="calendar-step" key={`${step.index}:${step.task_id}`}>
          <div className="calendar-step-time">
            <time dateTime={step.start_at}>{formatLocalInstant(step.start_at)}</time>
            <time dateTime={step.end_at}>{formatLocalInstant(step.end_at)}</time>
          </div>
          <div className="calendar-step-body">
            <div className="title-row">
              <h3>{step.summary}</h3>
              <StatusBadge label={step.static_anchor ? "Static anchor" : "Skeleton"} tone={step.static_anchor ? "warning" : "neutral"} />
            </div>
            <dl className="calendar-step-meta">
              <div>
                <dt>Task</dt>
                <dd>
                  <code>{step.task_id}</code>
                </dd>
              </div>
              <div>
                <dt>Dependencies</dt>
                <dd>{step.depends_on.length > 0 ? step.depends_on.join(", ") : "None"}</dd>
              </div>
              <div>
                <dt>Placement</dt>
                <dd>{step.placement_authority}</dd>
              </div>
            </dl>
          </div>
        </article>
      ))}
    </div>
  );
}

// The planner's alternatives are tokens. They are said in words here; one this screen does not know
// is shown as it came rather than dropped.
const ALTERNATIVE_WORDS: Record<string, string> = {
  decompose_task: "Break the Task up into smaller Tasks that fit, then generate the Plan again.",
  extend_planning_horizon: "Plan a longer period, which may hold a free interval long enough.",
  relax_task_window: "Widen the Task's allowed time range, if it has one.",
  reprioritize_task: "Raise the Task's priority, so it is placed ahead of other work.",
  remove_or_moot_task: "Remove the Task, or mark it as no longer needed.",
  manual_decision: "Decide by hand what gives way; the planner will not choose."
};
// Both reasons mean the same thing to the operator: no free interval is long enough for the Task.
const TOO_LONG_REASONS = new Set(["no_eligible_chunk_large_enough", "outside_allowed_window"]);

/// Said plainly when the Plan was made around a double-booking. The orchestrator reports each such pair
/// as `static_task_collision`, by title, in the list below this. It is information: the Plan was made.
function CollisionNotice({ notices }: { notices: BootstrapDiagnostic[] }) {
  const pairs = notices.filter((notice) => notice.code === "static_task_collision").length;
  if (pairs === 0) {
    return null;
  }
  return (
    <div className="diagnostics-list diagnostics-info collision-notice" role="status" aria-label="Fixed commitments that collide">
      <span className="diagnostic-message">
        {pairs === 1
          ? "Two fixed commitments overlap, or one depends on another that ends too late."
          : `${pairs} pairs of fixed commitments overlap, or have one that depends on another that ends too late.`}{" "}
        Both of a pair are in the Plan at their own times and both are busy: no other work is placed in the time they cover. The Plan was still
        made. Each pair is named below.
      </span>
    </div>
  );
}

/// What is not in the Plan, and why. Two different reasons, never run together: an unplaced Task did
/// not fit, and a blocked Task was not ready. A fact about the Plan, with a place of its own: never a
/// diagnostic, never an alert.
function NotInPlan({ unplaced, blocked, onOpenUniverseState }: { unplaced: UnplacedTask[]; blocked: BlockedTask[]; onOpenUniverseState: () => void }) {
  const total = unplaced.length + blocked.length;
  if (total === 0) {
    return null;
  }
  const one = total === 1;
  return (
    <section className="calendar-panel not-in-plan" aria-labelledby="not-in-plan-heading">
      <h2 id="not-in-plan-heading">Not in this Plan</h2>
      <p>
        {one ? "1 Task was left out of this Plan. It is" : `${total} Tasks were left out of this Plan. They are`} in none of the placements above.
      </p>
      {blocked.length > 0 && (
        <p>
          {unplaced.length > 0 && `${unplaced.length} did not fit. `}
          {blocked.length === 1 ? "1 was not ready." : `${blocked.length} were not ready.`}
        </p>
      )}
      {unplaced.map((task) => (
        <article className="not-in-plan-task" key={task.task_id} aria-label={`Not placed: ${task.summary}`}>
          <h3>{task.summary}</h3>
          <p>{task.explanation}</p>
          {TOO_LONG_REASONS.has(task.reason) && <p>It is longer than any free interval in the planning horizon.</p>}
          {task.safe_alternatives.length > 0 && (
            <>
              <p>What can be done:</p>
              <ul>
                {task.safe_alternatives.map((alternative) => (
                  <li key={alternative.action}>{ALTERNATIVE_WORDS[alternative.action] ?? <code>{alternative.action}</code>}</li>
                ))}
              </ul>
            </>
          )}
          <p className="small-print">
            <code>{task.task_id}</code> <code>{task.reason}</code>
          </p>
        </article>
      ))}
      {/* The orchestrator sends a blocked Task's id and precondition, and no title. The id is what there is. */}
      {blocked.map((task) => (
        <article className="not-in-plan-task" key={task.task_id} aria-label={`Not ready: ${task.task_id}`}>
          <h3>
            Not ready: <code>{task.task_id}</code>
          </h3>
          <p>This Task was not ready, so the planner did not try to place it. That is not the same as not fitting.</p>
          <p>
            It is waiting for this to be so: <PreconditionWords precondition={task.precondition} />.
          </p>
          {/* This is where an operator first meets a precondition, so this is where the screen that holds its answer is offered. */}
          <p>
            Whether it is so is recorded in the UniverseState, under that name.{" "}
            <button type="button" className="secondary-action" aria-label={`Open UniverseState for ${task.task_id}`} onClick={onOpenUniverseState}>
              Open UniverseState
            </button>
          </p>
          <p>When it is so, generate the Plan again.</p>
          <p className="small-print">
            <code>{task.task_id}</code> <code>task_precondition_blocked</code>
          </p>
        </article>
      ))}
    </section>
  );
}

export function Today({ onOpenUniverseState }: { onOpenUniverseState: () => void }) {
  const [status, setStatus] = useState<RequestStatus>("loading");
  const [plan, setPlan] = useState<CalendarPlan | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratePlanningResponse | null>(null);
  const [lastRecalculation, setLastRecalculation] = useState<RecalculationState | null>(null);
  // Two lists, never one. `failures` came with a request that failed. `notices` came with a
  // planning response that succeeded: they say what the planner did, and they are not errors.
  const [failures, setFailures] = useState<BootstrapDiagnostic[]>([]);
  const [notices, setNotices] = useState<BootstrapDiagnostic[]>([]);
  // What the generated Plan left out, for either reason, and which Plan that was. Only a generate reports it.
  const [notInPlan, setNotInPlan] = useState<{ planId: string | null; tasks: UnplacedTask[]; blocked: BlockedTask[] }>({ planId: null, tasks: [], blocked: [] });
  const [formError, setFormError] = useState("");
  const [triggerType, setTriggerType] = useState<RecalculationTriggerType>("user_override");
  const [note, setNote] = useState("");

  async function loadCurrentCalendar() {
    setStatus("loading");
    setFormError("");
    try {
      const response = await orchestratorClient.currentCalendar();
      setPlan(planFromCurrentCalendar(response.data));
      setFailures([]);
      setStatus("idle");
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setFailures(error.diagnostics);
        setFormError(error.message);
      } else {
        setFormError("Could not load the current Calendar from the local orchestrator.");
      }
      setStatus("failed");
    }
  }

  useEffect(() => {
    void loadCurrentCalendar();
  }, []);

  async function generatePlan() {
    setStatus("submitting");
    setFormError("");
    setFailures([]);
    setNotices([]);
    try {
      const response = await orchestratorClient.generatePlan();
      setGeneratedPlan(response.data);
      setNotices(response.data.diagnostics);
      setNotInPlan({ planId: response.data.plan?.id ?? null, tasks: response.data.unplaced_tasks ?? [], blocked: response.data.blocked_tasks ?? [] });
      if (response.data.plan) {
        setPlan(planFromBody(response.data.plan));
      } else {
        await loadCurrentCalendar();
      }
      setStatus("idle");
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setFailures(error.diagnostics);
        setFormError(error.message);
      } else {
        setFormError("Could not generate a Plan through the local orchestrator.");
      }
      setStatus("failed");
    }
  }

  async function requestRecalculation() {
    setStatus("submitting");
    setFormError("");
    setFailures([]);
    setNotices([]);
    const triggeredAt = new Date().toISOString();

    try {
      const response = await orchestratorClient.recalculatePlan({
        triggered_at: triggeredAt,
        trigger_type: triggerType,
        note
      });
      setLastRecalculation({ triggeredAt, triggerType, response: response.data });
      setNotices(response.data.diagnostics);
      // The list belonged to the Plan that was just superseded, and a recalculation reports none of its own.
      setNotInPlan({ planId: null, tasks: [], blocked: [] });
      if (response.data.plan) {
        setPlan(planFromBody(response.data.plan));
      } else {
        await loadCurrentCalendar();
      }
      setStatus("idle");
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setFailures(error.diagnostics);
        setFormError(error.message);
      } else {
        setFormError("Could not request recalculation through the local orchestrator.");
      }
      setStatus("failed");
    }
  }

  const hasPlan = Boolean(plan?.id && plan.steps.length > 0);
  const currentPlanLink = plan?.id ? `#plan-${plan.id}` : undefined;

  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Today</div>
        <h1>Compact Calendar</h1>
        <p className="muted">
          Compact Calendar for the latest timed Plan. It shows the admitted timed candidate with affect legitimization, dependencies, and static
          anchors only.
        </p>
      </div>

      <div className="calendar-controls">
        <button type="button" className="secondary-action" onClick={loadCurrentCalendar} disabled={status === "loading" || status === "submitting"}>
          {status === "loading" ? "Loading Calendar" : "Load current Calendar"}
        </button>
        <button type="button" className="primary-action" onClick={generatePlan} disabled={status === "submitting"}>
          {status === "submitting" ? "Working" : "Generate Plan"}
        </button>
      </div>

      {formError && <span className="error-text">{formError}</span>}
      <DiagnosticsList diagnostics={failures} />
      <CollisionNotice notices={notices} />
      <DiagnosticsList diagnostics={notices} tone="info" />

      <section className="calendar-panel">
        <div className="title-row">
          <div>
            <h2>Timed placements</h2>
            {plan && plan.steps.length > 0 && <p className="muted" aria-label="Placement counts">Placements: {plan.steps.length}. Skeleton {plan.steps.filter((step) => !step.static_anchor).length}, Static anchor {plan.steps.filter((step) => step.static_anchor).length}.</p>}
            <p className="muted">Compact Calendar grammar, rendered from canonical Plan timing and affect legitimization.</p>
            <p className="muted">Each placement shows when it starts and when it ends, in your timezone, {localTimezone()}.</p>
          </div>
          <StatusBadge label={legitimizationLabel(plan?.legitimization)} tone={legitimizationTone(plan?.legitimization)} />
        </div>
        <dl className="policy-grid calendar-plan-meta">
          <div>
            <dt>Plan</dt>
            <dd>{plan?.id ? <code>{plan.id}</code> : "None"}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{plan?.created_at ? formatIsoTimestamp(plan.created_at) : "Not returned by current Calendar"}</dd>
          </div>
          <div>
            <dt>Candidate</dt>
            <dd>{plan?.selectedCandidate ? `Rank ${plan.selectedCandidate.rank} of scored candidates` : "Single timed candidate"}</dd>
          </div>
        </dl>
        <PlanReports riskReport={plan?.riskReport} planQuality={plan?.planQuality} legitimization={plan?.legitimization} />
        <CandidateScores selected={plan?.selectedCandidate} alternatives={plan?.alternatives ?? []} />
        <LegitimizationSummary legitimization={plan?.legitimization} />
        {plan?.supersedes_plan_id && (
          <p className="warning-text">
            Plan <code>{plan.supersedes_plan_id}</code> was superseded by{" "}
            {currentPlanLink ? (
              <a href={currentPlanLink}>
                <code>{plan.id}</code>
              </a>
            ) : (
              "the current Plan"
            )}
            .
          </p>
        )}
        <CompactCalendar plan={plan ?? { id: null, status: "empty", steps: [], legitimization: null, alternatives: [] }} />
      </section>

      {/* Shown for the Plan it was reported with, and for no other. */}
      <NotInPlan
        unplaced={notInPlan.planId !== null && notInPlan.planId === plan?.id ? notInPlan.tasks : []}
        blocked={notInPlan.planId !== null && notInPlan.planId === plan?.id ? notInPlan.blocked : []}
        onOpenUniverseState={onOpenUniverseState}
      />

      <TimeByCategory />

      <section className="calendar-panel">
        <div>
          <h2>Recalculation</h2>
          <p className="muted">Request a store-backed repair pass and surface the latest trigger and supersession relationship.</p>
        </div>
        <div className="recalculation-form">
          <label htmlFor="recalculation-trigger">Trigger reason</label>
          <select
            id="recalculation-trigger"
            value={triggerType}
            onChange={(event) => setTriggerType(event.target.value as RecalculationTriggerType)}
          >
            {triggerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor="recalculation-note">Note</label>
          <textarea id="recalculation-note" value={note} onChange={(event) => setNote(event.target.value)} />
          <button type="button" className="primary-action fit" onClick={requestRecalculation} disabled={!hasPlan || status === "submitting"}>
            Request recalculation
          </button>
        </div>
        {!hasPlan && <p className="muted">Recalculation is available after an admitted timed Plan exists.</p>}
        {lastRecalculation && (
          <div className="recalculation-summary">
            <h3>Last recalculated</h3>
            <dl className="policy-grid">
              <div>
                <dt>Triggered</dt>
                <dd>{formatIsoTimestamp(lastRecalculation.triggeredAt)}</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{formatTrigger(lastRecalculation.triggerType)}</dd>
              </div>
              <div>
                <dt>Repair scope</dt>
                <dd>{lastRecalculation.response.repair_scope.replaceAll("_", " ")}</dd>
              </div>
            </dl>
            <p className="muted">A recalculation does not report which Tasks it left out. Generate Plan to see them.</p>
            {lastRecalculation.response.plan ? (
              <p>
                Prior Plan <code>{lastRecalculation.response.prior_plan_id}</code> was superseded by{" "}
                <a href={`#plan-${lastRecalculation.response.plan.id}`}>
                  <code>{lastRecalculation.response.plan.id}</code>
                </a>
                .
              </p>
            ) : (
              <p className="muted">
                Prior Plan <code>{lastRecalculation.response.prior_plan_id}</code> was not superseded because no repaired Plan was returned.
              </p>
            )}
          </div>
        )}
        {generatedPlan && (
          <p className="muted">
            Last generation schema: {generatedPlan.schema_version}; request: <code>{generatedPlan.request_id}</code>
          </p>
        )}
      </section>
    </section>
  );
}
