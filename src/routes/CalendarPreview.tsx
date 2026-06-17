import { useEffect, useMemo, useState } from "react";

import {
  orchestratorClient,
  OrchestratorError,
  type BootstrapDiagnostic,
  type CalendarResponse,
  type GeneratePlanningResponse,
  type PlanBody,
  type RecalculationResponse,
  type RecalculationTriggerType,
  type ScheduledTask
} from "../api/client";
import { DiagnosticsList } from "../components/DiagnosticsList";
import { StatusBadge } from "../components/StatusBadge";

type RequestStatus = "idle" | "loading" | "submitting" | "failed";

type CalendarPlan = {
  id: string | null;
  status: string;
  steps: ScheduledTask[];
  created_at?: string;
  supersedes_plan_id?: string | null;
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
    steps: calendar.steps
  };
}

function planFromBody(plan: PlanBody): CalendarPlan {
  return {
    id: plan.id,
    status: plan.status,
    steps: plan.steps,
    created_at: plan.created_at,
    supersedes_plan_id: plan.supersedes_plan_id
  };
}

function formatMinuteTimestamp(value: number): string {
  const date = new Date(value * 60_000);
  if (Number.isNaN(date.getTime()) || value < 1_000_000) {
    return `minute ${value}`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
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
            <span>{formatMinuteTimestamp(step.start)}</span>
            <span>{formatMinuteTimestamp(step.end)}</span>
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

export function CalendarPreview() {
  const [status, setStatus] = useState<RequestStatus>("loading");
  const [plan, setPlan] = useState<CalendarPlan | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratePlanningResponse | null>(null);
  const [lastRecalculation, setLastRecalculation] = useState<RecalculationState | null>(null);
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);
  const [formError, setFormError] = useState("");
  const [triggerType, setTriggerType] = useState<RecalculationTriggerType>("user_override");
  const [note, setNote] = useState("");

  async function loadCurrentCalendar() {
    setStatus("loading");
    setFormError("");
    try {
      const response = await orchestratorClient.currentCalendar();
      setPlan(planFromCurrentCalendar(response.data));
      setDiagnostics([]);
      setStatus("idle");
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setDiagnostics(error.diagnostics);
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
    setDiagnostics([]);
    try {
      const response = await orchestratorClient.generatePlan();
      setGeneratedPlan(response.data);
      setDiagnostics(response.data.diagnostics);
      if (response.data.plan) {
        setPlan(planFromBody(response.data.plan));
      } else {
        await loadCurrentCalendar();
      }
      setStatus("idle");
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setDiagnostics(error.diagnostics);
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
    setDiagnostics([]);
    const triggeredAt = new Date().toISOString();

    try {
      const response = await orchestratorClient.recalculatePlan({
        triggered_at: triggeredAt,
        trigger_type: triggerType,
        note
      });
      setLastRecalculation({ triggeredAt, triggerType, response: response.data });
      setDiagnostics(response.data.diagnostics);
      if (response.data.plan) {
        setPlan(planFromBody(response.data.plan));
      } else {
        await loadCurrentCalendar();
      }
      setStatus("idle");
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setDiagnostics(error.diagnostics);
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
        <div className="section-kicker">Calendar</div>
        <h1>Compact Calendar</h1>
        <p className="muted">
          Deterministic skeleton Calendar for the latest timed Plan. It shows one admitted candidate with timed placements, dependencies, and static
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
      <DiagnosticsList diagnostics={diagnostics} />

      <section className="calendar-panel">
        <div className="title-row">
          <div>
            <h2>Skeleton placements</h2>
            <p className="muted">Compact Calendar grammar, rendered from canonical Plan timing.</p>
          </div>
          <StatusBadge label={plan?.status ?? "unknown"} tone={plan?.status === "admitted" ? "success" : "neutral"} />
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
            <dd>Single deterministic skeleton</dd>
          </div>
        </dl>
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
        <CompactCalendar plan={plan ?? { id: null, status: "empty", steps: [] }} />
      </section>

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
