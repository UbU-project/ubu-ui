import openApiSpec from "./generated/openapi.generated.json";

export type ApiResult<T> = {
  data: T;
  status: number;
};

export type SessionTokenRequest = {
  token: string;
};

export type BootstrapSelectedRepo = {
  owner: string;
  repo: string;
};

export type BootstrapAnswers = {
  primary_objective: string;
  work_style: "focused" | "balanced" | "responsive";
  planning_horizon_days: number;
  attention_preference: "deep_work" | "mixed" | "quick_turnaround";
};

export type BootstrapSeedRequest = {
  selected_repo: BootstrapSelectedRepo;
  answers: BootstrapAnswers;
};

export type ImportResponse = {
  imported: number;
  admitted_to_store: number;
  candidates: Array<{
    task_id: string;
    title: string;
    source: string;
  }>;
};

export type BootstrapDiagnostic = {
  code: string;
  message: string;
};

export type ProjectionDiagnostic = BootstrapDiagnostic & {
  operation_id?: string | null;
};

export type NextActionDiagnostic = BootstrapDiagnostic & {
  blocked_task_count: number;
  sampled_task_ids: string[];
};

export type ReadinessState = "ready" | "blocked";

export type TaskLifecycleStatus = "active" | "completed" | "failed" | "moot";

export type NextActionObjectiveRef = {
  objective_id: string;
  title: string;
};

export type NextActionSourceRef = {
  source_kind: string;
  source_id: string;
  url: string | null;
};

export type NextActionSelection = {
  rule: string;
  priority: number | null;
  tiebreak: string;
};

export type NextActionExplanation = {
  template_id: string;
  label: string;
  message: string;
  readiness_state: ReadinessState;
  parent_objective: NextActionObjectiveRef | null;
  source_refs: NextActionSourceRef[];
};

export type NextActionRecommendation = {
  task_id: string;
  title: string;
  status: TaskLifecycleStatus;
  readiness: ReadinessState;
  parent_objective: NextActionObjectiveRef | null;
  source_refs: NextActionSourceRef[];
  selection: NextActionSelection;
  explanation: NextActionExplanation;
};

export type NextActionResponse = {
  schema_version: string;
  recommendation: NextActionRecommendation | null;
  diagnostics: NextActionDiagnostic[];
};

export type RecordedTaskActionKind = "complete" | "override" | "snooze";

export type RecordTaskActionRequest = {
  taskId: string;
  action: RecordedTaskActionKind;
  note?: string;
};

export type ActionDiagnostic = BootstrapDiagnostic;

export type RecordedTaskActionResponse = {
  schema_version: string;
  log_id: string;
  task_id: string;
  action: RecordedTaskActionKind;
  task_status: TaskLifecycleStatus;
  authority_source: string;
  transition_applied: boolean;
  diagnostics: ActionDiagnostic[];
  note: string | null;
};

export type BootstrapSeedResponse = {
  schema_version: string;
  objective_ids: string[];
  preference_ids: string[];
  imported_tasks: ImportResponse;
  diagnostics: BootstrapDiagnostic[];
};

export type SessionTokenResponse = {
  schema_version: string;
  accepted: boolean;
  token_available: boolean;
};

export type HealthResponse = {
  status: string;
  version: string;
  bind_policy: string;
};

export type ProjectionAuthoritySource = "user" | "user_override" | "delegated" | "automation_worker" | "policy" | "system";

export type ProjectionPolicySummary = {
  legitimization: string;
  adjudication_reasons: string[];
  checked_at: string;
  local_only?: boolean | null;
  no_cloud_llm?: boolean | null;
  no_external_export?: boolean | null;
};

export type ProjectionTarget = {
  owner: string;
  repo: string;
  issue_number?: number | null;
};

export type ProjectionOperation = {
  operation_id: string;
  kind: string;
  target: ProjectionTarget;
  summary: string;
  payload: unknown;
};

export type ProjectionPreviewRequest = {
  owner: string;
  repo: string;
  issue_number: number | null;
  observed_labels: string[];
  desired_labels: string[];
  existing_repository_labels: string[];
  no_external_export: boolean;
  reason: string | null;
};

export type ProjectionPreviewResponse = {
  schema_version: string;
  preview_id: string;
  operations: ProjectionOperation[];
  policy_summary: ProjectionPolicySummary;
  requires_approval: boolean;
};

