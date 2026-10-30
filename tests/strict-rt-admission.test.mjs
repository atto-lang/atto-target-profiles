import test from "node:test";
import assert from "node:assert/strict";
import {assessStrictRealtimeTarget as assess} from "../src/strict-rt-admission.mjs";

const clean=()=>({
 schemaVersion:1,profile:"llvm-aot-rt-strict",
 identity:{sourceTreeSha1:"a".repeat(40),compilerSha256:"b".repeat(64),
  artifactSha256:"c".repeat(64),board:"cortex-m7-test",
  rtos:"zephyr-pinned",configSha256:"d".repeat(64)},
 budget:{periodUs:10000,deadlineUs:8000,wcetUs:6000,releaseJitterUs:500,
   blockingUs:100,stackBytes:16384,arenaBytes:65536,mailboxSlots:32,
   controlCredits:4,maxConcurrentHandlers:1},
 closure:{guestFullyCompiled:true,closedFfiGraph:true,noTracingGc:true,
   noPostBootAlloc:true,noInterpreter:true,noUnboundedLoop:true,
   cleanupBounded:true,unknownEffects:false,qualificationEvidenceReviewed:true}
});
test("qualifying metadata is only an independent-review candidate",()=>{
 const r=assess(clean());assert.equal(r.ok,true);assert.equal(r.classification,"CANDIDATE_REVIEW_REQUIRED");
});
test("deadline admission accounts for all three bounded worst-case terms",()=>{
 const x=clean();x.budget.wcetUs=7600;
 assert.equal(assess(x).ok,false);
 x.budget.wcetUs=7400;
 assert.equal(assess(x).ok,true);
});
test("Graal native-image and unsupported backend cannot masquerade as hard RT",()=>{
 for(const profile of ["graalvm-native-image","wasm-hard-rt","unknown"]) {
  const x=clean();x.profile=profile;assert.equal(assess(x).ok,false);
 }
});
test("unknown FFI/heap, dynamic guest code and missing review fail closed",()=>{
 for(const key of ["closedFfiGraph","noPostBootAlloc","noInterpreter",
    "noTracingGc","cleanupBounded","qualificationEvidenceReviewed"]) {
  const x=clean();x.closure[key]=false;assert.equal(assess(x).ok,false);
 }
 const x=clean();x.closure.unknownEffects=true;assert.equal(assess(x).ok,false);
});
test("bounded actor resources reject zero, oversized and parallel critical state",()=>{
 for(const patch of [{mailboxSlots:0},{maxConcurrentHandlers:2},{releaseJitterUs:-1},
  {wcetUs:Number.MAX_SAFE_INTEGER},{periodUs:999},{arenaBytes:0}]) {
  const x=clean();Object.assign(x.budget,patch);assert.equal(assess(x).ok,false);
 }
});
test("hostile objects, missing hashes, inherited fields and extensions denied",()=>{
 for(const x of [Object.create(clean()), {...clean(),releaseCertified:true},
  {...clean(),identity:{...clean().identity,configSha256:null}},
  {...clean(),closure:{...clean().closure,unknownEffects:"false"}}]) {
  assert.equal(assess(x).ok,false);
 }
 let called=0;const x=clean();Object.defineProperty(x,"budget",{
  enumerable:true,get(){called++;return clean().budget}});
 assert.equal(assess(x).ok,false);assert.equal(called,0);
});
