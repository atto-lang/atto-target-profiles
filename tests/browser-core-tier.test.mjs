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
    ['browser','javascript'],['edge-js','javascript'],['server','javascript'],
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

test('Node server JavaScript can admit pure core without granting hosted Node authority',()=>{
  const base=closure('server','javascript');
  assert.equal(result(base).ok,true,diagnostics(base));
  for(const capability of ['fs.read','fs.write','net.client','threads','interop.native']){
    assert.match(diagnostics({...base,grants:[capability]}),/unused build grants/,
      capability+' was improperly granted without source demand');
  }
  const hosted={
    ...closure('server','javascript','hosted'),
    grants:['fs.read'],
    nodes:[
      node('app','app','server',['std/fs'],['fs.read']),
      node('std/fs','std','server',['core/minmax'],['fs.read']),
      node('core/minmax','core','server')
    ]
  };
  assert.equal(result(hosted).ok,true,diagnostics(hosted));
  assert.match(diagnostics({...hosted,grants:[]}),/missing build grants/);
  const coreReadsFilesystem={...hosted,nodes:[
    node('app','app','server',['core/minmax'],['fs.read']),
    node('core/minmax','core','server',['std/fs'],['fs.read']),
    node('std/fs','std','server',[],['fs.read'])
  ]};
  assert.match(diagnostics(coreReadsFilesystem),/core cannot require any host capability/);
  assert.match(diagnostics(coreReadsFilesystem),/forbidden library dependency core -> std/);
});

test('Node JS server cannot forge Java or native FFI authority from the server upper bound',()=>{
  const target='server',backend='javascript';
  for(const forbidden of ['interop.java','interop.native']){
    const g={
      ...closure(target,backend,'hosted'),
      grants:[forbidden],
      nodes:[
        node('app','app',target,['std/bridge'],[forbidden]),
        node('std/bridge','std',target,['core/minmax'],[forbidden]),
        node('core/minmax','core',target)
      ]
    };
    assert.match(diagnostics(g),
      /backend javascript on server does not admit interop\.(?:java|native)/);
  }
  // Java/Graal on a server remains governed by its original explicit grants.
  const g={
    ...closure(target,'graal','hosted'),
    grants:['interop.java'],
    nodes:[
      node('app','app',target,['std/java'],['interop.java']),
      node('std/java','std',target,['core/minmax'],['interop.java']),
      node('core/minmax','core',target)
    ]
  };
  assert.equal(result(g).ok,true,diagnostics(g));
});
