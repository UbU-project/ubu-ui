import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import { settingsFixture } from "./fixtures/settings";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

type Recorded = { method: string; path: string; query: string; body: string | null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Every request is answered here; anything unexpected fails the test rather than reaching a network.
function stubOrchestrator(tasksStatus = 200) {
  const requests: Recorded[] = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    const request = { method: init?.method ?? "GET", path: url.pathname, query: url.search, body: init?.body ? String(init.body) : null };
    requests.push(request);
    if (request.method !== "GET") {
      throw new Error(`the self-check must not write: ${request.method} ${request.path}`);
    }
    if (request.path === "/health") return json({ status: "ok", version: "0.1.0", bind_policy: "127.0.0.1_only" });
    if (request.path === "/settings") return json(settingsFixture());
    if (request.path === "/tasks") {
      if (tasksStatus !== 200) return json({ error: "Synthetic store failure", diagnostics: [] }, tasksStatus);
      return json({
        schema_version: "ubu.orchestrator.task_read.v1",
        status: "active",
        tasks: ["a", "b"].map((tail) => ({ task_id: `task-${tail}`, title: `Synthetic ${tail}`, status: "active", version: 1, placement: "planned", is_routine_occurrence: false }))
      });
    }
    if (request.path === "/affect/observation") return json({ schema_version: "ubu.orchestrator.affect_observation.v1", observation: null });
    if (request.path === "/calendar/current") return json({ plan_id: "plan-synthetic", steps: [{}, {}, {}], alternatives: [] });
    throw new Error(`unexpected request: ${request.method} ${request.path}`);
  });
  return requests;
}

async function openSelfCheck() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Setup" }));
  const card = (await screen.findByRole("heading", { name: "Self-check" })).closest(".settings-panel") as HTMLElement;
  // Opening Setup makes its own reads; the self-check is judged on what it sends after the button.
  await within(screen.getByRole("heading", { name: "Orchestrator" }).closest(".settings-panel") as HTMLElement).findByText("health: ok");
  return card;
}

describe("Setup self-check", () => {
  afterEach(() => {
    pluginFetch.mockReset();
  });

  it("62: runs its three reads, reports each, and issues no write", async () => {
    const requests = stubOrchestrator();
    const card = await openSelfCheck();
    expect(within(card).getByText("http://127.0.0.1:7878")).toBeInTheDocument();
    expect(card).toHaveTextContent("It writes nothing: no Task, Plan, Setting, preview or calendar is created or changed.");
    const before = requests.length;

    fireEvent.click(within(card).getByRole("button", { name: "Run self-check" }));

    expect(await within(card).findByText("3 of 3 reads answered")).toBeInTheDocument();
    const results = within(within(card).getByRole("list", { name: "Self-check results" })).getAllByRole("listitem");
    expect(results.map((item) => item.textContent)).toEqual([
      "GET /health: answered. status ok, version 0.1.0, bind policy 127.0.0.1_only",
      "GET /tasks?status=active: answered. 2 active Tasks",
      "GET /calendar/current: answered. the current Plan has 3 steps"
    ]);
    expect(within(card).getByText("Three reads were attempted and nothing was written.")).toBeInTheDocument();

    // On the mocked transport: exactly three requests, in order, every one a GET with no body.
    const sent = requests.slice(before);
    expect(sent.map((request) => `${request.method} ${request.path}${request.query}`)).toEqual([
      "GET /health",
      "GET /tasks?schema_version=ubu.orchestrator.task_read.v1&status=active",
      "GET /calendar/current"
    ]);
    expect(sent.every((request) => request.body === null)).toBe(true);
    // And across the whole test, Setup included, nothing but GET reached the transport.
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    // The Calendar preview stores a preview record, so the self-check never asks for one.
    expect(requests.some((request) => request.path.startsWith("/projection"))).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
