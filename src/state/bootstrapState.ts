export type BootstrapStepStatus = "complete" | "current" | "pending";

export type BootstrapStep = {
  id: string;
  label: string;
  description: string;
  status: BootstrapStepStatus;
};

export const bootstrapSteps: BootstrapStep[] = [
  {
    id: "orchestrator",
    label: "Connect orchestrator",
    description: "Confirm the loopback API is reachable at 127.0.0.1.",
    status: "complete"
  },
  {
    id: "session",
    label: "Start session",
    description: "Use orchestrator-managed GitHub credentials for this desktop session.",
    status: "current"
  },
  {
    id: "import",
    label: "Import context",
    description: "Preview GitHub and calendar inputs before creating the working Plan.",
    status: "pending"
  }
];
