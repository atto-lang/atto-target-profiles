import test from 'node:test';
import assert from 'node:assert/strict';
import {assessStrictRealtimeTarget as assess} from '../src/strict-rt-admission.mjs';

const candidate=()=>({
 schemaVersion:1,profile:'llvm-aot-rt-strict',
 identity:{sourceTreeSha1:'a'.repeat(40),compilerSha256:'a'.repeat(64),
  artifactSha256:'b'.repeat(64),board:'cortex-m',rtos:'zephyr',configSha256:'c'.repeat(64)},
 budget:{periodUs:1000,deadlineUs:850,wcetUs:600,releaseJitterUs:100,
  blockingUs:150,stackBytes:4096,arenaBytes:8192,mailboxSlots:4,
  controlCredits:2,maxConcurrentHandlers:1},
 closure:{guestFullyCompiled:true,closedFfiGraph:true,noTracingGc:true,
  noPostBootAlloc:true,noInterpreter:true,noUnboundedLoop:true,
  cleanupBounded:true,unknownEffects:false,qualificationEvidenceReviewed:true}
});

test('a complete bounded structural candidate still requires independent review',()=>{
 const result=assess(candidate());
 assert.equal(result.ok,true);
 assert.equal(result.classification,'CANDIDATE_REVIEW_REQUIRED');
 assert.deepEqual(result.errors,[]);
});

test('deadline equality is allowed, one microsecond overflow is rejected',()=>{
 const payload=candidate();
 payload.budget.deadlineUs=849;
 const result=assess(payload);
 assert.equal(result.classification,'DENIED');
 assert.ok(result.errors.some(e=>e.includes('exceeds admitted deadline')));
});

test('large safe integer sums use exact arithmetic, not rounded number addition',()=>{
 const payload=candidate();
 payload.budget.periodUs=Number.MAX_SAFE_INTEGER;
 payload.budget.deadlineUs=Number.MAX_SAFE_INTEGER;
 payload.budget.wcetUs=Number.MAX_SAFE_INTEGER;
 payload.budget.releaseJitterUs=1;
 payload.budget.blockingUs=0;
 assert.equal(assess(payload).ok,false);
});

test('descriptor accessors and unknown effects cannot be used as RT evidence',()=>{
 const payload=candidate();
 let invoked=0;
 Object.defineProperty(payload.budget,'wcetUs',{enumerable:true,get(){invoked++;throw Error('must not run');}});
 assert.equal(assess(payload).classification,'DENIED');
 assert.equal(invoked,0);
 const unreviewed=candidate();
 unreviewed.closure.qualificationEvidenceReviewed=false;
 assert.ok(assess(unreviewed).errors.some(x=>x.includes('reviewed evidence missing')));
});
