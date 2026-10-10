import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import { usesBootstrapDefaultProfile, usesStandInObservation } from "../src/affect";
import type { HumanCompletePlanQuality, LegitimizationReport, RiskReport } from "../src/api/client";
import { PlanReports } from "../src/components/PlanReports";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// What the orchestrator says when no Snapshot was taken, and when one was taken and scored against default tolerances.
const NO_SNAPSHOT = "affect profile uses bootstrap default review priors; review calibration recommended; missing affect observation; using bootstrap default profile observation in warn_only mode";
const DEFAULT_PROFILE_ONLY = "affect profile uses bootstrap default review priors; review calibration recommended";
const NOT_RECORDED_LINE = "No Snapshot of how you are feeling has been taken, so UbU is not guessing at affect margin, stretch pressure or post-Plan state.";

const legitimization = (warning: string | null): LegitimizationReport => ({
  result: "passed", mode: "warn_only", affect_feasible: true, affect_margin: 0, violated_dimensions: [], stale_dimensions: [], stale_affect_warning: warning
});
// As the orchestrator sends it for a stand-in: a margin of zero, neutral, and the sentence first.
const standInQuality: HumanCompletePlanQuality = {
  generated_at: "2026-10-02T12:00:00Z", plan_ref: "plan_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70", feedback_latency: 2700, checkpoint_coverage: "absent",
  affect_margin: 0, violated_dimensions: [], failure_pattern: "none", stretch_pressure: "sustainable_stretch", post_plan_state_delta: "neutral",
  revision_suggestions: ["Record how you are feeling: no affect Snapshot covers this Plan, so its affect margin, stretch pressure and post-plan state are a stand-in and not a measurement."]
};
const measuredQuality: HumanCompletePlanQuality = { ...standInQuality, affect_margin: 0.312, stretch_pressure: "comfort", post_plan_state_delta: "better", revision_suggestions: [] };
const risk: RiskReport = { generated_at: "2026-10-02T12:00:00Z", level: "low", findings: [] };

