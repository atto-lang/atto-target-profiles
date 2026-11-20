import test from 'node:test';
import assert from 'node:assert/strict';
import {CORE_WASM_ABI,validateCoreWasmArtifact} from '../src/artifact.mjs';
import {loadProfiles} from '../src/load-registry.mjs';

const profiles=await loadProfiles();
const digest='a'.repeat(64);
const good=()=>({
  schemaVersion:1,artifactType:CORE_WASM_ABI,target:'wasm32',
  environment:'browser',backend:'wasm',entry:'m',wasmSha256:digest,
  wasmBytes:1,requiredCapabilities:[],imports:[],
  memory:{maximumPages:1},
  producer:{compilerSha256:digest,sourceSha256:digest,llvmIrSha256:digest}
});
const admits=manifest=>validateCoreWasmArtifact(manifest,profiles).ok;

test('artifact byte and linear-memory bounds are inclusive and no larger',()=>{
  for(const wasmBytes of [1,16777216]){
    assert.equal(admits({...good(),wasmBytes}),true,String(wasmBytes));
  }
  for(const wasmBytes of [0,-1,1.5,16777217,Infinity,NaN]){
    assert.equal(admits({...good(),wasmBytes}),false,String(wasmBytes));
  }
  for(const maximumPages of [1,256]){
    assert.equal(admits({...good(),memory:{maximumPages}}),true,String(maximumPages));
  }
  for(const maximumPages of [0,-1,1.5,257]){
    assert.equal(admits({...good(),memory:{maximumPages}}),false,String(maximumPages));
  }
});

test('entry export length and digest spelling admit exact identities only',()=>{
  for(const entry of ['a','_entry','a'.repeat(128)]){
    assert.equal(admits({...good(),entry}),true,entry.slice(0,10));
  }
  for(const entry of ['', 'a'.repeat(129),'a-b','../guest','ñ']){
    assert.equal(admits({...good(),entry}),false,String(entry).slice(0,10));
  }
  for(const wasmSha256 of ['A'.repeat(64),'a'.repeat(63),'a'.repeat(65),'z'.repeat(64)]){
    assert.equal(admits({...good(),wasmSha256}),false,wasmSha256.slice(0,8));
  }
  assert.equal(admits(good()),true);
});
