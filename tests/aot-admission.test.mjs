import test from 'node:test';
import assert from 'node:assert/strict';
import { admitClosedWorldManifest, inspectAotProofReceipt, manifestDigest,
  hashBytes, verifyArtifactBytes, canonicalJson } from '../src/aot-admission.mjs';

const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(64);
const bytes = Uint8Array.from([0,97,115,109,1,0,0,0,7,8,9]);
const manifest = () => ({
  schema:'atto.aot.closed-world.v1',
  source:{commit:a,tree:b},
  compiler:{name:'atto-llvmc',sha256:c},
  target:{backend:'llvm',triple:'x86_64-unknown-linux-gnu',guestPointerBits:32},
  sourceFiles:[{path:'stdlib/core/identity.atto',sha256:c}],
  modules:['pkg'], types:['pkg.Foo'], exports:['pkg.main','pkg.worker'],
  actorEntries:['pkg.worker'],genericSpecializations:['pkg.Gen<int>'],
  imports:[{capability:'io.stdout',abiSha256:c}],
  closedWorld:true,dynamicLoading:false,runtimeReflection:false,runtimeJit:false,
});
const receipt = m => ({
  schema:'atto.aot.proof.v1',manifestSha256:manifestDigest(m),
  source:structuredClone(m.source),compiler:structuredClone(m.compiler),
  target:structuredClone(m.target),
  artifact:{sha256:hashBytes(bytes),bytes:bytes.length,format:'elf'},
  runner:{source:'github-actions',workflowRunId:420,runAttempt:2,jobId:33,
    runnerId:7,steps:[{name:'checkout',conclusion:'success'},
      {name:'compiled guest',conclusion:'success'}]},
  execution:{exitCode:0,compiledGuestCases:3,negativeNoArtifactCases:2,
    tracingGcEvents:0,runtimeCompilerInvocations:0,unsupportedFeatures:[]},
});
const denied = f => assert.throws(f, /^TypeError: AOT_/);

test('closed-world source manifest is strictly structured but does not authorize build',()=>{
  const m=manifest();
  assert.equal(admitClosedWorldManifest(m).certified,false);
  assert.match(manifestDigest(m),/^[0-9a-f]{64}$/);
  const reversed={...m,modules:[...m.modules]};
  assert.equal(manifestDigest(reversed),manifestDigest(m));
  assert.equal(canonicalJson({b:2,a:1}), '{"a":1,"b":2}');
});

test('real byte hashing matches a pinned immutable artifact, not provider identity',()=>{
  const m=manifest(), r=receipt(m);
  assert.equal(verifyArtifactBytes(bytes,r).bytesMatch,true);
  assert.equal(inspectAotProofReceipt(r,m).certified,false);
  assert.equal(inspectAotProofReceipt(r,m).authenticated,false);
  denied(()=>verifyArtifactBytes(Uint8Array.from([...bytes,0]),r));
  denied(()=>verifyArtifactBytes(Uint8Array.from([...bytes.slice(0,-1),99]),r));
});

test('open world, unsafe pointer width and unsupported target are denied',()=>{
  for(const [field, value] of [
    ['closedWorld',false],['dynamicLoading',true],['runtimeReflection',true],
    ['runtimeJit',true]]) {
    const m=manifest();m[field]=value;denied(()=>admitClosedWorldManifest(m));
  }
  for(const [field,value] of [['guestPointerBits',64],['triple','host'],['backend','js']]){
    const m=manifest();m.target[field]=value;denied(()=>admitClosedWorldManifest(m));
  }
});

test('unbounded source/import/actor metadata cannot escape closed manifest',()=>{
  const cases=[
    m=>m.actorEntries.push('pkg.missing'),
    m=>m.actorEntries.push('pkg.missing','pkg.worker'),
    m=>m.genericSpecializations.push('pkg.Gen<unknown>'),
    m=>m.exports.push('other.run'),
    m=>m.imports.push({capability:'eval',abiSha256:c}),
    m=>m.imports.push({capability:'io.stdout',abiSha256:c}),
    m=>m.sourceFiles.push({path:'../secret.atto',sha256:c}),
    m=>m.sourceFiles.push({path:'stdlib/core/identity.atto',sha256:c}),
    m=>m.sourceFiles[0].sha256='0',
    m=>m.modules.push('pkg'),
    m=>m.source.commit='f'.repeat(39),
  ];
  for(const mutate of cases){
    const m=manifest();mutate(m);
    denied(()=>admitClosedWorldManifest(m));
  }
});

