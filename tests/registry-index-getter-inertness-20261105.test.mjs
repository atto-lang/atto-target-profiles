import test from 'node:test';
import assert from 'node:assert/strict';
import {ENVIRONMENTS,validateRegistry} from '../src/contract.mjs';

const valid=()=>ENVIRONMENTS.map(name=>({
  schemaVersion:1,name,backends:['wasm'],capabilities:[]
}));

test('complete own-data registry remains accepted with null-prototype profile',()=>{
  const profiles=valid();
  assert.equal(validateRegistry(profiles).ok,true);
  Object.setPrototypeOf(profiles[0],null);
  assert.equal(validateRegistry(profiles).ok,true);
});

test('registry index getter is never called during authority admission',()=>{
  const profiles=valid();
  let called=0;
  Object.defineProperty(profiles,'0',{
    configurable:true,enumerable:true,
    get(){called++;throw Error('untrusted index getter');}
  });
  assert.equal(validateRegistry(profiles).ok,false);
  assert.equal(called,0);
});

test('sparse, extra-key and accessor-backed profile registries fail closed',()=>{
  const sparse=valid();delete sparse[1];
  assert.equal(validateRegistry(sparse).ok,false);
  const extra=valid();extra.untrusted='authority';
  assert.equal(validateRegistry(extra).ok,false);
  const symbol=valid();symbol[Symbol('authority')]=true;
  assert.equal(validateRegistry(symbol).ok,false);
  const profile=valid();let called=0;
  Object.defineProperty(profile[0],'name',{
    enumerable:true,get(){called++;throw Error('untrusted name getter');}
  });
  assert.equal(validateRegistry(profile).ok,false);
  assert.equal(called,0);
});
