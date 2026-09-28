import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";

type Recorded = { method: string; url: string; body: unknown };

type TaskRow = {
  task_id: string;
  title: string;
  status: string;
  version: number;
  placement: string;
  duration_estimate?: { type: "fixed"; seconds: number };
  due_at?: string;
  category_tag?: string;
  is_routine_occurrence: boolean;
  container_id?: string;
};

const LOOPBACK = "http://127.0.0.1:17890";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function task(id: string, title: string, fields: Partial<TaskRow> = {}): TaskRow {
  return { task_id: id, title, status: "active", version: 1, placement: "planned", is_routine_occurrence: false, ...fields };
}

// Every request is answered here; anything unexpected fails the test rather than reaching a network.
function stubOrchestrator(handlers: {
  list: (status: string) => TaskRow[];
  capture?: (body: Record<string, unknown>) => Response;
  edit?: (taskId: string, body: Record<string, unknown>) => Response;
}) {
  const requests: Recorded[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      requests.push({ method, url: input.toString(), body });
      expect(url.origin).toBe(LOOPBACK);

      if (method === "GET" && url.pathname === "/tasks") {
        const status = url.searchParams.get("status") ?? "active";
        return json({ schema_version: "ubu.orchestrator.task_read.v1", status, tasks: handlers.list(status) });
      }
      const taskId = url.pathname.match(/^\/task\/([^/]+)$/)?.[1];
      if (method === "GET" && taskId) {
        const row = handlers.list("active").find((candidate) => candidate.task_id === taskId);
        return json({
          schema_version: "ubu.orchestrator.task_read.v1",
          task_id: taskId,
          version: row?.version ?? 1,
          status: "active",
          is_routine_occurrence: false,
          payload: { id: taskId, title: row?.title, status: "active", tags: row?.category_tag ? [row.category_tag] : [] }
        });
      }
      if (method === "POST" && url.pathname === "/task" && handlers.capture && body) {
        return handlers.capture(body);
      }
      if (method === "PATCH" && taskId && handlers.edit && body) {
        return handlers.edit(taskId, body);
      }
      throw new Error(`unexpected request: ${method} ${url.pathname}`);
    })
  );
  return requests;
}

async function openTasks() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
  expect(await screen.findByRole("heading", { name: "Backlog" })).toBeInTheDocument();
}

function listRequests(requests: Recorded[]) {
  return requests.filter((request) => request.method === "GET" && new URL(request.url).pathname === "/tasks");
}

