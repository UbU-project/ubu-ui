import { isTauri } from "@tauri-apps/api/core";
import { fetch as pluginFetch } from "@tauri-apps/plugin-http";

import {
  BOOTSTRAP_SCHEMA_VERSION,
  BOOTSTRAP_SEED_PATH,
  CALENDAR_CURRENT_PATH,
  CALENDAR_PREVIEW_PATH,
  CALENDAR_APPROVE_PATH,
  CALENDAR_APPROVAL_SCHEMA_VERSION,
  CALENDAR_CAPTURE_PATH,
  CALENDAR_CAPTURE_SCHEMA_VERSION,
  CALENDAR_RECONCILE_PATH,
  CALENDAR_RECONCILIATION_SCHEMA_VERSION,
  CALENDAR_REPAIR_PATH,
  GOOGLE_CALENDAR_SESSION_PATH,
  DESKTOP_SESSION_SCHEMA_VERSION,
  DESKTOP_TOKEN_PATH,
  HEALTH_PATH,
  SETTINGS_LIST_PATH,
  SETTING_PUT_PATH,
  SETTING_DELETE_PATH,
  SETTING_SCHEMA_VERSION,
  NEXT_ACTION_PATH,
  NEXT_ACTION_SCHEMA_VERSION,
  PLANNING_GENERATE_PATH,
  PLANNING_RECALCULATE_PATH,
  PLANNING_SCHEMA_VERSION,
  PREFERENCE_CREATE_PATH,
  PREFERENCE_LIST_PATH,
  PREFERENCE_PATH,
  PREFERENCE_SCHEMA_VERSION,
  PROJECTION_ACCEPT_EXTERNAL_PATH,
  PROJECTION_APPROVAL_SCHEMA_VERSION,
  PROJECTION_APPROVE_PATH,
  PROJECTION_EXTERNAL_ACCEPT_SCHEMA_VERSION,
  PROJECTION_PREVIEW_PATH,
  PROJECTION_PREVIEW_SCHEMA_VERSION,
  PROJECTION_RECONCILE_PATH,
  PROJECTION_RECONCILIATION_SCHEMA_VERSION,
  RECALCULATION_SCHEMA_VERSION,
  RECORD_TASK_ACTION_PATH,
  TASK_ACTION_SCHEMA_VERSION,
  TASK_CAPTURE_PATH,
  TASK_CAPTURE_SCHEMA_VERSION,
  TASK_LIST_PATH,
  TASK_PATH,
  TASK_READ_SCHEMA_VERSION,
  getOrchestratorBaseUrl
} from "./endpoints";
import type { Task as CanonicalTask } from "../types/generated";

export { getOrchestratorBaseUrl };

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

export type CalendarEventBody = {
  external_id: string;
  task_id: string;
  summary: string;
  start_at: string;
  end_at: string;
  color_id: string | null;
  transparent: boolean;
  reminders_minutes: number[];
};

export type CalendarOperation =
  | { kind: "create" | "update"; event: CalendarEventBody }
  | { kind: "delete"; external_id: string; summary: string };

export type CalendarProjectionPreviewResponse = {
  schema_version: string;
  preview_id: string;
  plan_id: string | null;
  stale: boolean;
  events: CalendarEventBody[];
  operations: CalendarOperation[];
  diagnostics: BootstrapDiagnostic[];
};

export type CalendarProjectionResultResponse = {
  schema_version: string;
  preview_id: string;
  status: string;
  applied_events: CalendarEventBody[];
  operation_results: Array<{ operation_id: string; status: string; message: string | null }>;
  diagnostics: BootstrapDiagnostic[];
};

export type CalendarCaptureResponse = {
  schema_version: string;
  captured: number;
  updated: number;
  unchanged: number;
  skipped: number;
  moved: number;
  resized: number;
  diagnostics: BootstrapDiagnostic[];
};

export type CalendarConflict = {
  external_id: string;
  conflict_type: "missing" | "drifted" | "unrecorded" | "foreign";
  summary: string;
  message: string;
};

export type CalendarReconcileResponse = {
  schema_version: string;
  reconciliation_id: string;
  status: string;
  conflicts: CalendarConflict[];
  diagnostics: BootstrapDiagnostic[];
};

export type CalendarRepairResponse = {
  schema_version: string;
  reconciliation_id: string;
  dropped_events: number;
  updated_events: number;
  applied_event_count: number;
  remaining_conflicts: CalendarConflict[];
};

export type GoogleCalendarSessionResponse = {
  schema_version: string;
  accepted: boolean;
  enabled: boolean;
};

export type PaletteEntry = { category: string; color_id: string; origin: "setting" | "file" | "default" };
export type InversePaletteEntry = { color_id: string; categories: string[]; status: "mapped" | "collision" | "unmapped" };
export type SettingsResponse = {
  schema_version: string;
  settings: Array<{ id: string; name: string; value: string | number | boolean; authority_source: string; version: number }>;
  palette: PaletteEntry[];
  inverse: InversePaletteEntry[];
};
export type SettingWriteResponse = { schema_version: string; setting_id: string; version: number };

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
  risk_report?: RiskReport | null;
  human_complete_plan_quality?: HumanCompletePlanQuality | null;
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
  risk_report?: RiskReport | null;
  human_complete_plan_quality?: HumanCompletePlanQuality | null;
};

