import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import { DiagnosticsList } from "../src/components/DiagnosticsList";
import { settingsFixture } from "./fixtures/settings";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Invented, and reading as invented.
const TASK = "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70";
const UNPLACEABLE = { code: "task_unplaceable", message: `Task \`${TASK}\` cannot fit any free interval in the planning horizon at its placement duration` };
const UNMAPPABLE = { code: "calendar_event_id_unmappable", message: `Task \`${TASK}\` cannot produce a valid Calendar event id; step skipped` };
const BROKEN = { code: "planning_store_unavailable", message: "The synthetic store could not be read" };

const step = {
  index: 0, task_id: "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e71", summary: "Synthetic oat milk", start: 1_790_000_000, end: 1_790_001_200,
  start_at: "2026-09-21T13:33:20Z", end_at: "2026-09-21T13:53:20Z", depends_on: [], static_anchor: false, placement_authority: "planner", occupies_capacity: true
};
function planned(fields: Record<string, unknown> = {}) {
  return {
    schema_version: "planning-kernel-contract/0.1", request_id: "synthetic-request", status: "partial",
    plan: { id: "plan_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70", status: "admitted", steps: [step], created_at: "2026-09-21T13:33:20Z" },
    alternatives: [], unplaced_tasks: [], diagnostics: [UNPLACEABLE], ...fields
  };
}

type Call = { method: string; path: string };
function stub(handler: (call: Call) => Response | undefined) {
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    const call = { method: init?.method ?? "GET", path: url.pathname };
    const answer = handler(call);
    if (answer) return answer;
    if (call.method === "GET" && call.path === "/affect/observation") return json({ schema_version: "ubu.orchestrator.affect_observation.v1", observation: null });
    if (call.method === "GET" && call.path === "/calendar/current") return json({ plan_id: null, steps: [], alternatives: [] });
    if (call.method === "GET" && call.path === "/settings") return json(settingsFixture());
    throw new Error(`unexpected request: ${call.method} ${call.path}`);
  });
}
async function openToday() {
  render(<App />);
  await screen.findByRole("heading", { name: "No timed Plan available" });
}
/// The element holding a diagnostic's message, and the list it is in.
function shown(message: string) {
  const text = screen.getByText(message);
  return { text, item: text.closest(".diagnostic-item") as HTMLElement, list: text.closest(".diagnostics-list") as HTMLElement };
}