export type ProjectionOperationResult = {
  operation_id: string;
  status: string;
  message?: string | null;
  authority_source?: string | null;
};

export type ProjectionResultResponse = {
  schema_version: string;
  preview_id: string;
  status: "applied" | "partial" | "failed" | string;
  operation_results: ProjectionOperationResult[];
  diagnostics: ProjectionDiagnostic[];
};

export type ProjectionConflict = {
  operation_id: string;
  conflict_type: string;
  expected_label: string;
  observed_labels: string[];
  message: string;
};

export type ProjectionReconcileRequest = {
  observed_labels: string[];
};

export type ProjectionReconcileResponse = {
  schema_version: string;
  reconciliation_id: string;
  preview_id: string;
  status: "matched" | "drifted" | "missing" | string;
  conflicts: ProjectionConflict[];
  diagnostics: ProjectionDiagnostic[];
};

export type ProjectionAcceptExternalResponse = {
  schema_version: string;
  admitted_object_id: string;
  reconciliation_id: string;
  conflict_operation_id: string;
};

export type ScheduledTask = {
  index: number;
  task_id: string;
  summary: string;
  start: number;
  end: number;
  depends_on: string[];
  static_anchor: boolean;
  placement_authority: string;
};

export type AffectLegitimizationMode = "enforce" | "warn_only";

export type AffectDimensionLegitimization = {
  satisfaction: number;
  threshold: number;
  margin: number;
  stale: boolean;
};

export type LegitimizationReport = {
  result: string;
  mode: AffectLegitimizationMode;
  affect_feasible: boolean;
  affect_margin?: number | null;
  violated_dimensions?: string[];
  stale_dimensions?: string[];
  dimensions?: Record<string, AffectDimensionLegitimization>;
  stale_affect_warning?: string | null;
};

export type CandidateRole = "highest_utility" | "most_robust" | "most_schedule_diverse" | "other";

export type ProbabilityQuality =
  | "estimated"
  | "full"
  | "degraded_numeric_jitter"
  | "degraded_independence"
  | "not_estimated";

export type ScoreSummary = {
  utility_score: number;
  robustness_score: number;
  affect_margin_score: number;
  schedule_diversity_score: number;
  total_score: number;
};

export type SemiLegitimizationResult = "passes_cheap_checks" | "reject_obvious" | "needs_full_legitimization";

export type SemiLegitimizationSummary = {
  result: SemiLegitimizationResult;
  affect_budget_ok?: boolean | null;
  dependency_fragility_ok?: boolean | null;
  legitimacy_delta_estimate?: number | null;
  local_repair_viable?: boolean | null;
  slack_preserved?: boolean | null;
  user_mode_compatible?: boolean | null;
};

export type FeasibilitySummary = {
  hard_constraints_assumed_satisfied_by_engine: boolean;
  affect_feasible: boolean;
  minimum_affect_score?: number | null;
  violated_affect_dimensions?: string[];
};

export type PlanCandidate = {
  candidate_id: string;
  rank: number;
  candidate_role: CandidateRole;
  steps: ScheduledTask[];
  score_summary: ScoreSummary;
  feasibility_summary: FeasibilitySummary;
  semi_legitimization_summary: SemiLegitimizationSummary;
  display_probability: number | null;
  probability_interval_low: number | null;
  probability_interval_high: number | null;
  robustness_score: number;
  probability_quality: ProbabilityQuality;
};

export type PlanBody = {
  id: string;
  status: string;
  steps: ScheduledTask[];
  created_at: string;
  supersedes_plan_id?: string | null;
  legitimization?: LegitimizationReport | null;
  selected_candidate?: PlanCandidate | null;
  alternatives?: PlanCandidate[];
};

export type PlanningMode = "fresh_generation" | "repair";

export type PlanningRequestBody = {
  request_id: string;
  schema_version?: string | null;
  mode?: PlanningMode;
};

export type GeneratePlanningResponse = {
  schema_version: string;
  request_id: string;
  plan: PlanBody | null;
  selected_candidate?: PlanCandidate | null;
  alternatives?: PlanCandidate[];
  legitimization?: LegitimizationReport | null;
  diagnostics: BootstrapDiagnostic[];
};

