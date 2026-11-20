import test from 'node:test';
import assert from 'node:assert/strict';
import {assessStrictRealtimeTarget as assess} from '../src/strict-rt-admission.mjs';

function candidate(){return{
  schemaVersion:1,profile:'llvm-aot-rt-strict',
  identity:{sourceTreeSha1:'a'.repeat(40),compilerSha256:'b'.repeat(64),artifactSha256:'c'.repeat(64),
    configSha256:'d'.repeat(64),board:'cortex-m7',rtos:'zephyr'},
  budget:{periodUs:10000,deadlineUs:10000,wcetUs:9000,releaseJitterUs:500,blockingUs:500,
    stackBytes:1024,arenaBytes:1024,mailboxSlots:1,controlCredits:1,maxConcurrentHandlers:1},
  closure:{guestFullyCompiled:true,closedFfiGraph:true,noTracingGc:true,noPostBootAlloc:true,
    noInterpreter:true,noUnboundedLoop:true,cleanupBounded:true,unknownEffects:false,
    qualificationEvidenceReviewed:true}
}}

test('exact maximum-safe-integer budget equality is admitted as a review candidate only',()=>{
  const p=candidate(),m=Number.MAX_SAFE_INTEGER;
  Object.assign(p.budget,{periodUs:m,deadlineUs:m,wcetUs:m-3,releaseJitterUs:1,blockingUs:2});
  const r=assess(p);
  assert.equal(r.ok,true);
  assert.equal(r.classification,'CANDIDATE_REVIEW_REQUIRED');
  assert.equal(r.errors.length,0);
});

test('sum just above max-safe deadline is denied rather than rounded into equality',()=>{
  const p=candidate(),m=Number.MAX_SAFE_INTEGER;
  Object.assign(p.budget,{periodUs:m,deadlineUs:m,wcetUs:m-3,releaseJitterUs:2,blockingUs:2});
  const r=assess(p);
  assert.equal(r.ok,false);
  assert.equal(r.classification,'DENIED');
  assert.match(r.errors.join(' '),/WCET/);
});

test('deadline longer than period is denied even with a tiny WCET',()=>{
  const p=candidate();
  Object.assign(p.budget,{periodUs:9999,deadlineUs:10000,wcetUs:1,releaseJitterUs:0,blockingUs:0});
  assert.equal(assess(p).classification,'DENIED');
});
