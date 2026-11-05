import test from 'node:test';
import assert from 'node:assert/strict';
import {assessStrictRealtimeTarget as assess} from '../src/strict-rt-admission.mjs';
const record=()=>({
  schemaVersion:1,profile:'llvm-aot-rt-strict',
  identity:{sourceTreeSha1:'a'.repeat(40),compilerSha256:'b'.repeat(64),
    artifactSha256:'c'.repeat(64),board:'cortex-m',rtos:'zephyr',configSha256:'d'.repeat(64)},
  budget:{periodUs:1000,deadlineUs:700,wcetUs:600,releaseJitterUs:50,blockingUs:50,
    stackBytes:4096,arenaBytes:8192,mailboxSlots:2,controlCredits:2,maxConcurrentHandlers:1},
  closure:{guestFullyCompiled:true,closedFfiGraph:true,noTracingGc:true,noPostBootAlloc:true,
    noInterpreter:true,noUnboundedLoop:true,cleanupBounded:true,
    unknownEffects:false,qualificationEvidenceReviewed:true}
});
test('exact WCET+jitter+blocking deadline boundary only produces a review candidate',()=>{
  const result=assess(record());
  assert.equal(result.ok,true);
  assert.equal(result.classification,'CANDIDATE_REVIEW_REQUIRED');
  assert.deepEqual(result.errors,[]);
});
test('one microsecond beyond deadline and unsupported concurrency are denied',()=>{
  const tooSlow=record();tooSlow.budget.blockingUs=51;
  assert.equal(assess(tooSlow).classification,'DENIED');
  const handlers=record();handlers.budget.maxConcurrentHandlers=2;
  assert.equal(assess(handlers).ok,false);
  const big=record();big.budget.wcetUs=Number.MAX_SAFE_INTEGER;
  assert.equal(assess(big).classification,'DENIED');
});
test('accessors, extra authority, unsigned or all-zero hashes do not enter candidacy',()=>{
  const hostile=record();let calls=0;
  Object.defineProperty(hostile.budget,'wcetUs',{enumerable:true,get(){calls++;throw Error('getter');}});
  assert.equal(assess(hostile).classification,'DENIED');
  assert.equal(calls,0);
  const sym=record();sym.identity[Symbol('secret')]='x';
  assert.equal(assess(sym).classification,'DENIED');
  const zero=record();zero.identity.compilerSha256='0'.repeat(64);
  assert.equal(assess(zero).classification,'DENIED');
});
