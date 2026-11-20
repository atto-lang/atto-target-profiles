import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLibraryClosure} from '../src/library-profile.mjs';

const n=(id,layer,requires=[],providerRequires=[],imports=[])=>({id,layer,requires,providerRequires,imports});
const core=()=>n('core.math','core');
const clock=()=>n('std.clock','std',['clock'],['clock.monotonic'],['core.math']);
const app=()=>n('app','app',['clock'],['clock.monotonic'],['std.clock']);

test('explicit std provider grants admit only the declared, transitively propagated graph',()=>{
  const result=validateLibraryClosure({
    nodes:[core(),clock(),app()],libraryProfile:'std',providers:['clock.monotonic']
  });
  assert.deepEqual(result,{ok:true,errors:[]});
});

test('core-only profile and core module cannot smuggle hosted std dependencies',()=>{
  const profile=validateLibraryClosure({
    nodes:[core(),clock()],libraryProfile:'core',providers:['clock.monotonic']
  });
  assert.equal(profile.ok,false);
  assert.ok(profile.errors.some(x=>x.includes('library layer std is forbidden in core')));
  const imported=validateLibraryClosure({
    nodes:[n('core.importer','core',[],[],['std.clock']),clock()],
    libraryProfile:'std',providers:['clock.monotonic']
  });
  assert.equal(imported.ok,false);
  assert.ok(imported.errors.some(x=>x.includes('forbidden library dependency core -> std')));
});

test('missing transitive provider propagation and unused provider grants are errors',()=>{
  const missing=validateLibraryClosure({
    nodes:[core(),clock(),n('app','app',['clock'],[],['std.clock'])],
    libraryProfile:'std',providers:['clock.monotonic']
  });
  assert.ok(missing.errors.some(x=>x.includes('undeclared imported provider clock.monotonic')));
  const unused=validateLibraryClosure({
    nodes:[core()],libraryProfile:'std',providers:['clock.monotonic']
  });
  assert.equal(unused.ok,false);
  assert.ok(unused.errors.some(x=>x.includes('unused or unauthorized library provider')));
});
