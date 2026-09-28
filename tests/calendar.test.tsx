import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import type { CalendarConflict, CalendarEventBody, CalendarProjectionPreviewResponse } from "../src/api/client";

// Every Calendar interaction terminates here; no credential or external service is used.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

type Recorded = { method: string; path: string; query: string; body: unknown };
type Handler = (request: Recorded) => Response | undefined;
let unexpected: Recorded[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const event: CalendarEventBody = {
  external_id: "synthetic-event-static",
  task_id: "synthetic-task-static",
  summary: "Synthetic appointment",
  start_at: "2026-09-28T13:00:00Z",
  end_at: "2026-09-28T14:00:00Z",
  color_id: "4",
  transparent: false,
  reminders_minutes: [10]
};
const dynamicEvent = { ...event, external_id: "synthetic-event-dynamic", task_id: "synthetic-task-dynamic", summary: "Synthetic focus", color_id: null };

function preview(fields: Partial<CalendarProjectionPreviewResponse> = {}): CalendarProjectionPreviewResponse {
  return {
    schema_version: "ubu.orchestrator.calendar_projection_preview.v1",
    preview_id: "synthetic-preview",
    plan_id: "synthetic-plan",
    stale: false,
    events: [event, dynamicEvent],
    operations: [
      { kind: "create", event },
      { kind: "update", event: dynamicEvent },
      { kind: "delete", external_id: "synthetic-event-deleted", summary: "Synthetic old event" }
    ],
    diagnostics: [],
    ...fields
  };
}

const conflicts: CalendarConflict[] = [
  { external_id: "synthetic-missing", conflict_type: "missing", summary: "Synthetic missing event", message: "UbU applied this event and the calendar no longer has it" },
  { external_id: "synthetic-drifted", conflict_type: "drifted", summary: "Synthetic drifted event", message: "the calendar's copy of this event differs from what UbU applied" },
  { external_id: "synthetic-unrecorded", conflict_type: "unrecorded", summary: "Synthetic unrecorded event", message: "this event matches a known Task but UbU has no applied record; it will not be adopted" },
  { external_id: "synthetic-foreign", conflict_type: "foreign", summary: "Synthetic personal event", message: "this event was not created by UbU and will not be touched" }
];
const reconciliation = {
  schema_version: "ubu.orchestrator.calendar_reconciliation.v1",
  reconciliation_id: "synthetic/reconciliation",
  status: "drifted",
  conflicts,
  diagnostics: []
};

function stubOrchestrator(handler: Handler) {
  const requests: Recorded[] = [];
  unexpected = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    const request = { method: init?.method ?? "GET", path: url.pathname, query: url.search, body: init?.body ? JSON.parse(String(init.body)) : null };
    requests.push(request);
    const response = handler(request);
    if (response) return response;
    if (request.method === "GET" && request.path === "/calendar/current") return json({ plan_id: null, steps: [], alternatives: [] });
    if (request.method === "GET" && request.path === "/health") return json({ status: "ok", version: "synthetic", bind_policy: "127.0.0.1_only" });
    if (request.method === "POST" && request.path === "/desktop/session/google-calendar") {
      expect(request.body).toEqual({ schema_version: "ubu.orchestrator.desktop_session.v1" });
      return json({ schema_version: "ubu.orchestrator.desktop_session.v1", accepted: true, enabled: true });
    }
    unexpected.push(request);
    throw new Error(`unexpected mocked request: ${request.method} ${request.path}`);
  });
  return requests;
}

async function openCalendar() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Setup" }));
  fireEvent.click(screen.getByRole("button", { name: "Enable Google Calendar session" }));
  const card = screen.getByRole("heading", { name: "Google Calendar session" }).closest(".settings-panel") as HTMLElement;
  await waitFor(() => expect(within(card).getByText("accepted").nextElementSibling).toHaveTextContent("true"));
  expect(within(card).getByText("enabled", { selector: "dt" }).nextElementSibling).toHaveTextContent("true");
  fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
  expect(screen.queryByText(/Google Calendar session is not enabled/)).not.toBeInTheDocument();
}

