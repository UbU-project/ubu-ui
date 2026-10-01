import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import type { UnplacedTask } from "../src/api/client";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Invented, and reading as invented.
const FENCE = "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70";
const MURAL = "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e72";
const PLAN = "plan_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70";
const alternative = (action: string, label: string, summary: string) => ({ action, label, requires_user_input: true, resulting_change_summary: summary });

// The two reasons the orchestrator gives for the same condition, with the alternatives it offers for each.
const noChunk: UnplacedTask = {
  task_id: FENCE, summary: "Synthetic: paint the whole imaginary fence", reason: "no_eligible_chunk_large_enough",
  explanation: `Task \`${FENCE}\` was left out because no free interval is long enough.`,
  deferred_by_task_refs: [], affected_dependent_task_refs: [],
  safe_alternatives: [
    alternative("decompose_task", "Break up the task", "Model smaller tasks before planning again."),
    alternative("extend_planning_horizon", "Plan a longer period", "Request a longer planning horizon.")
  ]
};
const outsideWindow: UnplacedTask = {
  task_id: MURAL, summary: "Synthetic: paint the pretend mural", reason: "outside_allowed_window",
  explanation: `Task \`${MURAL}\` cannot fit its allowed occupancy window at its placement duration.`,
  deferred_by_task_refs: [], affected_dependent_task_refs: [],
  safe_alternatives: [
    alternative("relax_task_window", "Review the allowed time range", "Widen the task's allowed time range."),
    alternative("extend_planning_horizon", "Plan a longer period", "Request a longer planning horizon.")
  ]
};

const step = {
  index: 0, task_id: "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e71", summary: "Synthetic oat milk", start: 1_790_000_000, end: 1_790_001_200,
  start_at: "2026-09-21T13:33:20Z", end_at: "2026-09-21T13:53:20Z", depends_on: [], static_anchor: false, placement_authority: "planner", occupies_capacity: true
};
const planBody = (id = PLAN) => ({ id, status: "admitted", steps: [step], created_at: "2026-09-21T13:33:20Z" });
function planned(unplaced: UnplacedTask[], diagnostics: Array<{ code: string; message: string }> = []) {
  return {
    schema_version: "planning-kernel-contract/0.1", request_id: "synthetic-request", status: unplaced.length ? "partial" : "ok",
    plan: planBody(), alternatives: [], unplaced_tasks: unplaced, diagnostics
  };
}

function stub(handler: (path: string) => Response | undefined) {
  pluginFetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    const answer = handler(url.pathname);
    if (answer) return answer;
    if (url.pathname === "/calendar/current") return json({ plan_id: null, steps: [], alternatives: [] });
    throw new Error(`unexpected request: ${url.pathname}`);
  });
}
async function generate() {
  render(<App />);
  await screen.findByRole("heading", { name: "No timed Plan available" });
  fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
  await screen.findByRole("heading", { name: "Synthetic oat milk" });
}
const section = () => screen.queryByRole("region", { name: "Not in this Plan" });
const lines = (element: HTMLElement) => Array.from(element.querySelectorAll("h2, h3, p, li")).map((node) => node.textContent);

