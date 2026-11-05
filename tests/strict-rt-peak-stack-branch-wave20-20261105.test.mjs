// Structural RT *candidate* verification only; never WCET or runtime proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRtCandidate} from '../src/strict-rt-candidate.mjs';

const hash='a'.repeat(64),tree='b'.repeat(40);
const fixture=()=>({
 schemaVersion:1,profile:'llvm-aot-rt-strict',
 target:{architecture:'cortex-m7',board:'test-board',os:'zephyr',
   scheduler:'fixed-priority-preemptive',kernelConfigSha256:hash,cpuHz:480000000},
 provenance:{sourceGitTreeSha:tree,sourceTreeSha256:hash,compilerBinarySha256:hash,
   runtimeBinarySha256:hash,imageSha256:hash,ffiClosureSha256:hash},
 timing:{periodUs:1000,deadlineUs:800,minInterarrivalUs:1000,releaseJitterUs:20,
   wcetUpperUs:500,blockingUpperUs:20,dispatchUpperUs:30,irqInterferenceUpperUs:30},
 resources:{arenaBytes:65536,stackBytes:600,continuationBytes:100,
   mailboxCapacity:16,controlCredits:4,actorCapacity:1,
   criticalTurnAllocBytes:0,criticalTurnCopyBytes:0},
 closure:{entry:'root',units:[
   {id:'root',calls:['left','right'],effects:['compute'],
      loopBoundsProven:true,stackBoundBytes:100,allocUpperBytes:0,copyUpperBytes:0,layout:'soa'},
   {id:'left',calls:['shared'],effects:[],
      loopBoundsProven:true,stackBoundBytes:300,allocUpperBytes:0,copyUpperBytes:0,layout:'aosoa'},
   {id:'right',calls:['shared'],effects:[],
      loopBoundsProven:true,stackBoundBytes:200,allocUpperBytes:0,copyUpperBytes:0,layout:'aos'},
   {id:'shared',calls:[],effects:[],
      loopBoundsProven:true,stackBoundBytes:200,allocUpperBytes:0,copyUpperBytes:0,layout:'none'}
 ]},
 evidence:{staticWcetReportSha256:hash,linkedImageAuditSha256:hash,
   allocatorTraceSha256:hash,schedulerAnalysisSha256:hash,
   ownershipLifetimeAuditSha256:hash,hardwareMeasurementSha256:hash}
});

test('shared-callee diamond computes maximum live stack, not sum across siblings',()=>{
 const input=fixture();
 const ok=validateRtCandidate(input);
 assert.equal(ok.ok,true,ok.errors.join('; '));
 assert.equal(ok.stage,'STRUCTURAL_ONLY');
 assert.equal(ok.certified,false);
 input.resources.stackBytes=599;
 assert.equal(validateRtCandidate(input).ok,false);
 input.resources.stackBytes=600;
 input.closure.units[2].stackBoundBytes=301;
 assert.equal(validateRtCandidate(input).ok,false);
});

test('recursion and unreachable diamond successors cannot self-certify',()=>{
 const c=fixture();
 c.closure.units[3].calls=['root'];
 assert.equal(validateRtCandidate(c).ok,false);
 const orphan=fixture();
 orphan.closure.units.push({id:'unreachable',calls:[],effects:[],
   loopBoundsProven:true,stackBoundBytes:1,allocUpperBytes:0,copyUpperBytes:0,layout:'none'});
 assert.equal(validateRtCandidate(orphan).ok,false);
});

test('hostile authority array accessors are never evaluated',()=>{
 const c=fixture();
 let calls=0;
 Object.defineProperty(c.closure.units,'1',{configurable:true,enumerable:true,get(){
   calls++;throw Error('untrusted unit getter');
 }});
 assert.equal(validateRtCandidate(c).ok,false);
 assert.equal(calls,0);
});

test('large declared timing terms cannot overflow into a false admissible deadline',()=>{
 const c=fixture();
 c.timing.releaseJitterUs=Number.MAX_SAFE_INTEGER;
 assert.equal(validateRtCandidate(c).ok,false);
 c.timing.releaseJitterUs=0;
 c.timing.wcetUpperUs=0;
 assert.equal(validateRtCandidate(c).ok,false,'WCET lower bound required');
});
