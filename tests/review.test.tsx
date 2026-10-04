import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import type { AdvisoryCandidate, AdvisoryQueueResponse } from "../src/api/client";
import { settingsFixture } from "./fixtures/settings";

const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));
type Call = { method: string; path: string; body: Record<string, unknown> | null };
let unexpected: Call[] = [];
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function candidate(tail = "0"): AdvisoryCandidate {
  return { advisory_candidate_id: `advcand_018f3c8e9b2a7c4d8f1e2a3b4c5d6e7${tail}`, schema_version: "1.0", candidate_kind: "tag", lifecycle_state: "proposed", version: 1,
    target_refs: [{ id: `task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e7${tail}`, object_type: "Task" }], normalized_proposal: { operation: "set_category", category_tag: "work" },
    confidence: 0.8, evidence_refs: ["source:synthetic-task-title"], proposing_actor: { model_or_tool_name: "synthetic-model:1", version: "unspecified" },
    proposed_at: new Date(Date.now() - 2 * 86400_000).toISOString() };
}
function queue(candidates: AdvisoryCandidate[] = []): AdvisoryQueueResponse {
  return { state_category: "candidate_state", candidates: candidates.filter((c) => ["proposed", "resurfaced"].includes(c.lifecycle_state)).map((candidate) => ({ state_category: "candidate_state", candidate })),
    deferred_candidates: candidates.filter((c) => c.lifecycle_state === "deferred").map((candidate) => ({ state_category: "candidate_state", candidate })),
    target_titles: Object.fromEntries(candidates.map((c) => [c.target_refs[0].id, `Synthetic lunar teapot ${c.target_refs[0].id.slice(-1)}`])) };
}
function stub(handler: (call: Call) => Response | undefined) {
  const calls: Call[] = []; unexpected = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString()); expect(url.origin).toBe("http://127.0.0.1:7878");
    const call = { method: init?.method ?? "GET", path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call); const handled = handler(call); if (handled) return handled;
    if (call.method === "GET" && call.path === "/calendar/current") return json({ plan_id: null, steps: [], alternatives: [] });
    if (call.method === "GET" && call.path === "/advisory/queue") return json(queue());
    // Review reads placements beside the queue.
    if (call.method === "GET" && call.path === "/tasks") return json({ schema_version: "ubu.orchestrator.task_read.v1", status: "active", tasks: [] });
    if (call.method === "GET" && call.path === "/settings") return json(settingsFixture());
    if (call.method === "GET" && call.path === "/health") return json({ status: "ok", version: "synthetic", bind_policy: "127.0.0.1_only" });
    unexpected.push(call); throw new Error(`Unexpected mocked request ${call.method} ${call.path}`);
  });
  return calls;
}
async function openReview() {
  render(<App />); fireEvent.click(screen.getByRole("button", { name: "Review" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
}
const postCalls = (calls: Call[]) => calls.filter((call) => call.method === "POST");

describe("Advisory Review and configuration", () => {
  afterEach(() => { expect(unexpected).toEqual([]); expect(globalThis.fetch).not.toHaveBeenCalled(); pluginFetch.mockReset(); });

  it("48: renders proposal, target title, confidence, evidence, proposing actor and age", async () => {
    const proposed = candidate(); stub((call) => call.path === "/advisory/queue" ? json(queue([proposed])) : undefined);
    await openReview(); const card = screen.getByRole("article", { name: `Proposal ${proposed.advisory_candidate_id}` });
    expect(within(card).getByText("tag proposal")).toBeInTheDocument(); expect(within(card).getByText("Synthetic lunar teapot 0")).toBeInTheDocument();
    expect(within(card).getByText(proposed.target_refs[0].id)).toBeInTheDocument(); expect(within(card).getByText("work").parentElement).toHaveTextContent("Set category to work");
    expect(within(card).getByText("80%")).toBeInTheDocument(); expect(within(card).getByText("Evidence refs: source:synthetic-task-title")).toBeInTheDocument();
    expect(within(card).getByText("synthetic-model:1 (unspecified)")).toBeInTheDocument(); expect(within(card).getByText("2 days ago")).toHaveAttribute("datetime", proposed.proposed_at);
    expect(screen.getByText("Proposals change nothing until you explicitly admit them.")).toBeInTheDocument();
  });

  it("49: admit, reject, defer and resurface send observed versions and reload the queue", async () => {
    const rows = [candidate("0"), candidate("1"), candidate("2")]; let loads = 0;
    const calls = stub((call) => {
      if (call.path === "/advisory/queue") { loads += 1; return json(queue(rows)); }
      if (call.method === "POST" && call.path.startsWith("/advisory/candidate/")) {
        const target = rows.find((row) => call.path.includes(row.advisory_candidate_id))!;
        const action = call.path.split("/").at(-1)!;
        expect(call.body?.observed_version).toBe(target.version); target.version += 1;
        target.lifecycle_state = ({ admit: "admitted", reject: "rejected", defer: "deferred", resurface: "resurfaced" } as Record<string, string>)[action];
        return json({ state_category: "candidate_state", candidate: target });
      }
    });
    await openReview();
    const card = (index: number) => screen.getByRole("article", { name: `Proposal ${rows[index].advisory_candidate_id}` });
    fireEvent.click(within(card(0)).getByRole("button", { name: "Admit" })); await waitFor(() => expect(loads).toBe(2));
    fireEvent.click(within(card(1)).getByRole("button", { name: "Reject" })); fireEvent.click(screen.getByRole("button", { name: "Confirm reject" })); await waitFor(() => expect(loads).toBe(3));
    fireEvent.click(within(card(2)).getByRole("button", { name: "Defer" })); await screen.findByRole("heading", { name: "Deferred proposals" });
    expect(within(card(2)).queryByRole("button", { name: "Admit" })).not.toBeInTheDocument();
    fireEvent.click(within(card(2)).getByRole("button", { name: "Resurface" })); await waitFor(() => expect(loads).toBe(5));
    expect(within(card(2)).getByRole("button", { name: "Admit" })).toBeEnabled();
    expect(postCalls(calls).map(({ path, body }) => ({ path, body }))).toEqual([
      { path: `/advisory/candidate/${rows[0].advisory_candidate_id}/admit`, body: { observed_version: 1 } },
      { path: `/advisory/candidate/${rows[1].advisory_candidate_id}/reject`, body: { observed_version: 1, reason: "Not useful", retention_policy: "retain" } },
      { path: `/advisory/candidate/${rows[2].advisory_candidate_id}/defer`, body: { observed_version: 1 } },
      { path: `/advisory/candidate/${rows[2].advisory_candidate_id}/resurface`, body: { observed_version: 2, trigger: "user_request" } }
    ]);
  });

  it("50: rejection requires the durability confirmation before any POST", async () => {
    const row = candidate(); const calls = stub((call) => call.path === "/advisory/queue" ? json(queue([row])) : undefined);
    await openReview(); fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const confirmation = screen.getByRole("group", { name: "Confirm rejection" });
    expect(confirmation).toHaveTextContent("Rejection is durable. This same proposal will not return on another run; a different proposal for the Task can still arrive.");
    expect(postCalls(calls)).toEqual([]); fireEvent.click(within(confirmation).getByRole("button", { name: "Keep for review" }));
    expect(screen.queryByRole("group", { name: "Confirm rejection" })).not.toBeInTheDocument(); expect(postCalls(calls)).toEqual([]);
  });

  it("51: Run sends producer and optional limit and reports exact selection and created count", async () => {
    const proposed = candidate(); const calls = stub((call) => {
      if (call.path === "/advisory/run") return json({ schema_version: "ubu.orchestrator.advisory_run.v1", status: "ok", selected: [{ id: proposed.target_refs[0].id, title: "Synthetic selected teapot" }], candidates_enqueued: 1, candidate_ids: [proposed.advisory_candidate_id], report: null, diagnostics: [] });
    });
    await openReview(); expect(screen.getByText(/No proposals awaiting review/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Task limit (optional)"), { target: { value: "3" } }); fireEvent.click(screen.getByRole("button", { name: "Run" }));
    const result = await screen.findByRole("region", { name: "Advisory run result" });
    expect(result).toHaveTextContent("Candidates enqueued: 1"); expect(result).toHaveTextContent("Synthetic selected teapot"); expect(result).toHaveTextContent(proposed.advisory_candidate_id);
    expect(postCalls(calls)[0]).toEqual({ method: "POST", path: "/advisory/run", body: { schema_version: "ubu.orchestrator.advisory_run.v1", producer: "suggest_tags", limit: 3 } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Task limit (optional)"), { target: { value: "" } }); fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(postCalls(calls)).toHaveLength(2)); expect(postCalls(calls)[1].body).not.toHaveProperty("limit");
  });

  it("52: names either missing Setting and directs the operator to Setup", async () => {
    let missing = "advisory.model";
    stub((call) => call.path === "/advisory/run" ? json({ schema_version: "ubu.orchestrator.advisory_run.v1", status: "unconfigured", selected: [], candidates_enqueued: 0, candidate_ids: [], report: null,
      diagnostics: [{ code: "advisory_unconfigured", message: `${missing} is not configured; set it in Setup before running SuggestTags` }] }) : undefined);
    await openReview();
    for (const name of ["advisory.model", "advisory.endpoint"]) {
      missing = name; fireEvent.click(screen.getByRole("button", { name: "Run" }));
      expect(await screen.findByText(`${name} is not configured; set it in Setup before running SuggestTags`)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Open Setup" })); expect(screen.getByRole("heading", { level: 1, name: "Setup" })).toBeInTheDocument();
      expect(await screen.findByRole("heading", { name: "Advisory configuration" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Review" })); await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    }
  });

  it("53: Setup edits and reverts both advisory Settings and renders endpoint rejection", async () => {
    const values = new Map<string, string>();
    const reason = "advisory.endpoint must be http://127.0.0.1:<port>, with no path, credentials, query or fragment";
    const calls = stub((call) => {
      if (call.path === "/settings") return json({ ...settingsFixture(), advisory: ["advisory.model", "advisory.endpoint"].map((name) => ({ name, value: values.get(name) ?? null, origin: values.has(name) ? "setting" : "unconfigured" })) });
      if (call.path.startsWith("/setting/advisory.")) {
        const name = call.path.split("/").at(-1)!;
        if (call.method === "DELETE") { values.delete(name); return new Response(null, { status: 204 }); }
        if (call.method === "PUT") {
          if (name === "advisory.endpoint" && call.body?.value === "https://example.invalid:11434") return json({ error: reason, diagnostics: [{ code: "setting_invalid_advisory_endpoint", message: reason }] }, 400);
          values.set(name, String(call.body?.value)); return json({ schema_version: "ubu.orchestrator.setting.v1", setting_id: "setting_synthetic", version: 1 });
        }
      }
    });
    render(<App />); fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    const table = await screen.findByRole("table", { name: "Advisory Settings" });
    await waitFor(() => expect(within(table).getAllByText("unconfigured")).toHaveLength(2));
    for (const [name, value] of [["advisory.model", "synthetic-model:1"], ["advisory.endpoint", "http://127.0.0.1:11434"]]) {
      fireEvent.change(screen.getByLabelText(`Value for ${name}`), { target: { value } }); fireEvent.click(screen.getByRole("button", { name: `Save ${name}` }));
      const row = within(table).getByRole("row", { name }); await waitFor(() => expect(within(row).getByText("setting")).toBeInTheDocument());
      expect(calls.find((call) => call.path === `/setting/${name}` && call.method === "PUT")?.body).toEqual({ schema_version: "ubu.orchestrator.setting.v1", value });
    }
    fireEvent.change(screen.getByLabelText("Value for advisory.endpoint"), { target: { value: "https://example.invalid:11434" } }); fireEvent.click(screen.getByRole("button", { name: "Save advisory.endpoint" }));
    expect(await screen.findByText("setting_invalid_advisory_endpoint")).toBeInTheDocument(); expect(screen.getAllByText(reason)).toHaveLength(2);
    expect(values.get("advisory.endpoint")).toBe("http://127.0.0.1:11434");
    for (const name of ["advisory.model", "advisory.endpoint"]) {
      fireEvent.click(screen.getByRole("button", { name: `Revert ${name}` }));
      const row = within(table).getByRole("row", { name }); await waitFor(() => expect(within(row).getByText("unconfigured")).toBeInTheDocument());
      expect(calls.some((call) => call.method === "DELETE" && call.path === `/setting/${name}`)).toBe(true);
    }
  });

  it("54: the Setup row edits and reverts advisory.timeout_ms in seconds, and renders an out-of-range refusal with its bounds", async () => {
    let stored: number | null = null;
    const reason = "advisory.timeout_ms must be an integer number of milliseconds from 5000 to 3600000";
    const calls = stub((call) => {
      if (call.path === "/settings") return json({ ...settingsFixture(), advisory: [
        { name: "advisory.model", value: null, origin: "unconfigured" }, { name: "advisory.endpoint", value: null, origin: "unconfigured" },
        { name: "advisory.timeout_ms", value: String(stored ?? 120000), origin: stored === null ? "default" : "setting" }] });
      if (call.path === "/setting/advisory.timeout_ms") {
        if (call.method === "DELETE") { stored = null; return new Response(null, { status: 204 }); }
        const value = call.body?.value;
        if (typeof value !== "number" || !Number.isInteger(value) || value < 5000 || value > 3600000) return json({ error: reason, diagnostics: [{ code: "setting_invalid_advisory_timeout", message: reason }] }, 400);
        stored = value; return json({ schema_version: "ubu.orchestrator.setting.v1", setting_id: "setting_synthetic", version: 1 });
      }
    });
    render(<App />); fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    const table = await screen.findByRole("table", { name: "Advisory Settings" });
    const row = await within(table).findByRole("row", { name: "advisory.timeout_ms" });
    expect(within(row).getByText("120 seconds (120000 ms)")).toBeInTheDocument(); expect(within(row).getByText("default")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Revert advisory.timeout_ms" })).toBeDisabled();
    const field = screen.getByLabelText("Value for advisory.timeout_ms, in seconds"); expect(field).toHaveValue("120");
    const puts = () => calls.filter((call) => call.method === "PUT" && call.path === "/setting/advisory.timeout_ms").map((call) => call.body);

    // Seconds on screen, milliseconds on the wire, and a number rather than a string.
    fireEvent.change(field, { target: { value: "900" } }); fireEvent.click(screen.getByRole("button", { name: "Save advisory.timeout_ms" }));
    await waitFor(() => expect(within(row).getByText("900 seconds (900000 ms)")).toBeInTheDocument()); expect(within(row).getByText("setting")).toBeInTheDocument();
    expect(puts()).toEqual([{ schema_version: "ubu.orchestrator.setting.v1", value: 900000 }]);

    fireEvent.change(field, { target: { value: "2" } }); fireEvent.click(screen.getByRole("button", { name: "Save advisory.timeout_ms" }));
    expect(await screen.findByText("setting_invalid_advisory_timeout")).toBeInTheDocument(); expect(screen.getAllByText(reason)).toHaveLength(2);
    expect(screen.getByText("The timeout must be a whole number of milliseconds from 5 to 3600 seconds (5000 to 3600000 ms). Nothing was changed.")).toBeInTheDocument();
    expect(puts()[1]).toEqual({ schema_version: "ubu.orchestrator.setting.v1", value: 2000 }); expect(stored).toBe(900000);
    expect(within(row).getByText("900 seconds (900000 ms)")).toBeInTheDocument();

    // Text that is not a number is not sent at all.
    fireEvent.change(field, { target: { value: "soon" } }); fireEvent.click(screen.getByRole("button", { name: "Save advisory.timeout_ms" }));
    expect(await screen.findByText("Enter the timeout as a number of seconds.")).toBeInTheDocument(); expect(puts()).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Revert advisory.timeout_ms" }));
    await waitFor(() => expect(within(row).getByText("120 seconds (120000 ms)")).toBeInTheDocument()); expect(within(row).getByText("default")).toBeInTheDocument();
    expect(calls.some((call) => call.method === "DELETE" && call.path === "/setting/advisory.timeout_ms")).toBe(true);
    expect(screen.getByLabelText("Value for advisory.timeout_ms, in seconds")).toHaveValue("120");
  });

  const NO_COLOUR = "This Task is Dynamic, so admitting the category will not produce a calendar colour: a colour on a Dynamic event means done.";
  function placed(placement: "static" | "planned") {
    const proposed = candidate();
    const calls = stub((call) => {
      if (call.path === "/advisory/queue") return json(queue([proposed]));
      if (call.path === "/tasks") return json({ schema_version: "ubu.orchestrator.task_read.v1", status: "active", tasks: [
        { task_id: proposed.target_refs[0].id, title: "Synthetic lunar teapot 0", status: "active", version: 1, placement, is_routine_occurrence: false },
        { task_id: "task_synthetic_other", title: "Synthetic other teapot", status: "active", version: 1, placement: placement === "static" ? "planned" : "static", is_routine_occurrence: false }] });
    });
    return { proposed, calls };
  }

  it("55: a tag proposal against a Dynamic Task renders the placement and the no-colour line", async () => {
    const { proposed, calls } = placed("planned");
    await openReview(); const card = await screen.findByRole("article", { name: `Proposal ${proposed.advisory_candidate_id}` });
    expect(await within(card).findByText("Dynamic")).toBeInTheDocument(); expect(within(card).getByText("Dynamic").parentElement).toHaveTextContent("Placement: Dynamic");
    expect(within(card).getByText(NO_COLOUR)).toBeInTheDocument();
    expect(within(card).queryByText("Static")).not.toBeInTheDocument();
    // Said before the decision: nothing has been posted, and Admit is still there to press.
    expect(within(card).getByRole("button", { name: "Admit" })).toBeEnabled(); expect(postCalls(calls)).toEqual([]);
    expect(calls.filter((call) => call.path === "/tasks")).toHaveLength(1);
  });

  it("56: the same proposal against a Static Task renders the placement and no such line", async () => {
    const { proposed } = placed("static");
    await openReview(); const card = await screen.findByRole("article", { name: `Proposal ${proposed.advisory_candidate_id}` });
    expect(await within(card).findByText("Static")).toBeInTheDocument(); expect(within(card).getByText("Static").parentElement).toHaveTextContent("Placement: Static");
    expect(within(card).queryByText(NO_COLOUR)).not.toBeInTheDocument(); expect(screen.queryByText(/will not produce a calendar colour/)).not.toBeInTheDocument();
    expect(within(card).queryByText("Dynamic")).not.toBeInTheDocument();
  });

  it("57: advisory_empty_response and an enriched advisory_http_failed each render with their remedy", async () => {
    const failures = [
      { status: "malformed_result", code: "advisory_empty_response",
        message: "The local model returned an empty response (thinking_present: true): the model produced thinking and no answer; choose a model that honours think: false, or a non-reasoning model, in advisory.model; no candidates were enqueued",
        remedy: "What to change: the model. It thought and did not answer. Set advisory.model in Setup to a model that honours think: false, or to a non-reasoning model." },
      { status: "malformed_result", code: "advisory_empty_response",
        message: "The local model returned an empty response (thinking_present: false): the model produced neither thinking nor an answer; run again, or choose another model in advisory.model; no candidates were enqueued",
        remedy: "What to change: the model. It returned nothing at all. Run again, or set advisory.model in Setup to another model." },
      { status: "worker_error", code: "advisory_http_failed",
        message: "The local model returned HTTP 404: model 'synthetic-model:1' not found; check advisory.model and that the model has been pulled; no candidates were enqueued",
        remedy: "What to change: the model name. Check advisory.model in Setup, and that the model has been pulled into your local server." }
    ];
    let next = failures[0];
    stub((call) => call.path === "/advisory/run" ? json({ schema_version: "ubu.orchestrator.advisory_run.v1", status: next.status, selected: [{ id: "task_synthetic", title: "Synthetic selected teapot" }],
      candidates_enqueued: 0, candidate_ids: [], report: null, diagnostics: [{ code: next.code, message: next.message }] }) : undefined);
    await openReview();
    const remedies = failures.map((failure) => failure.remedy);
    for (const failure of failures) {
      next = failure; fireEvent.click(screen.getByRole("button", { name: "Run" }));
      const result = await screen.findByRole("region", { name: "Advisory run result" });
      expect(await within(result).findByText(failure.message)).toBeInTheDocument();
      expect(within(result).getByText(failure.code)).toBeInTheDocument(); expect(within(result).getByText(failure.remedy)).toBeInTheDocument();
      expect(result).toHaveTextContent("Candidates enqueued: 0"); expect(result).toHaveTextContent(`Run status: ${failure.status}`);
      // Each failure shows its own remedy and not another's.
      for (const other of remedies.filter((text) => text !== failure.remedy)) expect(within(result).queryByText(other)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Open Setup" })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    }
  });
});


describe("P1B-61 precondition review", () => {
  afterEach(() => { expect(unexpected).toEqual([]); pluginFetch.mockReset(); });
  function proposed(): AdvisoryCandidate {
    return { ...candidate(), candidate_kind: "precondition", normalized_proposal: { target: "numeric_values.synthetic.orbital_teapot_charge", predicate: "at_least", expected: 25 } };
  }
  it("renders a precondition in the same words as blocked work", async () => {
    const row = proposed();
    stub((call) => call.path === "/advisory/queue" ? json(queue([row])) : undefined);
    await openReview();
    const card = screen.getByRole("article", { name: `Proposal ${row.advisory_candidate_id}` });
    expect(card).toHaveTextContent("Before this Task can be planned: numeric_values.synthetic.orbital_teapot_charge is at least 25.");
    expect(card.querySelector("pre")).toBeNull();
    expect(within(card).queryByText(/Currently required/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/Admitting replaces/)).not.toBeInTheDocument();
  });
  it("shows both replacement trees in words and requires explicit admission", async () => {
    const row = proposed();
    const next = row.normalized_proposal;
    row.normalized_proposal = { existing_precondition: { ...next, expected: 10 }, proposed_precondition: next };
    const calls = stub((call) => call.path === "/advisory/queue" ? json(queue([row])) : call.method === "POST" ? json({ state_category: "candidate_state", candidate: row }) : undefined);
    await openReview();
    const card = screen.getByRole("article", { name: `Proposal ${row.advisory_candidate_id}` });
    expect(card).toHaveTextContent("Currently required: numeric_values.synthetic.orbital_teapot_charge is at least 10.");
    expect(card).toHaveTextContent("Proposed requirement: numeric_values.synthetic.orbital_teapot_charge is at least 25.");
    expect(card).toHaveTextContent("Admitting replaces the current requirement with the proposed requirement.");
    expect(card.querySelector("pre")).toBeNull();
    expect(postCalls(calls)).toEqual([]);
    fireEvent.click(within(card).getByRole("button", { name: "Admit" }));
    await waitFor(() => expect(postCalls(calls)).toHaveLength(1));
    expect(postCalls(calls)[0]).toEqual({ method: "POST", path: `/advisory/candidate/${row.advisory_candidate_id}/admit`, body: { observed_version: 1 } });
  });
  for (const action of ["admit", "reject"] as const) {
    it(`precondition ${action} uses the existing versioned route`, async () => {
      const row = proposed();
      const calls = stub((call) => call.path === "/advisory/queue" ? json(queue([row])) : call.method === "POST" ? json({ state_category: "candidate_state", candidate: row }) : undefined);
      await openReview();
      const card = screen.getByRole("article", { name: `Proposal ${row.advisory_candidate_id}` });
      fireEvent.click(within(card).getByRole("button", { name: action === "admit" ? "Admit" : "Reject" }));
      if (action === "reject") fireEvent.click(screen.getByRole("button", { name: "Confirm reject" }));
      await waitFor(() => expect(postCalls(calls)).toHaveLength(1));
      expect(postCalls(calls)[0]).toEqual({ method: "POST", path: `/advisory/candidate/${row.advisory_candidate_id}/${action}`, body: action === "admit" ? { observed_version: 1 } : { observed_version: 1, reason: "Not useful", retention_policy: "retain" } });
    });
  }
  it("runs the precondition producer and shows missing targets as information", async () => {
    const calls = stub((call) => call.path === "/advisory/run" ? json({ schema_version: "ubu.orchestrator.advisory_run.v1", status: "ok", selected: [], candidates_enqueued: 0, candidate_ids: [], report: null, diagnostics: [{ code: "precondition_missing_targets", message: "Record facts.synthetic.teapot_ready first; no candidate was enqueued." }] }) : undefined);
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "Run precondition advisor" }));
    const result = await screen.findByRole("region", { name: "Precondition advisor result" });
    expect(within(result).getByRole("status")).toHaveTextContent("precondition_missing_targets");
    expect(within(result).queryByRole("alert")).not.toBeInTheDocument();
    expect(postCalls(calls)[0]).toEqual({ method: "POST", path: "/advisory/run", body: { schema_version: "ubu.orchestrator.advisory_run.v1", producer: "precondition", limit: 25 } });
  });
});
