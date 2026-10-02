import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import type { UniverseStateResponse } from "../src/api/client";
import { readValue } from "../src/routes/UniverseState";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const SCHEMA = "ubu.orchestrator.universe_state.v1";
// Invented, and reading as invented: a kettle, a shelf of jars and a toolbox.
function recorded(overrides: Partial<UniverseStateResponse> = {}): UniverseStateResponse {
  return {
    schema_version: SCHEMA,
    id: "universe_state_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70",
    version: 4,
    captured_at: "2026-06-10T15:00:00Z",
    facts: { "kettle.descaled": true, "kettle.label": "true" },
    numeric_values: { "shelf.jars": 3 },
    set_memberships: { toolbox: ["spanner", 7] },
    event_markers: { "kettle.boiled": [{ cups: 2 }, { cups: 1 }] },
    source_summary: "synthetic stored UniverseState",
    confidence_summary: null,
    ...overrides
  };
}
// What a store with no UniverseState answers: the empty state, with no version.
const nothingStored = (): UniverseStateResponse =>
  recorded({ version: null, facts: {}, numeric_values: {}, set_memberships: {}, event_markers: {}, source_summary: "empty UniverseState synthesized by orchestrator" });

type Edit = { schema_version: string; mutations: Array<{ operation: string; target: string; payload?: unknown }> };

/// A stand-in for the route. `answer` decides each edit; what it returns becomes the stored state.
function stub(initial: UniverseStateResponse, answer: (edit: Edit, current: UniverseStateResponse) => UniverseStateResponse | Response) {
  let current = initial;
  const edits: Edit[] = [];
  const reads: string[] = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    if (url.pathname === "/calendar/current") return json({ plan_id: null, steps: [], alternatives: [] });
    if (url.pathname === "/universe-state" && (init?.method ?? "GET") === "GET") {
      reads.push(url.pathname);
      return json(current);
    }
    if (url.pathname === "/universe-state" && init?.method === "PATCH") {
      const edit = JSON.parse(String(init.body)) as Edit;
      edits.push(edit);
      const next = answer(edit, current);
      if (next instanceof Response) return next;
      current = next;
      return json(current);
    }
    throw new Error(`unexpected request: ${init?.method ?? "GET"} ${url.pathname}`);
  });
  return { edits, reads };
}
const refuse = (message: string) =>
  json({ error: message, diagnostics: [{ code: "universe_mutation_invalid", message }] }, 400);

async function open() {
  render(<App />);
  await screen.findByRole("heading", { name: "No timed Plan available" });
  fireEvent.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("button", { name: "UniverseState" }));
  await screen.findByLabelText("Entries in each collection");
}
const rowNames = (table: string) => within(screen.getByRole("table", { name: table })).getAllByRole("row").slice(1).map((row) => row.getAttribute("aria-label"));
const entries = () => screen.getByLabelText("Entries in each collection").textContent;

