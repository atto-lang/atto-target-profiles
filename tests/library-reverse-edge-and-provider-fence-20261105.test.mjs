import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLibraryClosure} from '../src/library-profile.mjs';

const node=(id,layer,imports=[],providerRequires=[],requires=[])=>({
  id,layer,imports,providerRequires,requires
});
test('explicit provider requirements propagate over every imported layer edge',()=>{
  const checked=validateLibraryClosure({libraryProfile:'std',
    nodes:[node('core','core',[],['allocator.explicit']),
      node('std','std',['core'],['allocator.explicit'],['host-io']),
      node('app','app',['std'],['allocator.explicit'])],
    providers:['allocator.explicit']});
  assert.equal(checked.ok,true);
  assert.deepEqual(checked.errors,[]);
});
test('core to std and std to app reverse dependencies are forbidden',()=>{
  for(const nodes of [
    [node('core','core',['std']),node('std','std')],
    [node('app','app'),node('std','std',['app'])]]){
    const checked=validateLibraryClosure({libraryProfile:'std',nodes,providers:[]});
    assert.equal(checked.ok,false);
    assert.match(checked.errors.join('\n'),/forbidden library dependency/);
  }
});
test('core cannot acquire ambient host effects inside hosted std graph',()=>{
  const checked=validateLibraryClosure({libraryProfile:'std',
    nodes:[node('core','core',[],[],['network'])],providers:[]});
  assert.equal(checked.ok,false);
  assert.match(checked.errors.join('\n'),/cannot require ambient host capabilities/);
});
test('unused explicit provider grants remain an admission error',()=>{
  const checked=validateLibraryClosure({libraryProfile:'std',
    nodes:[node('app','app')],providers:['clock.monotonic']});
  assert.equal(checked.ok,false);
  assert.match(checked.errors.join('\n'),/unused or unauthorized library provider/);
});