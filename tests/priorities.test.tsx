import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

type Recorded = { method: string; url: string; body: unknown };

type PreferenceRow = {
  preference_id: string;
  version: number;
  task_a: string;
  task_b: string;
  task_a_title: string;
  task_b_title: string;
  order: "a_preferred_to_b" | "a_indifferent_to_b";
  enabled: boolean;
  acquired_date: string;
};

const LOOPBACK = "http://127.0.0.1:7878";

const TITLES: Record<string, string> = {
  "task-a": "Synthetic write-up",
  "task-b": "Buy hinges",
  "task-c": "Hang the gate"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function preference(id: string, a: string, b: string, fields: Partial<PreferenceRow> = {}): PreferenceRow {
  return {
    preference_id: id,
    version: 1,
    task_a: a,
    task_b: b,
    task_a_title: TITLES[a],
    task_b_title: TITLES[b],
    order: "a_preferred_to_b",
    enabled: true,
    acquired_date: "2026-09-27T21:15:00.000000000Z",
    ...fields
  };
}

// Every request is answered here; anything unexpected fails the test rather than reaching a network.
function stubOrchestrator(handlers: { list: () => PreferenceRow[]; create?: (body: Record<string, unknown>) => Response }) {
  const requests: Recorded[] = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    expect(url.origin).toBe(LOOPBACK);
    // Today is the default route and loads the current Plan before Priorities is opened.
    if (method === "GET" && url.pathname === "/calendar/current") {
      return json({ plan_id: null, steps: [], alternatives: [] });
    }
    requests.push({ method, url: input.toString(), body });

    if (method === "GET" && url.pathname === "/preferences") {
      return json({ schema_version: "ubu.orchestrator.preference.v1", preferences: handlers.list() });
    }
    if (method === "GET" && url.pathname === "/tasks") {
      return json({
        schema_version: "ubu.orchestrator.task_read.v1",
        status: "active",
        tasks: Object.entries(TITLES).map(([task_id, title]) => ({
          task_id,
          title,
          status: "active",
          version: 1,
          placement: "planned",
          is_routine_occurrence: false
        }))
      });
    }
    if (method === "POST" && url.pathname === "/preference" && handlers.create && body) {
      return handlers.create(body);
    }
    throw new Error(`unexpected request: ${method} ${url.pathname}`);
  });
  return requests;
}

async function openPriorities() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Priorities" }));
  expect(await screen.findByRole("heading", { name: "Preferences" })).toBeInTheDocument();
}

function listRequests(requests: Recorded[]) {
  return requests.filter((request) => request.method === "GET" && new URL(request.url).pathname === "/preferences");
}

function choosePair(first: string, second: string) {
  fireEvent.change(screen.getByLabelText("First Task"), { target: { value: first } });
  fireEvent.change(screen.getByLabelText("Second Task"), { target: { value: second } });
  fireEvent.click(screen.getByRole("button", { name: "Add Preference" }));
}

describe("Priorities surface", () => {
  afterEach(() => {
    pluginFetch.mockReset();
  });

  it("lists Preferences with both Task titles and the order", async () => {
    const requests = stubOrchestrator({
      list: () => [
        preference("pref-1", "task-a", "task-b"),
        preference("pref-2", "task-b", "task-c", { order: "a_indifferent_to_b", enabled: false })
      ]
    });

    await openPriorities();

    const first = (await screen.findByText("Synthetic write-up comes before Buy hinges")).closest('[role="listitem"]') as HTMLElement;
    expect(within(first).getByText("Synthetic write-up")).toBeInTheDocument();
    expect(within(first).getByText("Buy hinges")).toBeInTheDocument();
    expect(within(first).getByText("a_preferred_to_b")).toBeInTheDocument();
    expect(within(first).getByText("enabled")).toBeInTheDocument();
    expect(within(first).getByText("2026-09-27")).toBeInTheDocument();

    const second = screen.getByText("Buy hinges is level with Hang the gate").closest('[role="listitem"]') as HTMLElement;
    expect(within(second).getByText("a_indifferent_to_b")).toBeInTheDocument();
    expect(within(second).getByText("disabled")).toBeInTheDocument();
    expect(within(second).getByRole("button", { name: "Enable Buy hinges is level with Hang the gate" })).toBeInTheDocument();

    expect(listRequests(requests)).toHaveLength(1);
    expect(listRequests(requests)[0].url).toBe(`${LOOPBACK}/preferences`);
  });

  it("creates a Preference with the expected body and reloads the list", async () => {
    const rows: PreferenceRow[] = [];
    const requests = stubOrchestrator({
      list: () => rows,
      create: (body) => {
        rows.push(preference("pref-new", String(body.task_a), String(body.task_b)));
        return json({ schema_version: "ubu.orchestrator.preference.v1", preference_id: "pref-new", version: 1 }, 201);
      }
    });

    await openPriorities();
    expect(await screen.findByText("No Preferences stated.")).toBeInTheDocument();

    choosePair("task-b", "task-c");

    expect(await screen.findByText("Buy hinges comes before Hang the gate")).toBeInTheDocument();
    const posted = requests.find((request) => request.method === "POST");
    expect(posted?.url).toBe(`${LOOPBACK}/preference`);
    expect(posted?.body).toEqual({
      schema_version: "ubu.orchestrator.preference.v1",
      task_a: "task-b",
      task_b: "task-c",
      order: "a_preferred_to_b"
    });
    expect(listRequests(requests)).toHaveLength(2);
    expect(requests.indexOf(posted as Recorded)).toBeLessThan(requests.lastIndexOf(listRequests(requests)[1]));
    expect(screen.getByLabelText("First Task")).toHaveValue("");
  });

  it("renders the orchestrator's reason for a rejected cycle and names the conflicting Preferences", async () => {
    // The message is the orchestrator's own, captured from a real run with the Task ids substituted.
    const reason =
      "Preference cycle among Tasks [task-a -> task-b -> task-c -> task-a]; disable or delete a conflicting Preference first";
    const requests = stubOrchestrator({
      list: () => [preference("pref-1", "task-a", "task-b"), preference("pref-2", "task-b", "task-c")],
      create: () => json({ error: reason, diagnostics: [{ code: "preference_cycle_rejected", message: reason }] }, 400)
    });

    await openPriorities();
    await screen.findByText("Synthetic write-up comes before Buy hinges");

    choosePair("task-c", "task-a");

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("preference_cycle_rejected")).toBeInTheDocument();
    expect(within(alert).getByText(reason)).toBeInTheDocument();
    expect(within(alert).getByText("Synthetic write-up → Buy hinges → Hang the gate → Synthetic write-up")).toBeInTheDocument();
    const conflicts = within(alert)
      .getAllByText("Conflicts with")
      .map((label) => label.parentElement?.textContent);
    expect(conflicts).toEqual([
      "Conflicts withSynthetic write-up comes before Buy hinges (pref-1)",
      "Conflicts withBuy hinges comes before Hang the gate (pref-2)"
    ]);
    expect(screen.queryByText(/Could not create the Preference/)).not.toBeInTheDocument();

    // Nothing was created, so the list is not reloaded and the operator's choice is kept.
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Preference" })).toBeEnabled());
    expect(listRequests(requests)).toHaveLength(1);
    expect(screen.getByLabelText("First Task")).toHaveValue("task-c");
    expect(screen.getByLabelText("Second Task")).toHaveValue("task-a");
  });
});
