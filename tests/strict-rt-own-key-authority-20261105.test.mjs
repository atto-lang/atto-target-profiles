// Host-only metadata checks. Structural candidate review is never WCET certification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assessStrictRealtimeTarget} from '../src/strict-rt-admission.mjs';

const fixture=()=>({
  schemaVersion:1,profile:'llvm-aot-rt-strict',
  identity:{sourceTreeSha1:'a'.repeat(40),compilerSha256:'b'.repeat(64),
    artifactSha256:'c'.repeat(64),board:'cortex-m7',rtos:'zephyr',
    configSha256:'d'.repeat(64)},
  budget:{periodUs:10000,deadlineUs:8000,wcetUs:6000,releaseJitterUs:500,
    blockingUs:100,stackBytes:16384,arenaBytes:65536,mailboxSlots:16,
    controlCredits:4,maxConcurrentHandlers:1},
  closure:{guestFullyCompiled:true,closedFfiGraph:true,noTracingGc:true,
    noPostBootAlloc:true,noInterpreter:true,noUnboundedLoop:true,
    cleanupBounded:true,unknownEffects:false,qualificationEvidenceReviewed:true}
});

test('minimal exact candidate stays review-only, never certified',()=>{
  const result=assessStrictRealtimeTarget(fixture());
  assert.deepEqual(result,{ok:true,classification:'CANDIDATE_REVIEW_REQUIRED',errors:[]});
});

test('hidden metadata cannot be smuggled into top-level or nested RT manifests',()=>{
  for(const location of ['top','identity','budget','closure']){
    const item=fixture();
    const target=location==='top'?item:item[location];
    Object.defineProperty(target,'hidden',{enumerable:false,value:'admin'});
    const r=assessStrictRealtimeTarget(item);
    assert.equal(r.ok,false,location);
    assert.equal(r.classification,'DENIED',location);
  }
});

test('symbol keys are denied and accessor getters never run',()=>{
  let called=0;
  for(const location of ['top','identity','budget','closure']){
    const item=fixture();
    const target=location==='top'?item:item[location];
    Object.defineProperty(target,Symbol('authority'),{value:true,enumerable:true});
    assert.equal(assessStrictRealtimeTarget(item).ok,false,location);
  }
  const item=fixture();
  Object.defineProperty(item.budget,'deadlineUs',{enumerable:true,
    get(){called++;throw Error('getter executed');}});
  assert.equal(assessStrictRealtimeTarget(item).ok,false);
  assert.equal(called,0);
});
