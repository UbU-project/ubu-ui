import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    set_memberships: { "toolbox.tools": ["spanner", 7] },
    event_markers: { "kettle.boiled": [{ cups: 2 }, { cups: 1 }] },
    fact_provenance: {},
    source_summary: "synthetic stored UniverseState",
    confidence_summary: null,
    ...overrides
  };
}
// What a store with no UniverseState answers: the empty state, with no version.
const nothingStored = (): UniverseStateResponse =>
  recorded({ version: null, facts: {}, numeric_values: {}, set_memberships: {}, event_markers: {}, fact_provenance: {}, source_summary: "empty UniverseState synthesized by orchestrator" });

type Edit = { schema_version: string; mutations: Array<{ operation: string; target: string; payload?: unknown }> };

/// A stand-in for the route. `answer` decides each edit; what it returns becomes the stored state.
function stub(initial: UniverseStateResponse, answer: (edit: Edit, current: UniverseStateResponse) => UniverseStateResponse | Response) {
  let current = initial;
  const edits: Edit[] = [];
  const reads: string[] = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    if (url.pathname === "/settings") return json({ settings: ["kettle", "shelf", "toolbox"].map(root => ({ name: `universe.subject.${root}`, value: true })), palette: [], inverse: [] });
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
function chooseKey(name: "Fact" | "Number" | "Set", key: string) {
  const [subject, ...parts] = key.trim().split(".");
  fireEvent.change(screen.getByLabelText(`${name} subject`), { target: { value: subject } });
  fireEvent.change(screen.getByLabelText(`${name} predicate`), { target: { value: parts.join(".") } });
}
const entries = () => screen.getByLabelText("Entries in each collection").textContent;

describe("UniverseState", () => {
  afterEach(() => {
    pluginFetch.mockReset();
  });

  it("shows the complete trimmed target as each editable key is typed", async () => {
    const { edits } = stub(recorded(), () => recorded());
    await open();
    for (const [field, preview, collection, correct] of [
      ["Fact", "Fact target", "facts", "kettle.descaled"],
      ["Number", "Number target", "numeric_values", "shelf.jars"],
      ["Set", "Set target", "set_memberships", "toolbox.tools"]
    ] as const) {
      for (const key of [correct, `${correct.split(".")[0]}.issue.14.pipeline_state`]) {
        chooseKey(field, `  ${key}  `);
        const code = screen.getByLabelText(preview).querySelector("code");
        expect(code?.textContent).toBe(`${collection}.${key}`);
      }
    }
    expect(edits).toEqual([]);
    expect(screen.queryByLabelText(/^Event marker key/)).not.toBeInTheDocument();
  });

  it("keeps intrinsic affect visible but unavailable to manual fact authoring", async () => {
    const { edits } = stub(recorded(), () => recorded());
    await open();
    expect(within(screen.getByLabelText("Fact subject")).getByRole("option", { name: /affect — reserved/ })).toBeDisabled();
    expect(screen.getByLabelText("Subject vocabulary")).toHaveTextContent("affect — governed; reserved for intrinsic affect");
    expect(edits).toEqual([]);
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
    expect(rowNames("Sets")).toEqual(["set_memberships.toolbox.tools"]);
    expect(screen.getByRole("row", { name: "set_memberships.toolbox.tools" })).toHaveTextContent('"spanner"');
    expect(screen.getByRole("row", { name: "set_memberships.toolbox.tools" })).toHaveTextContent("7");
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

    chooseKey("Fact", "kettle.filled");
    fireEvent.change(screen.getByLabelText("Fact value"), { target: { value: "false" } });
    fireEvent.click(screen.getByRole("button", { name: "Set fact" }));
    expect(await screen.findByRole("row", { name: "facts.kettle.filled" })).toHaveTextContent("facts.kettle.filledfalse");
    expect(edits[0]).toEqual({ schema_version: SCHEMA, mutations: [{ operation: "set_fact", target: "facts.kettle.filled", payload: false }] });
    expect(entries()).toBe("Entries: facts 3, numeric_values 1, set_memberships 1, event_markers 1.");
    expect(screen.getByLabelText("What is recorded")).toHaveTextContent("Version 5.");
    // The form is emptied once the edit is in.
    expect(screen.getByLabelText("Fact predicate")).toHaveValue("");
    expect(screen.getByLabelText("Fact value")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Clear facts.kettle.descaled" }));
    await waitFor(() => expect(screen.queryByRole("row", { name: "facts.kettle.descaled" })).not.toBeInTheDocument());
    // A clear carries no payload at all: the orchestrator refuses one that does.
    expect(edits[1]).toEqual({ schema_version: SCHEMA, mutations: [{ operation: "clear_fact", target: "facts.kettle.descaled" }] });
    expect(rowNames("Facts")).toEqual(["facts.kettle.label", "facts.kettle.filled"]);
    expect(screen.getByLabelText("What is recorded")).toHaveTextContent("Version 6.");

    // Change fills the form with the entry as it is stored, so the key is never retyped.
    fireEvent.click(screen.getByRole("button", { name: "Change facts.kettle.label" }));
    expect(screen.getByLabelText("Fact predicate")).toHaveValue("label");
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

    chooseKey("Fact", "kettle..descaled");
    fireEvent.change(screen.getByLabelText("Fact value"), { target: { value: "true" } });
    fireEvent.click(screen.getByRole("button", { name: "Set fact" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText("universe_mutation_invalid")).toBeInTheDocument();
    expect(screen.getByText("The orchestrator refused this, and nothing was changed.")).toBeInTheDocument();
    // The chosen subject and typed predicate are assembled without hiding the route refusal.
    expect(edits[0].mutations).toEqual([{ operation: "set_fact", target: "facts.kettle..descaled", payload: true }]);
    expect({ facts: rowNames("Facts"), entries: entries(), panel: screen.getByLabelText("What is recorded").textContent }).toEqual(before);
    // What was typed is still there to be corrected.
    expect(screen.getByLabelText("Fact predicate")).toHaveValue(".descaled");
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

    chooseKey("Fact", "kettle.descaled");
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

  it("138: a number is set to the value typed, outright, and cleared outright", async () => {
    // A stand-in for the route's two numeric operations: set replaces, clear removes.
    const { edits } = stub(recorded({ numeric_values: { "shelf.jars": 3, "shelf.litres": 0.7 } }), (edit, current) => {
      const [mutation] = edit.mutations;
      const key = mutation.target.replace(/^numeric_values\./, "");
      const numbers = { ...current.numeric_values };
      if (mutation.operation === "set_numeric") numbers[key] = mutation.payload as number;
      else if (mutation.operation === "clear_numeric") delete numbers[key];
      else throw new Error(`the screen sent ${mutation.operation}`);
      return { ...current, numeric_values: numbers };
    });
    await open();
    const set = (key: string, value: string) => {
      chooseKey("Number", key);
      fireEvent.change(screen.getByLabelText("Number value"), { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Set number" }));
    };

    // From 0.7, asking for 0.1 sends 0.1. Until P1B-59 this sent a decrement of 0.6 and landed on 0.09999999999999998.
    set("shelf.litres", "0.1");
    await waitFor(() => expect(screen.getByRole("row", { name: "numeric_values.shelf.litres" })).toHaveTextContent("numeric_values.shelf.litres0.1"));
    set("shelf.jars", "5");
    await waitFor(() => expect(screen.getByRole("row", { name: "numeric_values.shelf.jars" })).toHaveTextContent("numeric_values.shelf.jars5"));
    set("shelf.lids", "4");
    expect(await screen.findByRole("row", { name: "numeric_values.shelf.lids" })).toHaveTextContent("numeric_values.shelf.lids4");
    // The value it already has is sent like any other: the screen compares nothing and computes nothing.
    set("shelf.lids", "4");
    await waitFor(() => expect(edits).toHaveLength(4));
    expect(edits.map((edit) => edit.mutations)).toEqual([
      [{ operation: "set_numeric", target: "numeric_values.shelf.litres", payload: 0.1 }],
      [{ operation: "set_numeric", target: "numeric_values.shelf.jars", payload: 5 }],
      [{ operation: "set_numeric", target: "numeric_values.shelf.lids", payload: 4 }],
      [{ operation: "set_numeric", target: "numeric_values.shelf.lids", payload: 4 }]
    ]);
    // Nothing on the screen warns about a number not landing: there is nothing left to warn about.
    expect(screen.queryByText(/moves a number by a difference/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing was sent/)).not.toBeInTheDocument();
    expect(screen.getByText("The number is set to the value you enter, exactly. Setting a key that is already here replaces its value.")).toBeInTheDocument();

    // What is not a number is stopped here: there is no value to send.
    set("shelf.lids", "several");
    expect(await screen.findByText("Enter a number.")).toBeInTheDocument();
    expect(edits).toHaveLength(4);

    // Change fills the form from the row.
    fireEvent.click(screen.getByRole("button", { name: "Change numeric_values.shelf.jars" }));
    expect(screen.getByLabelText("Number predicate")).toHaveValue("jars");
    expect(screen.getByLabelText("Number value")).toHaveValue("5");

    // A number can be removed, with no payload, as a fact is cleared.
    fireEvent.click(screen.getByRole("button", { name: "Clear numeric_values.shelf.lids" }));
    await waitFor(() => expect(screen.queryByRole("row", { name: "numeric_values.shelf.lids" })).not.toBeInTheDocument());
    expect(edits[4]).toEqual({ schema_version: SCHEMA, mutations: [{ operation: "clear_numeric", target: "numeric_values.shelf.lids" }] });
    expect(rowNames("Numbers")).toEqual(["numeric_values.shelf.jars", "numeric_values.shelf.litres"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("139: the screen holds no difference arithmetic and no drift warning", () => {
    // The check that the workaround is gone and not merely unused: its words are not in the source.
    const source = readFileSync(join(__dirname, "../src/routes/UniverseState.tsx"), "utf8");
    for (const gone of ["increment_numeric", "decrement_numeric", "difference", "cannot set one outright", "Nothing was sent", "setNotice"]) {
      expect(source, gone).not.toContain(gone);
    }
    expect(source).toContain('operation: "set_numeric"');
    expect(source).toContain('operation: "clear_numeric"');
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

    chooseKey("Set", "toolbox.tools");
    fireEvent.change(screen.getByLabelText("Member"), { target: { value: "chisel" } });
    fireEvent.click(screen.getByRole("button", { name: "Add member" }));
    expect(await screen.findByRole("button", { name: 'Remove "chisel" from set_memberships.toolbox.tools' })).toBeInTheDocument();

    // The number 7 is removed as the number 7, not as the text "7".
    fireEvent.click(screen.getByRole("button", { name: "Remove 7 from set_memberships.toolbox.tools" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove 7 from set_memberships.toolbox.tools" })).not.toBeInTheDocument());
    expect(edits.map((edit) => edit.mutations[0])).toEqual([
      { operation: "add_membership", target: "set_memberships.toolbox.tools", payload: "chisel" },
      { operation: "remove_membership", target: "set_memberships.toolbox.tools", payload: 7 }
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
      if (url.pathname === "/settings") return json({settings: [], palette: [], inverse: []});
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

  it("145: beside a value one word says how it was established, for each of the four kinds", async () => {
    const at = "2026-06-10T15:30:00Z";
    stub(
      recorded({
        fact_provenance: {
          "facts.kettle.descaled": { kind: "asserted", recorded_at: at },
          "numeric_values.shelf.jars": { kind: "measured", recorded_at: at },
          "set_memberships.toolbox.tools": { kind: "proposed", recorded_at: at },
          "event_markers.kettle.boiled": { kind: "derived", recorded_at: at }
        }
      }),
      (_, current) => current
    );
    await open();

    const word = (row: string) => within(screen.getByRole("row", { name: row })).queryByLabelText(`${row} was`, { exact: false });
    expect(word("facts.kettle.descaled")).toHaveTextContent(/^asserted$/);
    expect(word("numeric_values.shelf.jars")).toHaveTextContent(/^measured$/);
    expect(word("set_memberships.toolbox.tools")).toHaveTextContent(/^proposed$/);
    expect(word("event_markers.kettle.boiled")).toHaveTextContent(/^derived$/);
    // Measured does not look like asserted: evidence and someone's word are different things here.
    const badge = (row: string) => (word(row) as HTMLElement).querySelector(".status-badge") as HTMLElement;
    expect(badge("numeric_values.shelf.jars").className).not.toBe(badge("facts.kettle.descaled").className);
    expect(badge("numeric_values.shelf.jars")).toHaveClass("success");
    expect(badge("set_memberships.toolbox.tools")).toHaveClass("warning");

    // A value with no recorded provenance shows no word. The screen does not guess one.
    expect(word("facts.kettle.label")).toBeNull();
    const unlabelled = screen.getByRole("row", { name: "facts.kettle.label" });
    for (const kind of ["asserted", "measured", "derived", "proposed"]) {
      expect(unlabelled).not.toHaveTextContent(kind);
    }
    expect(unlabelled.querySelector(".status-badge")).toBeNull();
    // The words are explained once, and the screen says what its own edits are recorded as.
    expect(screen.getByLabelText("What is recorded")).toHaveTextContent("What you set on this screen is recorded as asserted unless you choose “A reading”; the choice is yours.");
  });

  it("146: with no provenance at all no word is shown anywhere, and a write shows the word the orchestrator recorded", async () => {
    const { edits } = stub(recorded(), (edit, current) => ({
      ...current,
      numeric_values: { ...current.numeric_values, "shelf.lids": edit.mutations[0].payload as number },
      // The orchestrator records a write with no stated kind as asserted.
      fact_provenance: { ...current.fact_provenance, "numeric_values.shelf.lids": { kind: "asserted" as const, recorded_at: "2026-06-10T15:30:00Z" } }
    }));
    await open();
    expect(document.querySelectorAll("table .status-badge")).toHaveLength(0);

    chooseKey("Number", "shelf.lids");
    fireEvent.change(screen.getByLabelText("Number value"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Set number" }));
    const row = await screen.findByRole("row", { name: "numeric_values.shelf.lids" });
    expect(within(row).getByLabelText("numeric_values.shelf.lids was asserted")).toHaveTextContent("asserted");
    // The screen states no kind of its own: absent means asserted, and the orchestrator says so.
    expect(edits[0].mutations).toEqual([{ operation: "set_numeric", target: "numeric_values.shelf.lids", payload: 4 }]);
    expect(document.querySelectorAll("table .status-badge")).toHaveLength(1);
  });

  it("147: the generated READMEs name their source by a repo-relative path, never an absolute one", () => {
    for (const [file, source] of [
      ["../src/api/generated/README.md", "ubu-orchestrator/openapi/openapi.generated.json"],
      ["../src/types/generated/README.md", "ubu-schemas/generated/typescript"]
    ]) {
      const text = readFileSync(join(__dirname, file), "utf8");
      expect(text.split("\n"), file).toContain(source);
      // No line is a path from a filesystem root, a home directory or a drive.
      for (const line of text.split("\n")) {
        expect(line, `${file}: ${line}`).not.toMatch(/^\s*(\/|~|[A-Za-z]:[\\/])/);
        expect(line, `${file}: ${line}`).not.toMatch(/\/(home|Users|mnt|tmp)\//);
      }
    }
  });
});
