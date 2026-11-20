import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLibraryClosure} from '../src/library-profile.mjs';

const node=(id,layer,imports=[],providerRequires=[],requires=[])=>({
  id,layer,imports,providerRequires,requires
});

test('freestanding core permits only host-effect-free app and core closure',()=>{
  const allowed=validateLibraryClosure({
    libraryProfile:'core',
    nodes:[node('app','app',['core']),node('core','core')],
    providers:[]
  });
  assert.equal(allowed.ok,true);
  assert.deepEqual(allowed.errors,[]);
  const forbidden=validateLibraryClosure({
    libraryProfile:'core',
    nodes:[node('app','app',['std']),node('std','std')],
    providers:[]
  });
  assert.equal(forbidden.ok,false);
  assert.match(forbidden.errors.join('\n'),/forbidden/);
});

test('std can use explicit provider grants propagated to importing app',()=>{
  const source=[
    node('core','core'),
    node('std','std',['core'],['clock.monotonic'],['host-clock']),
    node('app','app',['std'],['clock.monotonic'])
  ];
  const checked=validateLibraryClosure({
    libraryProfile:'std',nodes:source,providers:['clock.monotonic']
  });
  assert.equal(checked.ok,true);
  assert.deepEqual(checked.errors,[]);
});

test('a transitive imported provider must be explicitly declared on importer',()=>{
  const checked=validateLibraryClosure({
    libraryProfile:'std',
    nodes:[
      node('core','core'),
      node('std','std',['core'],['clock.monotonic'],['host-clock']),
      node('app','app',['std'])
    ],
    providers:['clock.monotonic']
  });
  assert.equal(checked.ok,false);
  assert.match(checked.errors.join('\n'),/undeclared imported provider/);
});

test('unused providers and core ambient requirements fail closed',()=>{
  assert.equal(validateLibraryClosure({
    libraryProfile:'std',nodes:[node('core','core')],
    providers:['clock.monotonic']
  }).ok,false);
  const checked=validateLibraryClosure({
    libraryProfile:'core',
    nodes:[node('core','core',[],[],['network'])],
    providers:[]
  });
  assert.equal(checked.ok,false);
  assert.match(checked.errors.join('\n'),/cannot require ambient host capabilities/);
});