describe("Tasks surface", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists active Tasks with title, duration and category, grouping checklist children", async () => {
    const requests = stubOrchestrator({
      list: () => [
        task("task-a", "Synthetic write-up", { duration_estimate: { type: "fixed", seconds: 1500 }, category_tag: "writing" }),
        task("task-b", "Buy hinges", { duration_estimate: { type: "fixed", seconds: 1800 }, container_id: "container-1" }),
        task("task-c", "Hang the gate", { duration_estimate: { type: "fixed", seconds: 2700 }, container_id: "container-1" })
      ]
    });

    await openTasks();

    const row = (await screen.findByText("Synthetic write-up")).closest('[role="listitem"]') as HTMLElement;
    expect(within(row).getByText("25 min")).toBeInTheDocument();
    expect(within(row).getByText("writing")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Edit Synthetic write-up" })).toBeInTheDocument();

    const checklist = screen.getByRole("group", { name: "Checklist container-1" });
    expect(within(checklist).getByText("Buy hinges")).toBeInTheDocument();
    expect(within(checklist).getByText("Hang the gate")).toBeInTheDocument();
    expect(within(checklist).getByText("45 min")).toBeInTheDocument();
    expect(within(checklist).queryByText("Synthetic write-up")).not.toBeInTheDocument();

    expect(listRequests(requests)).toHaveLength(1);
    expect(requests[0].url).toBe(`${LOOPBACK}/tasks?schema_version=ubu.orchestrator.task_read.v1&status=active`);

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "completed" } });
    await waitFor(() => expect(listRequests(requests)).toHaveLength(2));
    expect(new URL(requests[1].url).searchParams.get("status")).toBe("completed");
  });

  it("captures a Task with the expected body and reloads the list", async () => {
    const rows: TaskRow[] = [];
    const requests = stubOrchestrator({
      list: () => rows,
      capture: (body) => {
        rows.push(
          task("task-new", String(body.title), { duration_estimate: { type: "fixed", seconds: 1200 }, category_tag: "home" })
        );
        return json({ schema_version: "ubu.orchestrator.task_capture.v1", task_id: "task-new", version: 1 }, 201);
      }
    });

    await openTasks();
    expect(await screen.findByText("No active Tasks.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  Oil the gate latch  " } });
    fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "home" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Capture Task" }));

    expect(await screen.findByText("Oil the gate latch")).toBeInTheDocument();
    const posted = requests.find((request) => request.method === "POST");
    expect(posted?.url).toBe(`${LOOPBACK}/task`);
    expect(posted?.body).toEqual({
      schema_version: "ubu.orchestrator.task_capture.v1",
      title: "Oil the gate latch",
      duration_estimate: { type: "fixed", seconds: 1200 },
      category_tag: "home",
      tags: ["home"],
      due_at: new Date(2026, 9, 1, 23, 59, 59).toISOString().replace(".000Z", "Z")
    });
    expect(listRequests(requests)).toHaveLength(2);
    expect(requests.indexOf(posted as Recorded)).toBeLessThan(requests.lastIndexOf(listRequests(requests)[1]));
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("sends an inline edit as a PATCH carrying the version from the list", async () => {
    const rows = [task("task-a", "Synthetic write-up", { version: 7, duration_estimate: { type: "fixed", seconds: 1500 } })];
    const requests = stubOrchestrator({
      list: () => rows,
      edit: (taskId, body) => {
        rows[0] = { ...rows[0], title: String(body.title), version: 8 };
        return json({ schema_version: "ubu.orchestrator.task_capture.v1", task_id: taskId, version: 8 });
      }
    });

    await openTasks();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Synthetic write-up" }));
    fireEvent.change(await screen.findByLabelText("Edit title"), { target: { value: "Synthetic write-up, second draft" } });
    fireEvent.change(screen.getByLabelText("Edit category"), { target: { value: "writing" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Synthetic write-up, second draft")).toBeInTheDocument();
    const patched = requests.find((request) => request.method === "PATCH");
    expect(patched?.url).toBe(`${LOOPBACK}/task/task-a`);
    // Only what changed is sent; the untouched duration and due date are absent.
    expect(patched?.body).toEqual({
      schema_version: "ubu.orchestrator.task_capture.v1",
      expected_version: 7,
      title: "Synthetic write-up, second draft",
      category_tag: "writing",
      tags: ["writing"]
    });
    expect(screen.queryByLabelText("Edit title")).not.toBeInTheDocument();
    expect(listRequests(requests)).toHaveLength(2);
  });

  it("shows the conflict, reloads, and keeps the operator's edit on a 409", async () => {
    const rows = [task("task-a", "Synthetic write-up", { version: 3 })];
    const expected: unknown[] = [];
    const requests = stubOrchestrator({
      list: () => rows,
      edit: (taskId, body) => {
        expected.push(body.expected_version);
        if (body.expected_version !== rows[0].version) {
          const message = `Task \`${taskId}\` expected version ${String(body.expected_version)}, current version ${rows[0].version}`;
          return json({ error: message, diagnostics: [{ code: "version_conflict", message }] }, 409);
        }
        rows[0] = { ...rows[0], title: String(body.title), version: rows[0].version + 1 };
        return json({ schema_version: "ubu.orchestrator.task_capture.v1", task_id: taskId, version: rows[0].version });
      }
    });

    await openTasks();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Synthetic write-up" }));
    fireEvent.change(await screen.findByLabelText("Edit title"), { target: { value: "My careful rewrite" } });
    // Someone else changes the Task after the list was loaded.
    rows[0] = { ...rows[0], title: "Changed elsewhere", version: 4 };
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/This Task changed since the list was loaded/)).toBeInTheDocument();
    expect(within(alert).getByText(/The list is reloading/)).toBeInTheDocument();
    expect(await screen.findByText("Changed elsewhere")).toBeInTheDocument();
    expect(listRequests(requests)).toHaveLength(2);
    expect(screen.getByLabelText("Edit title")).toHaveValue("My careful rewrite");

    // Recoverable: the kept edit saves against the reloaded version.
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("My careful rewrite")).toBeInTheDocument();
    expect(expected).toEqual([3, 4]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a routine occurrence read-only with no edit control", async () => {
    const requests = stubOrchestrator({
      list: () => [
        task("task-r", "Synthetic stretch", {
          placement: "static",
          is_routine_occurrence: true,
          duration_estimate: { type: "fixed", seconds: 300 }
        }),
        task("task-a", "Synthetic write-up")
      ]
    });

    await openTasks();

    const occurrence = (await screen.findByText("Synthetic stretch")).closest('[role="listitem"]') as HTMLElement;
    expect(within(occurrence).getByText(/Read-only: this is an occurrence of a routine/)).toBeInTheDocument();
    expect(within(occurrence).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Synthetic stretch" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Synthetic write-up" })).toBeInTheDocument();
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });
});
