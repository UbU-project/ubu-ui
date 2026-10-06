import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UniverseState } from "../src/routes/UniverseState";
import type { UniverseStateResponse } from "../src/api/client";
const pluginFetch=vi.hoisted(()=>vi.fn());vi.mock("@tauri-apps/plugin-http",()=>({fetch:pluginFetch}));
const NOW="2026-10-06T08:00:00Z";
function json(body:unknown){return new Response(JSON.stringify(body),{headers:{"Content-Type":"application/json"}});}
async function open(){
 let world:UniverseStateResponse={schema_version:"ubu.orchestrator.universe_state.v1",id:"universe_state_018f3c8e9b2a7c4d8f1e2a3b4c5d6e70",version:1,captured_at:NOW,facts:{},numeric_values:{},set_memberships:{},event_markers:{},fact_provenance:{},source_summary:"Synthetic laboratory teapot",confidence_summary:null};
 const edits:Array<Record<string,unknown>>=[];
 pluginFetch.mockImplementation(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(new URL(input.toString()).pathname === "/settings") return json({settings:[{name:"universe.subject.synthetic",value:true}],palette:[],inverse:[]});
  expect(new URL(input.toString()).pathname).toBe("/universe-state");
  if(init?.method==="PATCH"){
   const body=JSON.parse(String(init.body));const mutation=body.mutations[0];edits.push(mutation);
   const key=mutation.target.split('.').slice(1).join('.');
   world={...world,version:(world.version??0)+1, facts:mutation.operation==="set_fact"?{...world.facts,[key]:mutation.payload}:world.facts,numeric_values:mutation.operation==="set_numeric"?{...world.numeric_values,[key]:mutation.payload}:world.numeric_values,fact_provenance:{...world.fact_provenance,[mutation.target]:{kind:mutation.provenance_kind??"asserted",recorded_at:NOW}}};
  }
  return json(world);
 });
 render(<UniverseState/>);await screen.findByLabelText("Entries in each collection");return edits;
}
afterEach(()=>{pluginFetch.mockReset();expect(globalThis.fetch).not.toHaveBeenCalled();});
for(const kind of ["fact","number"] as const){
 it(`${kind} defaults to My assertion and omits provenance_kind`,async()=>{
  const edits=await open();const form=screen.getByRole("form",{name:kind==="fact"?"Set a fact":"Set a number"});
  const choice=within(form).getByLabelText(`How this ${kind} was established`);
  expect(choice).toHaveValue("asserted");expect(within(choice).getAllByRole("option").map(o=>o.textContent)).toEqual(["My assertion","A reading"]);
  fireEvent.change(within(form).getByLabelText(kind==="fact"?"Fact subject":"Number subject"),{target:{value:"synthetic"}});
  fireEvent.change(within(form).getByLabelText(kind==="fact"?"Fact predicate":"Number predicate"),{target:{value:"teapot"}});
  fireEvent.change(within(form).getByLabelText(kind==="fact"?"Fact value":"Number value"),{target:{value:kind==="fact"?"false":"0"}});
  fireEvent.click(within(form).getByRole("button",{name:kind==="fact"?"Set fact":"Set number"}));
  const row=await screen.findByRole("row",{name:`${kind==="fact"?"facts":"numeric_values"}.synthetic.teapot`});expect(within(row).getByText("asserted")).toBeInTheDocument();
  expect(edits).toEqual([{operation:kind==="fact"?"set_fact":"set_numeric",target:`${kind==="fact"?"facts":"numeric_values"}.synthetic.teapot`,payload:kind==="fact"?false:0}]);
 });
 it(`${kind} reading sends measured and the returned entry displays it`,async()=>{
  const edits=await open();const form=screen.getByRole("form",{name:kind==="fact"?"Set a fact":"Set a number"});
  const choice=within(form).getByLabelText(`How this ${kind} was established`);
  fireEvent.change(choice,{target:{value:"measured"}});
  fireEvent.change(within(form).getByLabelText(kind==="fact"?"Fact subject":"Number subject"),{target:{value:"synthetic"}});
  fireEvent.change(within(form).getByLabelText(kind==="fact"?"Fact predicate":"Number predicate"),{target:{value:"teapot"}});
  fireEvent.change(within(form).getByLabelText(kind==="fact"?"Fact value":"Number value"),{target:{value:kind==="fact"?"true":"2.5"}});
  fireEvent.click(within(form).getByRole("button",{name:kind==="fact"?"Set fact":"Set number"}));
  const row=await screen.findByRole("row",{name:`${kind==="fact"?"facts":"numeric_values"}.synthetic.teapot`});expect(within(row).getByText("measured")).toBeInTheDocument();
  expect(edits).toEqual([{operation:kind==="fact"?"set_fact":"set_numeric",target:`${kind==="fact"?"facts":"numeric_values"}.synthetic.teapot`,payload:kind==="fact"?true:2.5,provenance_kind:"measured"}]);
  expect(choice).toHaveValue("asserted");expect(screen.getByText(/the choice is yours/)).toBeInTheDocument();
 });
}
