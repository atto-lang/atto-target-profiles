import test from 'node:test';
import assert from 'node:assert/strict';
import {assessStrictRealtimeTarget as assess} from '../src/strict-rt-admission.mjs';

const candidate=()=>({
  schemaVersion:1,profile:'java-rtsj-rt-strict',
  identity:{sourceTreeSha1:'a'.repeat(40),compilerSha256:'b'.repeat(64),artifactSha256:'c'.repeat(64),
    configSha256:'d'.repeat(64),board:'x',rtos:'y'},
  budget:{periodUs:100,deadlineUs:99,wcetUs:60,releaseJitterUs:10,blockingUs:10,
    stackBytes:256,arenaBytes:256,mailboxSlots:1,controlCredits:1,maxConcurrentHandlers:1},
  closure:{guestFullyCompiled:true,closedFfiGraph:true,noTracingGc:true,noPostBootAlloc:true,
    noInterpreter:true,noUnboundedLoop:true,cleanupBounded:true,unknownEffects:false,
    qualificationEvidenceReviewed:true}
});

test('accessor-backed nested authority is denied without executing getters',()=>{
  for(const path of ['identity','budget','closure']){
    const c=candidate();let calls=0;
    Object.defineProperty(c[path],Object.keys(c[path])[0],{
      configurable:true,enumerable:true,get(){calls++;throw Error('unsafe getter');}
    });
    const r=assess(c);
    assert.equal(r.classification,'DENIED',path);
    assert.equal(calls,0,path);
  }
});

test('extra symbol authority is denied at every nested manifest boundary',()=>{
  for(const path of ['identity','budget','closure']){
    const c=candidate();let calls=0;
    Object.defineProperty(c[path],Symbol('shadow'),{
      enumerable:true,get(){calls++;throw Error('symbol getter');}
    });
    assert.equal(assess(c).classification,'DENIED');
    assert.equal(calls,0);
  }
});

test('get-trapping proxy can only provide descriptor-verified inert data',()=>{
  const c=candidate();let reads=0;
  c.budget=new Proxy(c.budget,{get(){reads++;throw Error('proxy get must not run');}});
  const r=assess(c);
  assert.equal(r.classification,'CANDIDATE_REVIEW_REQUIRED');
  assert.equal(reads,0);
});
