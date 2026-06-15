import type { RouteId } from "../App";
import { bootstrapSteps } from "./bootstrapState";
import type { TaskStatus } from "../types/generated";

export { bootstrapSteps };

export type { TaskStatus };

export type NavItem = {
  id: RouteId;
  label: string;
};

export type Task = {
  id: string;
  objective_id: string;
  title: string;
  repository: string;
  rationale: string;
  status: TaskStatus;
  derived_readiness: boolean;
  authority_source: string;
  schema_version: string;
  moot_reason_code?: string;
  risk: "low" | "medium" | "high";
};

export type PlanItemStatus = "active" | "completed" | "pending";

export type PlanItem = {
  id: string;
  title: string;
  status: PlanItemStatus;
  explanation: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  source: string;
};

export type LogEntry = {
  id: string;
  level: "info" | "warning" | "error";
  message: string;
  timestamp: string;
};

export type ProjectionOperation = {
  id: string;
  target: string;
  operation: "create" | "update" | "close";
  summary: string;
};

export type ProjectionBatch = {
  id: string;
  title: string;
  operations: ProjectionOperation[];
};

export const navItems: NavItem[] = [
  { id: "bootstrap", label: "Bootstrap" },
  { id: "github-import", label: "GitHub Import" },
  { id: "calendar", label: "Calendar" },
  { id: "next-action", label: "Next Task" },
  { id: "plan", label: "Plan" },
  { id: "logs", label: "Logs" },
  { id: "projection", label: "Projection" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" }
];

export const importSummary = {
  repositories: ["UbU-project/ubu-orchestrator", "UbU-project/ubu-schemas"],
  issueCount: 18,
  pullRequestCount: 4
};

export const projectionBatch: ProjectionBatch = {
  id: "projection-preview-001",
  title: "ProjectionPreview batch for orchestrator planning labels",
  operations: [
    {
      id: "op-1",
      target: "UbU-project/ubu-orchestrator#42",
      operation: "update",
      summary: "Apply planning labels based on accepted next-task ordering."
    },
    {
      id: "op-2",
      target: "UbU-project/ubu-ui#7",
      operation: "create",
      summary: "Create follow-up issue for Tauri command bridge once HTTP stabilizes."
    }
  ]
};

export const initialAppState = {
  nextTask: {
    id: "task-001",
    objective_id: "obj-orchestrator-bootstrap",
    title: "Validate orchestrator bootstrap contract",
    repository: "UbU-project/ubu-orchestrator",
    rationale: "This unblocks reliable import, plan generation, and later replacement of HTTP with a Tauri command bridge.",
    status: "active",
    derived_readiness: true,
    authority_source: "ubu-orchestrator",
    schema_version: "1.0.0",
    risk: "medium"
  } satisfies Task,
  plan: [
    {
      id: "plan-1",
      title: "Confirm orchestrator health endpoint",
      status: "active",
      explanation: "The UI needs a stable loopback health check before deeper import workflows are useful."
    },
    {
      id: "plan-2",
      title: "Run GitHub import preview",
      status: "pending",
      explanation: "Imported repository context should remain reviewable before it influences task ordering."
    },
    {
      id: "plan-3",
      title: "Review ProjectionPreview batch",
      status: "pending",
      explanation: "Writes are only sent after explicit batch approval."
    }
  ] satisfies PlanItem[],
  calendarEvents: [
    {
      id: "cal-1",
      title: "Planning review",
      startsAt: "Today 14:00",
      source: "Local calendar preview"
    },
    {
      id: "cal-2",
      title: "Implementation block",
      startsAt: "Tomorrow 09:30",
      source: "Local calendar preview"
    }
  ] satisfies CalendarEvent[],
  logEntries: [
    {
      id: "log-1",
      level: "info",
      message: "Loaded pinned generated contract metadata.",
      timestamp: "09:12"
    },
    {
      id: "log-2",
      level: "warning",
      message: "Projection approval remains protected by loopback only in Phase 1.",
      timestamp: "09:15"
    }
  ] satisfies LogEntry[],
  reports: [
    "Next-task throughput",
    "Projection approval history",
    "Import freshness"
  ]
};
