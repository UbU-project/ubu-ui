import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import type { AdvisoryCandidate, AdvisoryQueueResponse, ClarificationQuestion } from "../src/api/client";
import { settingsFixture } from "./fixtures/settings";

// The client's only transport is the Tauri HTTP plugin, so that is what is mocked.
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

type Call = { method: string; path: string; body: Record<string, unknown> | null };
let unexpected: Call[] = [];

const TASK = "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70";
const OTHER = "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e71";
const OCCURRENCE = "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e72";
const CLARIFICATION = "advcand_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70";
const TAG = "advcand_018f3c8e9b2a7c4d8f1e2a3b4c5d6e71";

// Every question here is invented, and reads as invented.
const QUESTIONS: ClarificationQuestion[] = [
  { id: "q1", text: "Is there a deadline for the synthetic teapot?", kind: "YesNo" },
  { id: "q2", text: "What is the synthetic deadline?", kind: "ShortText", depends_on: ["q1", "y"] },
  { id: "q3", text: "Is the synthetic deadline fixed?", kind: "YesNo", depends_on: ["q2", "friday"] },
  { id: "q4", text: "Who is the synthetic teapot for?", kind: "ShortText" },
  { id: "q5", text: "Why is there no synthetic deadline?", kind: "ShortText", depends_on: ["q1", "n"] }
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function base(id: string, target: string, fields: Partial<AdvisoryCandidate>): AdvisoryCandidate {
  return {
    advisory_candidate_id: id, schema_version: "1.0", candidate_kind: "tag", lifecycle_state: "proposed", version: 1,
    target_refs: [{ id: target, object_type: "Task" }], normalized_proposal: {}, evidence_refs: [],
    proposing_actor: { model_or_tool_name: "synthetic-model:1", version: "unspecified" },
    proposed_at: new Date(Date.now() - 3 * 3600_000).toISOString(), ...fields
  };
}
function clarification(fields: Partial<AdvisoryCandidate> = {}, round = 1): AdvisoryCandidate {
  return base(CLARIFICATION, TASK, {
    candidate_kind: "clarification_question",
    normalized_proposal: { operation: "answer_questions", round, questions: QUESTIONS },
    evidence_refs: [`${TASK}:title`, `${TASK}:description`],
    ...fields
  });
}
function tag(): AdvisoryCandidate {
  return base(TAG, OTHER, {
    normalized_proposal: { operation: "set_category", category_tag: "grocery" }, confidence: 0.8, evidence_refs: [`${OTHER}:title`]
  });
}
function queue(candidates: AdvisoryCandidate[]): AdvisoryQueueResponse {
  const wrap = (candidate: AdvisoryCandidate) => ({ state_category: "candidate_state" as const, candidate });
  return {
    state_category: "candidate_state",
    candidates: candidates.filter((c) => c.lifecycle_state !== "deferred").map(wrap),
    deferred_candidates: candidates.filter((c) => c.lifecycle_state === "deferred").map(wrap),
    target_titles: { [TASK]: "Synthetic lunar teapot", [OTHER]: "Synthetic oat milk" }
  };
}
const tasks = [
  { task_id: TASK, title: "Synthetic lunar teapot", status: "active", version: 1, placement: "planned", is_routine_occurrence: false },
  { task_id: OTHER, title: "Synthetic oat milk", status: "active", version: 1, placement: "planned", is_routine_occurrence: false },
  { task_id: OCCURRENCE, title: "Synthetic morning review", status: "active", version: 1, placement: "static", is_routine_occurrence: true }
];
function run(fields: Record<string, unknown>) {
  return json({ schema_version: "ubu.orchestrator.advisory_run.v1", status: "ok", selected: [], candidates_enqueued: 0, candidate_ids: [], report: null, diagnostics: [], ...fields });
}

// Every request is answered here; anything unexpected fails the test rather than reaching a network.
function stub(handler: (call: Call) => Response | undefined, queued: () => AdvisoryCandidate[] = () => []) {
  const calls: Call[] = [];
  unexpected = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    expect(url.origin).toBe("http://127.0.0.1:7878");
    const call = { method: init?.method ?? "GET", path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    const handled = handler(call);
    if (handled) return handled;
    if (call.method === "GET" && call.path === "/calendar/current") return json({ plan_id: null, steps: [], alternatives: [] });
    if (call.method === "GET" && call.path === "/advisory/queue") return json(queue(queued()));
    if (call.method === "GET" && call.path === "/tasks") return json({ schema_version: "ubu.orchestrator.task_read.v1", status: "active", tasks });
    if (call.method === "GET" && call.path === "/settings") return json(settingsFixture());
    if (call.method === "GET" && call.path === "/health") return json({ status: "ok", version: "synthetic", bind_policy: "127.0.0.1_only" });
    unexpected.push(call);
    throw new Error(`unexpected request: ${call.method} ${call.path}`);
  });
  return calls;
}
async function openReview() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Run Clarify" })).toBeEnabled());
}
const card = (id = CLARIFICATION) => screen.getByRole("article", { name: `Proposal ${id}` });
const posts = (calls: Call[]) => calls.filter((call) => call.method === "POST");
const shown = () => within(card()).queryAllByRole("group").map((group) => within(group).queryByText(/\?$/)?.textContent);
function questionsShown() {
  const form = within(card()).getByRole("form");
  return QUESTIONS.map((question) => question.text).filter((text) => within(form).queryByText(text) !== null);
}
function choose(question: string, label: "Yes" | "No") {
  const group = within(card()).getByRole("group", { name: question });
  fireEvent.click(within(group).getByRole("radio", { name: label }));
}
function type(question: string, value: string) {
  fireEvent.change(within(card()).getByLabelText(question), { target: { value } });
}

