import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import type { BlockedTask, UnplacedTask } from "../src/api/client";

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
// As the orchestrator sends it: `blocked_tasks` is left out of the response when it is empty.
function planned(unplaced: UnplacedTask[], diagnostics: Array<{ code: string; message: string }> = [], blocked: BlockedTask[] = []) {
  return {
    schema_version: "planning-kernel-contract/0.1", request_id: "synthetic-request", status: unplaced.length ? "partial" : "ok",
    plan: planBody(), alternatives: [], unplaced_tasks: unplaced, diagnostics, ...(blocked.length ? { blocked_tasks: blocked } : {})
  };
}
// A Task whose precondition is false, as the orchestrator reports it: an id and the precondition. No title.
const TEETH = "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e73";
const notReady: BlockedTask = { task_id: TEETH, precondition: { target: "facts.synthetic_teeth_clean", predicate: "equals", expected: true } };
const blockedDiagnostic = { code: "task_precondition_blocked", message: `Task \`${TEETH}\` was excluded from planning because its UniverseState precondition evaluated false` };

function stub(handler: (path: string) => Response | undefined) {
  pluginFetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    const answer = handler(url.pathname);
    if (answer) return answer;
    if (url.pathname === "/affect/observation") return json({ schema_version: "ubu.orchestrator.affect_observation.v1", observation: null });
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

  it("114: a Task blocked by a false precondition is in the section, labelled as not ready and not as not fitting", async () => {
    stub((path) => (path === "/planning/generate" ? json(planned([], [blockedDiagnostic], [notReady])) : undefined));
    await generate();
    const panel = section() as HTMLElement;
    expect(lines(panel)).toEqual([
      "Not in this Plan",
      "1 Task was left out of this Plan. It is in none of the placements above.",
      "1 was not ready.",
      `Not ready: ${TEETH}`,
      "This Task was not ready, so the planner did not try to place it. That is not the same as not fitting.",
      "It is waiting for this to be so: facts.synthetic_teeth_clean is true.",
      "Whether it is so is recorded in the UniverseState, under that name. Open UniverseState",
      "When it is so, generate the Plan again.",
      `${TEETH} task_precondition_blocked`
    ]);
    const task = within(panel).getByRole("article", { name: `Not ready: ${TEETH}` });
    expect(within(panel).queryByRole("article", { name: /^Not placed/ })).not.toBeInTheDocument();
    // Nothing that is said of a Task that did not fit is said of this one.
    expect(task).not.toHaveTextContent("It is longer than any free interval");
    expect(task).not.toHaveTextContent("What can be done:");
    expect(within(task).getAllByText(TEETH).some((node) => node.closest(".small-print"))).toBe(true);
    // It is a section of the Plan, not an alert, like the rest of it.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("115: one unplaced and one blocked Task read as two different things, and the count covers both", async () => {
    stub((path) => (path === "/planning/generate" ? json(planned([noChunk], [blockedDiagnostic], [notReady])) : undefined));
    await generate();
    const panel = section() as HTMLElement;
    console.log(`P1B54_D_SECTION=${JSON.stringify(lines(panel))}`);
    expect(lines(panel)).toEqual([
      "Not in this Plan",
      "2 Tasks were left out of this Plan. They are in none of the placements above.",
      "1 did not fit. 1 was not ready.",
      "Synthetic: paint the whole imaginary fence",
      `Task \`${FENCE}\` was left out because no free interval is long enough.`,
      "It is longer than any free interval in the planning horizon.",
      "What can be done:",
      "Break the Task up into smaller Tasks that fit, then generate the Plan again.",
      "Plan a longer period, which may hold a free interval long enough.",
      `${FENCE} no_eligible_chunk_large_enough`,
      `Not ready: ${TEETH}`,
      "This Task was not ready, so the planner did not try to place it. That is not the same as not fitting.",
      "It is waiting for this to be so: facts.synthetic_teeth_clean is true.",
      "Whether it is so is recorded in the UniverseState, under that name. Open UniverseState",
      "When it is so, generate the Plan again.",
      `${TEETH} task_precondition_blocked`
    ]);
    expect(within(panel).getAllByRole("article")).toHaveLength(2);
    // The Task that did not fit reads exactly as it does with nothing blocked beside it.
    const fence = within(panel).getByRole("article", { name: "Not placed: Synthetic: paint the whole imaginary fence" });
    expect(fence).not.toHaveTextContent("not ready");
  });

  it("116: several blocked Tasks are counted, and a precondition of several parts is said in words", async () => {
    const other: BlockedTask = {
      task_id: "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e74",
      precondition: { all_of: [{ target: "facts.synthetic_kettle", predicate: "member_of", expected: ["full", "hot"] }, { target: "facts.synthetic_alarm", predicate: "absent" }] }
    };
    const odd: BlockedTask = { task_id: "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e75", precondition: { target: "facts.synthetic_fuel", predicate: "synthetic_unknown_predicate", expected: 25 } };
    stub((path) => (path === "/planning/generate" ? json(planned([noChunk, outsideWindow], [], [notReady, other, odd])) : undefined));
    await generate();
    const panel = section() as HTMLElement;
    expect(within(panel).getByText("5 Tasks were left out of this Plan. They are in none of the placements above.")).toBeInTheDocument();
    expect(within(panel).getByText("2 did not fit. 3 were not ready.")).toBeInTheDocument();
    expect(within(panel).getByRole("article", { name: `Not ready: ${other.task_id}` })).toHaveTextContent(
      'It is waiting for this to be so: facts.synthetic_kettle is one of ["full","hot"] and facts.synthetic_alarm is not set.'
    );
    // A predicate this screen does not know is shown as it came, not put into words it might get wrong.
    expect(within(panel).getByRole("article", { name: `Not ready: ${odd.task_id}` })).toHaveTextContent(
      'It is waiting for this to be so: {"target":"facts.synthetic_fuel","predicate":"synthetic_unknown_predicate","expected":25}.'
    );
  });

  it("117: with nothing unplaced and nothing blocked the section is absent, and a recalculation clears blocked Tasks too", async () => {
    let blocked: BlockedTask[] = [];
    stub((path) => {
      if (path === "/planning/generate") return json(planned([], [], blocked));
      if (path === "/planning/recalculate") return json({ schema_version: "ubu.orchestrator.recalculation.v1", trigger_type: "user_override",
        repair_scope: "local_repair", prior_plan_id: PLAN, plan: planBody("plan_018f3c8e9b2a7c4d8f1e2a3b4c5d6e79"), diagnostics: [] });
      return undefined;
    });
    await generate();
    expect(section()).not.toBeInTheDocument();
    blocked = [notReady];
    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
    await waitFor(() => expect(section()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Request recalculation" }));
    await screen.findByRole("heading", { name: "Last recalculated" });
    await waitFor(() => expect(section()).not.toBeInTheDocument());
  });
  for (const [predicate, words] of [["at_least", "is at least"], ["at_most", "is at most"], ["greater_than", "is greater than"], ["less_than", "is less than"]]) {
    it(`P1B-60: ${predicate} is rendered in words`, async () => {
      const blocked: BlockedTask = { task_id: TEETH, precondition: { target: "numeric_values.invented.level", predicate, expected: 25 } };
      stub((path) => path === "/planning/generate" ? json(planned([], [], [blocked])) : undefined);
      await generate();
      expect(section()).toHaveTextContent(`numeric_values.invented.level ${words} 25`);
    });
  }
  it("P1B-60: an unknown predicate still shows its raw value", async () => {
    const precondition = { target: "numeric_values.invented.level", predicate: "invented_unknown", expected: 25 };
    stub((path) => path === "/planning/generate" ? json(planned([], [], [{ task_id: TEETH, precondition }])) : undefined);
    await generate(); expect(within(section()!).getByText(JSON.stringify(precondition))).toBeInTheDocument();
  });
  it("P1B-60: nested all_of mixes equals and at_least in words", async () => {
    const precondition = { all_of: [{ target: "facts.invented.ready", predicate: "equals", expected: true }, { all_of: [{ target: "numeric_values.invented.level", predicate: "at_least", expected: 25 }] }] };
    stub((path) => path === "/planning/generate" ? json(planned([], [], [{ task_id: TEETH, precondition }])) : undefined);
    await generate(); expect(section()).toHaveTextContent("facts.invented.ready is true and numeric_values.invented.level is at least 25");
  });

});
