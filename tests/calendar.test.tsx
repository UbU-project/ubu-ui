import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import { settingsFixture } from "./fixtures/settings";
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
    matching_placements: 0,
    operations: [
      { kind: "create", event, static_anchor: true },
      { kind: "update", event: dynamicEvent, static_anchor: false },
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
    if (request.method === "GET" && request.path === "/settings") return json(settingsFixture());
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

  it("24: takes Static and Dynamic meaning from the operation's static_anchor and renders a Delete only as removal", async () => {
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
    expect(screen.getByText(/^Applied record: 1 event in total\./)).toBeInTheDocument();
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

const recurringId = "abc123def456ghij_20260928T163000Z";
const refusal = {
  code: "capture_event_not_ownable",
  message: `Calendar event \`${recurringId}\` cannot be captured: its id cannot be a UbU Task handle, so UbU cannot own it`
};
const recurringConflict: CalendarConflict = {
  external_id: recurringId, conflict_type: "foreign", summary: "Synthetic lunar teapot rehearsal", message: refusal.message
};
const ordinaryConflict: CalendarConflict = {
  external_id: "abc123def456ghij", conflict_type: "foreign", summary: "Synthetic ordinary teapot appointment",
  message: "this event was not created by UbU and will not be touched"
};
function foreignReconciliation(withRecurring = true) {
  return { ...reconciliation, status: "observed", conflicts: withRecurring ? [ordinaryConflict, recurringConflict] : [ordinaryConflict], diagnostics: withRecurring ? [refusal] : [] };
}

describe("Recurring Calendar commitments", () => {
  afterEach(() => {
    expect(unexpected).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    pluginFetch.mockReset();
  });

  const OCCUPIED = "foreign, occupied time only conflicts";
  // What capture emits for an event UbU cannot own, from P1B-51: it is captured, as occupied time.
  const occupancy = {
    code: "capture_occupancy_only",
    message: `Calendar event \`${recurringId}\` cannot be owned by UbU, so its time is recorded as an occupied window that UbU will never write back to or export`
  };

  it("44: separates the foreign events UbU cannot own, and says they are captured as occupied time", async () => {
    stubOrchestrator((request) => request.path === "/projection/calendar/reconcile" ? json(foreignReconciliation()) : undefined);
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Run reconciliation" }));
    const group = await screen.findByRole("region", { name: OCCUPIED });
    expect(within(group).getByText(recurringConflict.summary)).toBeInTheDocument();
    expect(within(group).getByText("UbU cannot own these observed commitments. Capture records each one as occupied time: a Static Task that UbU never writes back to and never exports.")).toBeInTheDocument();
    expect(within(group).getByText("UbU cannot own this event. Capture records its time as occupied.")).toBeInTheDocument();
    expect(within(group).getByText(recurringId).closest(".small-print")).not.toBeNull();
    expect(within(group).queryByText(ordinaryConflict.summary)).not.toBeInTheDocument();
    const ordinary = screen.getByRole("region", { name: "foreign conflicts" });
    expect(within(ordinary).getByText(ordinaryConflict.summary)).toBeInTheDocument();
    expect(within(ordinary).queryByText(recurringConflict.summary)).not.toBeInTheDocument();
    // Nothing on the Calendar screen says such an event cannot be captured: it can, as occupied time.
    expect(document.body).not.toHaveTextContent(/cannot be captured/);
    expect(document.body).not.toHaveTextContent(/uncapturable/);
    expect(document.body).not.toHaveTextContent(/cannot become UbU Tasks/);
  });

  it("45: neither foreign group offers a repair control or sends a repair request", async () => {
    const requests = stubOrchestrator((request) => request.path === "/projection/calendar/reconcile" ? json(foreignReconciliation()) : undefined);
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Run reconciliation" }));
    await screen.findByRole("region", { name: OCCUPIED });
    for (const name of ["foreign conflicts", OCCUPIED]) {
      const group = screen.getByRole("region", { name });
      expect(within(group).queryByRole("button")).not.toBeInTheDocument();
      expect(within(group).getByText("Excluded from repair; remains unchanged.")).toBeInTheDocument();
    }
    expect(requests.some(({ path }) => path.endsWith("/repair"))).toBe(false);
  });

  it("46: counts the commitments UbU cannot own in the horizon, says capture records them, and drops the line at zero", async () => {
    let run = 0;
    const secondId = "abc123def456ghij_20260929T163000Z";
    const secondReason = refusal.message.replace(recurringId, secondId);
    stubOrchestrator((request) => {
      if (request.path !== "/projection/calendar/reconcile") return undefined;
      run += 1;
      if (run === 1) return json({ ...foreignReconciliation(),
        conflicts: [ordinaryConflict, recurringConflict, { ...recurringConflict, external_id: secondId, summary: "Synthetic second teapot rehearsal", message: secondReason }],
        diagnostics: [refusal, { code: refusal.code, message: secondReason }]
      });
      return json(foreignReconciliation(false));
    });
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Run reconciliation" }));
    expect(await screen.findByText("2 such commitments fall inside the current planning horizon. Run capture to record their time as occupied. Until a capture has, UbU does not see them when planning, and work may be placed over them.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run reconciliation" }));
    await waitFor(() => expect(screen.queryByText(/Until a capture has/)).not.toBeInTheDocument());
    expect(await screen.findByText(ordinaryConflict.summary)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: OCCUPIED })).not.toBeInTheDocument();
  });

  it("47: capture reports the same event as capture_occupancy_only, as a status and not an alert", async () => {
    stubOrchestrator((request) => {
      if (request.path === "/projection/calendar/reconcile") return json(foreignReconciliation());
      if (request.path === "/projection/calendar/capture") return json({ schema_version: "ubu.orchestrator.calendar_capture.v1",
        captured: 1, updated: 0, unchanged: 0, skipped: 0, moved: 0, resized: 0, diagnostics: [occupancy] });
    });
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Run reconciliation" }));
    const group = await screen.findByRole("region", { name: OCCUPIED });
    expect(within(group).getByText("1 such commitment falls inside the current planning horizon. Run capture to record its time as occupied. Until a capture has, UbU does not see it when planning, and work may be placed over it.")).toBeInTheDocument();
    // capture_event_not_ownable is a reconciliation code. It groups the event; it is never shown as a diagnostic.
    expect(screen.queryByText("capture_event_not_ownable")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run capture" }));
    const code = await screen.findByText("capture_occupancy_only");
    expect(code.closest(".diagnostics-list")).toHaveAttribute("role", "status");
    expect(screen.getByText(occupancy.message)).toBeInTheDocument();
    const counts = screen.getByLabelText("Capture counts");
    expect(within(counts).getByText("captured").nextElementSibling).toHaveTextContent("1");
    expect(within(counts).getByText("skipped").nextElementSibling).toHaveTextContent("0");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: OCCUPIED })).not.toBeInTheDocument();
  });

  it("61: the approve result names the applied record, and not a count of events pushed", async () => {
    stubOrchestrator((request) => {
      if (request.path === "/projection/calendar/preview") return json(preview({ operations: [{ kind: "create", event, static_anchor: true }] }));
      // One event was pushed in this run; the applied record already held two others.
      if (request.path === "/projection/calendar/approve") return json({
        schema_version: "ubu.orchestrator.calendar_projection_result.v1", preview_id: "synthetic-preview", status: "applied",
        applied_events: [event, dynamicEvent, { ...event, external_id: "synthetic-event-earlier", summary: "Synthetic earlier event" }],
        operation_results: [{ operation_id: "calendar-create-synthetic-event-static", status: "applied", message: null }],
        diagnostics: []
      });
    });
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    await screen.findByRole("article", { name: "Create Synthetic appointment" });
    fireEvent.click(screen.getByRole("button", { name: "Approve preview" }));

    expect(await screen.findByText("Operations applied in this run: 1 of 1")).toBeInTheDocument();
    expect(
      screen.getByText("Applied record: 3 events in total. This is the size of UbU's record of everything it has applied, not a count of events pushed in this run.")
    ).toBeInTheDocument();
    // The old wording, which read as a count of what was pushed, is gone.
    expect(screen.queryByText(/Applied events/)).not.toBeInTheDocument();
  });

  it("76: the screen says which control reads the calendar and writes, and which does neither", async () => {
    const requests = stubOrchestrator(() => undefined);
    await openCalendar();
    const panel = (heading: string) => screen.getByRole("heading", { name: heading }).closest(".calendar-panel") as HTMLElement;
    const previewPanel = panel("1. Preview");
    expect(previewPanel).toHaveTextContent(
      "Take preview writes nothing and captures nothing. It compares the Plan with what UbU has already applied and proposes changes; it does not read your calendar, so an event you made there will not appear here."
    );
    expect(within(previewPanel).getByRole("button", { name: "Take preview" })).toBeInTheDocument();
    const capturePanel = panel("3. Capture");
    expect(capturePanel).toHaveTextContent(
      "Run capture is the control that reads your calendar and writes to UbU. It makes a Task for each event there that UbU did not create, and applies your changes to the events it did."
    );
    expect(within(capturePanel).getByRole("button", { name: "Run capture" })).toBeInTheDocument();
    // Saying it costs no request.
    expect(requests.some((request) => request.path.startsWith("/projection"))).toBe(false);
  });
});

