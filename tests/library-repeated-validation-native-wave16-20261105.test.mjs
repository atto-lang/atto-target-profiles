import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLibraryClosure} from '../src/library-profile.mjs';

const node=(id,layer,imports=[],providerRequires=[],requires=[])=>
  ({id,layer,imports,providerRequires,requires});
const check=(nodes,profile='std',providers=[])=>
  validateLibraryClosure({nodes,libraryProfile:profile,providers});
test('repeated closure validation does not alter owned source metadata',()=>{
  const nodes=[node('core','core'),node('std','std',['core']),
    node('app','app',['std'])];
  const before=JSON.stringify(nodes);
  const one=check(nodes),two=check(nodes);
  assert.equal(one.ok,true);assert.deepEqual(one,two);
  assert.equal(JSON.stringify(nodes),before);
});
test('core-only profiles reject std even when there are no host effects',()=>{
  const result=check([node('std','std')],'core');
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/forbidden in core/);
});
test('missing grant cannot be hidden by a different used provider',()=>{
  const result=check([node('std','std',[],['allocator.explicit','clock.monotonic'])],
    'std',['allocator.explicit']);
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/missing explicit provider grant clock.monotonic/);
});
test('invalid layer and unsupported profile reject instead of promoting',()=>{
  const invalid=check([node('x','unknown')]);
  assert.equal(invalid.ok,false);
  assert.match(invalid.errors.join('\n'),/invalid library layer/);
  const profile=check([node('x','core')],'ambient-host');
  assert.deepEqual(profile,{ok:false,errors:['unknown libraryProfile']});
});