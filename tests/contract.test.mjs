import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {validateRegistry,validateClosure} from "../src/contract.mjs";
import {loadProfiles} from "../src/load-registry.mjs";
const profiles=await loadProfiles();
const good={schemaVersion:1,entry:"app",target:"browser",backend:"wasm",grants:["clock","net.client"],nodes:[{id:"app",targets:["browser","server"],requires:["clock","net.client"],imports:["dep"]},{id:"dep",targets:["browser","server"],requires:["net.client"],imports:[]}]};
const check=data=>validateClosure(data,profiles);
test("eight versioned target profiles conform to vocabulary",()=>assert.deepEqual(validateRegistry(profiles),{ok:true,errors:[]}));
test("portable graph passes",()=>assert.equal(check(good).ok,true));
test("cycles terminate safely when both directions declare transitive requirements",()=>assert.equal(check({...good,nodes:[good.nodes[0],{...good.nodes[1],requires:good.nodes[0].requires,imports:["app"]}]}).ok,true));
test("import target coverage is checked across all promised targets",()=>{const r=check({...good,nodes:[good.nodes[0],{...good.nodes[1],targets:["browser"]}]});assert.match(r.errors.join("\n"),/imported targets/)});
test("dependency cannot escalate declared effects",()=>{const r=check({...good,nodes:[good.nodes[0],{...good.nodes[1],requires:["net.server"]}]});assert.match(r.errors.join("\n"),/requirements/)});
test("capability budget cannot exceed host profile",()=>{const r=check({...good,grants:["interop.java"]});assert.match(r.errors.join("\n"),/grant unavailable/)});
test("build must grant all transitive effects",()=>{const r=check({...good,grants:["net.client"]});assert.match(r.errors.join("\n"),/missing build grants/)});
test("unknown imports, target and backend fail closed",()=>{for(const changed of [{...good,target:"anywhere"},{...good,backend:"dex"},{...good,nodes:[{...good.nodes[0],imports:["missing"]},good.nodes[1]]}])assert.equal(check(changed).ok,false)});
test("duplicate/unknown capabilities and unreachable units rejected",()=>{for(const changed of [{...good,grants:["clock","clock"]},{...good,grants:["clock","superuser"]},{...good,nodes:[...good.nodes,{id:"extra",targets:["server"],requires:[],imports:[]}]}])assert.equal(check(changed).ok,false)});
test("CLI examples run",()=>{const cli=new URL("../bin/oreslang-target.mjs",import.meta.url).pathname;const fixture=new URL("../examples/portable-closure.json",import.meta.url).pathname;const p=spawnSync(process.execPath,[cli,"check-closure",fixture,"--target=browser","--backend=wasm","--grants=clock,net.client"],{encoding:"utf8"});assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/2 units/)});

test("graph schema and backend must be explicit",()=>{
 assert.match(check({...good,schemaVersion:2}).errors.join("\n"),/schemaVersion/);
 assert.match(check({...good,backend:undefined}).errors.join("\n"),/backend/);
});
test("deep linear import chains do not overflow the verifier",()=>{
 const n=3000;
 const nodes=Array.from({length:n},(_,i)=>({id:"unit"+i,targets:["browser"],requires:[],imports:i===n-1?[]:["unit"+(i+1)]}));
 const r=check({...good,entry:"unit0",grants:[],nodes});
 assert.equal(r.ok,true,r.errors.join("; "));
 assert.equal(r.visited,n);
});
test("oversized graph and excessive fanout are refused",()=>{
 assert.match(check({...good,nodes:Array.from({length:4097},(_,i)=>({id:"unit"+i,targets:["browser"],requires:[],imports:[]}))}).errors.join("\n"),/4096/);
 assert.match(check({...good,nodes:[{...good.nodes[0],imports:Array.from({length:257},(_,i)=>"x"+i)},good.nodes[1]]}).errors.join("\n"),/excessive/);
});

test("invalid top-level closures fail closed without throwing",()=>{
 for(const invalid of [null,undefined,17,"graph",[],{}]){
  const r=check(invalid);
  assert.equal(r.ok,false);
  assert.ok(r.errors.length>0);
 }
});
test("unknown fields and inherited missing required fields fail closed",()=>{
 assert.match(check({...good,unreviewedEffects:["fs.write"]}).errors.join("\\n"),/unknown resolved graph property/);
 const inherited=Object.create(good);
 assert.match(check(inherited).errors.join("\\n"),/missing resolved graph property/);
});
test("registry notes must match the JSON schema's string contract",()=>{
 const altered=profiles.map(x=>({...x}));
 altered[0].notes={unsafe:"nonstring"};
 assert.match(validateRegistry(altered).errors.join("\\n"),/notes must be a string/);
});


