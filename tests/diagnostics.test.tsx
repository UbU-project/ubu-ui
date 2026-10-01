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

  it("95: an informational diagnostic is a status, a failure is an alert, and saying nothing means failure", () => {
    const { rerender } = render(<DiagnosticsList diagnostics={[UNPLACEABLE]} tone="info" />);
    expect(screen.getByRole("status")).toHaveTextContent(UNPLACEABLE.message);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("diagnostics-info");

    rerender(<DiagnosticsList diagnostics={[BROKEN]} tone="failure" />);
    expect(screen.getByRole("alert")).toHaveTextContent(BROKEN.message);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).not.toHaveClass("diagnostics-info");

    // The default: a call site that names no tone keeps the meaning it always had.
    rerender(<DiagnosticsList diagnostics={[BROKEN]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(BROKEN.message);
    // Nothing to say is nothing on screen, in either tone.
    rerender(<DiagnosticsList diagnostics={[]} tone="info" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fail = true;
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    await waitFor(() => expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes(BROKEN.message))).toBe(true));
    expect(shown(BROKEN.message).list).toHaveAttribute("role", "alert");
  });
});
