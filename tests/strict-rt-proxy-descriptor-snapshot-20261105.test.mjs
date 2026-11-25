import test from 'node:test';
import assert from 'node:assert/strict';
import {assessStrictRealtimeTarget} from '../src/strict-rt-admission.mjs';

const fixture=()=>({
  schemaVersion:1,profile:'llvm-aot-rt-strict',
  identity:{sourceTreeSha1:'a'.repeat(40),compilerSha256:'b'.repeat(64),artifactSha256:'c'.repeat(64),board:'cortex-m7',rtos:'zephyr',configSha256:'d'.repeat(64)},
  budget:{periodUs:10000,deadlineUs:8000,wcetUs:6000,releaseJitterUs:500,blockingUs:100,stackBytes:16384,arenaBytes:65536,mailboxSlots:16,controlCredits:4,maxConcurrentHandlers:1},
  closure:{guestFullyCompiled:true,closedFfiGraph:true,noTracingGc:true,noPostBootAlloc:true,noInterpreter:true,noUnboundedLoop:true,cleanupBounded:true,unknownEffects:false,qualificationEvidenceReviewed:true}
});

test('ordinary bounded candidate is review-only, never WCET certified',()=>{
  const r=assessStrictRealtimeTarget(fixture());
  assert.deepEqual(r,{ok:true,classification:'CANDIDATE_REVIEW_REQUIRED',errors:[]});
});
test('Proxy cannot substitute an invalid stored schema version via get',()=>{
  const raw=fixture();raw.schemaVersion=0;let gets=0;
  const proxy=new Proxy(raw,{get(t,k,r){gets++;return k==='schemaVersion'?1:Reflect.get(t,k,r);}});
  assert.equal(assessStrictRealtimeTarget(proxy).classification,'DENIED');
  assert.equal(gets,0,'descriptor snapshot must not invoke caller get');
});
test('nested budget Proxy cannot hide invalid negative deadline',()=>{
  const raw=fixture();raw.budget.deadlineUs=-1;let gets=0;
  raw.budget=new Proxy(raw.budget,{get(t,k,r){gets++;return k==='deadlineUs'?8000:Reflect.get(t,k,r);}});
  assert.equal(assessStrictRealtimeTarget(raw).classification,'DENIED');
  assert.equal(gets,0);
});
test('accessor, symbol and nonenumerable fields are all denied inertly',()=>{
  for(const location of ['top','identity','budget','closure']){
    const a=fixture();Object.defineProperty(location==='top'?a:a[location],'hidden',{value:true,enumerable:false});
    assert.equal(assessStrictRealtimeTarget(a).classification,'DENIED',location);
    const b=fixture();Object.defineProperty(location==='top'?b:b[location],Symbol('other'),{value:true,enumerable:true});
    assert.equal(assessStrictRealtimeTarget(b).classification,'DENIED',location);
  }
  const c=fixture();let called=0;
  Object.defineProperty(c.budget,'deadlineUs',{enumerable:true,get(){called++;return 8000;}});
  assert.equal(assessStrictRealtimeTarget(c).classification,'DENIED');assert.equal(called,0);
});
test('a hostile descriptor trap denies without escaping an exception',()=>{
  const value=fixture();let called=0;
  value.closure=new Proxy(value.closure,{getOwnPropertyDescriptor(){called++;throw Error('poisoned');}});
  assert.equal(assessStrictRealtimeTarget(value).classification,'DENIED');
  assert.equal(called,1);
});
test('deadline overflow remains denied and original manifest unchanged',()=>{
  const value=fixture();value.budget.wcetUs=8000;
  const prior=JSON.stringify(value);
  assert.equal(assessStrictRealtimeTarget(value).classification,'DENIED');
  assert.equal(JSON.stringify(value),prior);
});
