import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRtCandidate} from '../src/strict-rt-candidate.mjs';

const hash='a'.repeat(64),tree='b'.repeat(40);
const sample={
  schemaVersion:1,profile:'llvm-aot-rt-strict',
  target:{architecture:'cortex-m7',board:'test-board-v1',os:'zephyr',
          scheduler:'fixed-priority-preemptive',kernelConfigSha256:hash,cpuHz:480000000},
  provenance:{sourceGitTreeSha:tree,sourceTreeSha256:hash,compilerBinarySha256:hash,
              runtimeBinarySha256:hash,imageSha256:hash,ffiClosureSha256:hash},
  timing:{periodUs:1000,deadlineUs:800,minInterarrivalUs:1000,releaseJitterUs:20,
          wcetUpperUs:500,blockingUpperUs:20,dispatchUpperUs:30,irqInterferenceUpperUs:30},
  resources:{arenaBytes:65536,stackBytes:8192,continuationBytes:2048,
             mailboxCapacity:16,controlCredits:4,actorCapacity:1,
             criticalTurnAllocBytes:0,criticalTurnCopyBytes:0},
  closure:{entry:'tick',units:[
    {id:'tick',calls:['kernel'],effects:['clock.monotonic','actor.send.bounded'],
     loopBoundsProven:true,stackBoundBytes:4096,allocUpperBytes:0,copyUpperBytes:0,layout:'aosoa'},
    {id:'kernel',calls:[],effects:['compute','memory.read','memory.write'],
     loopBoundsProven:true,stackBoundBytes:4096,allocUpperBytes:0,copyUpperBytes:0,layout:'soa'}
  ]},
  evidence:{staticWcetReportSha256:hash,linkedImageAuditSha256:hash,
            allocatorTraceSha256:hash,schedulerAnalysisSha256:hash,
            ownershipLifetimeAuditSha256:hash,hardwareMeasurementSha256:hash}
};
const verify=changed=>{const c=structuredClone(sample);changed(c);return validateRtCandidate(c);};
function reject(label,changed){
  test('reject '+label,()=>{
    const r=verify(changed);
    assert.equal(r.ok,false,JSON.stringify(r));
    assert.equal(r.certified,false);
    assert.equal(r.stage,'STRUCTURAL_ONLY');
  });
}
test('sample is only structurally eligible and never certified',()=>{
  assert.deepEqual(validateRtCandidate(sample),{ok:true,errors:[],stage:'STRUCTURAL_ONLY',certified:false});
});
reject('non-LLVM profile',c=>{c.profile='java-rtsj-rt-strict';});
reject('unmodeled scheduler',c=>{c.target.scheduler='cooperative';});
reject('invalid board digest',c=>{c.target.kernelConfigSha256='missing';});
reject('invalid source hash',c=>{c.provenance.sourceGitTreeSha='missing';});
reject('unbound image',c=>{c.provenance.imageSha256='unverified';});
reject('deadline overrun',c=>{c.timing.wcetUpperUs=800;});
reject('overflowed timing sum',c=>{c.timing.releaseJitterUs=Number.MAX_SAFE_INTEGER;});
reject('deadline longer than period',c=>{c.timing.deadlineUs=1001;});
reject('min interarrival too short',c=>{c.timing.minInterarrivalUs=999;});
reject('negative WCET',c=>{c.timing.wcetUpperUs=-1;});
reject('noninteger timing',c=>{c.timing.dispatchUpperUs=1.5;});
reject('second actor',c=>{c.resources.actorCapacity=2;});
reject('critical-turn allocation',c=>{c.resources.criticalTurnAllocBytes=1;});
reject('critical-turn copy',c=>{c.resources.criticalTurnCopyBytes=1;});
reject('callee allocation',c=>{c.closure.units[0].allocUpperBytes=1;});
reject('callee copy',c=>{c.closure.units[1].copyUpperBytes=1;});
reject('GC effect',c=>{c.closure.units[1].effects.push('gc.collect');});
reject('unknown FFI',c=>{c.closure.units[1].effects.push('ffi.unknown');});
reject('blocking IO',c=>{c.closure.units[1].effects.push('io.blocking');});
reject('dynamic code',c=>{c.closure.units[1].effects.push('dynamic.code');});
reject('unbounded control flow',c=>{c.closure.units[1].loopBoundsProven=false;});
reject('individual stack over budget',c=>{c.closure.units[0].stackBoundBytes=8193;});
reject('nested live stack over budget',c=>{c.closure.units[0].stackBoundBytes=5000;c.closure.units[1].stackBoundBytes=5000;});
reject('continuation bigger than arena',c=>{c.resources.continuationBytes=c.resources.arenaBytes+1;});
reject('missing call',c=>{c.closure.units[0].calls=['unknown'];});
reject('recursion',c=>{c.closure.units[1].calls=['tick'];});
reject('orphan unit',c=>{c.closure.units.push({...c.closure.units[1],id:'orphan'});});
reject('duplicate unit',c=>{c.closure.units.push({...c.closure.units[1]});});
reject('invalid layout',c=>{c.closure.units[0].layout='invalid';});
reject('hidden authority field',c=>{c.closure.units[0].unvalidated=true;});
reject('missing evidence',c=>{delete c.evidence.allocatorTraceSha256;});
reject('duplicate call',c=>{c.closure.units[0].calls=['kernel','kernel'];});
reject('duplicate effect',c=>{c.closure.units[0].effects=['compute','compute'];});
reject('unsafe integer',c=>{c.resources.arenaBytes=2**53;});
reject('invalid numeric value',c=>{c.resources.continuationBytes=NaN;});
reject('unknown manifest key',c=>{c.rootAuthority=true;});
test('accessor fields never run',()=>{
  const c=structuredClone(sample);let count=0;
  Object.defineProperty(c.timing,'wcetUpperUs',{enumerable:true,get(){count++;throw Error('ran');}});
  assert.equal(validateRtCandidate(c).ok,false);assert.equal(count,0);
});
test('proxies and prototype authority fail closed',()=>{
  const c=structuredClone(sample);
  c.target=Object.assign(Object.create({scheduler:'fixed-priority-preemptive'}),c.target);
  assert.equal(validateRtCandidate(c).ok,false);
  const d=structuredClone(sample);
  d.closure.units[0]=new Proxy(d.closure.units[0],{});
  assert.equal(validateRtCandidate(d).ok,false);
});
test('sparse arrays and shadowed methods fail closed',()=>{
  const c=structuredClone(sample);c.closure.units[0].calls=Array(1);
  assert.equal(validateRtCandidate(c).ok,false);
  const d=structuredClone(sample);d.closure.units[0].effects.every=()=>true;
  assert.equal(validateRtCandidate(d).ok,false);
});
test('DAG accepts shared callees with accurate live stack',()=>{
  const c=structuredClone(sample);
  c.closure.units[0].calls=['left','right'];
  c.closure.units[0].stackBoundBytes=100;
  c.closure.units[1].id='right';
  c.closure.units[1].stackBoundBytes=200;
  c.closure.units.push({id:'left',calls:['right'],effects:[],
    loopBoundsProven:true,stackBoundBytes:300,allocUpperBytes:0,copyUpperBytes:0,layout:'soaos'});
  c.resources.stackBytes=600;
  assert.equal(validateRtCandidate(c).ok,true);
  c.resources.stackBytes=599;
  assert.equal(validateRtCandidate(c).ok,false);
});
test('deep call chains are checked iteratively',()=>{
  const c=structuredClone(sample);c.resources.stackBytes=1200;c.closure.units=[];c.closure.entry='node_0';
  for(let i=0;i<1000;i++)c.closure.units.push({
    id:'node_'+i,calls:i<999?['node_'+(i+1)]:[],effects:[],loopBoundsProven:true,
    stackBoundBytes:1,allocUpperBytes:0,copyUpperBytes:0,layout:'none'});
  assert.equal(validateRtCandidate(c).ok,true);
  c.resources.stackBytes=999;
  assert.equal(validateRtCandidate(c).ok,false);
});
test('semantically admissible marker never promotes certification',()=>{
  const r=validateRtCandidate(sample);
  assert.equal(r.ok,true);assert.equal(r.stage,'STRUCTURAL_ONLY');
  assert.equal(r.certified,false);
});
