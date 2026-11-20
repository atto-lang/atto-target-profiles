import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLibraryClosure} from '../src/library-profile.mjs';

const node=(id,layer,imports=[],providerRequires=[],requires=[])=>({
  id,layer,imports,providerRequires,requires
});

// These are structural metadata checks, not compiled AttoLang guest evidence.
test('core profile admits a closed core/app graph with explicitly propagated allocator',()=>{
  const result=validateLibraryClosure({libraryProfile:'core',
    nodes:[node('freestanding','core',[],['allocator.explicit']),
      node('entry','app',['freestanding'],['allocator.explicit'])],
    providers:['allocator.explicit']});
  assert.deepEqual(result,{ok:true,errors:[]});
});

test('core profile denies hosted std nodes even when no ambient effects are requested',()=>{
  const result=validateLibraryClosure({libraryProfile:'core',
    nodes:[node('hosted','std')],providers:[]});
  assert.equal(result.ok,false);
  assert.match(result.errors.join('\n'),/library layer std is forbidden in core/);
});

test('core profile denies ambient host effects for app as well as core nodes',()=>{
  for(const layer of ['app','core']){
    const result=validateLibraryClosure({libraryProfile:'core',
      nodes:[node('entry',layer,[],[],['network'])],providers:[]});
    assert.equal(result.ok,false,layer);
    assert.match(result.errors.join('\n'),/core profile cannot require ambient host capabilities/);
  }
});

test('imported explicit providers require both declaration propagation and a build grant',()=>{
  const missingPropagation=validateLibraryClosure({libraryProfile:'core',
    nodes:[node('core','core',[],['allocator.explicit']),
      node('entry','app',['core'])],providers:['allocator.explicit']});
  assert.equal(missingPropagation.ok,false);
  assert.match(missingPropagation.errors.join('\n'),/undeclared imported provider allocator\.explicit/);
  const missingGrant=validateLibraryClosure({libraryProfile:'core',
    nodes:[node('core','core',[],['allocator.explicit']),
      node('entry','app',['core'],['allocator.explicit'])],providers:[]});
  assert.equal(missingGrant.ok,false);
  assert.match(missingGrant.errors.join('\n'),/missing explicit provider grant allocator\.explicit/);
});
