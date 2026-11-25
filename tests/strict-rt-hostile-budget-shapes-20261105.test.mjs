import test from 'node:test';
import assert from 'node:assert/strict';
import {assessStrictRealtimeTarget} from '../src/strict-rt-admission.mjs';

const candidate = () => ({
  schemaVersion: 1, profile: 'llvm-aot-rt-strict',
  identity: {sourceTreeSha1: 'a'.repeat(40), compilerSha256: 'b'.repeat(64),
    artifactSha256: 'c'.repeat(64), board: 'cortex-m7', rtos: 'zephyr',
    configSha256: 'd'.repeat(64)},
  budget: {periodUs: 10000, deadlineUs: 8000, wcetUs: 6000,
    releaseJitterUs: 500, blockingUs: 100, stackBytes: 16384,
    arenaBytes: 65536, mailboxSlots: 32, controlCredits: 4,
    maxConcurrentHandlers: 1},
  closure: {guestFullyCompiled: true, closedFfiGraph: true, noTracingGc: true,
    noPostBootAlloc: true, noInterpreter: true, noUnboundedLoop: true,
    cleanupBounded: true, unknownEffects: false, qualificationEvidenceReviewed: true}
});
const denied = manifest => {
  const result = assessStrictRealtimeTarget(manifest);
  assert.equal(result.ok, false);
  assert.equal(result.classification, 'DENIED');
};

test('read-only inert manifests remain review candidates, not certificates', () => {
  const value = candidate();
  for (const sub of [value.identity, value.budget, value.closure]) Object.freeze(sub);
  Object.freeze(value);
  const result = assessStrictRealtimeTarget(value);
  assert.equal(result.ok, true);
  assert.equal(result.classification, 'CANDIDATE_REVIEW_REQUIRED');
});

test('budget coercion, floats, nonfinite numbers and invalid slots deny without coercion', () => {
  let called = 0;
  for (const bad of [NaN, Infinity, -Infinity, 1.25, '6000', 0n,
    {valueOf() { called++; throw Error('must not run'); }}]) {
    const x = candidate(); x.budget.wcetUs = bad; denied(x);
  }
  assert.equal(called, 0);
});

test('safe-integer deadline sum uses exact comparison at the upper bound', () => {
  const x = candidate();
  x.budget.periodUs = Number.MAX_SAFE_INTEGER;
  x.budget.deadlineUs = Number.MAX_SAFE_INTEGER;
  x.budget.wcetUs = Number.MAX_SAFE_INTEGER - 1;
  x.budget.releaseJitterUs = 1;
  x.budget.blockingUs = 0;
  assert.equal(assessStrictRealtimeTarget(x).ok, true);
  x.budget.blockingUs = 1;
  denied(x);
});

test('required budget descriptor getters are not run on admission', () => {
  const x = candidate(); let called = 0;
  Object.defineProperty(x.budget, 'mailboxSlots', {
    enumerable: true, get() { called++; throw Error('must not run'); }
  });
  denied(x); assert.equal(called, 0);
});
