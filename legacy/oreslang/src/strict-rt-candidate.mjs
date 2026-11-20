import {types as nodeTypes} from 'node:util';

// A structural candidate verifier, NEVER a deployment admission or WCET proof.
// Values, effects and hashes here are unauthenticated declarations.
const SHA256=/^[a-f0-9]{64}$/;
const GIT_TREE=/^[a-f0-9]{40}$/;
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/;
const TOP=['schemaVersion','profile','target','provenance','timing','resources','closure','evidence'];
const TARGET=['architecture','board','os','scheduler','kernelConfigSha256','cpuHz'];
const PROV=['sourceGitTreeSha','sourceTreeSha256','compilerBinarySha256','runtimeBinarySha256','imageSha256','ffiClosureSha256'];
const TIMING=['periodUs','deadlineUs','minInterarrivalUs','releaseJitterUs','wcetUpperUs','blockingUpperUs','dispatchUpperUs','irqInterferenceUpperUs'];
const RES=['arenaBytes','stackBytes','continuationBytes','mailboxCapacity','controlCredits','actorCapacity','criticalTurnAllocBytes','criticalTurnCopyBytes'];
const EVIDENCE=['staticWcetReportSha256','linkedImageAuditSha256','allocatorTraceSha256','schedulerAnalysisSha256','ownershipLifetimeAuditSha256','hardwareMeasurementSha256'];
const UNIT=['id','calls','effects','loopBoundsProven','stackBoundBytes','allocUpperBytes','copyUpperBytes','layout'];
const EFFECTS=new Set(['compute','memory.read','memory.write','clock.monotonic','actor.send.bounded']);
const LAYOUTS=new Set(['none','aos','soa','aosoa','soaos']);

function record(x) {
  try {
    if(!x||typeof x!=='object'||Array.isArray(x)||nodeTypes.isProxy(x))return false;
    const p=Object.getPrototypeOf(x);
    if(p!==Object.prototype&&p!==null)return false;
    for(const key of Reflect.ownKeys(x)){
      if(typeof key!=='string')return false;
      const d=Object.getOwnPropertyDescriptor(x,key);
      if(!d||!Object.hasOwn(d,'value')||d.value===undefined||d.enumerable!==true)return false;
    }
    return true;
  }catch{return false;}
}
function array(x,max){
  try {
    if(nodeTypes.isProxy(x)||!Array.isArray(x)||Object.getPrototypeOf(x)!==Array.prototype||
       x.length>max||Reflect.ownKeys(x).length!==x.length+1)return false;
    for(let i=0;i<x.length;i++){
      const d=Object.getOwnPropertyDescriptor(x,String(i));
      if(!d||!Object.hasOwn(d,'value'))return false;
    }
    return true;
  }catch{return false;}
}
function exact(x,keys,at,errors){
  if(!record(x)){errors.push(at+': must be a plain own-data object');return false;}
  let complete=true;
  for(const k of keys)if(!Object.hasOwn(x,k)){errors.push(at+': missing '+k);complete=false;}
  for(const k of Object.keys(x))if(!keys.includes(k))errors.push(at+': unexpected '+k);
  return complete;
}
function integer(x,at,errors,min=0){
  if(!Number.isSafeInteger(x)||x<min){errors.push(at+': invalid bounded integer');return false;}
  return true;
}
function digest(x,at,errors,git=false){
  if(typeof x!=='string'||!(git?GIT_TREE:SHA256).test(x))errors.push(at+': invalid digest shape');
}
function name(x,at,errors){
  if(typeof x!=='string'||x.length<1||x.length>128||/[\x00-\x1f]/.test(x))errors.push(at+': invalid identifier');
}
function list(x,max,at,errors) {
  if(!array(x,max)){errors.push(at+': expected own-data dense array, max '+max);return false;}
  return true;
}

