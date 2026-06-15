// Generated from ubu-schemas — do not edit by hand.
// Source revision pinned by ubu-devshell; regenerate with: npm run generate:types

export type TaskStatus = "active" | "completed" | "failed" | "moot";

export interface UbuTask {
  id: string;
  objective_id: string;
  title: string;
  status: TaskStatus;
  authority_source: string;
  schema_version: string;
  moot_reason_code?: string;
}

export interface DerivedReadiness {
  task_id: string;
  derived_readiness: boolean;
}
