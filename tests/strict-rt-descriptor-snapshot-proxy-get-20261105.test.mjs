import test from 'node:test';
import assert from 'node:assert/strict';
import {assessStrictRealtimeTarget} from '../src/strict-rt-admission.mjs';
const fixture=()=>({
 schemaVersion:1,profile:'llvm-aot-rt-strict',
 identity:{sourceTreeSha1:'a'.repeat(40),compilerSha256:'b'.repeat(64),artifactSha256:'c'.repeat(64),board:'cortex-m7',rtos:'zephyr',configSha256:'d'.repeat(64)},
 budget:{periodUs:10000,deadlineUs:8000,wcetUs:6000,releaseJitterUs:500,blockingUs:100,stackBytes:16384,arenaBytes:65536,mailboxSlots:16,controlCredits:4,maxConcurrentHandlers:1},
 closure:{guestFullyCompiled:true,closedFfiGraph:true,noTracingGc:true,noPostBootAlloc:true,noInterpreter:true,noUnboundedLoop:true,cleanupBounded:true,unknownEffects:false,qualificationEvidenceReviewed:true}
});
test('valid plain manifest remains review-only',()=>{
 assert.deepEqual(assessStrictRealtimeTarget(fixture()),{ok:true,classification:'CANDIDATE_REVIEW_REQUIRED',errors:[]});
});
test('a top-level Proxy get trap cannot execute during descriptor checking or field reading',()=>{
 let gets=0;
 const p=new Proxy(fixture(),{get(t,k){gets++;return Reflect.get(t,k);}});
 assert.equal(assessStrictRealtimeTarget(p).classification,'CANDIDATE_REVIEW_REQUIRED');
 assert.equal(gets,0);
});
test('nested Proxy get trap cannot execute',()=>{
 let gets=0;
 const f=fixture();
 f.identity=new Proxy(f.identity,{get(t,k){gets++;return Reflect.get(t,k);}});
 f.budget=new Proxy(f.budget,{get(t,k){gets++;return Reflect.get(t,k);}});
 f.closure=new Proxy(f.closure,{get(t,k){gets++;return Reflect.get(t,k);}});
 assert.equal(assessStrictRealtimeTarget(f).classification,'CANDIDATE_REVIEW_REQUIRED');
 assert.equal(gets,0);
});
test('attacker get trap cannot forge candidate eligibility after descriptor validation',()=>{
 let gets=0;
 const f=fixture();f.schemaVersion=0;
 const p=new Proxy(f,{get(t,k){gets++;return k==='schemaVersion'?1:Reflect.get(t,k);}});
 const result=assessStrictRealtimeTarget(p);
 assert.equal(result.ok,false);
 assert.equal(result.classification,'DENIED');
 assert.equal(gets,0);
});
test('own accessor getters never execute and are denied',()=>{
 let getters=0;
 const f=fixture();
 Object.defineProperty(f.budget,'deadlineUs',{enumerable:true,get(){getters++;return 8000;}});
 assert.equal(assessStrictRealtimeTarget(f).classification,'DENIED');
 assert.equal(getters,0);
});
test('symbols, hidden own fields, arrays and null prototypes still denied',()=>{
 for(const place of ['top','identity','budget','closure']){
  const f=fixture();const x=place==='top'?f:f[place];
  Object.defineProperty(x,'hidden',{value:1,enumerable:false});
  assert.equal(assessStrictRealtimeTarget(f).ok,false,place);
 }
 const s=fixture();s.identity[Symbol('authority')]=true;
 assert.equal(assessStrictRealtimeTarget(s).ok,false);
 assert.equal(assessStrictRealtimeTarget([]).ok,false);
 assert.equal(assessStrictRealtimeTarget(Object.create(null)).ok,false);
});
test('invalid quotas and unreviewed evidence remain denied',()=>{
 const bad=fixture();bad.budget.wcetUs=9000;
 assert.equal(assessStrictRealtimeTarget(bad).ok,false);
 const bad2=fixture();bad2.closure.qualificationEvidenceReviewed=false;
 assert.equal(assessStrictRealtimeTarget(bad2).ok,false);
});
