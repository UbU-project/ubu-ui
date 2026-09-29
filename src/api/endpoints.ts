// The contract with ubu-orchestrator: where it is, which routes exist and which
// schema versions are sent. This module must stay importable outside the Tauri
// shell, so it imports no transport and nothing from @tauri-apps.
import type openApiSpec from "./generated/openapi.generated.json";

export type GeneratedPath = keyof typeof openApiSpec.paths;

export const DESKTOP_TOKEN_PATH = "/desktop/session/github-token" satisfies GeneratedPath;
export const BOOTSTRAP_SEED_PATH = "/bootstrap/seed" satisfies GeneratedPath;
export const HEALTH_PATH = "/health" satisfies GeneratedPath;
export const PLANNING_GENERATE_PATH = "/planning/generate" satisfies GeneratedPath;
export const PLANNING_RECALCULATE_PATH = "/planning/recalculate" satisfies GeneratedPath;
export const CALENDAR_CURRENT_PATH = "/calendar/current" satisfies GeneratedPath;
export const PROJECTION_PREVIEW_PATH = "/projection/preview" satisfies GeneratedPath;
export const PROJECTION_APPROVE_PATH = "/projection/approve" satisfies GeneratedPath;
export const PROJECTION_RECONCILE_PATH = "/projection/reconcile" satisfies GeneratedPath;
export const PROJECTION_ACCEPT_EXTERNAL_PATH = "/projection/reconciliation/accept-external" satisfies GeneratedPath;
export const NEXT_ACTION_PATH = "/next-action" satisfies GeneratedPath;
export const RECORD_TASK_ACTION_PATH = "/task/{task_id}/action" satisfies GeneratedPath;
export const TASK_CAPTURE_PATH = "/task" satisfies GeneratedPath;
export const TASK_PATH = "/task/{task_id}" satisfies GeneratedPath;
export const TASK_LIST_PATH = "/tasks" satisfies GeneratedPath;
export const PREFERENCE_CREATE_PATH = "/preference" satisfies GeneratedPath;
export const PREFERENCE_PATH = "/preference/{preference_id}" satisfies GeneratedPath;
export const PREFERENCE_LIST_PATH = "/preferences" satisfies GeneratedPath;

export const DESKTOP_SESSION_SCHEMA_VERSION = "ubu.orchestrator.desktop_session.v1";
export const BOOTSTRAP_SCHEMA_VERSION = "ubu.orchestrator.bootstrap.v1";
export const NEXT_ACTION_SCHEMA_VERSION = "ubu.orchestrator.next_action.v1";
export const TASK_ACTION_SCHEMA_VERSION = "ubu.orchestrator.task_action.v1";
export const TASK_CAPTURE_SCHEMA_VERSION = "ubu.orchestrator.task_capture.v1";
export const TASK_READ_SCHEMA_VERSION = "ubu.orchestrator.task_read.v1";
export const PREFERENCE_SCHEMA_VERSION = "ubu.orchestrator.preference.v1";
export const PLANNING_SCHEMA_VERSION = "planning-kernel-contract/0.1";
export const RECALCULATION_SCHEMA_VERSION = "ubu.orchestrator.recalculation.v1";
export const PROJECTION_PREVIEW_SCHEMA_VERSION = "ubu.orchestrator.projection_preview.v1";
export const PROJECTION_APPROVAL_SCHEMA_VERSION = "ubu.orchestrator.projection_approval.v1";
export const PROJECTION_RECONCILIATION_SCHEMA_VERSION = "ubu.orchestrator.projection_reconciliation.v1";
export const PROJECTION_EXTERNAL_ACCEPT_SCHEMA_VERSION = "ubu.orchestrator.projection_external_accept.v1";
export const CALENDAR_PREVIEW_PATH = "/projection/calendar/preview" satisfies GeneratedPath;
export const CALENDAR_APPROVE_PATH = "/projection/calendar/approve" satisfies GeneratedPath;
export const CALENDAR_CAPTURE_PATH = "/projection/calendar/capture" satisfies GeneratedPath;
export const CALENDAR_RECONCILE_PATH = "/projection/calendar/reconcile" satisfies GeneratedPath;
export const CALENDAR_REPAIR_PATH = "/projection/calendar/reconcile/{reconciliation_id}/repair" satisfies GeneratedPath;
export const GOOGLE_CALENDAR_SESSION_PATH = "/desktop/session/google-calendar" satisfies GeneratedPath;

