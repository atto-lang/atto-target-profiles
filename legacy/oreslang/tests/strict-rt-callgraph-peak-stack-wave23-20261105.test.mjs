import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRtCandidate as assess} from '../src/strict-rt-candidate.mjs';

const sha=x=>x.repeat(64);
const unit=(id,calls=[],stackBoundBytes=16)=>({
 id,calls,effects:['compute'],loopBoundsProven:true,stackBoundBytes,
 allocUpperBytes:0,copyUpperBytes:0,layout:'none'
});
const candidate=()=>({
 schemaVersion:1,profile:'llvm-aot-rt-strict',
 target:{architecture:'armv7m',board:'stm32f4',os:'zephyr',scheduler:'fixed-priority-preemptive',
  kernelConfigSha256:sha('a'),cpuHz:100000000},
 provenance:{sourceGitTreeSha:'b'.repeat(40),sourceTreeSha256:sha('c'),compilerBinarySha256:sha('d'),
  runtimeBinarySha256:sha('e'),imageSha256:sha('f'),ffiClosureSha256:sha('1')},
 timing:{periodUs:1000,deadlineUs:800,minInterarrivalUs:1000,releaseJitterUs:100,
  wcetUpperUs:400,blockingUpperUs:100,dispatchUpperUs:50,irqInterferenceUpperUs:50},
 resources:{arenaBytes:8192,stackBytes:64,continuationBytes:100,
  mailboxCapacity:4,controlCredits:2,actorCapacity:1,
  criticalTurnAllocBytes:0,criticalTurnCopyBytes:0},
 closure:{entry:'entry',units:[unit('entry',['leaf'],32),unit('leaf',[],16)]},
 evidence:{staticWcetReportSha256:sha('2'),linkedImageAuditSha256:sha('3'),
  allocatorTraceSha256:sha('4'),schedulerAnalysisSha256:sha('5'),
  ownershipLifetimeAuditSha256:sha('6'),hardwareMeasurementSha256:sha('7')}
});

test('even a structurally complete RT candidate is never a WCET certificate',()=>{
 const result=assess(candidate());
 assert.deepEqual(result,{ok:true,errors:[],stage:'STRUCTURAL_ONLY',certified:false});
});

test('cumulative stack use is bounded along the entire live call chain',()=>{
 const input=candidate();
 input.closure.units[0].stackBoundBytes=49;
 const result=assess(input);
 assert.equal(result.ok,false);
 assert.ok(result.errors.some(x=>x.includes('peak call-chain stack exceeds budget')));
});

test('recursive and orphaned units are not silently certified as closed',()=>{
 const cyclic=candidate();cyclic.closure.units[1].calls=['entry'];
 assert.ok(assess(cyclic).errors.some(x=>x.includes('recursive call')));
 const orphan=candidate();orphan.closure.units.push(unit('orphan'));
 assert.ok(assess(orphan).errors.some(x=>x.includes('unreachable units')));
});

test('getter-backed evidence cannot run or confer target authority',()=>{
 const input=candidate();let calls=0;
 Object.defineProperty(input.evidence,'hardwareMeasurementSha256',{
  enumerable:true,get(){calls++;throw Error('unexpected read');}});
 const result=assess(input);
 assert.equal(result.certified,false);
 assert.equal(result.ok,false);
 assert.equal(calls,0);
});
