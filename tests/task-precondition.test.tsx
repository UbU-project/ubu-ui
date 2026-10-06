import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TaskPrecondition, CLEAR_PRECONDITION } from "../src/components/TaskPrecondition";
import { Tasks } from "../src/routes/Tasks";
const pluginFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));
const ID = "task_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70";
const FACT = "facts.synthetic.teapot_ready", NUMBER = "numeric_values.synthetic.teapot_charge", SET = "set_memberships.synthetic.tools", EVENT = "event_markers.synthetic.inspections";
const world = { schema_version: "ubu.orchestrator.universe_state.v1", id: "universe_state_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70", version: 1, captured_at: "2026-10-06T08:00:00Z", facts: { "synthetic.teapot_ready": true, "synthetic..bad": false }, numeric_values: { "synthetic.teapot_charge": 0 }, set_memberships: { "synthetic.tools": ["synthetic-spanner"] }, event_markers: { "synthetic.inspections": [] }, fact_provenance: {}, source_summary: "Synthetic teapot", confidence_summary: null };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function stub() {
  const patches: unknown[] = [];
  pluginFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());expect(url.origin).toBe("http://127.0.0.1:7878");
    if (url.pathname === "/universe-state") return json(world);
    if (url.pathname === `/task/${ID}` && init?.method === "PATCH") { patches.push(JSON.parse(String(init.body)));return json({ schema_version: "ubu.orchestrator.task_capture.v1", task_id: ID, version: 2 }); }
    throw new Error(`Unexpected mocked request ${url.pathname}`);
  });return patches;
}
function card(precondition: unknown = undefined, readOnly = false) {
  const saved = vi.fn(async () => {});render(<TaskPrecondition taskId={ID} version={1} precondition={precondition} readOnly={readOnly} onSaved={saved} />);return saved;
}
async function editor(target = FACT) {
  fireEvent.click(screen.getByRole("button", { name: "Write precondition" }));await screen.findByRole("form", { name: "Write precondition" });fireEvent.change(screen.getByLabelText("Recorded target"), { target: { value: target } });
}
afterEach(() => { pluginFetch.mockReset();expect(globalThis.fetch).not.toHaveBeenCalled(); });
it("a requirement-free Task says so and only recorded well-formed targets are selectable", async () => {
  stub();card();expect(screen.getByText("This Task has no precondition.")).toBeInTheDocument();await editor();
  expect(within(screen.getByLabelText("Recorded target")).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(["",EVENT,FACT,NUMBER,SET]);
});
it("renders an admitted leaf in words and preserves a string's type when editing", async () => {
  const patches = stub();card({ target: FACT, predicate: "equals", expected: "true" });
  expect(screen.getByText(/Before this Task/)).toHaveTextContent(`${FACT} is "true"`);
  await editor();fireEvent.click(screen.getByRole("button", { name: "Save precondition" }));await screen.findByText("Precondition saved.");
  expect(patches).toEqual([{ schema_version: "ubu.orchestrator.task_capture.v1", expected_version: 1, preconditions: { target: FACT, predicate: "equals", expected: "true" } }]);
});
it("reads a boolean tree in words, offers no leaf form, and can explicitly clear it", async () => {
  const patches = stub();card({ all_of: [{ target: FACT, predicate: "equals", expected: true }, { any_of: [{ target: NUMBER, predicate: "at_least", expected: 2 }, { target: SET, predicate: "member_of", expected: "synthetic-spanner" }] }] });
  expect(screen.getByText(/Before this Task/)).toHaveTextContent(`${FACT} is true and ${NUMBER} is at least 2 or ${SET} is one of "synthetic-spanner"`);
  expect(screen.queryByRole("button", { name: "Write precondition" })).not.toBeInTheDocument();expect(screen.getByText(CLEAR_PRECONDITION)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear precondition" }));await screen.findByText("Precondition cleared.");
  expect(patches).toEqual([{ schema_version: "ubu.orchestrator.task_capture.v1", expected_version: 1, preconditions: null }]);
});
it("predicates follow each collection and comparison inputs require a finite number", async () => {
  const patches = stub();card();await editor();
  const choices = () => within(screen.getByLabelText("Requirement")).getAllByRole("option").map((o) => o.getAttribute("value"));
  expect(choices()).toEqual(["equals","absent"]);
  fireEvent.change(screen.getByLabelText("Recorded target"),{target:{value:SET}});expect(choices()).toEqual(["equals","absent","member_of"]);
  fireEvent.change(screen.getByLabelText("Recorded target"),{target:{value:EVENT}});expect(choices()).toEqual(["equals","absent"]);
  fireEvent.change(screen.getByLabelText("Recorded target"),{target:{value:NUMBER}});expect(choices()).toEqual(["equals","absent","at_least","at_most","greater_than","less_than"]);
  fireEvent.change(screen.getByLabelText("Requirement"),{target:{value:"at_least"}});expect(screen.getByLabelText("Expected value")).toHaveAttribute("type","number");
  expect(screen.getByRole("button",{name:"Save precondition"})).toBeDisabled();fireEvent.change(screen.getByLabelText("Expected value"),{target:{value:"not numeric"}});expect(screen.getByRole("button",{name:"Save precondition"})).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Expected value"),{target:{value:"0"}});fireEvent.click(screen.getByRole("button",{name:"Save precondition"}));await screen.findByText("Precondition saved.");
  expect(patches).toEqual([{schema_version:"ubu.orchestrator.task_capture.v1",expected_version:1,preconditions:{target:NUMBER,predicate:"at_least",expected:0}}]);
});
it("absent has no expected input and saving writes no expected field", async () => {
  const patches = stub();card();await editor();fireEvent.change(screen.getByLabelText("Requirement"),{target:{value:"absent"}});
  expect(screen.queryByLabelText("Expected value")).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Save precondition"}));await screen.findByText("Precondition saved.");
  expect(patches).toEqual([{schema_version:"ubu.orchestrator.task_capture.v1",expected_version:1,preconditions:{target:FACT,predicate:"absent"}}]);
});
it("membership accepts false but arrays objects and null cannot produce an unevaluable scalar leaf", async () => {
  const patches=stub();card();await editor(SET);fireEvent.change(screen.getByLabelText("Requirement"),{target:{value:"member_of"}});
  expect(screen.getByLabelText("Expected value")).toHaveAttribute("type","text");
  for(const value of ["null","[]","{}"]){fireEvent.change(screen.getByLabelText("Expected value"),{target:{value}});expect(screen.getByRole("button",{name:"Save precondition"})).toBeDisabled();}
  fireEvent.change(screen.getByLabelText("Expected value"),{target:{value:"false"}});fireEvent.click(screen.getByRole("button",{name:"Save precondition"}));await screen.findByText("Precondition saved.");
  expect(patches).toEqual([{schema_version:"ubu.orchestrator.task_capture.v1",expected_version:1,preconditions:{target:SET,predicate:"member_of",expected:false}}]);
});
it("empty vocabulary cannot save a leaf and read-only occurrences have no editing controls", async () => {
  pluginFetch.mockImplementation(async()=>json({...world,facts:{},numeric_values:{},set_memberships:{},event_markers:{}}));card();await editor();
  expect(screen.getByText(/No recorded targets/)).toBeInTheDocument();expect(screen.getByRole("button",{name:"Save precondition"})).toBeDisabled();
});
it("read-only occurrences display the requirement but cannot edit or clear it", () => {
  stub();card({target:FACT,predicate:"equals",expected:false},true);expect(screen.getByText(/Before this Task/)).toHaveTextContent(`${FACT} is false`);expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("expanded Tasks rows read their stored condition and update it without editing other fields", async () => {
  let condition: unknown={target:FACT,predicate:"equals",expected:true};let version=1;const patches:unknown[]=[];
  pluginFetch.mockImplementation(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(input.toString());
    if(url.pathname==="/tasks")return json({schema_version:"ubu.orchestrator.task_read.v1",status:"active",tasks:[{task_id:ID,title:"Synthetic teapot launch",status:"active",version,placement:"planned",is_routine_occurrence:false}]});
    if(url.pathname==="/universe-state")return json(world);
    if(url.pathname===`/task/${ID}`){if(init?.method==="PATCH"){const body=JSON.parse(String(init.body));patches.push(body);condition=body.preconditions;version+=1;return json({task_id:ID,version});}return json({task_id:ID,version,payload:{id:ID,title:"Synthetic teapot launch",tags:[],preconditions:condition}});}
    throw new Error(`Unexpected mocked request ${url.pathname}`);
  });
  render(<Tasks/>);const summary=await screen.findByText("Notes for Synthetic teapot launch");const details=summary.parentElement as HTMLDetailsElement;details.open=true;fireEvent(details,new Event("toggle"));
  await screen.findByText(/Before this Task/);await editor(NUMBER);fireEvent.change(screen.getByLabelText("Requirement"),{target:{value:"greater_than"}});fireEvent.change(screen.getByLabelText("Expected value"),{target:{value:"3"}});fireEvent.click(screen.getByRole("button",{name:"Save precondition"}));
  await waitFor(()=>expect(screen.getByText(/Before this Task/)).toHaveTextContent(`${NUMBER} is greater than 3`));
  expect(patches).toEqual([{schema_version:"ubu.orchestrator.task_capture.v1",expected_version:1,preconditions:{target:NUMBER,predicate:"greater_than",expected:3}}]);
});