test("registry profiles require own authorization declarations",()=>{
 const inherited=profiles.map(x=>({...x}));
 inherited[0]=Object.create(profiles[0]);
 const result=validateRegistry(inherited);
 assert.equal(result.ok,false);
 assert.match(result.errors.join("\n"),/missing own registry fields/);
});
test("graph nodes cannot inherit capabilities or identities",()=>{
 const r=check({...good,nodes:[Object.create(good.nodes[0]),good.nodes[1]]});
 assert.equal(r.ok,false);
 assert.match(r.errors.join("\n"),/missing own node fields/);
});
test("inherited optional build grants cannot authorize graph",()=>{
 const graph=Object.assign(Object.create({grants:["clock","net.client"]}),{
  schemaVersion:1,nodes:good.nodes,entry:"app",target:"browser",backend:"wasm"
 });
 const denied=check(graph);
 assert.equal(denied.ok,false);
 assert.match(denied.errors.join("\n"),/missing build grants/);
 assert.equal(check({...graph,grants:["clock","net.client"]}).ok,true);
});
test("sparse lists and inherited array slots fail closed",()=>{
 const hole=Array(1);
 for(const changed of [
  {...good,grants:hole},
  {...good,nodes:[{...good.nodes[0],requires:hole},good.nodes[1]]},
  {...good,nodes:[{...good.nodes[0],imports:hole},good.nodes[1]]},
  {...good,nodes:[{...good.nodes[0],targets:hole},good.nodes[1]]},
 ])assert.equal(check(changed).ok,false);
 const registry=profiles.map(x=>({...x}));
 registry[0].capabilities=hole;
 assert.equal(validateRegistry(registry).ok,false);
 const inheritedIndex=Array(1);
 const proto=Object.create(Array.prototype);
 proto[0]="clock";
 Object.setPrototypeOf(inheritedIndex,proto);
 assert.equal(check({...good,grants:inheritedIndex}).ok,false);
});

test("method-shadowing grants cannot authorize ungranted dependency effects",()=>{
 const grants=["clock"];
 grants.includes=()=>true;
 assert.equal(check({...good,grants}).ok,false);
 const inheritedMethod=["clock"];
 Object.setPrototypeOf(inheritedMethod,Object.assign(Object.create(Array.prototype),{includes:()=>true}));
 assert.equal(check({...good,grants:inheritedMethod}).ok,false);
});
test("shadowed every cannot forge requirements or hide graph nodes",()=>{
 const fakeRequires=["net.client"];
 fakeRequires.every=()=>true;
 const forged={...good,grants:["clock"],nodes:[
  {...good.nodes[0],requires:fakeRequires,imports:[]}
 ]};
 assert.equal(check(forged).ok,false);
 const nodes=[
  {id:"app",targets:["browser"],requires:[],imports:[]},
  {id:"hidden",targets:["server"],requires:["interop.java"],imports:[]}
 ];
 nodes.entries=function*(){yield [0,nodes[0]]};
 assert.equal(check({...good,grants:[],nodes}).ok,false);
});
test("accessor-supplied authority cannot change across validation phases",()=>{
 const grants=["clock"];Object.defineProperty(grants,"0",{get(){return "clock"},enumerable:true,configurable:true});
 assert.equal(check({...good,grants}).ok,false);
 const graph={...good};
 Object.defineProperty(graph,"grants",{enumerable:true,get(){return ["clock","net.client"]}});
 assert.equal(check(graph).ok,false);
 const node={...good.nodes[0]};
 Object.defineProperty(node,"requires",{enumerable:true,get(){return ["clock","net.client"]}});
 assert.equal(check({...good,nodes:[node,good.nodes[1]]}).ok,false);
});


test("accessor-backed grants are never executed or admitted",()=>{
 let called=0;
 const hostile={...good};
 Object.defineProperty(hostile,"grants",{enumerable:true,get(){called++;return ["clock","net.client"]}});
 const result=check(hostile);
 assert.equal(result.ok,false);
 assert.match(result.errors.join("\\n"),/resolved graph must be an object/);
 assert.equal(called,0);
});
test("accessor-backed required graph and node fields fail before evaluation",()=>{
 let called=0;
 const hostile={...good};
 Object.defineProperty(hostile,"nodes",{enumerable:true,get(){called++;return good.nodes}});
 const graph=check(hostile);
 assert.equal(graph.ok,false);
 assert.match(graph.errors.join("\\n"),/resolved graph must be an object/);
 const node={...good.nodes[0]};
 Object.defineProperty(node,"requires",{enumerable:true,get(){called++;return []}});
 const result=check({...good,nodes:[node,good.nodes[1]]});
 assert.equal(result.ok,false);
 assert.match(result.errors.join("\\n"),/expected plain data object/);
 assert.equal(called,0);
});
test("accessor-backed profile capabilities and optional notes cannot execute",()=>{
 let called=0;
 const registry=profiles.map(p=>({...p}));
 Object.defineProperty(registry[0],"capabilities",{enumerable:true,get(){called++;return []}});
 const required=validateRegistry(registry);
 assert.equal(required.ok,false);
 assert.match(required.errors.join("\\n"),/expected plain data object/);
 const registry2=profiles.map(p=>({...p}));
 Object.defineProperty(registry2[0],"notes",{enumerable:true,get(){called++;return "injected"}});
 const optional=validateRegistry(registry2);
 assert.equal(optional.ok,false);
 assert.match(optional.errors.join("\\n"),/expected plain data object/);
 assert.equal(called,0);
});