// P1B-53: the preview says what the placement is. The screen used to infer it from the colour,
// and a Static Task with no category has no colour. No fixture here builds placement from one.
describe("Placement on the Calendar preview", () => {
  afterEach(() => {
    expect(unexpected).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    pluginFetch.mockReset();
  });

  const night: CalendarEventBody = { ...event, external_id: "synthetic-event-night", task_id: "synthetic-task-night", summary: "Synthetic night block", color_id: null };
  const unmapped: CalendarEventBody = { ...event, external_id: "synthetic-event-unmapped", task_id: "synthetic-task-unmapped", summary: "Synthetic captured tour", color_id: null };
  const packed: CalendarEventBody = { ...dynamicEvent, external_id: "synthetic-event-packed", task_id: "synthetic-task-packed", summary: "Synthetic packed errand", color_id: null };
  const lines = (article: HTMLElement) => Array.from(article.querySelectorAll("p")).slice(1).map((line) => line.textContent);
  async function previewed(operations: CalendarProjectionPreviewResponse["operations"]) {
    stubOrchestrator((request) => request.path === "/projection/calendar/preview" ? json(preview({ events: [], operations })) : undefined);
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
  }

  it("106: a Static event with no colour renders Static, its category, and move", async () => {
    await previewed([{ kind: "create", event: night, static_anchor: true }, { kind: "update", event: unmapped, static_anchor: true }]);
    for (const name of ["Create Synthetic night block", "Update Synthetic captured tour"]) {
      const article = await screen.findByRole("article", { name });
      expect(lines(article)).toEqual(["Placement: Static", "Colour means: its category", "Window change means: move — the window follows the event"]);
      // The three opposites, which is what the colour inference showed for these two.
      expect(article).not.toHaveTextContent("Dynamic");
      expect(article).not.toHaveTextContent("done");
      expect(article).not.toHaveTextContent("resize");
    }
  });

  it("107: a Dynamic event renders Dynamic, done, and resize, with or without a colour", async () => {
    // A colour on a Dynamic event means done. It does not make the event Static.
    const coloured: CalendarEventBody = { ...packed, external_id: "synthetic-event-done", summary: "Synthetic finished errand", color_id: "10" };
    await previewed([{ kind: "create", event: packed, static_anchor: false }, { kind: "update", event: coloured, static_anchor: false }]);
    for (const name of ["Create Synthetic packed errand", "Update Synthetic finished errand"]) {
      const article = await screen.findByRole("article", { name });
      expect(lines(article)).toEqual(["Placement: Dynamic", "Colour means: done", "Window change means: resize — the duration changed"]);
      expect(article).not.toHaveTextContent("Static");
      expect(article).not.toHaveTextContent("its category");
    }
  });

  it("108: the same event reads by its static_anchor alone, and a Delete keeps its rendering", async () => {
    // One event body, twice: only the field differs, and only the field decides.
    const twin: CalendarEventBody = { ...night, external_id: "synthetic-event-twin", summary: "Synthetic twin" };
    await previewed([
      { kind: "create", event: twin, static_anchor: true },
      { kind: "update", event: { ...twin, external_id: "synthetic-event-twin-two", summary: "Synthetic other twin" }, static_anchor: false },
      { kind: "delete", external_id: "synthetic-event-deleted", summary: "Synthetic old event" }
    ]);
    expect(lines(await screen.findByRole("article", { name: "Create Synthetic twin" }))[0]).toBe("Placement: Static");
    expect(lines(screen.getByRole("article", { name: "Update Synthetic other twin" }))[0]).toBe("Placement: Dynamic");
    const removed = screen.getByRole("article", { name: "Delete Synthetic old event" });
    expect(removed.textContent).toBe("Delete: Synthetic old eventEvent will be removed.");
    expect(removed).not.toHaveTextContent("Placement");
  });

  // ---- P1B-55 §C: the screen states both halves of the colour rule.
  const ABSENT = (id: string) => ({
    code: "capture_colour_absent",
    message: `Calendar event \`${id}\` has no colour, so it is taken as work for UbU to schedule: a Dynamic Task of the event's length, at no fixed time`
  });
  const captured = (diagnostics: Array<{ code: string; message: string }>, fields: Record<string, number> = {}) => ({
    schema_version: "ubu.orchestrator.calendar_capture.v1", captured: diagnostics.length, updated: 0, unchanged: 0, skipped: 0, moved: 0, resized: 0, ...fields, diagnostics
  });
  const capturePanel = () => screen.getByRole("heading", { name: "3. Capture" }).closest(".calendar-panel") as HTMLElement;

  it("122: the Capture panel states the capture rule, before anything is captured", async () => {
    stubOrchestrator(() => undefined);
    await openCalendar();
    const rule = within(capturePanel()).getByText(
      "An event with no colour is taken as work for UbU to schedule. An event with a colour is taken as a commitment at its own time, and the colour is its category."
    );
    expect(rule.tagName).toBe("P");
    // It is beside the control that applies it, and the export half is still said of gestures.
    expect(within(capturePanel()).getByRole("button", { name: "Run capture" })).toBeInTheDocument();
    expect(capturePanel()).toHaveTextContent("A colour on Dynamic work you made in UbU means done; a Static window change means move.");
    expect(capturePanel()).toHaveTextContent("An event that repeats cannot be moved by UbU, so it stays a commitment whatever its colour.");
    // Nothing in the panel calls a colourless event a problem.
    expect(capturePanel()).not.toHaveTextContent(/no category assigned|missing colour|needs a colour/i);
  });

  it("123: capture_colour_absent renders as information, in the info tone, and says what was done", async () => {
    const one = ABSENT("synthetic-kettle");
    stubOrchestrator((request) => (request.path === "/projection/calendar/capture" ? json(captured([one])) : undefined));
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Run capture" }));
    const group = await screen.findByRole("region", { name: "Events with no colour" });
    expect(group).toHaveTextContent("1 event had no colour. That is not something missing: an event with no colour is taken as work for UbU to schedule. It is listed here with what was done with it.");
    // The diagnostic itself: a status in the info tone, sentence first, code as small print. Not an alert.
    const message = within(group).getByText(one.message);
    const list = message.closest(".diagnostics-list") as HTMLElement;
    expect(list).toHaveAttribute("role", "status");
    expect(list).toHaveClass("diagnostics-info");
    expect(within(list).getByText("capture_colour_absent").tagName).toBe("CODE");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // With so few, it is shown without being asked for, and it is shown once.
    expect(group.querySelector("details")).toHaveAttribute("open");
    expect(screen.getAllByText(one.message)).toHaveLength(1);
  });

  it("124: a capture with sixty uncoloured events reads as one fact and a list, not as sixty faults", async () => {
    const many = Array.from({ length: 60 }, (_, index) => ABSENT(`synthetic-todo-${index}`));
    const occupancy = { code: "capture_occupancy_only", message: "Calendar event `synthetic-instance` cannot be owned by UbU, so its time is recorded as an occupied window that UbU will never write back to or export" };
    stubOrchestrator((request) => (request.path === "/projection/calendar/capture" ? json(captured([...many, occupancy], { captured: 61 })) : undefined));
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Run capture" }));
    const group = await screen.findByRole("region", { name: "Events with no colour" });
    expect(group).toHaveTextContent("60 events had no colour. That is not something missing: an event with no colour is taken as work for UbU to schedule. Each is listed here with what was done with it.");
    // The sixty are there to be read, under one line, and closed until asked for.
    const details = group.querySelector("details") as HTMLDetailsElement;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("The 60 events with no colour")).toBeInTheDocument();
    expect(details.querySelectorAll(".diagnostic-item")).toHaveLength(60);
    // Nothing on the screen is an alert or an error, and the counts say sixty-one were captured.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector(".error-text")).toBeNull();
    expect(countValues(screen.getByLabelText("Capture counts"))).toContain("captured: 61");
    // Every other diagnostic is where it always was, outside that list, and the sixty are not repeated there.
    const other = screen.getByText(occupancy.message).closest(".diagnostics-list") as HTMLElement;
    expect(group.contains(other)).toBe(false);
    expect(other.querySelectorAll(".diagnostic-item")).toHaveLength(1);
    expect(screen.getAllByText("capture_colour_absent")).toHaveLength(60);
  });

  it("125: with no uncoloured event the summary is absent, and Setup says an uncoloured event is not a fault", async () => {
    const unmapped = { code: "capture_colour_unmapped", message: "Calendar event `synthetic-tour` has unmapped colour `1`; no category assigned; map that colour in Settings to assign a category" };
    stubOrchestrator((request) => (request.path === "/projection/calendar/capture" ? json(captured([unmapped])) : undefined));
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Run capture" }));
    await screen.findByText(unmapped.message);
    expect(screen.queryByRole("region", { name: "Events with no colour" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    await screen.findByRole("table", { name: "Inverse colour mapping" });
    expect(
      screen.getByText("An event with no colour is not a row here. Capture takes it as work for UbU to schedule, with no category, and that is not a fault. Only an event with a colour is taken as a commitment at its own time.")
    ).toBeInTheDocument();
  });

  it("126: a colour on a Dynamic event means done for work made in UbU, and a commitment for a to-do that came from the calendar", async () => {
    // UbU's own Task: the event id is the Task id without its prefix.
    const own = { ...dynamicEvent, external_id: "018f3c8e9b2a7c4d8f1e2a3b4c5d6e70", task_id: "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70", summary: "Synthetic: made in UbU" };
    // A captured to-do: the event keeps the id it had, and the Task has a handle of its own.
    const parked = { ...dynamicEvent, external_id: "0inv3nt3dbrassduck", task_id: "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e71", summary: "Synthetic: came from the calendar" };
    stubOrchestrator((request) => (request.path === "/projection/calendar/preview" ? json(preview({
      events: [own, parked],
      operations: [{ kind: "update", event: own, static_anchor: false }, { kind: "update", event: parked, static_anchor: false }]
    })) : undefined));
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    const lines = (name: string) => Array.from(screen.getByRole("article", { name }).querySelectorAll("p")).slice(1).map((line) => line.textContent);
    await screen.findByRole("article", { name: "Update Synthetic: made in UbU" });
    expect(lines("Update Synthetic: made in UbU")).toEqual(["Placement: Dynamic", "Colour means: done", "Window change means: resize — the duration changed"]);
    expect(lines("Update Synthetic: came from the calendar")).toEqual([
      "Placement: Dynamic",
      "Colour means: a commitment at the time it then has, in that colour's category",
      "Window change means: resize — the duration changed"
    ]);
  });

  it("143: a preview says how many operations it proposes, by kind, on one line above the list", async () => {
    const numbered = (kind: "create" | "update", index: number) => ({
      kind, static_anchor: false,
      event: { ...dynamicEvent, external_id: `synthetic-event-${kind}-${index}`, task_id: `synthetic-task-${kind}-${index}`, summary: `Synthetic ${kind} ${index}` }
    });
    const operations = [...[1, 2, 3, 4, 5, 6, 7].map((index) => numbered("create", index)), ...[1, 2, 3].map((index) => numbered("update", index))];
    stubOrchestrator((request) => (request.path === "/projection/calendar/preview" ? json(preview({ events: [], operations })) : undefined));
    await openCalendar();
    // Nothing is said about a preview that has not been taken.
    expect(screen.queryByText(/^Operations proposed:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));

    const summary = await screen.findByText("Operations proposed: 10. Create 7, update 3, delete 0.");
    expect(screen.getAllByText(/^Operations proposed:/)).toHaveLength(1);
    const panel = screen.getByRole("heading", { name: "1. Preview" }).closest("section") as HTMLElement;
    expect(panel).toContainElement(summary);
    // It is above the cards it counts, and the cards are all still there.
    const cards = within(panel).getAllByRole("article");
    expect(cards).toHaveLength(10);
    expect(summary.compareDocumentPosition(cards[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("144: each kind is counted by its own kind, and a preview of nothing says zero once", async () => {
    let operations: CalendarProjectionPreviewResponse["operations"] = [];
    stubOrchestrator((request) => (request.path === "/projection/calendar/preview" ? json(preview({ events: [], operations })) : undefined));
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));

    expect(await screen.findByText("Operations proposed: 0. Create 0, update 0, delete 0.")).toBeInTheDocument();
    // One sentence for the empty case, not two.
    expect(screen.getAllByText(/^Operations proposed:/)).toHaveLength(1);
    expect(screen.queryByText("No Calendar operations proposed.")).not.toBeInTheDocument();
    const panel = screen.getByRole("heading", { name: "1. Preview" }).closest("section") as HTMLElement;
    expect(within(panel).queryByRole("article")).not.toBeInTheDocument();

    // The fixture's own preview: one of each kind.
    operations = preview().operations;
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    expect(await screen.findByText("Operations proposed: 3. Create 1, update 1, delete 1.")).toBeInTheDocument();
    expect(screen.getAllByText(/^Operations proposed:/)).toHaveLength(1);
  });
  it("148: the preview reads the matching placement count from the response", async () => {
    stubOrchestrator((request) => request.path === "/projection/calendar/preview" ? json(preview({ matching_placements: 14 })) : undefined);
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    expect(await screen.findByText("Operations proposed: 3. Create 1, update 1, delete 1. 14 placements already match the calendar and need no operation.")).toBeInTheDocument();
    expect(screen.getAllByText(/^Operations proposed:/)).toHaveLength(1);
  });
  it("149: a zero matching placement count adds no clause", async () => {
    stubOrchestrator((request) => request.path === "/projection/calendar/preview" ? json(preview({ matching_placements: 0 })) : undefined);
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    expect(await screen.findByText("Operations proposed: 3. Create 1, update 1, delete 1.")).toBeInTheDocument();
    expect(screen.queryByText(/placements already match/)).not.toBeInTheDocument();
  });
  it("150: no operations and one matching placement read as one sensible summary", async () => {
    stubOrchestrator((request) => request.path === "/projection/calendar/preview" ? json(preview({ operations: [], matching_placements: 1 })) : undefined);
    await openCalendar();
    fireEvent.click(screen.getByRole("button", { name: "Take preview" }));
    expect(await screen.findByText("Operations proposed: 0. Create 0, update 0, delete 0. 1 placement already matches the calendar and needs no operation.")).toBeInTheDocument();
    expect(screen.getAllByText(/^Operations proposed:/)).toHaveLength(1);
  });

});
