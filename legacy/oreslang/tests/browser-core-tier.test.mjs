import test from 'node:test';
import assert from 'node:assert/strict';
import {validateClosure} from '../src/contract.mjs';
import {loadProfiles} from '../src/load-registry.mjs';

const profiles=await loadProfiles();
const node=(id,layer,target,imports=[],requires=[],providerRequires=[])=>({
  id,layer,targets:[target],imports,requires,providerRequires
});
const closure=(target,backend,libraryProfile='core')=>({
  schemaVersion:1,entry:'app',target,backend,grants:[],providers:[],
  libraryProfile,
  nodes:[
    node('app','app',target,['ores.core/minmax']),
    node('ores.core/minmax','core',target)
  ]
});
const result=g=>validateClosure(g,profiles,g.libraryProfile);
const diagnostics=g=>result(g).errors.join('\n');

test('ores.core is admitted without OS authority on browser JS, Wasm and native',()=>{
  for(const [target,backend] of [
    ['browser','javascript'],['edge-js','javascript'],['server','javascript'],
    ['browser','wasm'],['edge-js','wasm'],['embedded','llvm']
  ]){
    const graph=closure(target,backend);
    assert.equal(result(graph).ok,true,target+'/'+backend+': '+diagnostics(graph));
  }
});

test('browser capability upper bounds never silently become core grants',()=>{
  for(const target of ['browser','edge-js']){
    const base=closure(target,'javascript');
    for(const cap of ['clock','net.client','heap','gc'])
      assert.match(diagnostics({...base,grants:[cap]}),/unused build grants/);
    const implicitHeap={...base,nodes:[
      node('app','app',target,['ores.core/minmax'],['heap']),
      node('ores.core/minmax','core',target)
    ]};
    assert.match(diagnostics(implicitHeap),/core profile cannot require ambient/);
  }
});

test('browser ores.std uses only explicit admitted host capabilities',()=>{
  const target='browser',backend='javascript';
  const admitted={
    ...closure(target,backend,'std'),
    grants:['net.client'],
    nodes:[
      node('app','app',target,['ores.std/http'],['net.client']),
      node('ores.std/http','std',target,['ores.core/minmax'],['net.client']),
      node('ores.core/minmax','core',target)
    ]
  };
  assert.equal(result(admitted).ok,true,diagnostics(admitted));
  assert.match(diagnostics({...admitted,grants:[]}),/missing build grants/);
  const coreImportsStd={...admitted,nodes:[
    node('app','app',target,['ores.core/minmax']),
    node('ores.core/minmax','core',target,['ores.std/http']),
    node('ores.std/http','std',target,[],['net.client'])
  ]};
  assert.match(diagnostics(coreImportsStd),/forbidden library dependency core -> std/);
});

test('core profile cannot gain ores.std by listing it as a dependency',()=>{
  const base=closure('browser','javascript');
  const graph={...base,nodes:[
    node('app','app','browser',['ores.std/http']),
    node('ores.std/http','std','browser',['ores.core/minmax']),
    node('ores.core/minmax','core','browser')
  ]};
  assert.match(diagnostics(graph),/library layer std is forbidden in core/);
});

test('Node server JavaScript can run core without granting Node authority',()=>{
  const base=closure('server','javascript');
  assert.equal(result(base).ok,true,diagnostics(base));
  for(const capability of ['fs.read','fs.write','net.client','threads'])
    assert.match(diagnostics({...base,grants:[capability]}),/unused build grants/);
  assert.match(diagnostics({...base,grants:['interop.native']}),
    /backend javascript on server does not admit interop\.native/);

  const std={
    ...closure('server','javascript','std'),
    grants:['fs.read'],
    nodes:[
      node('app','app','server',['ores.std/fs'],['fs.read']),
      node('ores.std/fs','std','server',['ores.core/minmax'],['fs.read']),
      node('ores.core/minmax','core','server')
    ]
  };
  assert.equal(result(std).ok,true,diagnostics(std));
});

test('Node JS server still rejects unverified Java/native FFI',()=>{
  const target='server',backend='javascript';
  for(const forbidden of ['interop.java','interop.native']){
    const g={
      ...closure(target,backend,'std'),
      grants:[forbidden],
      nodes:[
        node('app','app',target,['ores.std/bridge'],[forbidden]),
        node('ores.std/bridge','std',target,['ores.core/minmax'],[forbidden]),
        node('ores.core/minmax','core',target)
      ]
    };
    assert.match(diagnostics(g),
      /backend javascript on server does not admit interop\.(?:java|native)/);
  }
});
