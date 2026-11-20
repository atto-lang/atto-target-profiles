import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLibraryClosure} from '../src/library-profile.mjs';

const node=(id,layer,imports=[],providerRequires=[],requires=[])=>({id,layer,imports,providerRequires,requires});
const run=(nodes,providers)=>validateLibraryClosure({nodes,providers,libraryProfile:'std'});
test('declared explicit provider propagates from each branch of diamond imports',()=>{
  const nodes=[node('coreA','core',[],['allocator.explicit']),
    node('coreB','core',[],['clock.monotonic']),
    node('host','std',['coreA','coreB'],['allocator.explicit','clock.monotonic']),
    node('app','app',['host'],['allocator.explicit','clock.monotonic'])];
  const r=run(nodes,['allocator.explicit','clock.monotonic']);
  assert.equal(r.ok,true);assert.deepEqual(r.errors,[]);
});
test('omitting either dependency provider in an importing node is refused',()=>{
  for(const kept of [['allocator.explicit'],['clock.monotonic']]){
    const r=run([node('a','core',[],['allocator.explicit']),
      node('b','core',[],['clock.monotonic']),
      node('host','std',['a','b'],kept)],['allocator.explicit','clock.monotonic']);
    assert.equal(r.ok,false);
    assert.match(r.errors.join('\n'),/undeclared imported provider/);
  }
});
test('grants not consumed by any declaration are refused',()=>{
  const r=run([node('host','std',[],['allocator.explicit'])],
    ['allocator.explicit','clock.monotonic']);
  assert.equal(r.ok,false);
  assert.match(r.errors.join('\n'),/unused or unauthorized library provider/);
});
test('core importing hosted std cannot gain host effects through imports',()=>{
  const r=run([node('std','std'),node('core','core',['std'])],[]);
  assert.equal(r.ok,false);
  assert.match(r.errors.join('\n'),/forbidden library dependency/);
});