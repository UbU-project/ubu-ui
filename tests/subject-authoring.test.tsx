import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UniverseState } from "../src/routes/UniverseState";
import { ROOT_RULE } from "../src/components/SubjectFields";
import type { SubjectReferenceCounts } from "../src/api/client";
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
async function open({ empty = false, references = {}, staleRefusal = false }: { empty?: boolean; references?: Record<string, SubjectReferenceCounts>; staleRefusal?: boolean } = {}) {
  const roots = new Set(empty ? [] : ["teapot"]);
  const writes: Array<{ path: string; body?: Record<string, unknown>; method: string }> = [];
  const world = { schema_version: "ubu.orchestrator.universe_state.v1", id: "universe_state_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70", version: 1, captured_at: "2026-10-06T08:00:00Z", facts: { legacy_leaf: true }, numeric_values: {}, set_memberships: {}, event_markers: {}, fact_provenance: {}, source_summary: "Synthetic teapot", confidence_summary: null };
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(input.toString()).pathname, method = init?.method ?? "GET";
    if (method !== "GET") writes.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path === "/settings") return json({ settings: [...roots].map(root => ({ name: `universe.subject.${root}`, value: true, version: 1,
      subject_metadata: { minted_at: "2026-10-06T08:00:00Z", references: references[root] ?? { universe_state_keys: 0, fact_provenance_keys: 0, task_precondition_targets: 0 } } })), palette: [], inverse: [] });
    if (path.startsWith("/setting/universe.subject.")) {
      const root = path.split(".").at(-1)!;
      if (method === "DELETE") {
        if (staleRefusal) {
          references[root] = { universe_state_keys: 0, fact_provenance_keys: 0, task_precondition_targets: 1 };
          return new Response(JSON.stringify({ error: "Retirement refused: Task precondition targets 1. Retirement does not cascade.", diagnostics: [{ code: "subject_referenced", message: "Retirement does not cascade." }] }), { status: 409, headers: { "Content-Type": "application/json" } });
        }
        roots.delete(root); return new Response(null, { status: 204 });
      }
      roots.add(root); return json({ schema_version: "ubu.orchestrator.setting.v1", setting_id: "synthetic-setting", version: 1 });
    }
    expect(path).toBe("/universe-state");
    if (method === "PATCH") {
      const mutation = JSON.parse(String(init?.body)).mutations[0];
      const key = mutation.target.slice("facts.".length);
      if (mutation.operation === "clear_fact") delete (world.facts as Record<string, unknown>)[key];
      else (world.facts as Record<string, unknown>)[key] = mutation.payload;
      if (key.startsWith("teapot.")) references.teapot = mutation.operation === "clear_fact"
        ? { universe_state_keys: 0, fact_provenance_keys: 0, task_precondition_targets: 0 }
        : { universe_state_keys: 1, fact_provenance_keys: 1, task_precondition_targets: 0 };
    }
    return json(world);
  });
  render(<UniverseState />); await screen.findByLabelText("Subject vocabulary"); return writes;
}
afterEach(() => { pluginFetch.mockReset(); expect(globalThis.fetch).not.toHaveBeenCalled(); });
it("assembles subject and predicate with an optional entity path and sends only an authored value", async () => {
  const writes = await open();
  fireEvent.change(screen.getByLabelText("Fact subject"), { target: { value: "operator" } });
  fireEvent.change(screen.getByLabelText("Fact predicate"), { target: { value: "work_style" } });
  expect(screen.getByLabelText("Fact target")).toHaveTextContent("facts.operator.work_style");
  fireEvent.change(screen.getByLabelText("Fact value"), { target: { value: "synthetic" } });
  fireEvent.click(screen.getByRole("button", { name: "Set fact" }));
  await screen.findByRole("row", { name: "facts.operator.work_style" });
  expect(writes[0].body).toEqual({ schema_version: "ubu.orchestrator.universe_state.v1", mutations: [{ operation: "set_fact", target: "facts.operator.work_style", payload: "synthetic" }] });
  fireEvent.change(screen.getByLabelText("Fact subject"), { target: { value: "github" } });
  fireEvent.change(screen.getByLabelText("Fact predicate"), { target: { value: "issue.14.pipeline_state" } });
  expect(screen.getByLabelText("Fact target")).toHaveTextContent("facts.github.issue.14.pipeline_state");
});
it("a predicate without a chosen subject cannot submit or mint from a value form", async () => {
  const writes = await open();
  fireEvent.change(screen.getByLabelText("Fact predicate"), { target: { value: "ready" } });
  fireEvent.change(screen.getByLabelText("Fact value"), { target: { value: "true" } });
  expect(screen.getByRole("button", { name: "Set fact" })).toBeDisabled();
  const form = screen.getByRole("form", { name: "Set a fact" });
  fireEvent.submit(form); expect(writes).toEqual([]);
  expect(within(form).queryByRole("button", { name: "Mint subject" })).not.toBeInTheDocument();
});
it("lists governance distinctly and explicit mint/retire refreshes selectors without rewriting legacy data", async () => {
  const writes = await open(); const list = screen.getByLabelText("Subject vocabulary");
  expect(list).toHaveTextContent("operator — governed"); expect(list).toHaveTextContent("teapot — awaiting ratification");
  expect(list).toHaveTextContent(ROOT_RULE);
  fireEvent.change(screen.getByLabelText("New subject"), { target: { value: "workbench" } });
  fireEvent.click(screen.getByRole("button", { name: "Mint subject" }));
  await screen.findByRole("button", { name: "Retire subject workbench" });
  expect(within(screen.getByLabelText("Fact subject")).getByRole("option", { name: "workbench" })).toBeInTheDocument();
  expect(writes[0]).toEqual({ path: "/setting/universe.subject.workbench", method: "PUT", body: { schema_version: "ubu.orchestrator.setting.v1", value: true } });
  fireEvent.click(screen.getByRole("button", { name: "Retire subject workbench" }));
  await screen.findByRole("row", { name: "facts.legacy_leaf" });
  expect(writes[1]).toEqual({ path: "/setting/universe.subject.workbench", method: "DELETE", body: undefined });
  expect(within(screen.getByLabelText("Fact subject")).queryByRole("option", { name: "workbench" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retire subject operator" })).not.toBeInTheDocument();
});
it("shows both tiers, minting metadata and counts without copying reference contents into the agenda", async () => {
  const writes = await open({ references: { teapot: { universe_state_keys: 4, fact_provenance_keys: 3, task_precondition_targets: 2 } } });
  expect(screen.getByLabelText("Subject tier counts")).toHaveTextContent("Governed 5. Provisional 1.");
  const row = screen.getByLabelText("Provisional subject teapot");
  expect(row.querySelector("time")).toHaveAttribute("dateTime", "2026-10-06T08:00:00Z");
  expect(row).toHaveTextContent("Version 1");
  expect(screen.getByLabelText("Reference counts for teapot")).toHaveTextContent("UniverseState keys 4; fact_provenance keys 3; Task precondition targets 2.");
  expect(row).not.toHaveTextContent("legacy_leaf");
  expect(screen.getByRole("button", { name: "Retire subject teapot" })).toBeDisabled();
  expect(row).toHaveTextContent("References exist");
  expect(writes).toEqual([]);
});
for (const field of ["universe_state_keys", "fact_provenance_keys", "task_precondition_targets"] as const) {
  it(`blocks retirement when only ${field} is nonzero`, async () => {
    const writes = await open({ references: { teapot: { universe_state_keys: 0, fact_provenance_keys: 0, task_precondition_targets: 0, [field]: 1 } } });
    fireEvent.click(screen.getByRole("button", { name: "Retire subject teapot" }));
    expect(writes).toEqual([]);
    expect(screen.getByText(/Retirement is allowed only/)).toHaveTextContent("Append-only event markers have no clearing operation");
    expect(screen.queryByText(/Retiring a provisional subject stops new writes/)).not.toBeInTheDocument();
  });
}
it("computes empty-for-now satisfaction and changes to outstanding after explicit minting", async () => {
  await open({ empty: true });
  expect(screen.getByLabelText("Subject ratification status")).toHaveTextContent("currently satisfied for now");
  expect(screen.getByLabelText("Subject ratification status")).toHaveTextContent("evaluated at the switch, not banked");
  fireEvent.change(screen.getByLabelText("New subject"), { target: { value: "workbench" } });
  fireEvent.click(screen.getByRole("button", { name: "Mint subject" }));
  await screen.findByLabelText("Provisional subject workbench");
  expect(screen.getByLabelText("Subject ratification status")).toHaveTextContent("ratification is outstanding");
  expect(screen.getByLabelText("Subject ratification status")).toHaveTextContent("This screen is the agenda");
});
it("refreshes a race refusal without removing the root or its reference", async () => {
  const writes = await open({ staleRefusal: true });
  fireEvent.click(screen.getByRole("button", { name: "Retire subject teapot" }));
  await screen.findByText("subject_referenced");
  expect(await screen.findByLabelText("Reference counts for teapot")).toHaveTextContent("Task precondition targets 1");
  expect(screen.getByRole("button", { name: "Retire subject teapot" })).toBeDisabled();
  expect(screen.getByLabelText("Subject ratification status")).toHaveTextContent("outstanding");
  expect(writes).toHaveLength(1);
});
it("does not offer retirement when reference counts are malformed", async () => {
  const writes = await open({ references: { teapot: { universe_state_keys: -1, fact_provenance_keys: 0, task_precondition_targets: 0 } } });
  expect(screen.getByRole("button", { name: "Retire subject teapot" })).toBeDisabled();
  expect(screen.getByLabelText("Reference counts for teapot")).toHaveTextContent("unavailable");
  expect(writes).toEqual([]);
});
it("refreshes reference counts after an authored value and again after its explicit clear", async () => {
  await open();
  fireEvent.change(screen.getByLabelText("Fact subject"), { target: { value: "teapot" } });
  fireEvent.change(screen.getByLabelText("Fact predicate"), { target: { value: "ready" } });
  fireEvent.change(screen.getByLabelText("Fact value"), { target: { value: "true" } });
  fireEvent.click(screen.getByRole("button", { name: "Set fact" }));
  await screen.findByRole("row", { name: "facts.teapot.ready" });
  await waitFor(() => {
    expect(screen.getByLabelText("Reference counts for teapot")).toHaveTextContent("UniverseState keys 1; fact_provenance keys 1");
    expect(screen.getByRole("button", { name: "Clear facts.teapot.ready" })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole("button", { name: "Clear facts.teapot.ready" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Retire subject teapot" })).toBeEnabled());
  expect(screen.getByLabelText("Reference counts for teapot")).toHaveTextContent("UniverseState keys 0; fact_provenance keys 0; Task precondition targets 0");
});
for (const root of ["facts", "numeric_values", "set_memberships", "event_markers", "affect"]) {
  it(`refuses reserved mint ${root} before a write`, async () => {
    const writes = await open(); fireEvent.change(screen.getByLabelText("New subject"), { target: { value: root } });
    fireEvent.click(screen.getByRole("button", { name: "Mint subject" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(`Subject \`${root}\` is reserved and cannot be minted.`); expect(writes).toEqual([]);
  });
}
it("refuses duplicate, governed and mechanically malformed roots while leaving noun judgment to the operator", async () => {
  const writes = await open();
  for (const [root, message] of [["teapot", "already provisional"], ["operator", "governed"], ["Teapot", "lowercase ASCII snake_case"], ["teapot.room", "contain no dots"], ["a".repeat(65), "at most 64"]]) {
    fireEvent.change(screen.getByLabelText("New subject"), { target: { value: root } });
    fireEvent.click(screen.getByRole("button", { name: "Mint subject" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  }
  expect(writes).toEqual([]); expect(screen.getByText(ROOT_RULE)).toBeInTheDocument();
});
