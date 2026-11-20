// Host-only candidate graph invariants; never a WCET or compiler proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRtCandidate} from '../src/strict-rt-candidate.mjs';

const sha='a'.repeat(64), tree='b'.repeat(40);
const unit=(id,calls,stackBoundBytes)=>({id,calls,effects:[],
  loopBoundsProven:true,stackBoundBytes,allocUpperBytes:0,copyUpperBytes:0,layout:'none'});
const fixture=()=>({
  schemaVersion:1,profile:'llvm-aot-rt-strict',
  target:{architecture:'cortex-m7',board:'test-board',os:'zephyr',
    scheduler:'fixed-priority-preemptive',kernelConfigSha256:sha,cpuHz:480000000},
  provenance:{sourceGitTreeSha:tree,sourceTreeSha256:sha,compilerBinarySha256:sha,
    runtimeBinarySha256:sha,imageSha256:sha,ffiClosureSha256:sha},
  timing:{periodUs:1000,deadlineUs:800,minInterarrivalUs:1000,
    releaseJitterUs:20,wcetUpperUs:500,blockingUpperUs:20,
    dispatchUpperUs:30,irqInterferenceUpperUs:30},
  resources:{arenaBytes:65536,stackBytes:270,continuationBytes:2048,
    mailboxCapacity:16,controlCredits:4,actorCapacity:1,
    criticalTurnAllocBytes:0,criticalTurnCopyBytes:0},
  closure:{entry:'root',units:[unit('root',['left','right'],20),
    unit('left',['leaf'],30),unit('right',['leaf'],200),unit('leaf',[],50)]},
  evidence:{staticWcetReportSha256:sha,linkedImageAuditSha256:sha,
    allocatorTraceSha256:sha,schedulerAnalysisSha256:sha,
    ownershipLifetimeAuditSha256:sha,hardwareMeasurementSha256:sha}
});

test('a diamond shared callee counts only maximum simultaneously live stack path',()=>{
  const c=fixture(),r=validateRtCandidate(c);
  assert.deepEqual(r,{ok:true,errors:[],stage:'STRUCTURAL_ONLY',certified:false});
  c.resources.stackBytes=269;
  const denied=validateRtCandidate(c);
  assert.equal(denied.ok,false);
  assert.match(denied.errors.join(' '),/peak call-chain stack exceeds budget/);
});

test('permuting unit order and independent sibling call order cannot alter admission',()=>{
  const c=fixture();
  c.closure.units=[c.closure.units[3],c.closure.units[2],
    c.closure.units[0],c.closure.units[1]];
  c.closure.units.find(x=>x.id==='root').calls.reverse();
  assert.equal(validateRtCandidate(c).ok,true);
  c.closure.units.find(x=>x.id==='right').calls.push('missing');
  assert.equal(validateRtCandidate(c).ok,false);
});