export const CALENDAR_PREVIEW_SCHEMA_VERSION = "ubu.orchestrator.calendar_projection_preview.v1";
export const CALENDAR_APPROVAL_SCHEMA_VERSION = "ubu.orchestrator.calendar_projection_approval.v1";
export const CALENDAR_RESULT_SCHEMA_VERSION = "ubu.orchestrator.calendar_projection_result.v1";
export const CALENDAR_CAPTURE_SCHEMA_VERSION = "ubu.orchestrator.calendar_capture.v1";
export const CALENDAR_RECONCILIATION_SCHEMA_VERSION = "ubu.orchestrator.calendar_reconciliation.v1";
export const CALENDAR_REPAIR_SCHEMA_VERSION = "ubu.orchestrator.calendar_repair.v1";
// Google Calendar enablement uses the existing DESKTOP_SESSION_SCHEMA_VERSION.

export const SETTINGS_LIST_PATH = "/settings" satisfies GeneratedPath;
export const SETTING_PUT_PATH = "/setting/{name}" satisfies GeneratedPath;
export const SETTING_DELETE_PATH = "/setting/{name}" satisfies GeneratedPath;
export const SETTING_SCHEMA_VERSION = "ubu.orchestrator.setting.v1";

// A routine is an evergreen Objective, so it is read and written through these.
export const OBJECTIVE_LIST_PATH = "/objectives" satisfies GeneratedPath;
export const OBJECTIVE_READ_PATH = "/objective/{objective_id}" satisfies GeneratedPath;
export const OBJECTIVE_CREATE_PATH = "/objective" satisfies GeneratedPath;
export const OBJECTIVE_EDIT_PATH = "/objective/{objective_id}" satisfies GeneratedPath;
export const ROUTINE_LIST_PATH = "/routines" satisfies GeneratedPath;
export const ROUTINE_OVERRIDE_PATH = "/routine/{objective_id}/override/{local_date}" satisfies GeneratedPath;
export const OBJECTIVE_SCHEMA_VERSION = "ubu.orchestrator.objective.v1";
export const ROUTINE_SUMMARY_SCHEMA_VERSION = "routine-summary/1";
export const ROUTINE_OVERRIDE_SCHEMA_VERSION = "ubu.orchestrator.routine_override.v1";

export const DEFAULT_ORCHESTRATOR_PORT = "7878";

export function getOrchestratorBaseUrl(): string {
  const explicitUrl = import.meta.env.VITE_UBU_ORCHESTRATOR_URL;

  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, "");
  }

  const port = import.meta.env.VITE_UBU_ORCHESTRATOR_PORT ?? DEFAULT_ORCHESTRATOR_PORT;
  return `http://127.0.0.1:${port}`;
}

export const ADVISORY_QUEUE_PATH = "/advisory/queue" satisfies GeneratedPath;
export const ADVISORY_ADMIT_PATH = "/advisory/candidate/{candidate_id}/admit" satisfies GeneratedPath;
export const ADVISORY_REJECT_PATH = "/advisory/candidate/{candidate_id}/reject" satisfies GeneratedPath;
export const ADVISORY_DEFER_PATH = "/advisory/candidate/{candidate_id}/defer" satisfies GeneratedPath;
export const ADVISORY_RESURFACE_PATH = "/advisory/candidate/{candidate_id}/resurface" satisfies GeneratedPath;
export const ADVISORY_RUN_PATH = "/advisory/run" satisfies GeneratedPath;
export const ADVISORY_RUN_SCHEMA_VERSION = "ubu.orchestrator.advisory_run.v1";
// Existing review requests have no schema_version field; candidates use core 1.0.
export const ADVISORY_CANDIDATE_SCHEMA_VERSION = "1.0";
