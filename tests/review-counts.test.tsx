import { fireEvent,render,screen,waitFor,within } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import { Review } from "../src/routes/Review";
const pluginFetch=vi.hoisted(()=>vi.fn());vi.mock("@tauri-apps/plugin-http",()=>({fetch:pluginFetch}));
function json(body:unknown){return new Response(JSON.stringify(body),{headers:{"Content-Type":"application/json"}});}
function stub(notes:(producer:string)=>Array<{code:string;message:string}>){
 pluginFetch.mockImplementation(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const path=new URL(input.toString()).pathname;
  if(path==="/advisory/queue")return json({state_category:"candidate_state",candidates:[],deferred_candidates:[],target_titles:{}});
  if(path==="/tasks")return json({status:"active",tasks:[]});
  if(path==="/advisory/run"&&init?.method==="POST"){const {producer}=JSON.parse(String(init.body));return json({status:"ok",selected:[],candidates_enqueued:0,candidate_ids:[],report:null,diagnostics:notes(producer)});}
  throw new Error(`Unexpected mocked request ${path}`);
 });
}
async function open(){render(<Review onOpenSetup={vi.fn()}/>);await waitFor(()=>expect(screen.getByRole("button",{name:"Run precondition advisor"})).toBeEnabled());}
afterEach(()=>{pluginFetch.mockReset();expect(globalThis.fetch).not.toHaveBeenCalled();});
it("eight Review diagnostics have one selectable count line with both code counts",async()=>{
 const diagnostics=Array.from({length:8},(_,n)=>({code:n<5?"precondition_missing_targets":"precondition_proposal_refused",message:`Synthetic refusal ${n}`}));stub(()=>diagnostics);await open();
 fireEvent.click(screen.getByRole("button",{name:"Run precondition advisor"}));const result=await screen.findByRole("region",{name:"Precondition advisor result"});
 const line=within(result).getByLabelText("Diagnostic counts");expect(line).toHaveTextContent("Diagnostic counts: precondition_missing_targets 5, precondition_proposal_refused 3.");
 expect(within(result).getAllByText(/Synthetic refusal/)).toHaveLength(8);expect(within(result).queryByRole("alert")).not.toBeInTheDocument();
});
it("independent producer results share one latest four-line selection report",async()=>{
 const notes=Array.from({length:4},(_,n)=>({code:"advisory_task_skipped",message:n<3?`Synthetic skipped Task ${n}`:"5 more Tasks were skipped: they are routine occurrences or have neither a title nor a description"}));
 stub(producer=>[...notes,{code:`${producer}_proposal_refused`,message:`Synthetic ${producer} refusal`}]);await open();
 fireEvent.click(screen.getByRole("button",{name:"Run vocabulary advisor"}));await screen.findByRole("region",{name:"Vocabulary advisor result"});await waitFor(()=>expect(screen.getByRole("button",{name:"Run precondition advisor"})).toBeEnabled());
 fireEvent.click(screen.getByRole("button",{name:"Run precondition advisor"}));await screen.findByRole("region",{name:"Precondition advisor result"});
 const shared=screen.getByRole("region",{name:"Latest Task selection notes"});expect(within(shared).getByLabelText("Diagnostic counts")).toHaveTextContent("Diagnostic counts: advisory_task_skipped 4.");
 expect(screen.getAllByText("Synthetic skipped Task 0")).toHaveLength(1);expect(screen.getAllByText(/5 more Tasks/)).toHaveLength(1);
 for(const name of ["Vocabulary advisor result","Precondition advisor result"]){const result=screen.getByRole("region",{name});expect(result).not.toHaveTextContent("advisory_task_skipped");expect(result).toHaveTextContent("proposal_refused 1.");}
 expect(screen.getByText("Synthetic vocabulary refusal")).toBeInTheDocument();expect(screen.getByText("Synthetic precondition refusal")).toBeInTheDocument();
});
it("a newer selection with no skipped Tasks clears the old snapshot",async()=>{
 stub(producer=>producer==="vocabulary"?[{code:"advisory_task_skipped",message:"Synthetic stale selection"}]:[]);await open();
 fireEvent.click(screen.getByRole("button",{name:"Run vocabulary advisor"}));await screen.findByText("Synthetic stale selection");await waitFor(()=>expect(screen.getByRole("button",{name:"Run precondition advisor"})).toBeEnabled());
 fireEvent.click(screen.getByRole("button",{name:"Run precondition advisor"}));await screen.findByRole("region",{name:"Precondition advisor result"});expect(screen.queryByText("Synthetic stale selection")).not.toBeInTheDocument();expect(screen.queryByRole("region",{name:"Latest Task selection notes"})).not.toBeInTheDocument();
});
it("the untouched SuggestTags list keeps its original rendering without a count line",async()=>{
 stub(()=>[{code:"suggest_tags_occurrence_skipped",message:"Synthetic occurrence is skipped"}]);await open();fireEvent.click(screen.getByRole("button",{name:"Run"}));
 const result=await screen.findByRole("region",{name:"Advisory run result"});expect(within(result).getByText("Synthetic occurrence is skipped")).toBeInTheDocument();expect(within(result).queryByLabelText("Diagnostic counts")).not.toBeInTheDocument();
});
