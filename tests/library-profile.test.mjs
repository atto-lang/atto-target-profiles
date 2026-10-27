import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {validateClosure,LIBRARY_PROFILES,LIBRARY_LAYERS,LIBRARY_PROVIDERS}
  from "../src/contract.mjs";
import {loadProfiles} from "../src/load-registry.mjs";

const profiles=await loadProfiles();
const node=(id,layer,imports=[],requires=[],providerRequires=[])=>({
  id,layer,imports,requires,providerRequires,targets:["browser"]
});
const base={
  schemaVersion:1,entry:"app",target:"browser",backend:"wasm",
  grants:[],libraryProfile:"core",providers:[],
  nodes:[node("app","app",["ores.core/math"]),node("ores.core/math","core")]
};
const check=g=>validateClosure(g,profiles);
const errors=g=>check(g).errors.join("\n");

test("public contract has exactly core and std profiles",()=>{
  assert.deepEqual(LIBRARY_PROFILES,["core","std"]);
  assert.deepEqual(LIBRARY_LAYERS,["app","core","std"]);
});

test("core closure requires no OS capability or provider by default",()=>{
  assert.equal(check(base).ok,true,errors(base));
});

test("core cannot import std even when the overall build is std",()=>{
  const graph={...base,libraryProfile:"std",nodes:[
    node("app","app",["ores.core/math"]),
    node("ores.core/math","core",["ores.std/io"]),
    node("ores.std/io","std")
  ]};
  assert.match(errors(graph),/forbidden library dependency core -> std/);
});

test("core profile rejects std units",()=>{
  const graph={...base,nodes:[
    node("app","app",["ores.std/io"]),
    node("ores.std/io","std")
  ]};
  assert.match(errors(graph),/library layer std is forbidden in core/);
});

test("std cannot import application units",()=>{
  const denied={...base,libraryProfile:"std",nodes:[
    node("app","app",["ores.std/net"]),
    node("ores.std/net","std",["app"])
  ]};
  assert.match(errors(denied),/forbidden library dependency std -> app/);
});

test("allocation is an explicit provider, not a third library layer",()=>{
  const nodes=[
    node("app","app",["ores.core/vector"],[],["allocator.explicit"]),
    node("ores.core/vector","core",[],[],["allocator.explicit"])
  ];
  const graph={...base,nodes,providers:["allocator.explicit"]};
  assert.equal(check(graph).ok,true,errors(graph));
  assert.match(errors({...graph,providers:[]}),/missing explicit provider grant/);
  assert.match(errors({...graph,nodes:[
    node("app","app",["ores.core/vector"]),
    node("ores.core/vector","core",[],[],["allocator.explicit"])
  ]}),/undeclared imported provider allocator.explicit/);
});

test("bare-metal actor services are providers, not actor or otp library layers",()=>{
  const actorProviders=["executor.explicit","mailbox.bounded","control.trusted"];
  const nodes=[
    node("app","app",["ores.core/actor"],[],actorProviders),
    node("ores.core/actor","core",[],[],actorProviders)
  ];
  const graph={...base,nodes,providers:actorProviders};
  assert.equal(check(graph).ok,true,errors(graph));
  assert.match(errors({...graph,providers:actorProviders.slice(1)}),
    /missing explicit provider grant executor.explicit/);
});

test("core profile forbids ambient host capabilities",()=>{
  const graph={...base,grants:["clock"],nodes:[
    node("app","app",["ores.core/math"],["clock"]),
    node("ores.core/math","core")
  ]};
  assert.match(errors(graph),/core profile cannot require ambient host capabilities/);
});

test("ores.core remains host-effect-free inside std builds",()=>{
  const graph={...base,libraryProfile:"std",grants:["fs.read"],nodes:[
    node("app","app",["ores.core/math"],["fs.read"]),
    node("ores.core/math","core",[],["fs.read"])
  ]};
  assert.match(errors(graph),/ores.core cannot require ambient host capabilities/);
});

test("std may use admitted host effects",()=>{
  const graph={...base,libraryProfile:"std",grants:["net.client"],nodes:[
    node("app","app",["ores.std/http"],["net.client"]),
    node("ores.std/http","std",["ores.core/math"],["net.client"]),
    node("ores.core/math","core")
  ]};
  assert.equal(check(graph).ok,true,errors(graph));
});

test("provider grants are least-authority and propagated",()=>{
  assert.match(errors({...base,providers:["clock.monotonic"]}),
    /unused or unauthorized library provider/);
  const missingPropagation={...base,providers:["clock.monotonic"],nodes:[
    node("app","app",["ores.core/timer"]),
    node("ores.core/timer","core",[],[],["clock.monotonic"])
  ]};
  assert.match(errors(missingPropagation),/undeclared imported provider clock.monotonic/);
});

test("provider lists must be plain dense unique own-data arrays",()=>{
  assert.match(errors({...base,providers:["fake"]}),/invalid or missing library providers/);
  assert.match(errors({...base,providers:["allocator.explicit","allocator.explicit"]}),
    /invalid or missing library providers/);
  assert.match(errors({...base,nodes:[node("app","app",["ores.core/math"],[],Array(1)),
    node("ores.core/math","core")]}),/invalid inferred provider requirements/);
  let access=0;
  const hostile={...base};
  Object.defineProperty(hostile,"providers",{enumerable:true,get(){access++;return [];}});
  assert.equal(check(hostile).ok,false);
  assert.equal(access,0);
});

test("profile opt-in remains explicit",()=>{
  const noProfile={...base};delete noProfile.libraryProfile;delete noProfile.providers;
  assert.match(errors(noProfile),/layer requires libraryProfile/);
  const legacy={...noProfile,nodes:base.nodes.map(({layer,providerRequires,...x})=>x)};
  assert.equal(check(legacy).ok,true,errors(legacy));
});

test("build-selected profile cannot be removed or changed",()=>{
  const noProfile={...base};delete noProfile.libraryProfile;delete noProfile.providers;
  const legacy={...noProfile,nodes:base.nodes.map(({layer,providerRequires,...x})=>x)};
  assert.match(validateClosure(legacy,profiles,"core").errors.join("\n"),
    /missing or mismatched build selection/);
  assert.match(validateClosure({...base,libraryProfile:"std"},profiles,"core")
    .errors.join("\n"),/missing or mismatched build selection/);
  assert.equal(validateClosure(base,profiles,"core").ok,true);
  assert.equal(validateClosure(base,profiles,"std").ok,false);
  for(const oldName of ["hosted","freestanding-core","freestanding-alloc",
                        "freestanding-actor","freestanding-otp"])
    assert.equal(validateClosure({...base,libraryProfile:oldName},profiles).ok,false,oldName);
});

test("JSON schema matches the two-layer contract",async()=>{
  const s=JSON.parse(await readFile(new URL("../schemas/resolved-closure.schema.json",import.meta.url),"utf8"));
  assert.deepEqual(s.$defs.libraryProfile.enum,LIBRARY_PROFILES);
  assert.deepEqual(s.$defs.libraryLayer.enum,LIBRARY_LAYERS);
  assert.deepEqual(s.$defs.libraryProvider.enum,LIBRARY_PROVIDERS);
});

test("CLI exercises a core closure from fixture",()=>{
  const cli=new URL("../bin/oreslang-target.mjs",import.meta.url).pathname;
  const fixture=new URL("../examples/freestanding-core-closure.json",import.meta.url).pathname;
  const run=spawnSync(process.execPath,[cli,"check-closure",fixture,
    "--target=embedded","--backend=llvm","--grants="],{encoding:"utf8"});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/2 units/);
});