function countValues(container: HTMLElement) {
  return within(container).getAllByRole("term").map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent}`);
}

describe("Google Calendar surface", () => {
  afterEach(() => {
    expect(unexpected).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    pluginFetch.mockReset();
  });

  it("24: derives Static and Dynamic meaning from color_id and renders a Delete only as removal", async () => {
    const requests = stubOrchestrator((request) => request.path === "/projection/calendar/preview" ? json(preview()) : undefined);
    await openCalendar();
    expect(screen.getByRole("checkbox", { name: "No external export" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    const staticOperation = await screen.findByRole("article", { name: "Create Synthetic appointment" });
    expect(within(staticOperation).getByText("Placement: Static")).toBeInTheDocument();
    expect(within(staticOperation).getByText("Colour means: its category")).toBeInTheDocument();
    expect(within(staticOperation).getByText("Window change means: move — the window follows the event")).toBeInTheDocument();
    expect(within(staticOperation).getByText(event.start_at)).toBeInTheDocument();
    expect(within(staticOperation).getByText(event.end_at)).toBeInTheDocument();
    const dynamic = screen.getByRole("article", { name: "Update Synthetic focus" });
    expect(within(dynamic).getByText("Placement: Dynamic")).toBeInTheDocument();
    expect(within(dynamic).getByText("done").parentElement).toHaveTextContent("Colour means: done");
    expect(within(dynamic).getByText("Window change means: resize — the duration changed")).toBeInTheDocument();
    const removed = screen.getByRole("article", { name: "Delete Synthetic old event" });
    expect(removed.textContent).toBe("Delete: Synthetic old eventEvent will be removed.");
    expect(removed).not.toHaveTextContent(/colour|placement|window|absent metadata/i);
    expect(screen.getByText("synthetic-plan")).toBeInTheDocument();
    expect(requests.filter((request) => request.path === "/projection/calendar/preview")).toEqual([
      { method: "GET", path: "/projection/calendar/preview", query: "?no_external_export=false", body: null }
    ]);
    // Changing policy invalidates the previous preview and sends the true query flag.
    fireEvent.click(screen.getByRole("checkbox", { name: "No external export" }));
    expect(screen.getByRole("button", { name: "Approve preview" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    await screen.findByRole("article", { name: "Create Synthetic appointment" });
    expect(requests.at(-1)?.query).toBe("?no_external_export=true");
    expect(requests.some((request) => request.path === "/tasks")).toBe(false);
    expect(requests.some((request) => request.path === "/projection/calendar/approve")).toBe(false);
  });

  it("25: makes a stale preview prominent and shows its diagnostics", async () => {
    stubOrchestrator((request) => request.path === "/projection/calendar/preview" ? json(preview({ stale: true, diagnostics: [{ code: "synthetic_preview_diagnostic", message: "Synthetic plan needs review." }] })) : undefined);
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    const stale = await screen.findByText("Stale preview — the plan may have changed. Review before approving.");
    expect(stale.closest('[role="alert"]')).toBeInTheDocument();
    expect(screen.getByText("synthetic_preview_diagnostic")).toBeInTheDocument();
    expect(screen.getByText("Synthetic plan needs review.")).toBeInTheDocument();
  });

  it("26: gates approval on a preview and posts exactly that preview_id after explicit approval", async () => {
    const requests = stubOrchestrator((request) => {
      if (request.path === "/projection/calendar/preview") return json(preview());
      if (request.path === "/projection/calendar/approve") return json({
        schema_version: "ubu.orchestrator.calendar_projection_result.v1", preview_id: "synthetic-preview", status: "partial", applied_events: [event],
        operation_results: [{ operation_id: "synthetic-operation", status: "failed", message: "Synthetic operation refused." }],
        diagnostics: [{ code: "synthetic_approval_diagnostic", message: "Review synthetic result." }]
      });
    });
    await openCalendar();
    expect(screen.getByRole("button", { name: "Approve preview" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    await screen.findByRole("article", { name: "Create Synthetic appointment" });
    expect(screen.getByRole("button", { name: "Approve preview" })).toBeEnabled();
    expect(requests.some((request) => request.path.endsWith("/approve"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Approve preview" }));
    expect(await screen.findByText("synthetic-operation: failed — Synthetic operation refused.")).toBeInTheDocument();
    expect(screen.getByText("partial", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Review synthetic result.")).toBeInTheDocument();
    expect(screen.getByText("Applied events: 1")).toBeInTheDocument();
    expect(requests.find((request) => request.path.endsWith("/approve"))).toEqual({
      method: "POST", path: "/projection/calendar/approve", query: "",
      body: { schema_version: "ubu.orchestrator.calendar_projection_approval.v1", preview_id: "synthetic-preview", authority_source: "user", export_mode: "live" }
    });
  });

  it("27: renders all six capture counts including zeros and every gesture diagnostic", async () => {
    const diagnostics = [
      { code: "calendar_move_needs_occurrence_override", message: "Synthetic occurrence move needs an occurrence override." },
      { code: "calendar_resize_overridden_by_observations", message: "Synthetic resize is overridden by observations." },
      { code: "calendar_gesture_on_inactive_task", message: "Synthetic inactive Task cannot take this gesture." }
    ];
    const requests = stubOrchestrator((request) => request.path === "/projection/calendar/capture" ? json({
      schema_version: "ubu.orchestrator.calendar_capture.v1", captured: 2, updated: 1, unchanged: 0, skipped: 3, moved: 0, resized: 1, diagnostics
    }) : undefined);
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Run capture" }));
    const counts = await screen.findByLabelText("Capture counts");
    expect(countValues(counts)).toEqual(["captured: 2", "updated: 1", "unchanged: 0", "skipped: 3", "moved: 0", "resized: 1"]);
    for (const diagnostic of diagnostics) {
      expect(screen.getByText(diagnostic.code)).toBeInTheDocument();
      expect(screen.getByText(diagnostic.message)).toBeInTheDocument();
    }
    expect(requests.at(-1)).toEqual({ method: "POST", path: "/projection/calendar/capture", query: "", body: { schema_version: "ubu.orchestrator.calendar_capture.v1", export_mode: "live" } });
  });

  it("28: groups four conflict kinds and offers exactly one repair excluding foreign and unrecorded", async () => {
    const requests = stubOrchestrator((request) => request.path === "/projection/calendar/reconcile" ? json(reconciliation) : undefined);
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Run reconciliation" }));
    await screen.findByRole("region", { name: "missing conflicts" });
    for (const conflict of conflicts) {
      const group = screen.getByRole("region", { name: `${conflict.conflict_type} conflicts` });
      expect(within(group).getByText(conflict.summary)).toBeInTheDocument();
      expect(within(group).getByText(conflict.message)).toBeInTheDocument();
      expect(within(group).queryByRole("button")).not.toBeInTheDocument();
    }
    for (const explanation of [
      "An owned event is absent from the observed list.",
      "An owned event's observed fields differ from its applied record.",
      "An observed event is not owned, but its ID derives from an active Task UbU knows about.",
      "An observed event is neither owned nor linked by ID to an active Task."
    ]) expect(screen.getByText(explanation)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /repair/i })).toHaveLength(1);
    expect(screen.getByText("Repair corrects UbU's record of what it applied. It addresses missing and drifted only and does not call Google. The calendar corrections appear in the next preview, which needs a separate approval.")).toBeInTheDocument();
    expect(screen.getByText("foreign events belong to the operator and are never repairable. foreign and unrecorded are excluded from repair and remain unchanged.")).toBeInTheDocument();
    expect(requests.at(-1)).toEqual({ method: "POST", path: "/projection/calendar/reconcile", query: "", body: { schema_version: "ubu.orchestrator.calendar_reconciliation.v1", export_mode: "live" } });
  });

  it("29: reports whole-reconciliation repair, offers the next preview, and explains a second repair's 409", async () => {
    let repairs = 0;
    const repairPath = "/projection/calendar/reconcile/synthetic%2Freconciliation/repair";
    const message = "This Calendar reconciliation has already been repaired; request a new reconciliation";
    const requests = stubOrchestrator((request) => {
      if (request.path === "/projection/calendar/reconcile") return json(reconciliation);
      if (request.path === "/projection/calendar/preview") return json(preview());
      if (request.path === repairPath) {
        repairs += 1;
        return repairs === 1 ? json({ schema_version: "ubu.orchestrator.calendar_repair.v1", reconciliation_id: reconciliation.reconciliation_id,
          dropped_events: 1, updated_events: 1, applied_event_count: 2, remaining_conflicts: conflicts.slice(2)
        }) : json({ error: message, diagnostics: [{ code: "calendar_reconciliation_already_repaired", message }] }, 409);
      }
    });
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Run reconciliation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Repair applied record" }));
    const result = await screen.findByRole("region", { name: "Repair result" });
    expect(countValues(result)).toEqual(["dropped_events: 1", "updated_events: 1", "applied_event_count: 2"]);
    expect(within(result).getByText("remaining_conflicts")).toBeInTheDocument();
    expect(within(result).getAllByRole("listitem").map((item) => item.textContent)).toEqual(conflicts.slice(2).map((conflict) => `${conflict.conflict_type}: ${conflict.summary} — ${conflict.message}`));
    expect(within(result).getByText("The calendar corrections appear in the next preview. Review and approve it separately.")).toBeInTheDocument();
    expect(requests.filter((request) => request.path === repairPath)).toEqual([{ method: "POST", path: repairPath, query: "", body: null }]);
    fireEvent.click(screen.getByRole("button", { name: "Take fresh preview" }));
    await screen.findByRole("article", { name: "Create Synthetic appointment" });
    expect(requests.some((request) => request.path.endsWith("/approve"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Repair applied record" }));
    expect(await screen.findByText("calendar_reconciliation_already_repaired")).toBeInTheDocument();
    expect(screen.getAllByText(message)).toHaveLength(2);
    expect(screen.getByText("Take a new reconciliation before repairing again.")).toBeInTheDocument();
    expect(repairs).toBe(2);
    expect(requests.filter((request) => request.path === repairPath).every((request) => request.body === null)).toBe(true);
  });

  it("30: directs a disabled session to Setup and renders 503 as configuration instructions", async () => {
    const requests = stubOrchestrator((request) => request.path === "/desktop/session/google-calendar" ? json({ error: "Google credential paths are not configured", diagnostics: [{ code: "calendar_live_export_unconfigured", message: "Google credential paths are not configured" }] }, 503) : undefined);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.getByText("Google Calendar session is not enabled. Enable it in Setup before approving, capturing or reconciling.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run capture" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run reconciliation" })).toBeDisabled();
    expect(requests.some((request) => request.path.startsWith("/projection/calendar"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Open Setup" }));
    expect(screen.getByRole("heading", { level: 1, name: "Setup" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enable Google Calendar session" }));
    const heading = await screen.findByRole("heading", { name: "Configure Google Calendar credential paths" });
    const instruction = heading.parentElement as HTMLElement;
    expect(instruction).toHaveAttribute("role", "status");
    expect(instruction).toHaveTextContent("The credential paths are not configured.");
    expect(instruction).toHaveTextContent("UBU_GOOGLE_CREDENTIALS_PATH");
    expect(instruction).toHaveTextContent("UBU_GOOGLE_TOKEN_CACHE_PATH");
    expect(instruction).toHaveTextContent("restart the orchestrator and enable this session again");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(requests.at(-1)).toEqual({ method: "POST", path: "/desktop/session/google-calendar", query: "", body: { schema_version: "ubu.orchestrator.desktop_session.v1" } });
  });
});
