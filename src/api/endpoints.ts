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
export const DEFAULT_ORCHESTRATOR_PORT = "7878";

export function getOrchestratorBaseUrl(): string {
  const explicitUrl = import.meta.env.VITE_UBU_ORCHESTRATOR_URL;

  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, "");
  }

  const port = import.meta.env.VITE_UBU_ORCHESTRATOR_PORT ?? DEFAULT_ORCHESTRATOR_PORT;
  return `http://127.0.0.1:${port}`;
}