describe("What did not fit", () => {
  afterEach(() => {
    pluginFetch.mockReset();
  });

  it("100: a Task left out for want of a long enough interval is shown by title, with its explanation and its alternatives as words", async () => {
    stub((path) => (path === "/planning/generate" ? json(planned([noChunk])) : undefined));
    await generate();
    const panel = section() as HTMLElement;
    expect(panel).toBeInTheDocument();
    // The whole section, as it reads on screen.
    expect(lines(panel)).toEqual([
      "Not in this Plan",
      "1 Task was left out of this Plan. It is in none of the placements above.",
      "Synthetic: paint the whole imaginary fence",
      `Task \`${FENCE}\` was left out because no free interval is long enough.`,
      "It is longer than any free interval in the planning horizon.",
      "What can be done:",
      "Break the Task up into smaller Tasks that fit, then generate the Plan again.",
      "Plan a longer period, which may hold a free interval long enough.",
      `${FENCE} no_eligible_chunk_large_enough`
    ]);
    // By title, as a heading; the id is small print and still copyable.
    const task = within(panel).getByRole("article", { name: "Not placed: Synthetic: paint the whole imaginary fence" });
    expect(within(task).getByRole("heading", { level: 3 })).toHaveTextContent("Synthetic: paint the whole imaginary fence");
    expect(within(task).getByText(FENCE).closest(".small-print")).not.toBeNull();
    // No alternative is a raw token.
    expect(panel).not.toHaveTextContent("decompose_task");
    expect(panel).not.toHaveTextContent("extend_planning_horizon");
  });

  it("101: the other reason for the same condition reads the same way, with its own alternatives as words", async () => {
    stub((path) => (path === "/planning/generate" ? json(planned([outsideWindow, noChunk])) : undefined));
    await generate();
    const panel = section() as HTMLElement;
    expect(within(panel).getByText("2 Tasks were left out of this Plan. They are in none of the placements above.")).toBeInTheDocument();
    const task = within(panel).getByRole("article", { name: "Not placed: Synthetic: paint the pretend mural" });
    expect(lines(task)).toEqual([
      "Synthetic: paint the pretend mural",
      `Task \`${MURAL}\` cannot fit its allowed occupancy window at its placement duration.`,
      "It is longer than any free interval in the planning horizon.",
      "What can be done:",
      "Widen the Task's allowed time range, if it has one.",
      "Plan a longer period, which may hold a free interval long enough.",
      `${MURAL} outside_allowed_window`
    ]);
    expect(task).not.toHaveTextContent("relax_task_window");
    expect(within(panel).getAllByRole("article")).toHaveLength(2);
  });

  it("102: an alternative this screen does not know is shown as it came, and a reason it does not know adds no line", async () => {
    const odd: UnplacedTask = {
      ...noChunk, reason: "omitted_lower_value", explanation: `Task \`${FENCE}\` was left out in favour of higher-value work.`,
      safe_alternatives: [alternative("synthetic_unknown_action", "Synthetic label", "Synthetic change."), alternative("reprioritize_task", "Reprioritize", "Raise it.")]
    };
    stub((path) => (path === "/planning/generate" ? json(planned([odd])) : undefined));
    await generate();
    const task = within(section() as HTMLElement).getByRole("article");
    const items = within(task).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["synthetic_unknown_action", "Raise the Task's priority, so it is placed ahead of other work."]);
    expect(within(task).getByText("synthetic_unknown_action").tagName).toBe("CODE");
    expect(task).not.toHaveTextContent("It is longer than any free interval");
    expect(task).toHaveTextContent("was left out in favour of higher-value work.");
  });

  it("103: with nothing left out the section is absent", async () => {
    stub((path) => (path === "/planning/generate" ? json(planned([])) : undefined));
    render(<App />);
    await screen.findByRole("heading", { name: "No timed Plan available" });
    expect(section()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
    await screen.findByRole("heading", { name: "Synthetic oat milk" });
    expect(section()).not.toBeInTheDocument();
    expect(screen.queryByText(/left out of this Plan/)).not.toBeInTheDocument();
  });

  it("104: the section is not an alert and not a diagnostic list, beside a diagnostic that names the same Task", async () => {
    const diagnostic = { code: "task_unplaceable", message: `Task \`${MURAL}\` cannot fit its allowed occupancy window at its placement duration.` };
    stub((path) => (path === "/planning/generate" ? json(planned([outsideWindow], [diagnostic])) : undefined));
    await generate();
    const panel = section() as HTMLElement;
    expect(panel.closest('[role="alert"]')).toBeNull();
    expect(panel.querySelector('[role="alert"], [role="status"], .diagnostics-list, .diagnostic-item, .error-text, .warning-text')).toBeNull();
    expect(panel.tagName).toBe("SECTION");
    // Nothing on the whole screen is an alert: the Plan was made, and one Task did not fit.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // The diagnostic is still there, as a status, and it is a different thing from the section.
    expect(screen.getByText("task_unplaceable").closest(".diagnostics-list")).toHaveAttribute("role", "status");
    expect(panel).not.toHaveTextContent("task_unplaceable");
  });

  it("105: a recalculation, which reports nothing left out, clears the section and says so", async () => {
    stub((path) => {
      if (path === "/planning/generate") return json(planned([noChunk]));
      if (path === "/planning/recalculate") return json({ schema_version: "ubu.orchestrator.recalculation.v1", trigger_type: "user_override",
        repair_scope: "local_repair", prior_plan_id: PLAN, plan: planBody("plan_018f3c8e9b2a7c4d8f1e2a3b4c5d6e79"), diagnostics: [] });
      return undefined;
    });
    await generate();
    expect(section()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request recalculation" }));
    await screen.findByRole("heading", { name: "Last recalculated" });
    // The list belonged to the superseded Plan. It is not shown against a Plan it was not reported for.
    await waitFor(() => expect(section()).not.toBeInTheDocument());
    expect(screen.getByText("A recalculation does not report which Tasks it left out. Generate Plan to see them.")).toBeInTheDocument();
  });
});
