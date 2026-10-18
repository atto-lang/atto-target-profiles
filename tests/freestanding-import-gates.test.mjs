// Regression vectors for freestanding core/alloc/stdlib import isolation.
// Issues #14 and #21: all transitive grants must come from the target profile.
import test from "node:test";
import assert from "node:assert/strict";
import {loadProfiles} from "../src/load-registry.mjs";
import {validateClosure} from "../src/contract.mjs";
const registry=await loadProfiles();
const graph={schemaVersion:1,entry:"firmware",target:"embedded",backend:"llvm",grants:[],nodes:[
 {id:"firmware",targets:["embedded"],requires:[],imports:["core"]},
 {id:"core",targets:["embedded"],requires:[],imports:[]}
]};
const verdict=x=>validateClosure(x,registry);
test("freestanding core-only closed import graph needs no OS grants",()=>{
 const v=verdict(graph);assert.equal(v.ok,true,v.errors.join("; "));
});
test("an imported network capability cannot be hidden behind an empty top-level grant",()=>{
 const bad={...graph,nodes:[graph.nodes[0],{...graph.nodes[1],requires:["net.client"]}]};
 const v=verdict(bad);assert.equal(v.ok,false);assert.ok(v.errors.length);
});
test("disallowed interop and tracing-GC grants remain unavailable on embedded",()=>{
 for(const forbidden of ["interop.native","interop.java","gc","threads"]){
  const v=verdict({...graph,grants:[forbidden]});
  assert.equal(v.ok,false,forbidden);assert.match(v.errors.join("; "),/capability grant unavailable/);
 }
});
test("embedded import cannot silently acquire an unrelated hosted target",()=>{
 const bad={...graph,nodes:[graph.nodes[0],{...graph.nodes[1],targets:["server"]}]};
 assert.equal(verdict(bad).ok,false);
});
test("hardware-only profile cannot admit runtime heap or backend substitution",()=>{
 const asic={...graph,target:"asic",backend:"hdl",nodes:graph.nodes.map(n=>({...n,targets:["asic"]}))};
 assert.equal(verdict(asic).ok,true,verdict(asic).errors.join("; "));
 assert.equal(verdict({...asic,grants:["heap"]}).ok,false);
 assert.equal(verdict({...asic,backend:"llvm"}).ok,false);
});