export type RiskLevel = "low" | "medium" | "high";

export type RiskCategory =
  | "deadline_risk"
  | "dependency_fragility"
  | "worker_bottleneck"
  | "stale_affect"
  | "affect_margin"
  | "destructive_pressure"
  | "post_plan_depletion"
  | "low_coverage"
  | "skeleton_failure";

export type RiskFinding = {
  category: RiskCategory;
  severity: RiskLevel;
  blocking: boolean;
  detail: string;
  subject_ref?: string | null;
};

export type RiskReport = {
  generated_at: string;
  level: RiskLevel;
  findings: RiskFinding[];
};

export type CheckpointCoverage = "adequate" | "sparse" | "absent";
export type FailurePattern =
  | "none"
  | "wrong_estimates"
  | "missing_dependencies"
  | "stale_affect"
  | "interruption"
  | "overload"
  | "changed_objective";
export type StretchPressure = "comfort" | "sustainable_stretch" | "destructive_pressure";
export type PostPlanStateDelta = "better" | "neutral" | "depleted" | "at_risk";

export type HumanCompletePlanQuality = {
  generated_at: string;
  plan_ref: string;
  feedback_latency: number;
  checkpoint_coverage: CheckpointCoverage;
  affect_margin: number;
  violated_dimensions?: string[];
  failure_pattern: FailurePattern;
  stretch_pressure: StretchPressure;
  post_plan_state_delta: PostPlanStateDelta;
  revision_suggestions: string[];
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
  risk_report?: RiskReport | null;
  human_complete_plan_quality?: HumanCompletePlanQuality | null;
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
  risk_report?: RiskReport | null;
  human_complete_plan_quality?: HumanCompletePlanQuality | null;
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

export type TaskDurationEstimate = NonNullable<CanonicalTask["duration_estimate"]>;

export type TaskPlacement = "static" | "planned";

export type TaskSummary = {
  task_id: string;
  title: string;
  status: TaskLifecycleStatus;
  version: number;
  placement: TaskPlacement;
  duration_estimate?: TaskDurationEstimate;
  due_at?: string;
  objective_id?: string;
  category_tag?: string;
  is_routine_occurrence: boolean;
  container_id?: string;
};

export type TaskListResponse = {
  schema_version: string;
  status: TaskLifecycleStatus;
  tasks: TaskSummary[];
};

export type TaskReadResponse = {
  schema_version: string;
  task_id: string;
  version: number;
  status: TaskLifecycleStatus;
  is_routine_occurrence: boolean;
  payload: CanonicalTask;
};

export type CaptureTaskRequest = {
  title: string;
  duration_estimate?: TaskDurationEstimate;
  category_tag?: string;
  tags?: string[];
  due_at?: string;
};

// A null clears the field; an absent field is left as stored.
export type TaskEditFields = {
  title?: string;
  duration_estimate?: TaskDurationEstimate | null;
  category_tag?: string | null;
  tags?: string[];
  due_at?: string | null;
};

export type EditTaskRequest = {
  taskId: string;
  expectedVersion: number;
  fields: TaskEditFields;
};

export type TaskWriteResponse = {
  schema_version: string;
  task_id: string;
  version: number;
};

export type PreferenceOrder = "a_preferred_to_b" | "a_indifferent_to_b";

export type PreferenceSummary = {
  preference_id: string;
  version: number;
  task_a: string | null;
  task_b: string | null;
  task_a_title: string | null;
  task_b_title: string | null;
  // Imported Objective pairs are listed but cannot be authored.
  objective_a?: string;
  objective_b?: string;
  order: PreferenceOrder;
  enabled: boolean;
  acquired_date: string;
};

export type PreferenceListResponse = {
  schema_version: string;
  preferences: PreferenceSummary[];
};

export type CreatePreferenceRequest = {
  taskA: string;
  taskB: string;
  order: PreferenceOrder;
};

export type SetPreferenceEnabledRequest = {
  preferenceId: string;
  expectedVersion: number;
  enabled: boolean;
};

export type PreferenceWriteResponse = {
  schema_version: string;
  preference_id: string;
  version: number;
};

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

export const TRANSPORT_UNAVAILABLE_MESSAGE =
  "The Tauri HTTP plugin is unavailable, so the orchestrator cannot be reached. Start the app with `npm run tauri:dev`; a plain browser cannot make these requests.";

// Requests are made in Rust by the Tauri HTTP plugin. There is deliberately no
// fallback to the webview's own fetch: it is cross-origin to the orchestrator and
// would behave differently inside and outside the shell.
async function transportFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await pluginFetch(url, init);
  } catch (error) {
    if (!isTauri()) {
      throw new OrchestratorError(TRANSPORT_UNAVAILABLE_MESSAGE, 0);
    }
    console.error("Orchestrator request failed in the Tauri HTTP plugin:", error);
    throw error;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await transportFetch(`${getOrchestratorBaseUrl()}${path}`, {
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

  // 204 carries no body to parse.
  const data = (response.status === 204 ? null : await response.json()) as T;
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

  captureTask(fields: CaptureTaskRequest) {
    return request<TaskWriteResponse>(TASK_CAPTURE_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: TASK_CAPTURE_SCHEMA_VERSION,
        ...fields
      })
    });
  },

  editTask({ taskId, expectedVersion, fields }: EditTaskRequest) {
    const path = TASK_PATH.replace("{task_id}", encodeURIComponent(taskId));
    return request<TaskWriteResponse>(path, {
      method: "PATCH",
      body: JSON.stringify({
        schema_version: TASK_CAPTURE_SCHEMA_VERSION,
        expected_version: expectedVersion,
        ...fields
      })
    });
  },

  listTasks(status: TaskLifecycleStatus = "active") {
    const params = new URLSearchParams({ schema_version: TASK_READ_SCHEMA_VERSION, status });
    return request<TaskListResponse>(`${TASK_LIST_PATH}?${params.toString()}`);
  },

  getTask(taskId: string) {
    const path = TASK_PATH.replace("{task_id}", encodeURIComponent(taskId));
    const params = new URLSearchParams({ schema_version: TASK_READ_SCHEMA_VERSION });
    return request<TaskReadResponse>(`${path}?${params.toString()}`);
  },

  listPreferences() {
    return request<PreferenceListResponse>(PREFERENCE_LIST_PATH);
  },

  createPreference({ taskA, taskB, order }: CreatePreferenceRequest) {
    return request<PreferenceWriteResponse>(PREFERENCE_CREATE_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: PREFERENCE_SCHEMA_VERSION,
        task_a: taskA,
        task_b: taskB,
        order
      })
    });
  },

  setPreferenceEnabled({ preferenceId, expectedVersion, enabled }: SetPreferenceEnabledRequest) {
    const path = PREFERENCE_PATH.replace("{preference_id}", encodeURIComponent(preferenceId));
    return request<PreferenceWriteResponse>(path, {
      method: "PATCH",
      body: JSON.stringify({
        schema_version: PREFERENCE_SCHEMA_VERSION,
        expected_version: expectedVersion,
        enabled
      })
    });
  },

  deletePreference(preferenceId: string) {
    const path = PREFERENCE_PATH.replace("{preference_id}", encodeURIComponent(preferenceId));
    return request<null>(path, { method: "DELETE" });
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

  listSettings() {
    return request<SettingsResponse>(SETTINGS_LIST_PATH);
  },

  putSetting(name: string, value: string | number | boolean) {
    const path = SETTING_PUT_PATH.replace("{name}", encodeURIComponent(name));
    return request<SettingWriteResponse>(path, {
      method: "PUT",
      body: JSON.stringify({ schema_version: SETTING_SCHEMA_VERSION, value })
    });
  },

  deleteSetting(name: string) {
    const path = SETTING_DELETE_PATH.replace("{name}", encodeURIComponent(name));
    return request<null>(path, { method: "DELETE" });
  },

  previewCalendar(noExternalExport = false) {
    const params = new URLSearchParams({ no_external_export: String(noExternalExport) });
    return request<CalendarProjectionPreviewResponse>(`${CALENDAR_PREVIEW_PATH}?${params.toString()}`);
  },

  approveCalendar(previewId: string) {
    return request<CalendarProjectionResultResponse>(CALENDAR_APPROVE_PATH, {
      method: "POST",
      body: JSON.stringify({
        schema_version: CALENDAR_APPROVAL_SCHEMA_VERSION,
        preview_id: previewId,
        authority_source: "user" satisfies ProjectionAuthoritySource,
        export_mode: "live"
      })
    });
  },

  captureCalendar() {
    return request<CalendarCaptureResponse>(CALENDAR_CAPTURE_PATH, {
      method: "POST",
      body: JSON.stringify({ schema_version: CALENDAR_CAPTURE_SCHEMA_VERSION, export_mode: "live" })
    });
  },

  reconcileCalendar() {
    return request<CalendarReconcileResponse>(CALENDAR_RECONCILE_PATH, {
      method: "POST",
      body: JSON.stringify({ schema_version: CALENDAR_RECONCILIATION_SCHEMA_VERSION, export_mode: "live" })
    });
  },

  repairCalendarReconciliation(reconciliationId: string) {
    const path = CALENDAR_REPAIR_PATH.replace("{reconciliation_id}", encodeURIComponent(reconciliationId));
    return request<CalendarRepairResponse>(path, { method: "POST" });
  },

  enableGoogleCalendarSession() {
    return request<GoogleCalendarSessionResponse>(GOOGLE_CALENDAR_SESSION_PATH, {
      method: "POST",
      body: JSON.stringify({ schema_version: DESKTOP_SESSION_SCHEMA_VERSION })
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
