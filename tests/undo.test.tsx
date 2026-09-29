import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

type Call = { method: string; path: string; body: Record<string, unknown> | null };

const TASK = "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70";
const COMPLETION = "log_018f3c8e9b2a7c4d8f1e2a3b4c5d6e7a";
const ACTION = "ubu.orchestrator.task_action.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function recommendation(title: string) {
  const reference = { objective_id: "obj_synthetic", title: "Synthetic objective" };
  return {
    task_id: TASK, title, status: "active", readiness: "ready", parent_objective: reference, source_refs: [],
    selection: { rule: "readiness_ordered_skeleton", priority: 10, tiebreak: "synthetic" },
    explanation: { template_id: "readiness_based_recommendation.v1", label: "readiness-based recommendation", message: "Synthetic explanation.", readiness_state: "ready", parent_objective: reference, source_refs: [] }
  };
}

// One Task. Completing it leaves nothing ready; reopening it brings it back.
function stub(reopen: (body: Record<string, unknown>) => Response) {
  const calls: Call[] = [];
  let completed = false;
  let logs = 0;
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    const call = { method: init?.method ?? "GET", path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    if (call.method === "GET" && call.path === "/calendar/current") return json({ plan_id: null, steps: [], alternatives: [] });
    if (call.method === "GET" && call.path === "/next-action") {
      return json({
        schema_version: "ubu.orchestrator.next_action.v1",
        recommendation: completed ? null : recommendation("Synthetic lunar teapot"),
        diagnostics: completed ? [{ code: "no_active_tasks", message: "admitted Tasks exist, but none are active", blocked_task_count: 0, sampled_task_ids: [] }] : []
      });
    }
    if (call.method === "POST" && call.path === `/task/${TASK}/action`) {
      const action = String(call.body?.action);
      completed = action === "complete";
      logs += 1;
      return json({
        schema_version: ACTION, log_id: action === "complete" ? COMPLETION : `log_synthetic_${logs}`, task_id: TASK, action,
        task_status: completed ? "completed" : "active", authority_source: "user", transition_applied: completed, diagnostics: [], note: null
      });
    }
    if (call.method === "POST" && call.path === `/task/${TASK}/reopen`) {
      const response = reopen(call.body ?? {});
      if (response.ok) completed = false;
      return response;
    }
    throw new Error(`unexpected request: ${call.method} ${call.path}`);
  });
  return calls;
}
const reopened = (diagnostics: unknown[] = []) =>
  json({ schema_version: ACTION, log_id: "log_synthetic_reopen", task_id: TASK, completion_log_id: COMPLETION, task_status: "active", diagnostics });

async function openNextTask() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Next Task" }));
  expect(await screen.findByRole("heading", { name: "Synthetic lunar teapot" })).toBeInTheDocument();
}
const undo = () => screen.queryByRole("button", { name: "Undo completion" });
const reopens = (calls: Call[]) => calls.filter((call) => call.path.endsWith("/reopen"));

describe("Undo of a completion", () => {
  afterEach(() => {
    pluginFetch.mockReset();
  });

  // The screen has two controls, Complete and Override. It has no Start, Skip or Snooze control,
  // so Override stands for every recorded action that is not a completion.
  it("72: the undo is offered only after a completion, and not after another recorded action", async () => {
    const calls = stub(() => reopened());
    await openNextTask();
    expect(undo()).not.toBeInTheDocument();
    for (const action of ["Override", "Override"]) {
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(await screen.findByText(`${action.toLowerCase()} recorded; Task status is active.`)).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("button", { name: action })).toBeEnabled());
      expect(undo()).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(await screen.findByText("complete recorded; Task status is completed.")).toBeInTheDocument();
    // The Task was the only one ready, so nothing is recommended now. The undo is there all the same.
    expect(await screen.findByText("no_active_tasks")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Synthetic lunar teapot" })).not.toBeInTheDocument();
    expect(undo()).toBeEnabled();
    expect(reopens(calls)).toHaveLength(0);
  });

  it("73: undo posts the schema version and the exact log id the completion returned, then the Task is back", async () => {
    const calls = stub(() => reopened());
    await openNextTask();
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo completion" }));

    expect(await screen.findByText("The completion was undone. The Task is active again.")).toBeInTheDocument();
    expect(reopens(calls)).toEqual([
      { method: "POST", path: `/task/${TASK}/reopen`, body: { schema_version: ACTION, completion_log_id: COMPLETION } }
    ]);
    // Reloaded: the Task is recommended again, and the offer is used up.
    expect(await screen.findByRole("heading", { name: "Synthetic lunar teapot" })).toBeInTheDocument();
    expect(undo()).not.toBeInTheDocument();
    expect(screen.queryByText("complete recorded; Task status is completed.")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // It can be completed again, which offers a new undo.
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(await screen.findByRole("button", { name: "Undo completion" })).toBeEnabled();
    expect(screen.queryByText("The completion was undone. The Task is active again.")).not.toBeInTheDocument();
  });

  it("74: a 409 shows the diagnostic as an ordinary error and leaves the screen usable", async () => {
    const reason = `\`${COMPLETION}\` is not the latest completion of Task \`${TASK}\`; nothing was undone`;
    const calls = stub(() => json({ error: reason, diagnostics: [{ code: "reopen_stale_completion", message: reason }] }, 409));
    await openNextTask();
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo completion" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("reopen_stale_completion")).toBeInTheDocument();
    expect(screen.getAllByText(reason)).toHaveLength(2);
    expect(screen.queryByText("The completion was undone. The Task is active again.")).not.toBeInTheDocument();
    // Nothing is stuck: the screen still shows where things stand and can be asked again.
    await waitFor(() => expect(screen.getByRole("button", { name: "Undo completion" })).toBeEnabled());
    expect(screen.getByText("complete recorded; Task status is completed.")).toBeInTheDocument();
    expect(reopens(calls)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Next Task" }));
    expect(screen.getByRole("heading", { level: 1, name: "Recommended Task" })).toBeInTheDocument();
  });

  it("75: when effects were not reversed, the undo says so beneath its success", async () => {
    const message = "The Task is active again. The effects it applied when it completed were not reversed, and will be applied again if it is completed again";
    stub(() => reopened([{ code: "reopen_effects_not_reversed", message }]));
    await openNextTask();
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo completion" }));

    expect(await screen.findByText("The completion was undone. The Task is active again.")).toBeInTheDocument();
    expect(await screen.findByText("reopen_effects_not_reversed")).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    // Through the list every diagnostic on this screen goes through, not a second surface.
    expect(screen.getByText("reopen_effects_not_reversed").closest(".diagnostics-list")).toBeInTheDocument();
    expect(document.querySelectorAll(".diagnostics-list")).toHaveLength(1);
    expect(await screen.findByRole("heading", { name: "Synthetic lunar teapot" })).toBeInTheDocument();
  });
});