export type CalendarResponse = {
  plan_id: string | null;
  steps: ScheduledTask[];
  display_probability: number | null;
  probability_interval_low: number | null;
  probability_interval_high: number | null;
  robustness_score: number | null;
  probability_quality: ProbabilityQuality;
  selected_candidate?: PlanCandidate | null;
  alternatives: PlanCandidate[];
  legitimization?: LegitimizationReport | null;
};

export type RecalculationTriggerType =
  | "task_completed"
  | "task_failed"
  | "task_moot"
  | "user_override"
  | "observed_snapshot"
  | "external_event"
  | "github_update"
  | "low_compact_calendar_coverage"
  | "worker_request";

export type RecalculationObjectRef = {
  id: string;
  object_type: string;
};

export type RecalculationRequest = {
  triggered_at: string;
  trigger_type: RecalculationTriggerType;
  note?: string | null;
  objects?: RecalculationObjectRef[];
};

export type RecalculationResponse = {
  schema_version: string;
  trigger_type: RecalculationTriggerType;
  repair_scope: string;
  prior_plan_id: string;
  plan: PlanBody | null;
  diagnostics: BootstrapDiagnostic[];
};

type GeneratedPath = keyof typeof openApiSpec.paths;

const DESKTOP_TOKEN_PATH = "/desktop/session/github-token" satisfies GeneratedPath;
const BOOTSTRAP_SEED_PATH = "/bootstrap/seed" satisfies GeneratedPath;
const HEALTH_PATH = "/health" satisfies GeneratedPath;
const PLANNING_GENERATE_PATH = "/planning/generate" satisfies GeneratedPath;
const PLANNING_RECALCULATE_PATH = "/planning/recalculate" satisfies GeneratedPath;
const CALENDAR_CURRENT_PATH = "/calendar/current" satisfies GeneratedPath;
const PROJECTION_PREVIEW_PATH = "/projection/preview" satisfies GeneratedPath;
const PROJECTION_APPROVE_PATH = "/projection/approve" satisfies GeneratedPath;
const PROJECTION_RECONCILE_PATH = "/projection/reconcile" satisfies GeneratedPath;
const PROJECTION_ACCEPT_EXTERNAL_PATH = "/projection/reconciliation/accept-external" satisfies GeneratedPath;
const NEXT_ACTION_PATH = "/next-action" satisfies GeneratedPath;
const RECORD_TASK_ACTION_PATH = "/task/{task_id}/action" satisfies GeneratedPath;

const DESKTOP_SESSION_SCHEMA_VERSION = "ubu.orchestrator.desktop_session.v1";
const BOOTSTRAP_SCHEMA_VERSION = "ubu.orchestrator.bootstrap.v1";
const NEXT_ACTION_SCHEMA_VERSION = "ubu.orchestrator.next_action.v1";
const TASK_ACTION_SCHEMA_VERSION = "ubu.orchestrator.task_action.v1";
const PLANNING_SCHEMA_VERSION = "planning-kernel-contract/0.1";
const RECALCULATION_SCHEMA_VERSION = "ubu.orchestrator.recalculation.v1";
const PROJECTION_PREVIEW_SCHEMA_VERSION = "ubu.orchestrator.projection_preview.v1";
const PROJECTION_APPROVAL_SCHEMA_VERSION = "ubu.orchestrator.projection_approval.v1";
const PROJECTION_RECONCILIATION_SCHEMA_VERSION = "ubu.orchestrator.projection_reconciliation.v1";
const PROJECTION_EXTERNAL_ACCEPT_SCHEMA_VERSION = "ubu.orchestrator.projection_external_accept.v1";
const DEFAULT_ORCHESTRATOR_PORT = "17890";

export function getOrchestratorBaseUrl(): string {
  const explicitUrl = import.meta.env.VITE_UBU_ORCHESTRATOR_URL;

  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, "");
  }

  const port = import.meta.env.VITE_UBU_ORCHESTRATOR_PORT ?? DEFAULT_ORCHESTRATOR_PORT;
  return `http://127.0.0.1:${port}`;
}

export class OrchestratorError extends Error {
  readonly status: number;
  readonly diagnostics: BootstrapDiagnostic[];

  constructor(message: string, status: number, diagnostics: BootstrapDiagnostic[] = []) {
    super(message);
    this.name = "OrchestratorError";
    this.status = status;
    this.diagnostics = diagnostics;
  }
}