describe("A diagnostic that means something", () => {
  afterEach(() => {
    pluginFetch.mockReset();
  });

  it("counts nineteen diagnostic lines without replacing their sentences", () => {
    const diagnostics = Array.from({ length: 19 }, (_, index) => ({ code: "synthetic_notice", message: `Synthetic notice ${index}` }));
    render(<DiagnosticsList diagnostics={diagnostics} tone="info" showCounts />);
    const counts = screen.getByRole("status", { name: "Diagnostic counts" });
    expect(counts.textContent).toBe("Diagnostic counts: synthetic_notice 19.");
    expect(counts.tagName).toBe("P");
    expect(counts).toHaveClass("muted");
    expect(counts.closest('[role="alert"]')).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    for (const diagnostic of diagnostics) expect(screen.getByText(diagnostic.message)).toBeInTheDocument();
  });

  it("counts interleaved codes in first-rendered order, rather than alphabetically", () => {
    render(<DiagnosticsList diagnostics={[
      { code: "synthetic_z", message: "Synthetic first" },
      { code: "synthetic_a", message: "Synthetic second" },
      { code: "synthetic_z", message: "Synthetic third" }
    ]} tone="info" showCounts />);
    expect(screen.getByLabelText("Diagnostic counts").textContent).toBe("Diagnostic counts: synthetic_z 2, synthetic_a 1.");
    expect(Array.from(document.querySelectorAll(".diagnostic-message"), (node) => node.textContent)).toEqual(["Synthetic first", "Synthetic second", "Synthetic third"]);
  });

  it("keeps default rendering exact and renders nothing for an empty opt-in list", () => {
    const { container, rerender } = render(<DiagnosticsList diagnostics={[BROKEN]} />);
    expect(container.innerHTML).toBe('<div class="diagnostics-list" role="alert"><div class="diagnostic-item"><span class="diagnostic-message">The synthetic store could not be read</span><code class="diagnostic-code">planning_store_unavailable</code></div></div>');
    expect(screen.queryByLabelText("Diagnostic counts")).not.toBeInTheDocument();
    rerender(<DiagnosticsList diagnostics={[]} tone="info" showCounts />);
    expect(container.innerHTML).toBe("");
  });

  it("95: an informational diagnostic is a status, a failure is an alert, and saying nothing means failure", () => {
    const { rerender } = render(<DiagnosticsList diagnostics={[UNPLACEABLE]} tone="info" />);
    expect(screen.getByRole("status")).toHaveTextContent(UNPLACEABLE.message);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("diagnostics-info");

    rerender(<DiagnosticsList diagnostics={[BROKEN]} tone="failure" />);
    expect(screen.getByRole("alert")).toHaveTextContent(BROKEN.message);
    expect(document.querySelector(".diagnostics-info")).toBeNull();
    expect(screen.getByRole("alert")).not.toHaveClass("diagnostics-info");

    // The default: a call site that names no tone keeps the meaning it always had.
    rerender(<DiagnosticsList diagnostics={[BROKEN]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(BROKEN.message);
    // Nothing to say is nothing on screen, in either tone.
    rerender(<DiagnosticsList diagnostics={[]} tone="info" />);
    expect(document.querySelector(".diagnostics-info")).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("96: the message comes before the code in both tones, and the code is small print that can still be copied", () => {
    for (const tone of ["info", "failure"] as const) {
      const { unmount } = render(<DiagnosticsList diagnostics={[UNPLACEABLE]} tone={tone} />);
      const { text, item } = shown(UNPLACEABLE.message);
      const code = within(item).getByText(UNPLACEABLE.code);
      // The sentence leads; the machine code follows it.
      expect(text.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(item.firstElementChild).toBe(text);
      expect(item.textContent).toBe(`${UNPLACEABLE.message}${UNPLACEABLE.code}`);
      // The code is not the headline: it is a <code>, not a <strong>, and it is whole and exact.
      expect(code.tagName).toBe("CODE");
      expect(code).toHaveClass("diagnostic-code");
      expect(code.textContent).toBe(UNPLACEABLE.code);
      expect(item.querySelector("strong")).toBeNull();
      unmount();
    }
  });

  it("120: a collision between two fixed commitments is said plainly, as information, beside the warning that names them", async () => {
    const collision = {
      code: "static_task_collision",
      message: "Static Tasks “Synthetic dentist” (`task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e72`) and “Synthetic school run” (`task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e73`) overlap; both keep their fixed windows and stay on the Calendar, and the whole span is busy"
    };
    stub((call) => (call.path === "/planning/generate" ? json(planned({ status: "ok", diagnostics: [collision] })) : undefined));
    await openToday();
    expect(screen.queryByRole("status", { name: "Fixed commitments that collide" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
    const notice = await screen.findByRole("status", { name: "Fixed commitments that collide" });
    expect(notice.textContent).toBe(
      "Two fixed commitments overlap, or one depends on another that ends too late. Both of a pair are in the Plan at their own times and both are busy: no other work is placed in the time they cover. The Plan was still made. Each pair is named below."
    );
    // Information, in the quiet tone: not an alert, and nothing on the screen is one.
    expect(notice).toHaveClass("diagnostics-info");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // The warning itself follows it, with both titles, and its code as small print.
    const { list, item } = shown(collision.message);
    expect(list).toHaveAttribute("role", "status");
    expect(notice.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(item).toHaveTextContent("Synthetic dentist");
    expect(item).toHaveTextContent("Synthetic school run");
    expect(within(item).getByText("static_task_collision").tagName).toBe("CODE");
    // And the Plan is on the screen.
    expect(screen.getByRole("heading", { name: "Synthetic oat milk" })).toBeInTheDocument();
  });

  it("121: several collisions are counted, and with none the sentence is absent", async () => {
    const collision = (first: string, second: string) => ({ code: "static_task_collision", message: `Static Tasks “${first}” and “${second}” overlap; both keep their fixed windows and stay on the Calendar, and the whole span is busy` });
    let diagnostics = [collision("Synthetic dentist", "Synthetic school run"), collision("Synthetic night", "Synthetic night"), UNPLACEABLE];
    stub((call) => (call.path === "/planning/generate" ? json(planned({ diagnostics })) : undefined));
    await openToday();
    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
    const notice = await screen.findByRole("status", { name: "Fixed commitments that collide" });
    expect(notice).toHaveTextContent("2 pairs of fixed commitments overlap, or have one that depends on another that ends too late.");
    // A Plan with other diagnostics and no collision says nothing of the kind.
    diagnostics = [UNPLACEABLE];
    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
    await waitFor(() => expect(screen.queryByRole("status", { name: "Fixed commitments that collide" })).not.toBeInTheDocument());
    expect(screen.getByText(UNPLACEABLE.message)).toBeInTheDocument();
  });

  it("97: a planning diagnostic from a successful Generate Plan is a status and not an alert", async () => {
    stub((call) => (call.path === "/planning/generate" ? json(planned()) : undefined));
    await openToday();
    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
    await screen.findByText(UNPLACEABLE.message);
    const { list } = shown(UNPLACEABLE.message);
    expect(list).toHaveAttribute("role", "status");
    expect(list).toHaveClass("diagnostics-info");
    expect(within(list).getByText("task_unplaceable")).toBeInTheDocument();
    // The Plan was made, and nothing on the screen says otherwise.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector(".error-text")).toBeNull();
    expect(screen.getByRole("heading", { name: "Synthetic oat milk" })).toBeInTheDocument();
  });

  it("98: a Generate Plan that fails is still an alert, and what the last success said is gone", async () => {
    let fail = false;
    stub((call) => {
      if (call.path !== "/planning/generate") return undefined;
      return fail ? json({ error: "The synthetic store could not be read", diagnostics: [BROKEN] }, 500) : json(planned());
    });
    await openToday();
    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
    await screen.findByText(UNPLACEABLE.message);
    fail = true;
    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(BROKEN.message);
    expect(within(alert).getByText(BROKEN.code)).toBeInTheDocument();
    expect(alert).not.toHaveClass("diagnostics-info");
    // The two are never one list: the notice from the earlier 200 is not shown as part of the failure.
    expect(screen.queryByText(UNPLACEABLE.message)).not.toBeInTheDocument();
    expect(document.querySelector(".diagnostics-info")).toBeNull();
  });

  it("99: a Calendar preview that skipped a step says so as a status, and a preview that fails is an alert", async () => {
    let fail = false;
    stub((call) => {
      if (call.path !== "/projection/calendar/preview") return undefined;
      if (fail) return json({ error: "The synthetic preview could not be taken", diagnostics: [BROKEN] }, 500);
      return json({ schema_version: "ubu.orchestrator.calendar_projection_preview.v1", preview_id: "synthetic-preview", plan_id: "synthetic-plan",
        stale: false, events: [], operations: [], diagnostics: [UNMAPPABLE] });
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    await screen.findByText(UNMAPPABLE.message);
    const { list } = shown(UNMAPPABLE.message);
    expect(list).toHaveAttribute("role", "status");
    expect(within(list).getByText("calendar_event_id_unmappable")).toBeInTheDocument();
    expect(screen.queryByLabelText("Diagnostic counts")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fail = true;
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    await waitFor(() => expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes(BROKEN.message))).toBe(true));
    expect(shown(BROKEN.message).list).toHaveAttribute("role", "alert");
  });
});