/// The six signal rows, as `term: value`.
function rows(container: HTMLElement = document.body) {
  const grid = container.querySelector(".quality-signal-grid") as HTMLElement;
  return within(grid).getAllByRole("term").map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent}`);
}

describe("Plan-quality signals when no affect state was recorded", () => {
  afterEach(() => {
    pluginFetch.mockReset();
  });

  it("127: the three affect rows read “not recorded” when the stand-in observation was used, with one line saying why", () => {
    render(<PlanReports riskReport={risk} planQuality={standInQuality} legitimization={legitimization(NO_SNAPSHOT)} />);
    expect(rows()).toEqual([
      "Feedback latency: 45 min",
      "Checkpoint coverage: absent",
      "Affect margin: not recorded",
      "Model failure pattern: none",
      "Stretch pressure: not recorded",
      "Post-Plan state delta: not recorded"
    ]);
    // Not a number and two enum words that were never measured.
    const grid = document.querySelector(".quality-signal-grid") as HTMLElement;
    expect(grid).not.toHaveTextContent("0.000");
    expect(grid).not.toHaveTextContent("sustainable stretch");
    expect(grid).not.toHaveTextContent("neutral");
    // One line of plain English under them, once.
    expect(screen.getAllByText(NOT_RECORDED_LINE)).toHaveLength(1);
    expect(screen.getByText(NOT_RECORDED_LINE).previousElementSibling).toBe(grid);
    // The rest of the panel is as it was.
    expect(screen.getByText("low risk")).toBeInTheDocument();
    expect(screen.getByText(standInQuality.revision_suggestions[0])).toBeInTheDocument();
  });

  it("128: they read the figures when the affect state was recorded, including under default tolerances", () => {
    const measured = ["Feedback latency: 45 min", "Checkpoint coverage: absent", "Affect margin: 0.312", "Model failure pattern: none", "Stretch pressure: comfort", "Post-Plan state delta: better"];
    // No warning at all.
    const first = render(<PlanReports riskReport={risk} planQuality={measuredQuality} legitimization={legitimization(null)} />);
    expect(rows(first.container)).toEqual(measured);
    expect(screen.queryByText(NOT_RECORDED_LINE)).not.toBeInTheDocument();
    first.unmount();
    // A real Snapshot scored against default tolerances: the warning names a bootstrap default, and the figures are still measurements.
    const second = render(<PlanReports riskReport={risk} planQuality={measuredQuality} legitimization={legitimization(DEFAULT_PROFILE_ONLY)} />);
    expect(rows(second.container)).toEqual(measured);
    expect(screen.queryByText(NOT_RECORDED_LINE)).not.toBeInTheDocument();
    // The two predicates differ exactly there.
    expect([usesBootstrapDefaultProfile(legitimization(DEFAULT_PROFILE_ONLY)), usesStandInObservation(legitimization(DEFAULT_PROFILE_ONLY))]).toEqual([true, false]);
    expect([usesBootstrapDefaultProfile(legitimization(NO_SNAPSHOT)), usesStandInObservation(legitimization(NO_SNAPSHOT))]).toEqual([true, true]);
    expect([usesBootstrapDefaultProfile(legitimization(null)), usesStandInObservation(legitimization(null))]).toEqual([false, false]);
  });

  it("129: with no legitimization prop the panel renders exactly as it did", () => {
    // What Next Task passes: the reports and nothing else. Even the stand-in's own figures are shown as they came.
    const { container } = render(<PlanReports riskReport={risk} planQuality={standInQuality} compact />);
    expect(rows(container)).toEqual([
      "Feedback latency: 45 min",
      "Checkpoint coverage: absent",
      "Affect margin: 0.000",
      "Model failure pattern: none",
      "Stretch pressure: sustainable stretch",
      "Post-Plan state delta: neutral"
    ]);
    expect(screen.queryByText(NOT_RECORDED_LINE)).not.toBeInTheDocument();
    expect(container.querySelector(".plan-reports")).toHaveClass("compact");
    // A null prop is the same as none.
    const second = render(<PlanReports riskReport={risk} planQuality={standInQuality} legitimization={null} />);
    expect(rows(second.container)[2]).toBe("Affect margin: 0.000");
  });

  it("130: Today passes the Plan's legitimization, so a Plan made with no Snapshot reads “not recorded” and says so once", async () => {
    const step = {
      index: 0, task_id: "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e71", summary: "Synthetic oat milk", start: 1_790_000_000, end: 1_790_001_200,
      start_at: "2026-09-21T13:33:20Z", end_at: "2026-09-21T13:53:20Z", depends_on: [], static_anchor: false, placement_authority: "planner", occupies_capacity: true
    };
    const plan = {
      id: standInQuality.plan_ref, status: "admitted", steps: [step], created_at: "2026-09-21T13:33:20Z",
      legitimization: legitimization(NO_SNAPSHOT), risk_report: risk, human_complete_plan_quality: standInQuality
    };
    pluginFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      expect(url.origin).toBe("http://127.0.0.1:7878");
      if (url.pathname === "/affect/observation") return json({ schema_version: "ubu.orchestrator.affect_observation.v1", observation: null });
      if (url.pathname === "/calendar/current") return json({ plan_id: null, steps: [], alternatives: [] });
      if (url.pathname === "/planning/generate") {
        return json({ schema_version: "planning-kernel-contract/0.1", request_id: "synthetic-request", status: "ok", plan, alternatives: [], unplaced_tasks: [], diagnostics: [] });
      }
      throw new Error(`unexpected request: ${url.pathname}`);
    });
    render(<App />);
    await screen.findByRole("heading", { name: "No timed Plan available" });
    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
    await screen.findByRole("heading", { name: "Synthetic oat milk" });
    expect(rows().slice(2)).toEqual(["Affect margin: not recorded", "Model failure pattern: none", "Stretch pressure: not recorded", "Post-Plan state delta: not recorded"]);
    // One statement in the panel, and the legitimization summary's own banner once, not twice.
    expect(screen.getAllByText(NOT_RECORDED_LINE)).toHaveLength(1);
    expect(screen.getAllByText(/Bootstrap default profile observation is in use/)).toHaveLength(1);
    expect(screen.getByText("low risk")).toBeInTheDocument();
  });
});

describe("A duration is said in the unit it is in", () => {
  it("131: formatDuration reads seconds alone under a minute, minutes alone under an hour, and hours and minutes above", async () => {
    const { formatDuration } = await import("../src/duration");
    expect([0, 1, 45, 59].map(formatDuration)).toEqual(["0 s", "1 s", "45 s", "59 s"]);
    expect([60, 90, 600, 2700, 3569].map(formatDuration)).toEqual(["1 min", "2 min", "10 min", "45 min", "59 min"]);
    // Rounding to the minute never prints "60 min".
    expect([3570, 3600, 5400, 14400, 16200, 86400, 604800].map(formatDuration)).toEqual(["1 h", "1 h", "1 h 30 min", "4 h", "4 h 30 min", "24 h", "168 h"]);
    expect([Number.NaN, -1, Number.POSITIVE_INFINITY].map(formatDuration)).toEqual(["not known", "not known", "not known"]);
  });

  it("132: the feedback latency row shows the orchestrator's seconds as a duration, and never as a number of minutes", () => {
    const latency = (seconds: number) => {
      const { container, unmount } = render(<PlanReports riskReport={risk} planQuality={{ ...measuredQuality, feedback_latency: seconds }} />);
      const row = rows(container)[0];
      unmount();
      return row;
    };
    expect(latency(0)).toBe("Feedback latency: 0 s");
    expect(latency(45)).toBe("Feedback latency: 45 s");
    expect(latency(1800)).toBe("Feedback latency: 30 min");
    // Four hours. Until P1B-57 this read "14400 min", which is ten days.
    expect(latency(14400)).toBe("Feedback latency: 4 h");
    expect(latency(15300)).toBe("Feedback latency: 4 h 15 min");
    expect(latency(14400)).not.toContain("14400");
  });
});
