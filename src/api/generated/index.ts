// Generated from ubu-orchestrator openapi.generated.json — do not edit by hand.
// Source revision pinned by ubu-devshell; regenerate with: npm run generate:api

export type TaskStatus = "active" | "completed" | "failed" | "moot";

export interface TaskResponse {
  id: string;
  objective_id: string;
  title: string;
  status: TaskStatus;
  derived_readiness: boolean;
  authority_source: string;
  schema_version: string;
  moot_reason_code?: string;
  repository: string;
  rationale: string;
  risk: "low" | "medium" | "high";
}

export interface HealthResponse {
  status: string;
}

export interface SessionTokenRequest {
  token: string;
}

export interface SessionTokenResponse {
  sessionReady: boolean;
}

export interface ProjectionApprovalResponse {
  approved: boolean;
  batchId: string;
}