export function validateRtCandidate(candidate) {
  const errors=[];
  const done=()=>({ok:errors.length===0,errors,stage:'STRUCTURAL_ONLY',certified:false});
  if(!exact(candidate,TOP,'candidate',errors))return done();
  if(candidate.schemaVersion!==1)errors.push('unsupported stage-0 schema version');
  if(candidate.profile!=='llvm-aot-rt-strict')errors.push('unimplemented RT profile');
  const {target,provenance,timing,resources,closure,evidence}=candidate;
  if(exact(target,TARGET,'target',errors)){
    for(const k of ['architecture','board','os'])name(target[k],'target.'+k,errors);
    if(target.scheduler!=='fixed-priority-preemptive')errors.push('unsupported scheduler');
    digest(target.kernelConfigSha256,'kernel configuration',errors);
    integer(target.cpuHz,'CPU frequency',errors,1);
  }
  if(exact(provenance,PROV,'provenance',errors))
    for(const k of PROV)digest(provenance[k],'provenance.'+k,errors,k==='sourceGitTreeSha');
  if(exact(timing,TIMING,'timing',errors)){
    for(const k of TIMING)integer(timing[k],'timing.'+k,errors,
      ['periodUs','deadlineUs','minInterarrivalUs','wcetUpperUs'].includes(k)?1:0);
    if(TIMING.every(k=>Number.isSafeInteger(timing[k])&&timing[k]>=0)){
      if(timing.deadlineUs>timing.periodUs)errors.push('deadline exceeds period');
      if(timing.minInterarrivalUs<timing.periodUs)errors.push('minimum interarrival below period');
      const terms=['releaseJitterUs','wcetUpperUs','blockingUpperUs','dispatchUpperUs','irqInterferenceUpperUs'];
      const total=terms.reduce((sum,k)=>sum+timing[k],0);
      if(!Number.isSafeInteger(total)||total>timing.deadlineUs)
        errors.push('overflow or declared response bound exceeds deadline');
    }
  }
  const resourceReady=exact(resources,RES,'resources',errors);
  if(resourceReady){
    for(const k of RES)integer(resources[k],'resources.'+k,errors,
      ['arenaBytes','stackBytes','mailboxCapacity','controlCredits','actorCapacity'].includes(k)?1:0);
    if(resources.actorCapacity!==1)errors.push('only one RT actor modeled');
    if(resources.criticalTurnAllocBytes!==0)errors.push('critical-turn allocation must be zero');
    if(resources.criticalTurnCopyBytes!==0)errors.push('critical-turn copying must be zero');
    if(Number.isSafeInteger(resources.continuationBytes)&&Number.isSafeInteger(resources.arenaBytes)&&
       resources.continuationBytes>resources.arenaBytes)errors.push('continuation exceeds actor arena');
  }
  if(exact(evidence,EVIDENCE,'evidence',errors))
    for(const k of EVIDENCE)digest(evidence[k],'evidence.'+k,errors);
  if(!exact(closure,['entry','units'],'closure',errors))return done();
  if(typeof closure.entry!=='string'||!ID.test(closure.entry))errors.push('invalid closure entry');
  if(!list(closure.units,1024,'closure.units',errors)||closure.units.length===0){
    errors.push('closure must include at least one unit');return done();
  }
  const units=new Map();let edges=0;
  for(let i=0;i<closure.units.length;i++){
    const unit=closure.units[i],where='closure.units['+i+']';
    if(!exact(unit,UNIT,where,errors))continue;
    if(typeof unit.id!=='string'||!ID.test(unit.id))errors.push(where+': invalid unit id');
    else if(units.has(unit.id))errors.push(where+': duplicate id');
    else units.set(unit.id,unit);
    if(list(unit.calls,64,where+'.calls',errors)){
      const seen=new Set();edges+=unit.calls.length;
      for(const call of unit.calls){
        if(typeof call!=='string'||!ID.test(call)||seen.has(call))errors.push(where+': invalid or duplicate call');
        seen.add(call);
      }
    }
    if(list(unit.effects,16,where+'.effects',errors)){
      const seen=new Set();
      for(const effect of unit.effects){
        if(!EFFECTS.has(effect)||seen.has(effect))errors.push(where+': forbidden/duplicate effect');
        seen.add(effect);
      }
    }
    if(unit.loopBoundsProven!==true)errors.push(where+': bounded-control-flow declaration required');
    integer(unit.stackBoundBytes,where+'.stack',errors,1);
    for(const k of ['allocUpperBytes','copyUpperBytes']){
      integer(unit[k],where+'.'+k,errors);
      if(unit[k]!==0)errors.push(where+': nonzero '+k);
    }
    if(!LAYOUTS.has(unit.layout))errors.push(where+': unknown layout');
    if(resourceReady&&Number.isSafeInteger(unit.stackBoundBytes)&&
       unit.stackBoundBytes>resources.stackBytes)errors.push(where+': stack over budget');
  }
  if(edges>65536)errors.push('excessive call edges');
  if(!units.has(closure.entry))errors.push('missing entry unit');
  if(errors.length)return done();

  // Iterative DFS rejects unknown edges, recursion, and orphan units.
  const state=new Map(),order=[],stack=[[closure.entry,false]];
  while(stack.length){
    const [id,finished]=stack.pop();
    if(finished){state.set(id,2);order.push(id);continue;}
    if(state.get(id)===2)continue;
    if(state.get(id)===1){errors.push('recursive call at '+id);break;}
    const unit=units.get(id);
    if(!unit){errors.push('unresolved call at '+id);break;}
    state.set(id,1);stack.push([id,true]);
    for(let i=unit.calls.length-1;i>=0;i--){
      const called=unit.calls[i];
      if(!units.has(called)){errors.push('unresolved call '+called);break;}
      if(state.get(called)===1){errors.push('recursive call '+called);break;}
      if(state.get(called)!==2)stack.push([called,false]);
    }
    if(errors.length)break;
  }
  if(!errors.length&&state.size!==units.size)errors.push('unreachable units');
  // Sum live call frames, not just the maximum individual frame.
  // These are STILL user-provided declarations, not compiler proofs.
  if(!errors.length){
    const peak=new Map();
    for(const id of order){
      const unit=units.get(id);
      let child=0;
      for(const called of unit.calls)child=Math.max(child,peak.get(called));
      const stackBytes=unit.stackBoundBytes+child;
      if(!Number.isSafeInteger(stackBytes)||stackBytes>resources.stackBytes){
        errors.push('peak call-chain stack exceeds budget at '+id);break;
      }
      peak.set(id,stackBytes);
    }
  }
  return done();
}