describe("The interview", () => {
  afterEach(() => {
    expect(unexpected).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    pluginFetch.mockReset();
  });

  it("63: the Clarify panel says what is sent, and offers Tasks by title without routine occurrences", async () => {
    stub(() => undefined);
    await openReview();
    const panel = screen.getByRole("heading", { name: "Clarify" }).closest(".settings-panel") as HTMLElement;
    expect(panel).toHaveTextContent(
      "That Task's ID, title, category, tags and description are sent to your configured local model, and nowhere else. The description includes the answers you have already given. Runs are manual."
    );
    // The SuggestTags panel still states its own, narrower, limit.
    expect(screen.getByRole("heading", { name: "SuggestTags" }).closest(".settings-panel")).toHaveTextContent(
      "Only their IDs and titles are sent to your configured local model."
    );
    const selector = within(panel).getByLabelText("Task to interview");
    expect(selector.tagName).toBe("SELECT");
    expect(within(selector).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "The first Task without a description",
      "Synthetic lunar teapot",
      "Synthetic oat milk"
    ]);
    expect(selector).toHaveValue("");
    // No id is shown for the operator to copy, and none is asked for.
    expect(within(panel).queryByRole("textbox")).not.toBeInTheDocument();
    expect(panel).not.toHaveTextContent("task_018f");
  });

  it("64: Run Clarify sends the producer and the chosen Task, never a limit, and shows the result", async () => {
    const queued: AdvisoryCandidate[] = [];
    const calls = stub((call) => {
      if (call.path !== "/advisory/run") return undefined;
      queued.push(clarification());
      return run({ selected: [{ id: TASK, title: "Synthetic lunar teapot" }], candidates_enqueued: 1, candidate_ids: [CLARIFICATION] });
    }, () => queued);
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "Run Clarify" }));
    const result = await screen.findByRole("region", { name: "Clarify run result" });
    expect(result).toHaveTextContent("Run status: ok");
    expect(result).toHaveTextContent("Candidates enqueued: 1");
    expect(within(result).getByText("Synthetic lunar teapot", { exact: false })).toBeInTheDocument();
    expect(posts(calls)[0]).toEqual({ method: "POST", path: "/advisory/run", body: { schema_version: "ubu.orchestrator.advisory_run.v1", producer: "clarify" } });
    // The queue was reloaded, so the questions are there to answer.
    expect(await screen.findByRole("article", { name: `Proposal ${CLARIFICATION}` })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("button", { name: "Run Clarify" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Task to interview"), { target: { value: OTHER } });
    fireEvent.click(screen.getByRole("button", { name: "Run Clarify" }));
    await waitFor(() => expect(posts(calls)).toHaveLength(2));
    expect(posts(calls)[1].body).toEqual({ schema_version: "ubu.orchestrator.advisory_run.v1", producer: "clarify", task_id: OTHER });
    expect(posts(calls).every((call) => !("limit" in (call.body ?? {})))).toBe(true);
    // SuggestTags was not run, and its result region is not shown.
    expect(screen.queryByRole("region", { name: "Advisory run result" })).not.toBeInTheDocument();
  });

  it("65: a clarification card shows its questions and its round, and offers no Admit", async () => {
    stub(() => undefined, () => [clarification({}, 2)]);
    await openReview();
    expect(within(card()).getByRole("heading", { name: "Questions about Synthetic lunar teapot, round 2" })).toBeInTheDocument();
    // Only the questions that apply with nothing answered: q1 and q4.
    expect(questionsShown()).toEqual(["Is there a deadline for the synthetic teapot?", "Who is the synthetic teapot for?"]);
    const first = within(card()).getByRole("group", { name: "Is there a deadline for the synthetic teapot?" });
    expect(within(first).getAllByRole("radio").map((radio) => [(radio as HTMLInputElement).value, (radio as HTMLInputElement).checked])).toEqual([["y", false], ["n", false]]);
    expect(within(first).getByRole("radio", { name: "Yes" })).toBeInTheDocument();
    expect(within(first).getByRole("radio", { name: "No" })).toBeInTheDocument();
    expect(within(card()).getByLabelText("Who is the synthetic teapot for?")).toHaveAttribute("type", "text");

    expect(within(card()).queryByRole("button", { name: "Admit" })).not.toBeInTheDocument();
    expect(within(card()).getByRole("button", { name: "Save answers" })).toBeDisabled();
    expect(within(card()).getByRole("button", { name: "Defer" })).toBeEnabled();
    expect(within(card()).getByRole("button", { name: "Reject" })).toBeEnabled();
    // What is about tags is not on it: no confidence, no placement, no colour note.
    expect(card()).not.toHaveTextContent("Confidence");
    expect(card()).not.toHaveTextContent("Placement");
    expect(card()).not.toHaveTextContent("calendar colour");
    expect(within(card()).getByText("synthetic-model:1 (unspecified)")).toBeInTheDocument();
    expect(within(card()).getByText("3 hours ago")).toBeInTheDocument();
  });

  it("66: a dependent question appears only while its dependency is answered as required", async () => {
    stub(() => undefined, () => [clarification()]);
    await openReview();
    const q1 = "Is there a deadline for the synthetic teapot?";
    const q2 = "What is the synthetic deadline?";
    const q3 = "Is the synthetic deadline fixed?";
    const q4 = "Who is the synthetic teapot for?";
    const q5 = "Why is there no synthetic deadline?";
    expect(questionsShown()).toEqual([q1, q4]);

    choose(q1, "Yes");
    expect(questionsShown()).toEqual([q1, q2, q4]);
    // A chain: q3 depends on q2's answer, compared without regard to case or padding.
    type(q2, "  FRIDAY ");
    expect(questionsShown()).toEqual([q1, q2, q3, q4]);
    choose(q3, "No");
    type(q2, "Thursday");
    expect(questionsShown()).toEqual([q1, q2, q4]);
    // Its answer went with it: asked again, it is unanswered.
    type(q2, "friday");
    expect(questionsShown()).toEqual([q1, q2, q3, q4]);
    expect(within(within(card()).getByRole("group", { name: q3 })).getByRole("radio", { name: "No" })).not.toBeChecked();
    choose(q3, "Yes");

    // Changing the first answer takes the whole chain with it, and shows the other branch.
    choose(q1, "No");
    expect(questionsShown()).toEqual([q1, q4, q5]);
    choose(q1, "Yes");
    expect(questionsShown()).toEqual([q1, q2, q4]);
    expect(within(card()).getByLabelText(q2)).toHaveValue("");

    // Clearing a dependency hides what depended on it.
    type(q2, "friday");
    fireEvent.click(within(within(card()).getByRole("group", { name: q1 })).getByRole("button", { name: "Clear this answer" }));
    expect(questionsShown()).toEqual([q1, q4]);
    expect(within(card()).getByRole("button", { name: "Save answers" })).toBeDisabled();
    expect(shown().length).toBeGreaterThan(0);
  });

  it("67: Save posts exactly the visible answers with the observed version, and reloads the queue", async () => {
    const queued = [clarification({ version: 4 })];
    let loads = 0;
    const calls = stub((call) => {
      if (call.path === "/advisory/queue") { loads += 1; return undefined; }
      if (call.path === `/advisory/candidate/${CLARIFICATION}/answer`) {
        queued.length = 0;
        return json({ state_category: "candidate_state", candidate: clarification({ lifecycle_state: "admitted", version: 5 }), task: { id: TASK } });
      }
    }, () => queued);
    await openReview();
    expect(loads).toBe(1);
    const q1 = "Is there a deadline for the synthetic teapot?";
    // An answer is given to the "no" branch, which is then left: it must not be sent.
    choose(q1, "No");
    type("Why is there no synthetic deadline?", "Synthetic reason that stops applying");
    choose(q1, "Yes");
    type("What is the synthetic deadline?", "  next synthetic Friday ");
    // Blank and whitespace are "no comment", and are not sent either.
    type("Who is the synthetic teapot for?", "   ");
    const save = within(card()).getByRole("button", { name: "Save answers" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]).toEqual({
      method: "POST",
      path: `/advisory/candidate/${CLARIFICATION}/answer`,
      body: { observed_version: 4, answers: { q1: "y", q2: "next synthetic Friday" } }
    });
    await waitFor(() => expect(loads).toBe(2));
    expect(await screen.findByText("Your answers were saved to the description of Synthetic lunar teapot.")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: `Proposal ${CLARIFICATION}` })).not.toBeInTheDocument();
    // Nothing was admitted by any other route.
    expect(calls.some((call) => call.path.endsWith("/admit"))).toBe(false);
  });

  it("68: a refused answer keeps what was typed and shows the orchestrator's reason", async () => {
    const reason = "The Task's description would be 16402 bytes; the limit is 16384. Nothing was written";
    const calls = stub((call) => call.path.endsWith("/answer") ? json({ error: reason, diagnostics: [{ code: "clarify_description_too_large", message: reason }] }, 400) : undefined, () => [clarification()]);
    await openReview();
    type("Who is the synthetic teapot for?", "Synthetic recipient");
    fireEvent.click(within(card()).getByRole("button", { name: "Save answers" }));
    expect(await screen.findByText("clarify_description_too_large")).toBeInTheDocument();
    expect(screen.getAllByText(reason).length).toBeGreaterThan(0);
    expect(within(card()).getByLabelText("Who is the synthetic teapot for?")).toHaveValue("Synthetic recipient");
    await waitFor(() => expect(within(card()).getByRole("button", { name: "Save answers" })).toBeEnabled());
    expect(posts(calls)).toHaveLength(1);
  });

  it("69: what is not a failure is shown as information, and a failure goes through the same remedies", async () => {
    const outcomes = [
      { code: "clarify_already_queued", status: "ok", message: `Task \`${TASK}\` (Synthetic lunar teapot) already has questions waiting in Review; answer, defer or reject them before asking for more`,
        line: "That Task already has questions waiting in the queue below. Answer, defer or reject them first. No model was asked." },
      { code: "clarify_no_task", status: "ok", message: "Every active Task already has a description; name a Task to interview it again",
        line: "There is no Task to interview. Left on its default, Clarify takes the first active Task with no description; choose a Task to interview it again." },
      { code: "clarify_no_questions", status: "ok", message: `The model has no further question about Task \`${TASK}\`; nothing was enqueued and the Task is unchanged`,
        line: "The model has nothing further to ask about this Task. Nothing was enqueued and the Task is unchanged." }
    ];
    let next = { code: "", status: "", message: "" };
    stub((call) => call.path === "/advisory/run" ? run({ status: next.status, diagnostics: [{ code: next.code, message: next.message }] }) : undefined);
    await openReview();
    for (const outcome of outcomes) {
      next = outcome;
      fireEvent.click(screen.getByRole("button", { name: "Run Clarify" }));
      const result = await screen.findByRole("region", { name: "Clarify run result" });
      const note = await within(result).findByText(outcome.line);
      expect(note.closest('[role="status"]')).toBeInTheDocument();
      expect(within(result).getByText(outcome.code)).toBeInTheDocument();
      // Information: no alert, no error text, no remedy, and no sending the operator to Setup.
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(result.querySelector(".error-text, .diagnostics-list")).toBeNull();
      expect(result).not.toHaveTextContent("What to change");
      expect(screen.queryByRole("button", { name: "Open Setup" })).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("button", { name: "Run Clarify" })).toBeEnabled());
    }
    // A failure is a failure here as it is for SuggestTags: the same alert and the same remedy.
    next = { code: "advisory_timeout", status: "timeout", message: "The local model exceeded timeout_ms; no candidates were enqueued" };
    fireEvent.click(screen.getByRole("button", { name: "Run Clarify" }));
    const result = await screen.findByRole("region", { name: "Clarify run result" });
    expect(await within(result).findByRole("alert")).toHaveTextContent("advisory_timeout");
    expect(within(result).getByText("What to change: the budget. Raise advisory.timeout_ms in Setup.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Setup" })).toBeInTheDocument();
  });

  it("70: a deferred interview is resurfaced before it is answered, and rejecting one asks first", async () => {
    const queued = [clarification({ lifecycle_state: "deferred", version: 2 })];
    const calls = stub((call) => {
      if (call.path.endsWith("/resurface")) { queued[0] = clarification({ lifecycle_state: "resurfaced", version: 3 }); return json({ state_category: "candidate_state", candidate: queued[0] }); }
      if (call.path.endsWith("/defer")) { queued[0] = clarification({ lifecycle_state: "deferred", version: 4 }); return json({ state_category: "candidate_state", candidate: queued[0] }); }
    }, () => queued);
    await openReview();
    expect(screen.getByRole("heading", { name: "Deferred proposals" })).toBeInTheDocument();
    expect(within(card()).queryByRole("form")).not.toBeInTheDocument();
    expect(within(card()).queryByRole("button", { name: "Save answers" })).not.toBeInTheDocument();
    expect(card()).toHaveTextContent("5 questions were put aside. Resurface them to answer them.");
    fireEvent.click(within(card()).getByRole("button", { name: "Resurface" }));
    await waitFor(() => expect(within(card()).getByRole("form")).toBeInTheDocument());
    expect(posts(calls)[0]).toEqual({ method: "POST", path: `/advisory/candidate/${CLARIFICATION}/resurface`, body: { observed_version: 2, trigger: "user_request" } });

    fireEvent.click(within(card()).getByRole("button", { name: "Reject" }));
    const confirmation = screen.getByRole("group", { name: "Confirm rejection" });
    expect(confirmation).toHaveTextContent("Rejection is durable. This same proposal will not return on another run; a different proposal for the Task can still arrive.");
    expect(posts(calls)).toHaveLength(1);
    fireEvent.click(within(confirmation).getByRole("button", { name: "Keep for review" }));
    fireEvent.click(within(card()).getByRole("button", { name: "Defer" }));
    await waitFor(() => expect(posts(calls)).toHaveLength(2));
    expect(posts(calls)[1]).toEqual({ method: "POST", path: `/advisory/candidate/${CLARIFICATION}/defer`, body: { observed_version: 3 } });
  });

  it("71: a tag card beside a clarification card is unchanged in every respect", async () => {
    const calls = stub((call) => call.path.endsWith("/admit") ? json({ state_category: "candidate_state", candidate: { ...tag(), lifecycle_state: "admitted", version: 2 }, task: {} }) : undefined, () => [clarification(), tag()]);
    await openReview();
    const tagCard = card(TAG);
    expect(within(tagCard).getByRole("heading", { name: "tag proposal" })).toBeInTheDocument();
    expect(within(tagCard).getByText("grocery").parentElement).toHaveTextContent("Set category to grocery");
    expect(within(tagCard).getByText("80%")).toBeInTheDocument();
    expect(within(tagCard).getByText("Dynamic").parentElement).toHaveTextContent("Placement: Dynamic");
    expect(within(tagCard).getByText("This Task is Dynamic, so admitting the category will not produce a calendar colour: a colour on a Dynamic event means done.")).toBeInTheDocument();
    expect(within(tagCard).getByText(`Evidence refs: ${OTHER}:title`)).toBeInTheDocument();
    expect(within(tagCard).getAllByRole("button").map((button) => button.textContent)).toEqual(["Admit", "Defer", "Reject"]);
    expect(within(tagCard).queryByRole("form")).not.toBeInTheDocument();
    expect(within(tagCard).queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.click(within(tagCard).getByRole("button", { name: "Admit" }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]).toEqual({ method: "POST", path: `/advisory/candidate/${TAG}/admit`, body: { observed_version: 1 } });
    // The clarification card beside it has the buttons it should, in its own order.
    expect(within(card()).getAllByRole("button").map((button) => button.textContent)).toEqual(["Save answers", "Defer", "Reject"]);
  });
});
