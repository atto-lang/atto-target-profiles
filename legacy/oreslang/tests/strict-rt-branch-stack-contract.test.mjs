// Structural-only RT candidate checks. This is NOT WCET or compiled guest proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRtCandidate} from '../src/strict-rt-candidate.mjs';

const sha = 'a'.repeat(64), tree = 'b'.repeat(40);
const unit = (id, calls, stackBoundBytes) => ({
  id, calls, effects: [], loopBoundsProven: true, stackBoundBytes,
  allocUpperBytes: 0, copyUpperBytes: 0, layout: 'none'
});
const fixture = () => ({
  schemaVersion: 1, profile: 'llvm-aot-rt-strict',
  target: {architecture:'cortex-m7', board:'test-board', os:'zephyr',
    scheduler:'fixed-priority-preemptive', kernelConfigSha256:sha, cpuHz:480000000},
  provenance: {sourceGitTreeSha:tree, sourceTreeSha256:sha, compilerBinarySha256:sha,
    runtimeBinarySha256:sha, imageSha256:sha, ffiClosureSha256:sha},
  timing: {periodUs:1000, deadlineUs:800, minInterarrivalUs:1000,
    releaseJitterUs:20, wcetUpperUs:500, blockingUpperUs:20,
    dispatchUpperUs:30, irqInterferenceUpperUs:30},
  resources: {arenaBytes:65536, stackBytes:600, continuationBytes:2048,
    mailboxCapacity:16, controlCredits:4, actorCapacity:1,
    criticalTurnAllocBytes:0, criticalTurnCopyBytes:0},
  closure: {entry:'root', units:[unit('root',['left','right'],100),
    unit('left',['right'],300), unit('right',[],200)]},
  evidence: {staticWcetReportSha256:sha, linkedImageAuditSha256:sha,
    allocatorTraceSha256:sha, schedulerAnalysisSha256:sha,
    ownershipLifetimeAuditSha256:sha, hardwareMeasurementSha256:sha}
});
const check = specimen => validateRtCandidate(specimen);

test('shared callee is counted along maximum live call path, not summed as siblings', () => {
  const data = fixture();
  assert.deepEqual(check(data), {ok:true, errors:[], stage:'STRUCTURAL_ONLY', certified:false});
  data.resources.stackBytes = 599;
  const denied = check(data);
  assert.equal(denied.ok, false);
  assert.match(denied.errors.join(' '), /peak call-chain stack exceeds budget/);
  assert.equal(denied.certified, false);
});

test('an unknown edge, recursion, or disconnected unit cannot gain a structural pass', () => {
  const cases = [
    data => { data.closure.units[2].calls = ['ghost']; },
    data => { data.closure.units[2].calls = ['root']; },
    data => { data.closure.units.push(unit('orphan', [], 1)); }
  ];
  for (const mutate of cases) {
    const data = fixture(); mutate(data);
    const result = check(data);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.certified, false);
    assert.equal(result.stage, 'STRUCTURAL_ONLY');
  }
});
