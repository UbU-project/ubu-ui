import type { LegitimizationReport } from "./api/client";

// What the orchestrator's affect warning says about where the affect figures came from. The
// legitimization report carries no field for it, so both are read from the warning's own words.

/** The profile or the observation is a bootstrap default: a prior, not something the operator set or recorded. */
export function usesBootstrapDefaultProfile(legitimization: LegitimizationReport): boolean {
  const warning = legitimization.stale_affect_warning?.toLowerCase() ?? "";
  return warning.includes("bootstrap default");
}

/**
 * No affect Snapshot was used: the orchestrator manufactured the observation, so no affect figure
 * for the Plan was measured. Narrower than `usesBootstrapDefaultProfile`, which also holds when a
 * real Snapshot was scored against default tolerances, and then the figures are measurements.
 */
export function usesStandInObservation(legitimization: LegitimizationReport): boolean {
  const warning = legitimization.stale_affect_warning?.toLowerCase() ?? "";
  return warning.includes("bootstrap default profile observation");
}
