import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { AffectObservationForm } from "../src/components/AffectObservationForm";
import { PlanReports } from "../src/components/PlanReports";
import { orchestratorClient, type HumanCompletePlanQuality, type LegitimizationReport } from "../src/api/client";

const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));
const schema_version = "ubu.orchestrator.affect_observation.v1";
const observed_at = "2026-06-10T09:00:00Z";
const write = { schema_version, snapshot_id: "snapshot_invented", observed_at, source_kind: "live_observation", dimension_count: 3 };
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function stub(observation: unknown = null, refusal = false) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    const call = { method: init?.method ?? "GET", path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    if (call.path === "/calendar/current" && call.method === "GET") return json({ plan_id: null, steps: [], alternatives: [] });
    if (call.path === "/affect/observation" && call.method === "GET") return json({ schema_version, observation });
    if (call.path === "/affect/observation" && call.method === "POST") return refusal ? json({ error: "Observation refused", diagnostics: [{ code: "affect_value_out_of_range", severity: "error", message: "Energy must be from 0 to 10." }] }, 400) : json(write, 201);
    throw new Error(`unexpected request: ${call.method} ${call.path}`);
  });
  return calls;
}
async function fill(energy = "7") {
  await waitFor(() => expect(screen.getByRole("button", { name: "Record" })).toBeEnabled());
  for (const [label, value] of [["Energy", energy], ["Stress", "3"], ["Mood intensity", "3"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("affect check-in", () => {
  afterEach(() => pluginFetch.mockReset());
  it("reads an empty store, posts exactly the user reading, and shows Recorded at without generating a Plan", async () => {
    const calls = stub(); render(<AffectObservationForm />);
    expect(await screen.findByText("Not recorded")).toBeInTheDocument();
    await fill(); fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByText(/^Recorded at /)).toBeInTheDocument();
    expect(calls).toEqual([
      { method: "GET", path: "/affect/observation", body: null },
      { method: "POST", path: "/affect/observation", body: { schema_version, energy: 7, stress: 3, mood_intensity: 3 } }
    ]);
    expect(screen.getByText(/The next “Generate Plan” uses this observation/)).toBeInTheDocument();
  });
  it("reads the latest server timestamp on load and explains all three dimensions", async () => {
    stub({ ...write, dimensions: { energy: 7, stress: 3, mood_intensity: 3 } }); render(<AffectObservationForm />);
    expect(await screen.findByText(/^Recorded at /)).toBeInTheDocument();
    expect(screen.getByText("Higher energy is better.")).toBeInTheDocument();
    expect(screen.getByText("Lower stress is better.")).toBeInTheDocument();
    expect(screen.getByText(/Intensity is arousal or volatility/)).toBeInTheDocument();
    for (const input of screen.getAllByRole("spinbutton")) { expect(input).toHaveAttribute("min", "0"); expect(input).toHaveAttribute("max", "10"); expect(input).toHaveAttribute("step", "1"); }
  });
  it("refuses out-of-range, blank and fractional values before writing", async () => {
    const calls = stub(); render(<AffectObservationForm />);
    for (const value of ["11", "-1", "", "1.5"]) {
      await fill(value); fireEvent.click(screen.getByRole("button", { name: "Record" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Energy must be a whole number from 0 to 10.");
    }
    expect(calls).toHaveLength(1);
  });
  it("renders a server refusal through DiagnosticsList and leaves the reading unrecorded", async () => {
    stub(null, true); render(<AffectObservationForm />); await fill(); fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByText("affect_value_out_of_range")).toBeInTheDocument();
    expect(screen.getByText("Energy must be from 0 to 10.")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
  });
  it("places the form directly above the Plan reports on Today", async () => {
    stub(); render(<App />); await screen.findByRole("heading", { name: "No timed Plan available" });
    const form = screen.getByRole("heading", { name: "How are you feeling?" }).closest("section") as HTMLElement;
    expect(form.nextElementSibling).toHaveTextContent("Risk and plan-quality reports were not returned for this Plan.");
  });
  it("the client preserves fractional server-supported readings and returns server provenance", async () => {
    const calls = stub(); const response = await orchestratorClient.recordAffectObservation({ energy: 7.25, stress: 3, mood_intensity: 3 });
    expect(response.data).toEqual(write); expect(calls[0].body).toEqual({ schema_version, energy: 7.25, stress: 3, mood_intensity: 3 });
  });
  it("shows live affect figures with a bootstrap-prior warning and no stand-in marker", () => {
    const legitimization: LegitimizationReport = { result: "passed", mode: "warn_only", affect_feasible: true, affect_margin: 0.381, violated_dimensions: [], stale_dimensions: [], stale_affect_warning: "affect profile uses bootstrap default review priors; review calibration recommended" };
    const quality: HumanCompletePlanQuality = { generated_at: observed_at, plan_ref: "plan_invented", feedback_latency: 900, checkpoint_coverage: "absent", affect_margin: 0.381, violated_dimensions: [], failure_pattern: "none", stretch_pressure: "comfort", post_plan_state_delta: "neutral", revision_suggestions: [] };
    const { container } = render(<PlanReports legitimization={legitimization} planQuality={quality} />);
    for (const [name, value] of [["Affect margin", "0.381"], ["Stretch pressure", "comfort"], ["Post-Plan state delta", "neutral"]]) {
      const term = within(container).getByText(name, { selector: "dt" }); expect(term.nextElementSibling).toHaveTextContent(value);
    }
    expect(container).not.toHaveTextContent("not recorded"); expect(container).not.toHaveTextContent("Record how you are feeling:");
  });
});
