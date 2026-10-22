import test from 'node:test';
import assert from 'node:assert/strict';
import {validateClosure} from '../src/contract.mjs';
import {loadProfiles} from '../src/load-registry.mjs';

// Contract-level execution only: declarations must be compiler-inferred from
// pinned sources; these fixtures are not source compilation evidence.
const profiles=await loadProfiles();
const node=(id,layer,target,imports=[],requires=[],providerRequires=[])=>({
  id,layer,targets:[target],imports,requires,providerRequires
});
const closure=(target,backend,libraryProfile='freestanding-core')=>({
  schemaVersion:1,entry:'app',target,backend,grants:[],providers:[],
  libraryProfile,
  nodes:[
    node('app','app',target,['core/minmax']),
    node('core/minmax','core',target)
  ]
});
const result=g=>validateClosure(g,profiles,g.libraryProfile);
const diagnostics=g=>result(g).errors.join('\n');

test('pure core is admitted with zero OS/provider privileges on browser JS, edge JS, Wasm and native',()=>{
  for(const [target,backend] of [
    ['browser','javascript'],['edge-js','javascript'],
    ['browser','wasm'],['edge-js','wasm'],
    ['embedded','llvm']
  ]){
    const graph=closure(target,backend);
    assert.equal(result(graph).ok,true,target+'/'+backend+': '+diagnostics(graph));
    assert.equal(graph.grants.length,0);
    assert.equal(graph.providers.length,0);
  }
});

test('browser profile capability upper bounds never silently become core grants',()=>{
  for(const target of ['browser','edge-js']){
    const base=closure(target,'javascript');
    for(const cap of ['clock','net.client','heap','gc']){
      const graph={...base,grants:[cap]};
      assert.equal(result(graph).ok,false,target+'/'+cap);
      assert.match(diagnostics(graph),/unused build grants/);
    }
    const implicitHeap={...base,
      nodes:[node('app','app',target,['core/minmax'],['heap']),
        node('core/minmax','core',target)]};
    assert.match(diagnostics(implicitHeap),/freestanding nodes cannot require ambient/);
    const covertCoreClock={...base,grants:['clock'],
      nodes:[node('app','app',target,['core/minmax'],['clock']),
        node('core/minmax','core',target,[],['clock'])]};
    assert.match(diagnostics(covertCoreClock),/core cannot require any host capability/);
    const covertProvider={...base,providers:['clock.monotonic'],
      nodes:[node('app','app',target,['core/minmax'],[],['clock.monotonic']),
        node('core/minmax','core',target,[],[],['clock.monotonic'])]};
    assert.match(diagnostics(covertProvider),/core cannot require any runtime provider/);
  }
});

test('hosted browser std uses only explicit admitted net capability, never core inheritance',()=>{
  const target='browser',backend='javascript';
  const admitted={
    ...closure(target,backend,'hosted'),
    grants:['net.client'],
    nodes:[
      node('app','app',target,['std/http'],['net.client']),
      node('std/http','std',target,['core/minmax'],['net.client']),
      node('core/minmax','core',target)
    ]
  };
  assert.equal(result(admitted).ok,true,diagnostics(admitted));
  assert.match(diagnostics({...admitted,grants:[]}),/missing build grants/);
  assert.match(diagnostics({...admitted,nodes:[
    node('app','app',target,['std/http']),
    node('std/http','std',target,['core/minmax'],['net.client']),
    node('core/minmax','core',target)
  ]}),/imported requirements are not declared/);
  // Node-like fs.read never appears in a browser's capability upper bound.
  const fsGraph={...admitted,grants:['fs.read'],nodes:[
    node('app','app',target,['std/fs'],['fs.read']),
    node('std/fs','std',target,['core/minmax'],['fs.read']),
    node('core/minmax','core',target)
  ]};
  assert.match(diagnostics(fsGraph),/capability grant unavailable in browser/);
  const coreImportsHosted={...admitted,nodes:[
    node('app','app',target,['core/minmax']),
    node('core/minmax','core',target,['std/http']),
    node('std/http','std',target,[],['net.client'])
  ]};
  assert.match(diagnostics(coreImportsHosted),/forbidden library dependency core -> std/);
});

test('freestanding consumer cannot gain hosted std merely by listing it as a dependency',()=>{
  const base=closure('browser','javascript');
  const graph={...base,nodes:[
    node('app','app','browser',['std/http']),
    node('std/http','std','browser',['core/minmax']),
    node('core/minmax','core','browser')
  ]};
  assert.match(diagnostics(graph),/library layer std is forbidden/);
});
