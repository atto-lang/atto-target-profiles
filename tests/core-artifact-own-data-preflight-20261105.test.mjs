import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCoreWasmArtifact} from '../src/artifact.mjs';

const artifact=()=>({
 schemaVersion:1,artifactType:'oreslang.core-wasm.i64-v1',target:'wasm32',
 environment:'browser',backend:'wasm',entry:'main',
 wasmSha256:'a'.repeat(64),wasmBytes:8,requiredCapabilities:[],imports:[],
 memory:{maximumPages:1},
 producer:{compilerSha256:'b'.repeat(64),sourceSha256:'c'.repeat(64),llvmIrSha256:'d'.repeat(64)}
});
const rejected=manifest=>{
 const result=validateCoreWasmArtifact(manifest,[]);
 assert.equal(result.ok,false);
 assert.ok(result.errors.length>0);
};

test('top-level artifact accessors fail before executing caller code',()=>{
 for(const field of ['entry','backend','wasmBytes','environment']){
  const manifest=artifact();let hits=0;
  Object.defineProperty(manifest,field,{enumerable:true,get(){hits++;throw Error('host getter invoked');}});
  rejected(manifest);
  assert.equal(hits,0,field);
 }
});

test('nested provenance and memory getters never become trusted authority',()=>{
 for(const [sub,field] of [['producer','compilerSha256'],['memory','maximumPages']]){
  const manifest=artifact();let hits=0;
  Object.defineProperty(manifest[sub],field,{enumerable:true,get(){hits++;throw Error('nested getter ran');}});
  rejected(manifest);
  assert.equal(hits,0);
 }
});

test('symbol, hidden metadata and custom empty-array iterators are denied before use',()=>{
 for(const mutate of [
  a=>{a[Symbol('privilege')]=true;},
  a=>Object.defineProperty(a,'entry',{value:'main',enumerable:false}),
  a=>{a.memory.unexpected=true;},
  a=>{a.producer.extra='e';}
 ]){
  const manifest=artifact();mutate(manifest);rejected(manifest);
 }
 let hits=0;const manifest=artifact();
 Object.defineProperty(manifest.imports,Symbol.iterator,{get(){hits++;throw Error('iterator executed');}});
 rejected(manifest);
 assert.equal(hits,0);
});