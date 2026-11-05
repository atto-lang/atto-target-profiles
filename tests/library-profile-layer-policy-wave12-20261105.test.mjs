import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLibraryClosure} from '../src/library-profile.mjs';
const node=(id,layer,imports=[],providerRequires=[],requires=[])=>({id,layer,imports,providerRequires,requires});

test('hosted std graph permits explicit host effects only in hosted layers',()=>{
 const good=validateLibraryClosure({libraryProfile:'std',providers:[],
  nodes:[node('base','core'),node('net','std',['base'],[],['network']),node('app','app',['net'])]});
 assert.equal(good.ok,true);assert.deepEqual(good.errors,[]);
 const bad=validateLibraryClosure({libraryProfile:'std',providers:[],
  nodes:[node('base','core',[],[],['network']),node('net','std',['base'])]});
 assert.equal(bad.ok,false);
 assert.match(bad.errors.join('\n'),/ores\.core cannot require ambient host capabilities/);
});
test('forbidden reverse dependencies remain rejected under a hosted profile',()=>{
 for(const graph of [
  [node('core','core',['std']),node('std','std')],
  [node('app','app'),node('std','std',['app'])]]){
  const check=validateLibraryClosure({libraryProfile:'std',nodes:graph,providers:[]});
  assert.equal(check.ok,false);
  assert.match(check.errors.join('\n'),/forbidden library dependency/);
 }
});
test('unknown profile fails before validating supplied package nodes',()=>{
 const check=validateLibraryClosure({libraryProfile:'sandbox',nodes:[],providers:[]});
 assert.deepEqual(check,{ok:false,errors:['unknown libraryProfile']});
});
test('importers cannot silently inherit a provider without declaring it',()=>{
 const missing=validateLibraryClosure({libraryProfile:'std',
  nodes:[node('core','core',[],['executor.explicit']),node('app','app',['core'])],
  providers:['executor.explicit']});
 assert.equal(missing.ok,false);
 assert.match(missing.errors.join('\n'),/undeclared imported provider executor\.explicit/);
 const granted=validateLibraryClosure({libraryProfile:'std',
  nodes:[node('core','core',[],['executor.explicit']),node('app','app',['core'],['executor.explicit'])],
  providers:['executor.explicit']});
 assert.equal(granted.ok,true);
});
