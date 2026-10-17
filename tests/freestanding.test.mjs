import test from "node:test";
import assert from "node:assert/strict";
import {validateFreestandingClosure as verify} from "../src/freestanding.mjs";

const scalar={id:"core/math",layer:"core",requires:[],imports:[]};
const core={schemaVersion:1,target:"freestanding-core",backend:"llvm",entry:scalar.id,grants:[],nodes:[scalar]};
const actorProviders=["executor","mailbox.bounded","control.auth"];
const actor={id:"actor/runtime",layer:"actor",requires:actorProviders,imports:[]};
const otp={id:"otp/supervisor",layer:"otp",requires:actorProviders,imports:[actor.id]};
const source=(target,entry,grants,nodes)=>({schemaVersion:1,target,backend:"llvm",entry,grants,nodes});

test("true effect-free core without alloc/OS/actor providers passes",()=>{
 assert.deepEqual(verify(core),{ok:true,errors:[],visited:1});
});
test("core cannot reach actor, alloc, OTP or hosted module transitively",()=>{
 for(const l of ["actor","alloc","otp","host"]){
  const dep={id:"dep",layer:l,requires:[],imports:[]};
  const invalid={...scalar,imports:["dep"]};
  const r=verify(source("freestanding-core",scalar.id,[],[invalid,dep]));
  assert.equal(r.ok,false,l);
  assert.match(r.errors.join("\n"),/forbidden layer/);
 }
});
test("static bounded actor without heap is admitted only with explicit capabilities",()=>{
 const r=verify(source("freestanding-actor",actor.id,actorProviders,[actor]));
 assert.equal(r.ok,true,r.errors.join("; "));
 for(const grant of actorProviders){
  const grants=actorProviders.filter(x=>x!==grant);
  assert.equal(verify(source("freestanding-actor",actor.id,grants,[actor])).ok,false);
 }
});
test("OTP imports actor without Linux and optional allocator",()=>{
 const r=verify(source("freestanding-otp",otp.id,actorProviders,[otp,actor]));
 assert.equal(r.ok,true,r.errors.join("; "));
 const alloc={id:"alloc/arena",layer:"alloc",requires:["memory.explicit"],imports:[]};
 const withAlloc={...otp,requires:[...actorProviders,"memory.explicit"],imports:[actor.id,alloc.id]};
 const a=verify(source("freestanding-otp",withAlloc.id,[...actorProviders,"memory.explicit"],[withAlloc,actor,alloc]));
 assert.equal(a.ok,true,a.errors.join("; "));
});
test("monotonic clock is only usable through explicit effect and grant",()=>{
 const clocked={...otp,requires:[...actorProviders,"clock.monotonic"]};
 assert.equal(verify(source("freestanding-otp",otp.id,actorProviders,[clocked,actor])).ok,false);
 assert.equal(verify(source("freestanding-otp",otp.id,[...actorProviders,"clock.monotonic"],[clocked,actor])).ok,true);
});
test("source cannot import undeclared effects or host adapters",()=>{
 const forbidden={id:"host/files",layer:"host",requires:["os.filesystem"],imports:[]};
 const application={...otp,imports:[actor.id,forbidden.id]};
 assert.equal(verify(source("freestanding-otp",otp.id,[...actorProviders,"os.filesystem"],[application,actor,forbidden])).ok,false);
 const hidden={...otp,requires:[],imports:[actor.id]};
 assert.match(verify(source("freestanding-otp",otp.id,actorProviders,[hidden,actor])).errors.join("\n"),/imported effect/);
});
test("unknown provider, unused grant, unresolved dependency and unreachable units fail",()=>{
 assert.equal(verify({...core,grants:["unknown"]}).ok,false);
 assert.equal(verify(source("freestanding-otp",scalar.id,["clock.monotonic"],[scalar])).ok,false);
 assert.equal(verify({...core,nodes:[{...scalar,imports:["missing"]}]}).ok,false);
 assert.equal(verify({...core,nodes:[scalar,{id:"extra",layer:"core",requires:[],imports:[]}]}).ok,false);
});
test("malicious host objects, proxies, accessor fields and sparse arrays fail closed",()=>{
 const getter={...core};
 Object.defineProperty(getter,"grants",{get(){throw Error("must not execute")},enumerable:true});
 assert.equal(verify(getter).ok,false);
 assert.equal(verify(new Proxy(core,{})).ok,false);
 const grants=Array(1);
 assert.equal(verify({...core,grants}).ok,false);
 const nodes=[scalar];nodes.every=()=>true;
 assert.equal(verify({...core,nodes}).ok,false);
});
test("import cycles terminate and effect constraints still apply",()=>{
 const a={id:"a",layer:"core",requires:[],imports:["b"]};
 const b={id:"b",layer:"core",requires:[],imports:["a"]};
 const r=verify(source("freestanding-core","a",[],[a,b]));
 assert.equal(r.ok,true,r.errors.join("; "));
 assert.equal(r.visited,2);
});
