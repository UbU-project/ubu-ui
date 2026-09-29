import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import { settingsFixture } from "./fixtures/settings";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

type Recorded = { method: string; url: string; path: string; body: Record<string, unknown> | null };

type Stored = {
  version: number;
  payload: Record<string, unknown> & { id: string; title: string; status: string };
};

const LOOPBACK = "http://127.0.0.1:7878";
const REVIEW = "obj_synthetic_review";
const LEDGER = "obj_synthetic_ledger";

// Both messages are the orchestrator's own, from a real run, with synthetic ids substituted.
const OVERLAP_SUMMARY =
  "1 routine overlap; nothing was written. Routines must not overlap: stagger the start time, shorten the routine, or set occupies_capacity to false.";
const OVERLAP_MESSAGE =
  "Conflict with another routine: routine `obj_synthetic_standup` (Synthetic stand-up) 09:15:00-09:45:00 would overlap routine `obj_synthetic_review` (Synthetic morning review) 09:00:00-09:30:00, first on 2026-09-30 (up to 105 dates in the next year)";
const EVERGREEN_MESSAGE = "a routine must be an evergreen Objective; set mode to `evergreen`";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function refusal(code: string, message: string, error = message) {
  return json({ error, diagnostics: [{ code, message }] }, 400);
}

function review(): Stored {
  return {
    version: 7,
    payload: {
      id: REVIEW,
      title: "Synthetic morning review",
      description: "Synthetic description",
      status: "active",
      mode: "evergreen",
      recurrence: { timezone: "UTC", rule: { kind: "weekly", weekdays: ["mon", "wed"] }, schedule_version: 1 },
      routine_instance_template: {
        title: "Synthetic morning review",
        duration_estimate: { type: "fixed", seconds: 1800 },
        nominal_start: "09:00:00",
        placement: "static",
        category_tag: "personal",
        tags: ["personal"],
        reminder_minutes: [10],
        effects: { mutations: [{ operation: "set_fact", target: "facts.synthetic_reviewed", payload: true }] },
        preconditions: { target: "facts.synthetic_awake", predicate: "equals", expected: true },
        template_version: 3
      }
    }
  };
}

function ledger(): Stored {
  return {
    version: 2,
    payload: {
      id: LEDGER,
      title: "Synthetic ledger check",
      status: "abandoned",
      mode: "evergreen",
      recurrence: { timezone: "Europe/Dublin", rule: { kind: "monthly_day", days: [15, 1] }, schedule_version: 1 },
      routine_instance_template: {
        title: "Synthetic ledger check",
        duration_estimate: { type: "fixed", seconds: 2700 },
        nominal_start: "13:00:00",
        placement: "planned",
        allowed_local_range: { earliest: "13:00:00", latest: "17:00:00" },
        template_version: 1
      }
    }
  };
}

