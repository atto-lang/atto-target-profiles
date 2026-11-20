// Host structural metadata tests; not a measured hard-real-time certificate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assessStrictRealtimeTarget} from '../src/strict-rt-admission.mjs';

const fixture = () => ({
  schemaVersion:1, profile:'llvm-aot-rt-strict',
  identity:{sourceTreeSha1:'a'.repeat(40), compilerSha256:'b'.repeat(64),
    artifactSha256:'c'.repeat(64), board:'cortex-m7', rtos:'zephyr',
    configSha256:'d'.repeat(64)},
  budget:{periodUs:10000, deadlineUs:8000, wcetUs:7400,
    releaseJitterUs:500, blockingUs:100, stackBytes:16384,
    arenaBytes:65536, mailboxSlots:16, controlCredits:4, maxConcurrentHandlers:1},
  closure:{guestFullyCompiled:true,closedFfiGraph:true,noTracingGc:true,
    noPostBootAlloc:true,noInterpreter:true,noUnboundedLoop:true,
    cleanupBounded:true,unknownEffects:false,qualificationEvidenceReviewed:true}
});

test('exact WCET, jitter and blocking equality is a candidate, plus one microsecond denies', () => {
  const data=fixture();
  const equal=assessStrictRealtimeTarget(data);
  assert.equal(equal.ok,true);
  assert.equal(equal.classification,'CANDIDATE_REVIEW_REQUIRED');
  data.budget.wcetUs++;
  const denied=assessStrictRealtimeTarget(data);
  assert.equal(denied.ok,false);
  assert.equal(denied.classification,'DENIED');
  assert.match(denied.errors.join(' '),/exceeds admitted deadline/);
});

test('large safe-integer summands use exact arithmetic, not rounded Number totals', () => {
  const data=fixture(), max=Number.MAX_SAFE_INTEGER;
  Object.assign(data.budget,{periodUs:max,deadlineUs:max,wcetUs:max-2,
    releaseJitterUs:1,blockingUs:1});
  assert.equal(assessStrictRealtimeTarget(data).ok,true);
  data.budget.blockingUs=2;
  assert.equal(assessStrictRealtimeTarget(data).ok,false);
  data.budget.blockingUs=1;
  data.budget.deadlineUs=max-1;
  assert.equal(assessStrictRealtimeTarget(data).ok,false);
});