function isDiagnostic(value: unknown): value is BootstrapDiagnostic {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

async function readError(response: Response): Promise<OrchestratorError> {
  let message = `Orchestrator request failed: ${response.status} ${response.statusText}`;
  let diagnostics: BootstrapDiagnostic[] = [];

  try {
    const body = (await response.json()) as unknown;
    if (typeof body === "object" && body !== null) {
      if ("error" in body && typeof body.error === "string") {
        message = body.error;
      }
      if ("diagnostics" in body && Array.isArray(body.diagnostics)) {
        diagnostics = body.diagnostics.filter(isDiagnostic);
      }
    }
  } catch {
    // Keep the status-based fallback when the orchestrator returns no JSON body.
  }

  return new OrchestratorError(message, response.status, diagnostics);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await fetch(`${getOrchestratorBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });

  if (!response.ok) {
    throw await readError(response);
  }

  const data = (await response.json()) as T;
  return { data, status: response.status };
}

export const orchestratorClient = {
  health() {
    return request<HealthResponse>(HEALTH_PATH);
  },

  submitSessionToken({ token }: SessionTokenRequest) {
    return request<SessionTokenResponse>(DESKTOP_TOKEN_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: DESKTOP_SESSION_SCHEMA_VERSION,
        github_token: token
      })
    });
  },

  seedBootstrap({ selected_repo, answers }: BootstrapSeedRequest) {
    return request<BootstrapSeedResponse>(BOOTSTRAP_SEED_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: BOOTSTRAP_SCHEMA_VERSION,
        selected_repo,
        answers
      })
    });
  },

  nextAction() {
    const params = new URLSearchParams({ schema_version: NEXT_ACTION_SCHEMA_VERSION });
    return request<NextActionResponse>(`${NEXT_ACTION_PATH}?${params.toString()}`);
  },

  recordTaskAction({ taskId, action, note }: RecordTaskActionRequest) {
    const path = RECORD_TASK_ACTION_PATH.replace("{task_id}", encodeURIComponent(taskId));
    return request<RecordedTaskActionResponse>(path, {
      method: "POST",
      body: JSON.stringify({
        schema_version: TASK_ACTION_SCHEMA_VERSION,
        action,
        note: note?.trim() ? note.trim() : null
      })
    });
  },

  generatePlan() {
    return request<GeneratePlanningResponse>(PLANNING_GENERATE_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: PLANNING_SCHEMA_VERSION,
        request: null
      })
    });
  },

  currentCalendar() {
    return request<CalendarResponse>(CALENDAR_CURRENT_PATH);
  },

  recalculatePlan(requestBody: RecalculationRequest) {
    return request<RecalculationResponse>(PLANNING_RECALCULATE_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: RECALCULATION_SCHEMA_VERSION,
        ...requestBody,
        note: requestBody.note?.trim() ? requestBody.note.trim() : null,
        objects: requestBody.objects ?? []
      })
    });
  },

  previewProjectionBatch(requestBody: ProjectionPreviewRequest) {
    return request<ProjectionPreviewResponse>(PROJECTION_PREVIEW_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: PROJECTION_PREVIEW_SCHEMA_VERSION,
        ...requestBody
      })
    });
  },

  approveProjectionBatch(previewId: string) {
    // TODO(security): loopback-only binding does not fully protect mutating endpoints such as projection approval; Phase 1 defers per-run bearer-token/CSRF work because this surface is temporary and test-heavy.
    return request<ProjectionResultResponse>(PROJECTION_APPROVE_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: PROJECTION_APPROVAL_SCHEMA_VERSION,
        preview_id: previewId,
        approved: true,
        authority_source: "user" satisfies ProjectionAuthoritySource
      })
    });
  },

  reconcileProjection(requestBody: ProjectionReconcileRequest) {
    return request<ProjectionReconcileResponse>(PROJECTION_RECONCILE_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: PROJECTION_RECONCILIATION_SCHEMA_VERSION,
        ...requestBody
      })
    });
  },

  acceptExternalProjectionChange(reconciliationId: string, conflictOperationId: string) {
    return request<ProjectionAcceptExternalResponse>(PROJECTION_ACCEPT_EXTERNAL_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: PROJECTION_EXTERNAL_ACCEPT_SCHEMA_VERSION,
        reconciliation_id: reconciliationId,
        conflict_operation_id: conflictOperationId,
        authority_source: "user" satisfies ProjectionAuthoritySource
      })
    });
  }
};

// TODO: add Tauri command bridge once local HTTP API stabilizes; it supersedes the HTTP surface.