// Every request is answered here; anything unexpected fails the test rather than reaching a network.
function stubOrchestrator(handlers: {
  routines?: Stored[];
  create?: (body: Record<string, unknown>) => Response;
  edit?: (objectiveId: string, body: Record<string, unknown>) => Response;
  override?: (objectiveId: string, localDate: string, body: Record<string, unknown>) => Response;
  clear?: (objectiveId: string, localDate: string) => Response;
}) {
  const stored = handlers.routines ?? [];
  const requests: Recorded[] = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    expect(url.origin).toBe(LOOPBACK);
    // Today is the default route and loads the current Plan before Routines is opened.
    if (method === "GET" && url.pathname === "/calendar/current") {
      return json({ plan_id: null, steps: [], alternatives: [] });
    }
    requests.push({ method, url: input.toString(), path: url.pathname, body });

    if (method === "GET" && url.pathname === "/settings") {
      return json(settingsFixture());
    }
    if (method === "GET" && url.pathname === "/objectives") {
      return json({
        schema_version: "ubu.orchestrator.objective.v1",
        objectives: [
          // An ordinary Objective is not a routine and is not listed on the screen.
          { objective_id: "obj_synthetic_goal", title: "Synthetic one-time goal", status: "active", mode: "one_time", is_routine: false, version: 1 },
          ...stored.map(({ version, payload }) => ({
            objective_id: payload.id,
            title: payload.title,
            status: payload.status,
            mode: "evergreen",
            is_routine: true,
            version
          }))
        ]
      });
    }
    if (method === "GET" && url.pathname === "/routines") {
      return json({
        schema_version: "routine-summary/1",
        // Only live routines have a summary, as in the orchestrator.
        routines: stored
          .filter(({ payload }) => payload.status === "active")
          .map(({ payload }) => ({
            objective_id: payload.id,
            title: payload.title,
            done: 4,
            skipped: 1,
            missed: 2,
            pending: 6,
            current_streak: 3,
            last_occurrence: { local_date: "2026-09-23", outcome: "done" }
          }))
      });
    }
    const objectiveId = url.pathname.match(/^\/objective\/([^/]+)$/)?.[1];
    if (method === "GET" && objectiveId) {
      const found = stored.find(({ payload }) => payload.id === objectiveId);
      if (found) {
        return json({
          schema_version: "ubu.orchestrator.objective.v1",
          objective_id: objectiveId,
          version: found.version,
          is_routine: true,
          payload: found.payload
        });
      }
    }
    if (method === "POST" && url.pathname === "/objective" && handlers.create && body) {
      return handlers.create(body);
    }
    if (method === "PATCH" && objectiveId && handlers.edit && body) {
      return handlers.edit(objectiveId, body);
    }
    const dated = url.pathname.match(/^\/routine\/([^/]+)\/override\/([^/]+)$/);
    if (method === "PUT" && dated && handlers.override && body) {
      return handlers.override(dated[1], dated[2], body);
    }
    if (method === "DELETE" && dated && handlers.clear) {
      return handlers.clear(dated[1], dated[2]);
    }
    throw new Error(`unexpected request: ${method} ${url.pathname}`);
  });
  return requests;
}

function created(body: Record<string, unknown>) {
  expect(body.title).toBeTruthy();
  return json({ schema_version: "ubu.orchestrator.objective.v1", objective_id: "obj_synthetic_new", version: 1 }, 201);
}

