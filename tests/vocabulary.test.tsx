import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UniverseTargetCard } from "../src/components/UniverseTargetCard";
import { Review } from "../src/routes/Review";
import { isUniverseTarget, type UniverseTargetCandidate } from "../src/api/client";
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));
const FACT = "facts.synthetic.teapot_ready";
const NUMBER = "numeric_values.synthetic.teapot_charge";
function candidate(target = FACT): UniverseTargetCandidate {
  return { advisory_candidate_id: "advcand_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70", schema_version: "1.0", candidate_kind: "universe_target", lifecycle_state: "proposed", version: 1,
    normalized_proposal: { operation: "record_universe_target", target }, target_refs: [{ id: "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70", object_type: "Task" }],
    evidence_refs: ["source:synthetic-title"], proposing_actor: { model_or_tool_name: "synthetic-model", version: "1" }, proposed_at: "2026-10-01T08:00:00Z" };
}
const handlers = () => ({ onAdmit: vi.fn(), onDefer: vi.fn(), onResurface: vi.fn(), onReject: vi.fn() });
function card(target = FACT) { const actions = handlers(); render(<UniverseTargetCard candidate={candidate(target)} title="Synthetic teapot launch" busy={false} age="Just now" {...actions} />); return actions; }
afterEach(() => { pluginFetch.mockReset(); expect(globalThis.fetch).not.toHaveBeenCalled(); });
it("renders fact target and evidence Task with an empty value and the sovereignty sentence", () => {
  const actions = card();
  expect(screen.getByText(FACT)).toBeInTheDocument();expect(screen.getByText("Synthetic teapot launch")).toBeInTheDocument();
  expect(screen.getByText("UbU suggested the name; the value is yours.")).toBeInTheDocument();
  expect(screen.getByLabelText("Fact value")).toHaveValue("");expect(screen.getByRole("button", { name: "Admit" })).toBeDisabled();
  expect(actions.onAdmit).not.toHaveBeenCalled();
});
it("fact input submits explicit false and rejects object values", () => {
  const actions = card(); const input = screen.getByLabelText("Fact value");
  fireEvent.change(input, { target: { value: '{"synthetic":true}' } });expect(screen.getByRole("button", { name: "Admit" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "false" } });expect(screen.getByRole("button", { name: "Admit" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Admit" }));expect(actions.onAdmit).toHaveBeenCalledWith(false);
});
it("number card refuses nonnumeric input and submits explicit zero", () => {
  const actions = card(NUMBER);const input = screen.getByLabelText("Number value");
  expect(input).toHaveAttribute("type", "number");expect(screen.getByText(NUMBER)).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "not-a-number" } });expect(screen.getByRole("button", { name: "Admit" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "0" } });expect(screen.getByRole("button", { name: "Admit" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Admit" }));expect(actions.onAdmit).toHaveBeenCalledWith(0);
});
it("target defer reject and deferred resurface reuse the explicit action callbacks", () => {
  const actions = handlers();const row = candidate();const { rerender } = render(<UniverseTargetCard candidate={row} title="Synthetic teapot launch" busy={false} age="Just now" {...actions} />);
  fireEvent.click(screen.getByRole("button", { name: "Defer" }));fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  expect(actions.onDefer).toHaveBeenCalledOnce();expect(actions.onReject).toHaveBeenCalledOnce();
  rerender(<UniverseTargetCard candidate={{ ...row, lifecycle_state: "deferred" }} title="Synthetic teapot launch" busy={false} age="Just now" {...actions} />);
  expect(screen.queryByRole("button", { name: "Admit" })).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button", { name: "Resurface" }));expect(actions.onResurface).toHaveBeenCalledOnce();
});
it("narrowing rejects other kinds, malformed target and value-carrying proposals", () => {
  expect(isUniverseTarget(candidate())).toBe(true);
  expect(isUniverseTarget({ ...candidate(), candidate_kind: "tag" })).toBe(false);
  expect(isUniverseTarget({ ...candidate(), normalized_proposal: { operation: "record_universe_target", target: "event_markers.synthetic.x" } })).toBe(false);
  expect(isUniverseTarget({ ...candidate(), normalized_proposal: { operation: "record_universe_target", target: FACT, value: false } })).toBe(false);
});
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
it("Review runs vocabulary with names-only disclosure and sends the operator value on admission", async () => {
  const row = candidate();let admitted = false;const posts: Array<{ path: string; body: unknown }> = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(input.toString()).pathname;
    if (init?.method === "POST") {
      const body: unknown = JSON.parse(String(init.body));posts.push({ path, body });
      if (path === "/advisory/run") return json({ schema_version: "ubu.orchestrator.advisory_run.v1", status: "ok", selected: [], candidates_enqueued: 1, candidate_ids: [row.advisory_candidate_id], report: null, diagnostics: [{ code: "vocabulary_proposal_refused", message: "Synthetic other proposal refused; the rest stands." }] });
      if (path.endsWith("/admit")) { admitted = true; return json({ state_category: "candidate_state", candidate: row, task: {}, universe_state: {} }); }
    }
    if (path === "/advisory/queue") return json({ state_category: "candidate_state", candidates: admitted ? [] : [{ state_category: "candidate_state", candidate: row }], deferred_candidates: [], target_titles: { [row.target_refs[0].id]: "Synthetic teapot launch" } });
    if (path === "/tasks") return json({ schema_version: "ubu.orchestrator.task_read.v1", status: "active", tasks: [] });
    throw new Error(`Unexpected mocked request ${path}`);
  });
  render(<Review onOpenSetup={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Run vocabulary advisor" })).toBeEnabled());
  expect(screen.getByText(/Suggest names worth recording/)).toHaveTextContent("Fact values are not sent.");
  fireEvent.click(screen.getByRole("button", { name: "Run vocabulary advisor" }));
  const result = await screen.findByRole("region", { name: "Vocabulary advisor result" });expect(result).toHaveTextContent("Candidates enqueued: 1");
  expect(within(result).getByRole("status")).toHaveTextContent("Synthetic other proposal refused");
  expect(posts[0]).toEqual({ path: "/advisory/run", body: { schema_version: "ubu.orchestrator.advisory_run.v1", producer: "vocabulary", limit: 25 } });
  await waitFor(() => expect(screen.getByLabelText("Fact value")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Fact value"), { target: { value: "false" } });fireEvent.click(screen.getByRole("button", { name: "Admit" }));
  await screen.findByText("Your value was recorded in UniverseState as asserted.");
  expect(posts[1]).toEqual({ path: `/advisory/candidate/${row.advisory_candidate_id}/admit`, body: { observed_version: 1, value: false } });
});
