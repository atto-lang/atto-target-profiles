import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLibraryClosure} from '../src/library-profile.mjs';

const node=(id,layer,imports=[],providerRequires=[],requires=[])=>({
  id,layer,imports,providerRequires,requires
});
const closure=nodes=>validateLibraryClosure({
  libraryProfile:'std',providers:['clock.monotonic'],nodes
});
test('multi-hop std provider is explicitly carried to the app',()=>{
  const result=closure([
    node('app','app',['middle'],['clock.monotonic']),
    node('middle','std',['leaf'],['clock.monotonic']),
    node('leaf','std',[],['clock.monotonic'])
  ]);
  assert.equal(result.ok,true);
  assert.deepStrictEqual(result.errors,[]);
});
test('intermediate import cannot drop downstream provider grant',()=>{
  const result=closure([
    node('app','app',['middle'],['clock.monotonic']),
    node('middle','std',['leaf']),
    node('leaf','std',[],['clock.monotonic'])
  ]);
  assert.equal(result.ok,false);
  assert.match(result.errors.join('|'),/undeclared imported provider clock.monotonic/);
});
test('core cannot import std even with explicit host provider grant',()=>{
  const result=validateLibraryClosure({
    libraryProfile:'std',providers:[],
    nodes:[node('core','core',['host']),node('host','std')]
  });
  assert.equal(result.ok,false);
  assert.match(result.errors.join('|'),/forbidden library dependency core -> std/);
});
test('unused provider cannot authorize unclaimed capability',()=>{
  const result=validateLibraryClosure({
    libraryProfile:'std',providers:['clock.monotonic'],
    nodes:[node('app','app')]
  });
  assert.equal(result.ok,false);
  assert.match(result.errors.join('|'),/unused or unauthorized library provider/);
});