async function openRoutines() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Routines" }));
  expect(await screen.findByRole("heading", { name: "Create a routine" })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Loading routines...")).not.toBeInTheDocument());
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillRoutine(fields: { title: string; rule: string; minutes: string; start: string; placement: string }) {
  fill("Title", fields.title);
  fill("Timezone", "UTC");
  fill("Repeats", fields.rule);
  fill("Duration (minutes)", fields.minutes);
  fill("Nominal start", fields.start);
  fill("Placement", fields.placement);
}

function posts(requests: Recorded[]) {
  return requests.filter((request) => request.method === "POST");
}

describe("Routines surface", () => {
  afterEach(() => {
    pluginFetch.mockReset();
  });

  it("36: joins streaks and definitions, with the recurrence in words and the streak counts", async () => {
    const requests = stubOrchestrator({ routines: [review(), ledger()] });

    await openRoutines();

    const live = (await screen.findByText("Synthetic morning review")).closest('[role="listitem"]') as HTMLElement;
    expect(within(live).getByText("Every week on Monday and Wednesday, at 09:00 (UTC)")).toBeInTheDocument();
    expect(within(live).getByText("active")).toBeInTheDocument();
    const counts = Object.fromEntries(
      within(live)
        .getAllByRole("term")
        .map((term) => [term.textContent, term.nextElementSibling?.textContent])
    );
    expect(counts).toEqual({
      "Current streak": "3",
      Done: "4",
      Skipped: "1",
      Missed: "2",
      Pending: "6",
      "Last occurrence": "2026-09-23, done"
    });

    // The definition of a routine that is not live is still shown; it has no streak to show.
    const withdrawn = screen.getByText("Synthetic ledger check").closest('[role="listitem"]') as HTMLElement;
    expect(within(withdrawn).getByText("Every month on the 1st and 15th, between 13:00 and 17:00 (Europe/Dublin)")).toBeInTheDocument();
    expect(within(withdrawn).getByText("abandoned")).toBeInTheDocument();
    expect(within(withdrawn).getByText(/No streak: this routine is not live/)).toBeInTheDocument();

    expect(screen.queryByText("Synthetic one-time goal")).not.toBeInTheDocument();
    expect(screen.getByText("2 defined")).toBeInTheDocument();
    expect(requests.map((request) => `${request.method} ${request.path}`).sort()).toEqual([
      `GET /objective/${LEDGER}`,
      `GET /objective/${REVIEW}`,
      "GET /objectives",
      "GET /routines",
      "GET /settings"
    ]);
  });

  it("37: creates a weekly routine as an evergreen Objective with the chosen weekdays and placement", async () => {
    const requests = stubOrchestrator({ create: created });

    await openRoutines();
    fillRoutine({ title: "  Synthetic morning review  ", rule: "weekly", minutes: "30", start: "09:00", placement: "static" });
    fill("Description", "Synthetic description");
    fireEvent.click(screen.getByRole("checkbox", { name: "Thursday" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
    fill("Category", "personal");
    fill("Reminder minutes", "10, 0");
    fireEvent.click(screen.getByRole("button", { name: "Create routine" }));

    await waitFor(() => expect(posts(requests)).toHaveLength(1));
    expect(posts(requests)[0].url).toBe(`${LOOPBACK}/objective`);
    expect(posts(requests)[0].body).toEqual({
      schema_version: "ubu.orchestrator.objective.v1",
      mode: "evergreen",
      title: "Synthetic morning review",
      description: "Synthetic description",
      recurrence: { timezone: "UTC", rule: { kind: "weekly", weekdays: ["mon", "thu"] } },
      routine_instance_template: {
        title: "Synthetic morning review",
        duration_estimate: { type: "fixed", seconds: 1800 },
        nominal_start: "09:00:00",
        placement: "static",
        occupies_capacity: true,
        category_tag: "personal",
        tags: ["personal"],
        reminder_minutes: [10, 0]
      }
    });
    // The orchestrator refuses a routine that carries a priority, so none is sent.
    expect(posts(requests)[0].body).not.toHaveProperty("priority");
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(""));
    expect(requests.filter((request) => request.path === "/objectives")).toHaveLength(2);
  });

  it("38: a daily Dynamic routine carries the allowed local range, and a Static one does not", async () => {
    const requests = stubOrchestrator({ create: created });

    await openRoutines();
    fillRoutine({ title: "Synthetic stretch", rule: "daily", minutes: "15", start: "13:00", placement: "planned" });
    fill("Allowed range, earliest", "13:00");
    fill("Allowed range, latest", "17:30");
    fireEvent.click(screen.getByRole("button", { name: "Create routine" }));

    await waitFor(() => expect(posts(requests)).toHaveLength(1));
    expect(posts(requests)[0].body).toMatchObject({ mode: "evergreen", recurrence: { timezone: "UTC", rule: { kind: "daily" } } });
    const dynamic = posts(requests)[0].body?.routine_instance_template as Record<string, unknown>;
    expect(dynamic.placement).toBe("planned");
    expect(dynamic.allowed_local_range).toEqual({ earliest: "13:00:00", latest: "17:30:00" });

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(""));
    expect(screen.queryByLabelText("Allowed range, earliest")).not.toBeInTheDocument();
    fillRoutine({ title: "Synthetic stand-up", rule: "daily", minutes: "15", start: "10:00", placement: "static" });
    fireEvent.click(screen.getByRole("button", { name: "Create routine" }));

    await waitFor(() => expect(posts(requests)).toHaveLength(2));
    const fixed = posts(requests)[1].body?.routine_instance_template as Record<string, unknown>;
    expect(fixed.placement).toBe("static");
    expect(fixed).not.toHaveProperty("allowed_local_range");
  });

  it("39: a template edit sends PATCH with the version from the list, and says when it applies", async () => {
    const rows = [review()];
    const requests = stubOrchestrator({
      routines: rows,
      edit: (objectiveId, body) => {
        rows[0] = { version: 8, payload: { ...rows[0].payload, routine_instance_template: { ...(body.routine_instance_template as object), template_version: 4 } } };
        return json({
          schema_version: "ubu.orchestrator.objective.v1",
          objective_id: objectiveId,
          version: 8,
          notice:
            "The routine template changed. Occurrences already materialized keep the template they were created with; the change applies at the next materialize."
        });
      }
    });

    await openRoutines();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Synthetic morning review" }));
    expect(screen.getByRole("heading", { name: "Edit Synthetic morning review" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "A template change applies at the next materialize. Occurrences already created, including today's, keep the template they were created with."
      )
    ).toBeInTheDocument();
    // Shown, and not editable.
    expect(screen.getByText(/"target":"facts.synthetic_reviewed"/)).toBeInTheDocument();
    expect(screen.getByText(/"target":"facts.synthetic_awake"/)).toBeInTheDocument();

    fill("Duration (minutes)", "45");
    fireEvent.click(screen.getByRole("button", { name: "Save routine" }));

    expect(await screen.findByRole("status")).toHaveTextContent("the change applies at the next materialize");
    const patched = requests.find((request) => request.method === "PATCH");
    expect(patched?.url).toBe(`${LOOPBACK}/objective/${REVIEW}`);
    // Only the template changed, so only the template is sent; what the form does not show is sent as stored.
    expect(patched?.body).toEqual({
      schema_version: "ubu.orchestrator.objective.v1",
      expected_version: 7,
      routine_instance_template: {
        title: "Synthetic morning review",
        duration_estimate: { type: "fixed", seconds: 2700 },
        nominal_start: "09:00:00",
        placement: "static",
        occupies_capacity: true,
        category_tag: "personal",
        tags: ["personal"],
        reminder_minutes: [10],
        effects: { mutations: [{ operation: "set_fact", target: "facts.synthetic_reviewed", payload: true }] },
        preconditions: { target: "facts.synthetic_awake", predicate: "equals", expected: true }
      }
    });
  });

  it("40: renders objective_routine_overlap in full, naming both routines and the colliding date", async () => {
    const requests = stubOrchestrator({
      routines: [review()],
      create: () => refusal("objective_routine_overlap", OVERLAP_MESSAGE, OVERLAP_SUMMARY)
    });

    await openRoutines();
    fillRoutine({ title: "Synthetic stand-up", rule: "daily", minutes: "30", start: "09:15", placement: "static" });
    fireEvent.click(screen.getByRole("button", { name: "Create routine" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(OVERLAP_SUMMARY)).toBeInTheDocument();
    expect(within(alert).getByText("objective_routine_overlap")).toBeInTheDocument();
    expect(within(alert).getByText(OVERLAP_MESSAGE)).toBeInTheDocument();
    const set = Object.fromEntries(
      within(alert)
        .getAllByRole("term")
        .map((term) => [term.textContent, term.nextElementSibling?.textContent])
    );
    expect(set).toEqual({
      "This routine": "Synthetic stand-up, 09:15:00-09:45:00 (obj_synthetic_standup)",
      "Conflicts with": "Synthetic morning review, 09:00:00-09:30:00 (obj_synthetic_review)",
      "First colliding date": "2026-09-30",
      Extent: "up to 105 dates in the next year"
    });
    expect(screen.queryByText(/Could not save the routine/)).not.toBeInTheDocument();

    // Nothing was written, so the list is not reloaded and the operator's entries are kept.
    await waitFor(() => expect(screen.getByRole("button", { name: "Create routine" })).toBeEnabled());
    expect(requests.filter((request) => request.path === "/objectives")).toHaveLength(1);
    expect(screen.getByLabelText("Title")).toHaveValue("Synthetic stand-up");
    expect(screen.getByLabelText("Nominal start")).toHaveValue("09:15");
  });

  it("41: renders objective_routine_requires_evergreen as its own message", async () => {
    stubOrchestrator({ create: () => refusal("objective_routine_requires_evergreen", EVERGREEN_MESSAGE) });

    await openRoutines();
    fillRoutine({ title: "Synthetic stand-up", rule: "daily", minutes: "30", start: "09:15", placement: "static" });
    fireEvent.click(screen.getByRole("button", { name: "Create routine" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/^A routine must be evergreen/)).toBeInTheDocument();
    expect(within(alert).getByText("objective_routine_requires_evergreen")).toBeInTheDocument();
    expect(within(alert).getAllByText(EVERGREEN_MESSAGE)).toHaveLength(2);
    expect(within(alert).queryByText("Routine overlap")).not.toBeInTheDocument();
    expect(within(alert).queryByRole("term")).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("42: offers the palette's categories from GET /settings, and no free-text category", async () => {
    const requests = stubOrchestrator({});

    await openRoutines();

    const control = screen.getByLabelText("Category");
    expect(control.tagName).toBe("SELECT");
    expect(screen.queryByRole("textbox", { name: "Category" })).not.toBeInTheDocument();
    const palette = settingsFixture().palette.map((entry) => entry.category);
    expect(palette).toHaveLength(11);
    expect(within(control).getAllByRole("option").map((option) => option.textContent)).toEqual(["No category", ...palette]);
    expect(requests.filter((request) => request.path === "/settings")).toHaveLength(1);
  });

  it("43: sends the override's start and end to the dated path and renders overridden", async () => {
    const rows = [review()];
    const requests = stubOrchestrator({
      routines: rows,
      override: (objectiveId, localDate, body) => {
        const recurrence = rows[0].payload.recurrence as Record<string, unknown>;
        rows[0] = {
          version: 8,
          payload: { ...rows[0].payload, recurrence: { ...recurrence, overrides: [{ local_date: localDate, start: body.start, end: body.end }] } }
        };
        return json({
          schema_version: "ubu.orchestrator.routine_override.v1",
          objective_id: objectiveId,
          local_date: localDate,
          overridden: true,
          diagnostics: []
        });
      }
    });

    await openRoutines();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Synthetic morning review" }));
    fill("Occurrence date", "2026-09-30");
    fill("Override start", "10:00");
    fill("Override end", "10:30");
    fireEvent.click(screen.getByRole("button", { name: "Override this date" }));

    expect(await screen.findByText("overridden")).toBeInTheDocument();
    // The orchestrator serves this route as PUT.
    const sent = requests.find((request) => request.method === "PUT");
    expect(sent?.url).toBe(`${LOOPBACK}/routine/${REVIEW}/override/2026-09-30`);
    const start = new Date(2026, 8, 30, 10, 0, 0).toISOString().replace(".000Z", "Z");
    const end = new Date(2026, 8, 30, 10, 30, 0).toISOString().replace(".000Z", "Z");
    expect(sent?.body).toEqual({ schema_version: "ubu.orchestrator.routine_override.v1", start, end });
    expect(posts(requests)).toHaveLength(0);
    // Read back from the routine after the reload.
    expect(await screen.findByText(`2026-09-30: ${start} to ${end}`)).toBeInTheDocument();
  });

  it("60: clearing an override sends DELETE to the dated path and the row goes", async () => {
    const stored = review();
    const overrides = [
      { local_date: "2026-09-30", start: "2026-09-30T10:00:00Z", end: "2026-09-30T10:30:00Z" },
      { local_date: "2026-10-05", start: "2026-10-05T11:00:00Z", end: "2026-10-05T11:30:00Z" }
    ];
    const withOverrides = (kept: typeof overrides, version: number): Stored => ({
      version,
      payload: { ...stored.payload, recurrence: { ...(stored.payload.recurrence as object), overrides: kept } }
    });
    const rows = [withOverrides(overrides, 9)];
    const requests = stubOrchestrator({
      routines: rows,
      clear: (objectiveId, localDate) => {
        rows[0] = withOverrides(overrides.filter((override) => override.local_date !== localDate), 10);
        return json({
          schema_version: "ubu.orchestrator.routine_override.v1",
          objective_id: objectiveId,
          local_date: localDate,
          overridden: false,
          diagnostics: []
        });
      }
    });

    await openRoutines();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Synthetic morning review" }));
    expect(screen.getByText(/^2026-09-30: 2026-09-30T10:00:00Z to 2026-09-30T10:30:00Z/)).toBeInTheDocument();
    expect(screen.getByText(/^2026-10-05:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear the override for 2026-09-30" }));

    expect(await screen.findByText("override cleared")).toBeInTheDocument();
    const sent = requests.filter((request) => request.method === "DELETE");
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(`${LOOPBACK}/routine/${REVIEW}/override/2026-09-30`);
    expect(sent[0].body).toBeNull();
    // The row is gone after the reload, and the other override is untouched.
    await waitFor(() => expect(screen.queryByText(/^2026-09-30: /)).not.toBeInTheDocument());
    expect(screen.getByText(/^2026-10-05:/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear the override for 2026-09-30" })).not.toBeInTheDocument();
    expect(requests.filter((request) => request.method === "PUT" || request.method === "PATCH")).toHaveLength(0);
  });
});