test('prototype, accessor, symbol and nonenumerable field injection fail closed',()=>{
  for(const mutate of [
    m=>m.extra=true,
    m=>Object.defineProperty(m,'hidden',{value:'x'}),
    m=>m[Symbol('hidden')]='x',
    m=>Object.defineProperty(m,'closedWorld',{get:()=>true,enumerable:true}),
    m=>m.source=Object.create({commit:a,tree:b}),
    m=>m.imports[0].extra='x',
  ]) {const m=manifest();mutate(m);denied(()=>admitClosedWorldManifest(m));}
});

test('sparse arrays, array symbols, and hidden indexes cannot bypass closed-world admission',()=>{
  const mutations=[
    m=>delete m.genericSpecializations[0],
    m=>m.modules[Symbol('hidden')]='secret',
    m=>Object.defineProperty(m.actorEntries,'0',{get:()=> 'pkg.worker',enumerable:true}),
    m=>m.exports.extra='unsafe',
    m=>delete m.sourceFiles[0],
    m=>delete m.imports[0],
  ];
  for(const mutate of mutations) {
    const m=manifest();mutate(m);denied(()=>admitClosedWorldManifest(m));
  }
  for(const mutate of [
    r=>delete r.runner.steps[0],
    r=>r.runner.steps.extra='fake',
    r=>Object.defineProperty(r.runner.steps,'0',{get:()=>({name:'fake',conclusion:'success'}),enumerable:true}),
  ]){
    const m=manifest(), r=receipt(m);mutate(r);
    denied(()=>inspectAotProofReceipt(r,m));
  }
});

test('zero steps, stale build and unverifiable success claims are rejected',()=>{
  const cases=[
    r=>r.runner.steps=[],
    r=>r.runner.runnerId=0,
    r=>r.runner.steps[0].conclusion='skipped',
    r=>r.runner.steps[1].name='checkout',
    r=>r.runner.steps[0].name=' \n',
    r=>r.source.tree='0'.repeat(40),
    r=>r.compiler.sha256='d'.repeat(64),
    r=>r.manifestSha256='a'.repeat(64),
    r=>r.execution.compiledGuestCases=0,
    r=>r.execution.negativeNoArtifactCases=0,
    r=>r.execution.tracingGcEvents=1,
    r=>r.execution.runtimeCompilerInvocations=1,
    r=>r.execution.unsupportedFeatures=['runtime-eval','runtime-eval'],
    r=>r.artifact.format='pe',
  ];
  for(const mutate of cases) {
    const m=manifest(),r=receipt(m);mutate(r);
    denied(()=>inspectAotProofReceipt(r,m));
  }
});

test('a forged-but-plausible receipt can never claim AOT certification',()=>{
  const m=manifest(), r=receipt(m);
  r.runner.runnerId=999999;
  r.runner.workflowRunId=999999;
  r.execution.compiledGuestCases=999999;
  const result=inspectAotProofReceipt(r,m);
  assert.deepEqual(result,{
    structurallyValid:true,authenticated:false,certified:false,
    reason:'REQUIRES_AUTHENTICATED_PROVIDER_AND_ARTIFACT_BYTES'
  });
  denied(()=>inspectAotProofReceipt({...r,actorCanaryPassed:true},m));
});

test('supported backend identity and artifact format remain distinct',()=>{
  for(const [backend,triple,format] of [
    ['java-graal','x86_64-unknown-linux-gnu','elf'],
    ['llvm','aarch64-apple-darwin','macho'],
    ['net','x86_64-pc-windows-msvc','pe'],
    ['wasm','wasm32-unknown-unknown','wasm'],
    ['forge','aarch64-unknown-linux-gnu','elf']]){
    const m=manifest();m.target.backend=backend;m.target.triple=triple;
    const r=receipt(m);r.artifact.format=format;
    assert.equal(inspectAotProofReceipt(r,m).certified,false);
  }
});

test('SHA and identifier fields require primitive strings rather than coerced objects',()=>{
  let coerced=0;
  const spoof=s=>({toString(){coerced++;return s;}});
  for(const mutate of [
    m=>m.source.commit=spoof(a),
    m=>m.source.tree=spoof(b),
    m=>m.compiler.name=spoof('atto-llvmc'),
    m=>m.compiler.sha256=spoof(c),
    m=>m.sourceFiles[0].sha256=spoof(c),
    m=>m.imports[0].abiSha256=spoof(c),
  ]) {
    const m=manifest();mutate(m);
    denied(()=>admitClosedWorldManifest(m));
  }
  const m=manifest(),r=receipt(m);
  r.artifact.sha256=spoof(r.artifact.sha256);
  denied(()=>inspectAotProofReceipt(r,m));
  assert.equal(coerced,0,'untrusted toString must never execute');
});
