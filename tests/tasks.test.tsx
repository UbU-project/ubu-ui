import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

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
  // Not part of the list row; the stub returns it in the Task's payload.
  static_window?: { start: string; end: string };
  description?: string;
};

const LOOPBACK = "http://127.0.0.1:7878";

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
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    expect(url.origin).toBe(LOOPBACK);
    // Today is the default route and loads the current Plan before Tasks is opened.
    if (method === "GET" && url.pathname === "/affect/observation") return json({ schema_version: "ubu.orchestrator.affect_observation.v1", observation: null });
    if (method === "GET" && url.pathname === "/calendar/current") {
      return json({ plan_id: null, steps: [], alternatives: [] });
    }
    requests.push({ method, url: input.toString(), body });

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
        payload: { id: taskId, title: row?.title, status: "active", tags: row?.category_tag ? [row.category_tag] : [], static_window: row?.static_window, description: row?.description }
      });
    }
    if (method === "POST" && url.pathname === "/task" && handlers.capture && body) {
      return handlers.capture(body);
    }
    if (method === "PATCH" && taskId && handlers.edit && body) {
      return handlers.edit(taskId, body);
    }
    throw new Error(`unexpected request: ${method} ${url.pathname}`);
  });
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
    pluginFetch.mockReset();
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

  // A datetime-local field holds this computer's local time; the orchestrator is sent the instant.
  const instant = (local: string) => new Date(local).toISOString().replace(".000Z", "Z");

  it("58: captures a Task with a fixed window, and refuses a window that ends before it starts", async () => {
    const rows: TaskRow[] = [];
    const refusal = "bad request: Task static_window.end must be strictly after start";
    const requests = stubOrchestrator({
      list: () => rows,
      capture: (body) => {
        const window = body.static_window as { start: string; end: string };
        // The orchestrator's own check, for a window the form let through.
        if (window.end <= window.start) {
          return json({ error: refusal, diagnostics: [] }, 400);
        }
        rows.push(task("task-new", String(body.title), { placement: "static", static_window: window }));
        return json({ schema_version: "ubu.orchestrator.task_capture.v1", task_id: "task-new", version: 1 }, 201);
      }
    });
    const posts = () => requests.filter((request) => request.method === "POST");

    await openTasks();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Synthetic dentist" } });
    fireEvent.change(screen.getByLabelText("Fixed window start"), { target: { value: "2026-10-01T10:00" } });
    fireEvent.change(screen.getByLabelText("Fixed window end"), { target: { value: "2026-10-01T09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Capture Task" }));

    expect(await screen.findByText("The fixed window must end after it starts.")).toBeInTheDocument();
    expect(posts()).toHaveLength(0);

    // Half a window is refused too, and nothing is sent.
    fireEvent.change(screen.getByLabelText("Fixed window end"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Capture Task" }));
    expect(await screen.findByText("Enter both the start and the end of the fixed window, or clear both.")).toBeInTheDocument();
    expect(posts()).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Fixed window end"), { target: { value: "2026-10-01T10:45" } });
    fireEvent.click(screen.getByRole("button", { name: "Capture Task" }));

    expect(await screen.findByText("Synthetic dentist")).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toEqual({
      schema_version: "ubu.orchestrator.task_capture.v1",
      title: "Synthetic dentist",
      static_window: { start: instant("2026-10-01T10:00"), end: instant("2026-10-01T10:45") }
    });
    const row = screen.getByText("Synthetic dentist").closest('[role="listitem"]') as HTMLElement;
    expect(within(row).getByText("static")).toBeInTheDocument();
    expect(screen.getByLabelText("Fixed window start")).toHaveValue("");
    expect(screen.queryByText("The fixed window must end after it starts.")).not.toBeInTheDocument();

    // What the orchestrator refuses is shown as it said it.
    pluginFetch.mockImplementationOnce(async () => json({ error: refusal, diagnostics: [] }, 400));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Synthetic refused" } });
    fireEvent.change(screen.getByLabelText("Fixed window start"), { target: { value: "2026-10-02T10:00" } });
    fireEvent.change(screen.getByLabelText("Fixed window end"), { target: { value: "2026-10-02T10:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Capture Task" }));
    expect(await screen.findByText(refusal)).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Synthetic refused");
  });

  it("59: editing a Task sets its fixed window and clears it", async () => {
    const rows = [task("task-a", "Synthetic write-up", { version: 3, duration_estimate: { type: "fixed", seconds: 1500 } })];
    const requests = stubOrchestrator({
      list: () => rows,
      edit: (taskId, body) => {
        const window = body.static_window as { start: string; end: string } | null;
        rows[0] = { ...rows[0], version: rows[0].version + 1, placement: window ? "static" : "planned", static_window: window ?? undefined };
        return json({ schema_version: "ubu.orchestrator.task_capture.v1", task_id: taskId, version: rows[0].version });
      }
    });
    const patches = () => requests.filter((request) => request.method === "PATCH").map((request) => request.body);

    await openTasks();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Synthetic write-up" }));
    expect(await screen.findByLabelText("Edit fixed window start")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Clear the fixed window" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Edit fixed window start"), { target: { value: "2026-10-01T14:00" } });
    fireEvent.change(screen.getByLabelText("Edit fixed window end"), { target: { value: "2026-10-01T15:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    // Only the window changed, so only the window is sent.
    expect(patches()[0]).toEqual({
      schema_version: "ubu.orchestrator.task_capture.v1",
      expected_version: 3,
      static_window: { start: instant("2026-10-01T14:00"), end: instant("2026-10-01T15:00") }
    });
    const row = () => screen.getByText("Synthetic write-up").closest('[role="listitem"]') as HTMLElement;
    await waitFor(() => expect(within(row()).getByText("static")).toBeInTheDocument());

    // The stored window is read back into the form, and clearing it sends null.
    fireEvent.click(screen.getByRole("button", { name: "Edit Synthetic write-up" }));
    expect(await screen.findByLabelText("Edit fixed window start")).toHaveValue("2026-10-01T14:00");
    expect(screen.getByLabelText("Edit fixed window end")).toHaveValue("2026-10-01T15:00");
    fireEvent.click(screen.getByRole("button", { name: "Clear the fixed window" }));
    expect(screen.getByLabelText("Edit fixed window start")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]).toEqual({ schema_version: "ubu.orchestrator.task_capture.v1", expected_version: 4, static_window: null });
    await waitFor(() => expect(within(row()).getByText("planned")).toBeInTheDocument());
  });

  // P1B-50: a Task has notes, and Clarify's interview is what they hold.
  const INTERVIEW = "\n\nQ: Is there a deadline for the synthetic teapot?\nA: y\nQ: What is the synthetic deadline?\nA: friday\n\nQ: Who is the synthetic teapot for?\nA: the synthetic neighbour\n\n";
  const SECOND_ROUND = INTERVIEW + "Q: Is the synthetic teapot already bought?\nA: n\n";

  it("81: a captured description reaches the orchestrator and comes back on the list", async () => {
    const rows: TaskRow[] = [];
    const requests = stubOrchestrator({
      list: () => rows,
      capture: (body) => {
        rows.push(task("task-new", String(body.title), { description: body.description as string | undefined }));
        return json({ schema_version: "ubu.orchestrator.task_capture.v1", task_id: "task-new", version: 1 }, 201);
      }
    });
    await openTasks();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Synthetic teapot" } });
    const notes = screen.getByLabelText("Notes");
    expect(notes.tagName).toBe("TEXTAREA");
    expect(notes).toHaveAttribute("placeholder", "Optional. Clarify writes its questions and your answers here, as Q: and A: lines.");
    fireEvent.change(notes, { target: { value: INTERVIEW } });
    fireEvent.click(screen.getByRole("button", { name: "Capture Task" }));

    expect(await screen.findByText("Synthetic teapot")).toBeInTheDocument();
    const posted = requests.find((request) => request.method === "POST");
    expect(posted?.body).toEqual({ schema_version: "ubu.orchestrator.task_capture.v1", title: "Synthetic teapot", description: INTERVIEW });
    expect(screen.getByLabelText("Notes")).toHaveValue("");

    // A blank description is omitted, not sent as an empty string.
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Synthetic kettle" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "  \n\t" } });
    fireEvent.click(screen.getByRole("button", { name: "Capture Task" }));
    await screen.findByText("Synthetic kettle");
    const second = requests.filter((request) => request.method === "POST")[1];
    expect(second.body).toEqual({ schema_version: "ubu.orchestrator.task_capture.v1", title: "Synthetic kettle" });
  });

  it("82: an edit that changes nothing sends no description, and a stale conflict keeps the notes", async () => {
    const rows = [task("task-a", "Synthetic write-up", { version: 2, description: INTERVIEW, duration_estimate: { type: "fixed", seconds: 1500 } })];
    const requests = stubOrchestrator({
      list: () => rows,
      edit: (taskId, body) => {
        rows[0] = { ...rows[0], version: rows[0].version + 1, title: String(body.title ?? rows[0].title) };
        return json({ schema_version: "ubu.orchestrator.task_capture.v1", task_id: taskId, version: rows[0].version });
      }
    });
    await openTasks();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Synthetic write-up" }));
    // The stored narrative is read into the field byte for byte.
    expect(await screen.findByLabelText("Edit notes")).toHaveValue(INTERVIEW);
    fireEvent.change(screen.getByLabelText("Edit title"), { target: { value: "Synthetic write-up, retitled" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Synthetic write-up, retitled");
    const patched = requests.filter((request) => request.method === "PATCH");
    expect(patched).toHaveLength(1);
    expect(patched[0].body).toEqual({ schema_version: "ubu.orchestrator.task_capture.v1", expected_version: 2, title: "Synthetic write-up, retitled" });
    expect(patched[0].body).not.toHaveProperty("description");

    // Saved again with nothing changed at all: refused before any request.
    fireEvent.click(screen.getByRole("button", { name: "Edit Synthetic write-up, retitled" }));
    expect(await screen.findByLabelText("Edit notes")).toHaveValue(INTERVIEW);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Nothing was changed.")).toBeInTheDocument();
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(1);
  });

  it("83: clearing a description sends null", async () => {
    const rows = [task("task-a", "Synthetic write-up", { version: 5, description: INTERVIEW })];
    const requests = stubOrchestrator({
      list: () => rows,
      edit: (taskId, body) => {
        rows[0] = { ...rows[0], version: 6, description: body.description === null ? undefined : (body.description as string) };
        return json({ schema_version: "ubu.orchestrator.task_capture.v1", task_id: taskId, version: 6 });
      }
    });
    await openTasks();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Synthetic write-up" }));
    fireEvent.change(await screen.findByLabelText("Edit notes"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(1));
    expect(requests.find((request) => request.method === "PATCH")?.body).toEqual({
      schema_version: "ubu.orchestrator.task_capture.v1", expected_version: 5, description: null
    });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Synthetic write-up" }));
    expect(await screen.findByLabelText("Edit notes")).toHaveValue("");
  });

  it("84: a multi-round Q:/A: narrative round-trips through the textarea unchanged, newlines included", async () => {
    const rows = [task("task-a", "Synthetic write-up", { version: 1, description: INTERVIEW })];
    const requests = stubOrchestrator({
      list: () => rows,
      edit: (taskId, body) => {
        rows[0] = { ...rows[0], version: rows[0].version + 1, description: body.description as string };
        return json({ schema_version: "ubu.orchestrator.task_capture.v1", task_id: taskId, version: rows[0].version });
      }
    });
    await openTasks();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Synthetic write-up" }));
    const field = await screen.findByLabelText("Edit notes");
    expect(field).toHaveValue(INTERVIEW);
    // Leading newlines, blank lines between rounds and the trailing newlines all survive.
    expect((field as HTMLTextAreaElement).value.startsWith("\n\n")).toBe(true);
    expect((field as HTMLTextAreaElement).value.endsWith("\n\n")).toBe(true);
    expect(Number(field.getAttribute("rows"))).toBeGreaterThanOrEqual(INTERVIEW.split("\n").length + 1);
    fireEvent.change(field, { target: { value: SECOND_ROUND } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(1));
    expect(requests.find((request) => request.method === "PATCH")?.body).toEqual({
      schema_version: "ubu.orchestrator.task_capture.v1", expected_version: 1, description: SECOND_ROUND
    });
    expect(rows[0].description).toBe(SECOND_ROUND);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Synthetic write-up" }));
    expect(await screen.findByLabelText("Edit notes")).toHaveValue(SECOND_ROUND);
  });

  it("85: the list shows a Task's notes when its row is expanded, whole, and says when there are none", async () => {
    const requests = stubOrchestrator({
      list: () => [task("task-a", "Synthetic write-up", { description: INTERVIEW }), task("task-b", "Synthetic errand")]
    });
    await openTasks();
    const row = (await screen.findByText("Synthetic write-up")).closest('[role="listitem"]') as HTMLElement;
    const details = within(row).getByText("Notes for Synthetic write-up").closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(requests.filter((request) => request.method === "GET" && request.url.includes("/task/task-a"))).toHaveLength(0);
    details.open = true;
    fireEvent(details, new Event("toggle"));
    const notes = await within(row).findByText((_, element) => element?.tagName === "PRE" && element.textContent === INTERVIEW);
    expect(notes).toBeInTheDocument();
    expect(notes.textContent).toBe(INTERVIEW);
    expect(requests.filter((request) => request.method === "GET" && request.url.includes("/task/task-a"))).toHaveLength(1);

    const other = (await screen.findByText("Synthetic errand")).closest('[role="listitem"]') as HTMLElement;
    const none = within(other).getByText("Notes for Synthetic errand").closest("details") as HTMLDetailsElement;
    none.open = true;
    fireEvent(none, new Event("toggle"));
    expect(await within(other).findByText("This Task has no notes.")).toBeInTheDocument();
  });
});