describe("UniverseState", () => {
  afterEach(() => {
    pluginFetch.mockReset();
  });

  it("133: the four collections render, each entry by its target and its value as stored", async () => {
    const { reads, edits } = stub(recorded(), () => recorded());
    await open();

    expect(screen.getByRole("heading", { level: 1, name: "UniverseState" })).toBeInTheDocument();
    // What it is for, said plainly.
    expect(screen.getByText(/A Task can ask that something be true before UbU will plan it\. This is where that something is recorded\./)).toBeInTheDocument();
    // The names and the counts on one line, and no value on it.
    expect(entries()).toBe("Entries: facts 2, numeric_values 1, set_memberships 1, event_markers 1.");
    expect(screen.getByLabelText("What is recorded")).toHaveTextContent("Version 4. First recorded");
    expect(screen.getByLabelText("What is recorded")).toHaveTextContent("synthetic stored UniverseState");

    expect(rowNames("Facts")).toEqual(["facts.kettle.descaled", "facts.kettle.label"]);
    // The boolean and the text of the same spelling are told apart.
    expect(screen.getByRole("row", { name: "facts.kettle.descaled" })).toHaveTextContent("facts.kettle.descaledtrue");
    expect(screen.getByRole("row", { name: "facts.kettle.label" })).toHaveTextContent('facts.kettle.label"true"');
    expect(rowNames("Numbers")).toEqual(["numeric_values.shelf.jars"]);
    expect(screen.getByRole("row", { name: "numeric_values.shelf.jars" })).toHaveTextContent("numeric_values.shelf.jars3");
    expect(rowNames("Sets")).toEqual(["set_memberships.toolbox"]);
    expect(screen.getByRole("row", { name: "set_memberships.toolbox" })).toHaveTextContent('"spanner"');
    expect(screen.getByRole("row", { name: "set_memberships.toolbox" })).toHaveTextContent("7");
    expect(rowNames("Event markers")).toEqual(["event_markers.kettle.boiled"]);
    expect(screen.getByRole("row", { name: "event_markers.kettle.boiled" })).toHaveTextContent('{"cups":2}{"cups":1}');

    for (const [heading, count] of [["Facts facts", "2 entries"], ["Numbers numeric_values", "1 entry"], ["Sets set_memberships", "1 entry"], ["Event markers event_markers", "1 entry"]]) {
      const section = screen.getByRole("heading", { level: 2, name: heading }).closest("section") as HTMLElement;
      expect(within(section).getByText(count)).toBeInTheDocument();
    }
    // Event markers are read-only here, and the screen says so.
    const markers = screen.getByRole("heading", { level: 2, name: "Event markers event_markers" }).closest("section") as HTMLElement;
    expect(markers).toHaveTextContent("Event markers can only be added to, never changed or removed, and this screen does not add them.");
    expect(within(markers).queryByRole("button")).not.toBeInTheDocument();
    expect(within(markers).queryByRole("textbox")).not.toBeInTheDocument();

    // Opening the screen reads once and writes nothing.
    expect(reads).toEqual(["/universe-state"]);
    expect(edits).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("134: a set and a clear each call the route, and the screen shows the state it answered with", async () => {
    const { edits, reads } = stub(recorded(), (edit, current) => {
      const [mutation] = edit.mutations;
      const facts = { ...current.facts };
      const key = mutation.target.replace(/^facts\./, "");
      if (mutation.operation === "set_fact") facts[key] = mutation.payload;
      if (mutation.operation === "clear_fact") delete facts[key];
      return { ...current, version: (current.version ?? 1) + 1, facts };
    });
    await open();

    fireEvent.change(screen.getByLabelText(/^Fact key/), { target: { value: "kettle.filled" } });
    fireEvent.change(screen.getByLabelText("Fact value"), { target: { value: "false" } });
    fireEvent.click(screen.getByRole("button", { name: "Set fact" }));
    expect(await screen.findByRole("row", { name: "facts.kettle.filled" })).toHaveTextContent("facts.kettle.filledfalse");
    expect(edits[0]).toEqual({ schema_version: SCHEMA, mutations: [{ operation: "set_fact", target: "facts.kettle.filled", payload: false }] });
    expect(entries()).toBe("Entries: facts 3, numeric_values 1, set_memberships 1, event_markers 1.");
    expect(screen.getByLabelText("What is recorded")).toHaveTextContent("Version 5.");
    // The form is emptied once the edit is in.
    expect(screen.getByLabelText(/^Fact key/)).toHaveValue("");
    expect(screen.getByLabelText("Fact value")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Clear facts.kettle.descaled" }));
    await waitFor(() => expect(screen.queryByRole("row", { name: "facts.kettle.descaled" })).not.toBeInTheDocument());
    // A clear carries no payload at all: the orchestrator refuses one that does.
    expect(edits[1]).toEqual({ schema_version: SCHEMA, mutations: [{ operation: "clear_fact", target: "facts.kettle.descaled" }] });
    expect(rowNames("Facts")).toEqual(["facts.kettle.label", "facts.kettle.filled"]);
    expect(screen.getByLabelText("What is recorded")).toHaveTextContent("Version 6.");

    // Change fills the form with the entry as it is stored, so the key is never retyped.
    fireEvent.click(screen.getByRole("button", { name: "Change facts.kettle.label" }));
    expect(screen.getByLabelText(/^Fact key/)).toHaveValue("kettle.label");
    expect(screen.getByLabelText("Fact value")).toHaveValue('"true"');
    fireEvent.change(screen.getByLabelText("Fact value"), { target: { value: "copper" } });
    fireEvent.click(screen.getByRole("button", { name: "Set fact" }));
    await waitFor(() => expect(screen.getByRole("row", { name: "facts.kettle.label" })).toHaveTextContent('facts.kettle.label"copper"'));
    expect(edits[2].mutations).toEqual([{ operation: "set_fact", target: "facts.kettle.label", payload: "copper" }]);

    // The screen showed what each edit answered with. It did not read again.
    expect(reads).toEqual(["/universe-state"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("135: a refusal shows the orchestrator's message and leaves the screen as it was", async () => {
    const message = "mutation 0: malformed target `facts.kettle..descaled`";
    const { edits } = stub(recorded(), () => refuse(message));
    await open();
    const before = { facts: rowNames("Facts"), entries: entries(), panel: screen.getByLabelText("What is recorded").textContent };

    fireEvent.change(screen.getByLabelText(/^Fact key/), { target: { value: "kettle..descaled" } });
    fireEvent.change(screen.getByLabelText("Fact value"), { target: { value: "true" } });
    fireEvent.click(screen.getByRole("button", { name: "Set fact" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText("universe_mutation_invalid")).toBeInTheDocument();
    expect(screen.getByText("The orchestrator refused this, and nothing was changed.")).toBeInTheDocument();
    // The key was sent as typed: the route is the one validator.
    expect(edits[0].mutations).toEqual([{ operation: "set_fact", target: "facts.kettle..descaled", payload: true }]);
    expect({ facts: rowNames("Facts"), entries: entries(), panel: screen.getByLabelText("What is recorded").textContent }).toEqual(before);
    // What was typed is still there to be corrected.
    expect(screen.getByLabelText(/^Fact key/)).toHaveValue("kettle..descaled");
    expect(screen.getByLabelText("Fact value")).toHaveValue("true");
  });

  it("136: a store with no UniverseState says so, and the first entry creates it", async () => {
    const { edits } = stub(nothingStored(), (edit, current) => ({ ...current, version: 2, facts: { "kettle.descaled": edit.mutations[0].payload }, source_summary: "empty UniverseState seeded by an operator edit" }));
    await open();

    const panel = screen.getByLabelText("What is recorded");
    expect(panel).toHaveTextContent(
      "Nothing is recorded here yet. This store has no UniverseState, so a Task that waits for something to be so is not ready. The first entry you set creates it."
    );
    expect(entries()).toBe("Entries: facts 0, numeric_values 0, set_memberships 0, event_markers 0.");
    // An empty state has no version and no time worth showing.
    expect(panel).not.toHaveTextContent("Version");
    expect(panel).not.toHaveTextContent("First recorded");
    for (const sentence of ["No facts.", "No numbers.", "No sets.", "No event markers."]) {
      expect(screen.getByText(sentence)).toBeInTheDocument();
    }
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Fact key/), { target: { value: "kettle.descaled" } });
    fireEvent.change(screen.getByLabelText("Fact value"), { target: { value: "true" } });
    fireEvent.click(screen.getByRole("button", { name: "Set fact" }));
    expect(await screen.findByRole("row", { name: "facts.kettle.descaled" })).toBeInTheDocument();
    expect(edits).toHaveLength(1);
    expect(screen.getByLabelText("What is recorded")).not.toHaveTextContent("Nothing is recorded here yet.");
    expect(screen.getByLabelText("What is recorded")).toHaveTextContent("Version 2.");
  });

  it("137: a stored state with nothing in it says that, which is not the same as nothing stored", async () => {
    stub(recorded({ version: 3, facts: {}, numeric_values: {}, set_memberships: {}, event_markers: {} }), (_, current) => current);
    await open();
    const panel = screen.getByLabelText("What is recorded");
    expect(panel).toHaveTextContent("This UniverseState holds no entries.");
    expect(panel).toHaveTextContent("Version 3.");
    expect(panel).not.toHaveTextContent("Nothing is recorded here yet.");
  });

  it("138: a number is set by sending the difference, up or down, and a new key counts from zero", async () => {
    const { edits } = stub(recorded(), (edit, current) => {
      const [mutation] = edit.mutations;
      const key = mutation.target.replace(/^numeric_values\./, "");
      const sign = mutation.operation === "increment_numeric" ? 1 : -1;
      return { ...current, numeric_values: { ...current.numeric_values, [key]: (current.numeric_values[key] ?? 0) + sign * Number(mutation.payload) } };
    });
    await open();
    const set = async (key: string, value: string) => {
      fireEvent.change(screen.getByLabelText(/^Number key/), { target: { value: key } });
      fireEvent.change(screen.getByLabelText("Number value"), { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Set number" }));
    };

    await set("shelf.jars", "5");
    await waitFor(() => expect(screen.getByRole("row", { name: "numeric_values.shelf.jars" })).toHaveTextContent("numeric_values.shelf.jars5"));
    await set("shelf.jars", "1.5");
    await waitFor(() => expect(screen.getByRole("row", { name: "numeric_values.shelf.jars" })).toHaveTextContent("numeric_values.shelf.jars1.5"));
    await set("shelf.lids", "4");
    expect(await screen.findByRole("row", { name: "numeric_values.shelf.lids" })).toHaveTextContent("numeric_values.shelf.lids4");
    expect(edits.map((edit) => edit.mutations[0])).toEqual([
      { operation: "increment_numeric", target: "numeric_values.shelf.jars", payload: 2 },
      { operation: "decrement_numeric", target: "numeric_values.shelf.jars", payload: 3.5 },
      { operation: "increment_numeric", target: "numeric_values.shelf.lids", payload: 4 }
    ]);

    // The value it already has sends nothing, and says so.
    await set("shelf.lids", "4");
    expect(await screen.findByText("numeric_values.shelf.lids is already 4. Nothing was sent.")).toBeInTheDocument();
    // What is not a number is stopped here: there is no difference to send.
    await set("shelf.lids", "several");
    expect(await screen.findByText("Enter a number.")).toBeInTheDocument();
    expect(edits).toHaveLength(3);

    // Change fills the form from the row.
    fireEvent.click(screen.getByRole("button", { name: "Change numeric_values.shelf.jars" }));
    expect(screen.getByLabelText(/^Number key/)).toHaveValue("shelf.jars");
    expect(screen.getByLabelText("Number value")).toHaveValue("1.5");
  });

  it("139: a number that does not land on the value asked for is said, not hidden", async () => {
    // The orchestrator moves a number by a difference. From 0.7, the difference to 0.1 does not land on 0.1.
    const { edits } = stub(recorded({ numeric_values: { "shelf.litres": 0.7 } }), (edit, current) => {
      const [mutation] = edit.mutations;
      const sign = mutation.operation === "increment_numeric" ? 1 : -1;
      return { ...current, numeric_values: { "shelf.litres": current.numeric_values["shelf.litres"] + sign * Number(mutation.payload) } };
    });
    await open();
    fireEvent.change(screen.getByLabelText(/^Number key/), { target: { value: "shelf.litres" } });
    fireEvent.change(screen.getByLabelText("Number value"), { target: { value: "0.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Set number" }));
    const landed = 0.7 - (0.7 - 0.1);
    expect(landed).not.toBe(0.1);
    expect(
      await screen.findByText(`UbU moves a number by a difference and cannot set one outright. numeric_values.shelf.litres is now ${landed}, not 0.1.`)
    ).toBeInTheDocument();
    expect(edits[0].mutations).toEqual([{ operation: "decrement_numeric", target: "numeric_values.shelf.litres", payload: 0.7 - 0.1 }]);
    expect(screen.getByRole("row", { name: "numeric_values.shelf.litres" })).toHaveTextContent(String(landed));
  });

  it("140: a member is added to a set and removed from it, with the value as it is stored", async () => {
    const { edits } = stub(recorded(), (edit, current) => {
      const [mutation] = edit.mutations;
      const key = mutation.target.replace(/^set_memberships\./, "");
      const members = (current.set_memberships[key] ?? []).filter((value) => value !== mutation.payload);
      if (mutation.operation === "add_membership") members.push(mutation.payload as string);
      const sets = { ...current.set_memberships, [key]: members };
      if (members.length === 0) delete sets[key];
      return { ...current, set_memberships: sets };
    });
    await open();

    fireEvent.change(screen.getByLabelText(/^Set key/), { target: { value: "toolbox" } });
    fireEvent.change(screen.getByLabelText("Member"), { target: { value: "chisel" } });
    fireEvent.click(screen.getByRole("button", { name: "Add member" }));
    expect(await screen.findByRole("button", { name: 'Remove "chisel" from set_memberships.toolbox' })).toBeInTheDocument();

    // The number 7 is removed as the number 7, not as the text "7".
    fireEvent.click(screen.getByRole("button", { name: "Remove 7 from set_memberships.toolbox" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove 7 from set_memberships.toolbox" })).not.toBeInTheDocument());
    expect(edits.map((edit) => edit.mutations[0])).toEqual([
      { operation: "add_membership", target: "set_memberships.toolbox", payload: "chisel" },
      { operation: "remove_membership", target: "set_memberships.toolbox", payload: 7 }
    ]);
  });

  it("141: what is typed is read as JSON when it is JSON, and as text when it is not", () => {
    expect(readValue("true")).toBe(true);
    expect(readValue(" false ")).toBe(false);
    expect(readValue("3")).toBe(3);
    expect(readValue('"3"')).toBe("3");
    expect(readValue("null")).toBe(null);
    expect(readValue("ready")).toBe("ready");
    expect(readValue("  two words ")).toBe("two words");
    expect(readValue('{"cups":2}')).toEqual({ cups: 2 });
  });

  it("142: a blocked Task on Today opens the screen that holds what it is waiting for", async () => {
    const TASK = "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e73";
    const PLAN = "plan_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70";
    const step = {
      index: 0, task_id: "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e71", summary: "Synthetic oat milk", start: 1_790_000_000, end: 1_790_001_200,
      start_at: "2026-09-21T13:33:20Z", end_at: "2026-09-21T13:53:20Z", depends_on: [], static_anchor: false, placement_authority: "planner", occupies_capacity: true
    };
    pluginFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      if (url.pathname === "/calendar/current") return json({ plan_id: null, steps: [], alternatives: [] });
      if (url.pathname === "/universe-state") return json(nothingStored());
      if (url.pathname === "/planning/generate") {
        return json({
          schema_version: "planning-kernel-contract/0.1", request_id: "synthetic-request", status: "ok",
          plan: { id: PLAN, status: "admitted", steps: [step], created_at: "2026-09-21T13:33:20Z" }, alternatives: [], unplaced_tasks: [], diagnostics: [],
          blocked_tasks: [{ task_id: TASK, precondition: { target: "facts.kettle.descaled", predicate: "equals", expected: true } }]
        });
      }
      throw new Error(`unexpected request: ${url.pathname}`);
    });
    render(<App />);
    await screen.findByRole("heading", { name: "No timed Plan available" });
    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));
    const blocked = await screen.findByRole("article", { name: `Not ready: ${TASK}` });
    expect(blocked).toHaveTextContent("Whether it is so is recorded in the UniverseState, under that name.");

    fireEvent.click(within(blocked).getByRole("button", { name: `Open UniverseState for ${TASK}` }));
    expect(await screen.findByRole("heading", { level: 1, name: "UniverseState" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("button", { name: "UniverseState" })).toHaveClass("active");
    // The fact the Task waits for is entered under the key its precondition names.
    expect(await screen.findByText("No facts.")).toBeInTheDocument();
  });
});
