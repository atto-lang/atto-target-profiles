import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {validateClosure,LIBRARY_PROFILES,LIBRARY_LAYERS,LIBRARY_PROVIDERS}
  from "../src/contract.mjs";
import {loadProfiles} from "../src/load-registry.mjs";

const profiles=await loadProfiles();
const ACTOR=["executor.explicit","mailbox.bounded","control.trusted"];
const node=(id,layer,imports=[],requires=[],providerRequires=[])=>({
  id,layer,imports,requires,providerRequires,targets:["browser"]
});
// Test builder only. The production validator must NEVER infer authority from
// untrusted names or silently fill in missing requirements.
const declared=nodes=>{
  const copies=nodes.map(n=>({...n,providerRequires:[...n.providerRequires]}));
  const index=new Map(copies.map(n=>[n.id,n]));
  for(const n of copies){
    if(n.layer==="actor")n.providerRequires=[...new Set([...n.providerRequires,...ACTOR])];
    if(n.layer==="alloc")n.providerRequires=[...new Set([...n.providerRequires,"allocator.explicit"])];
  }
  // Iterative fixed point handles nested import paths and cycles in fixtures.
  let changed=true,round=0;
  while(changed){
    if(++round>copies.length+1)throw Error("nonterminating test closure");
    changed=false;
    for(const n of copies){
      const all=new Set(n.providerRequires);
      for(const dep of n.imports)
        for(const provider of index.get(dep)?.providerRequires??[])all.add(provider);
      if(all.size!==n.providerRequires.length){
        n.providerRequires=[...all];changed=true;
      }
    }
  }
  return copies;
};
const base={
  schemaVersion:1,entry:"app",target:"browser",backend:"wasm",
  grants:[],libraryProfile:"freestanding-core",providers:[],
  nodes:[node("app","app",["core/math"]),node("core/math","core")]
};
const check=g=>validateClosure(g,profiles);
const errors=g=>check(g).errors.join("\n");
const actorNodes=()=>declared([node("app","app",["actor/mailbox"]),node("actor/mailbox","actor")]);

test("core-only closure requires no host capability or provider",()=>{
  assert.equal(check(base).ok,true,errors(base));
});
test("core forbids direct and transitive higher-layer imports",()=>{
  for(const layer of ["alloc","actor","otp","std"]){
    const graph={...base,libraryProfile:"hosted",nodes:[
      node("app","app",["core/math"]),node("core/math","core",["forbidden"]),
      node("forbidden",layer)
    ]};
    assert.match(errors(graph),new RegExp("forbidden library dependency core -> "+layer));
  }
});
test("freestanding rejects std even when imported by an app",()=>{
  assert.match(errors({...base,nodes:[node("app","app",["std/net"]),node("std/net","std")]}),
    /layer std is forbidden/);
});
test("hosted stdlib cannot import application units",()=>{
  const denied={...base,libraryProfile:"hosted",nodes:[
    node("app","app",["std/net"]),node("std/net","std",["app"])
  ]};
  assert.match(errors(denied),/forbidden library dependency std -> app/);
  const admitted={...denied,nodes:[node("app","app",["std/net"]),node("std/net","std")]};
  assert.equal(check(admitted).ok,true,errors(admitted));
});
test("alloc requires inferred demand and explicit allocator grant",()=>{
  const nodes=declared([node("app","app",["alloc/vector"]),node("alloc/vector","alloc")]);
  const graph={...base,libraryProfile:"freestanding-alloc",nodes,providers:["allocator.explicit"]};
  assert.equal(check(graph).ok,true,errors(graph));
  assert.match(errors({...graph,providers:[]}),/requires allocator.explicit|missing explicit provider/);
  const missingDemand=[node("app","app",["alloc/vector"]),node("alloc/vector","alloc")];
  assert.match(errors({...graph,nodes:missingDemand}),/requires declaration of allocator.explicit/);
  const missingPropagation=[node("app","app",["alloc/vector"]),
    node("alloc/vector","alloc",[],[],["allocator.explicit"])];
  assert.match(errors({...graph,nodes:missingPropagation}),/undeclared imported provider allocator.explicit/);
});
test("actor works with fixed capacity and without a mandatory allocator",()=>{
  const graph={...base,libraryProfile:"freestanding-actor",nodes:actorNodes(),providers:ACTOR};
  assert.equal(check(graph).ok,true,errors(graph));
  assert.match(errors({...graph,providers:ACTOR.slice(1)}),/missing explicit provider grant|requires executor.explicit/);
  const optional=declared([node("app","app",["actor/mailbox"]),
    node("actor/mailbox","actor",[],[],["allocator.explicit","clock.monotonic"])]);
  assert.equal(check({...graph,providers:[...ACTOR,"allocator.explicit","clock.monotonic"],nodes:optional}).ok,true);
});
test("actor provider requirements must propagate transitively and be complete",()=>{
  const bad={...base,libraryProfile:"freestanding-actor",providers:ACTOR,nodes:[
    node("app","app",["actor/mailbox"]),
    node("actor/mailbox","actor",[],[],ACTOR)
  ]};
  assert.match(errors(bad),/undeclared imported provider executor.explicit/);
  const forged=declared([node("app","app",["actor/mailbox"]),node("actor/mailbox","actor")]);
  forged[1].providerRequires=ACTOR.slice(1);
  assert.match(errors({...bad,nodes:forged}),/actor requires declaration of executor.explicit/);
});
test("OTP must truly depend on actor and cannot import std",()=>{
  const nodes=declared([
    node("app","app",["otp/gen_server"]),
    node("otp/gen_server","otp",["actor/mailbox"]),
    node("actor/mailbox","actor")
  ]);
  const graph={...base,libraryProfile:"freestanding-otp",providers:ACTOR,nodes};
  assert.equal(check(graph).ok,true,errors(graph));
  const unrelated=declared([
    node("app","app",["otp/gen_server","actor/mailbox"]),
    node("otp/gen_server","otp"),node("actor/mailbox","actor")
  ]);
  assert.match(errors({...graph,nodes:unrelated}),/otp requires transitive actor dependency/);
  const forbidden=declared([...nodes,node("std/fs","std")]);
  forbidden[1]={...forbidden[1],imports:[...forbidden[1].imports,"std/fs"]};
  assert.match(errors({...graph,nodes:forbidden}),/forbidden library dependency otp -> std/);
});
test("core forbids direct host or provider effects even when hosted",()=>{
  assert.match(errors({...base,libraryProfile:"hosted",grants:["clock"],
    nodes:[node("app","app",["core/math"],["clock"]),node("core/math","core",[],["clock"])]}),
    /core cannot require any host capability/);
  assert.match(errors({...base,libraryProfile:"hosted",providers:["clock.monotonic"],
    nodes:[node("app","app",["core/math"],[],["clock.monotonic"]),
           node("core/math","core",[],[],["clock.monotonic"])]}),
    /core cannot require any runtime provider/);
});
test("freestanding target does not tolerate ambient host capabilities",()=>{
  assert.match(errors({...base,grants:["net.client"],nodes:[
    node("app","app",["core/math"],["net.client"]),node("core/math","core")
  ]}),/freestanding nodes cannot require ambient/);
});
test("provider grants are least-authority and cannot be unused",()=>{
  const graph={...base,libraryProfile:"freestanding-alloc",providers:["allocator.explicit"]};
  assert.match(errors(graph),/unused or unauthorized library provider/);
  const actor={...base,libraryProfile:"freestanding-actor",nodes:actorNodes(),
               providers:[...ACTOR,"clock.monotonic"]};
  assert.match(errors(actor),/unused or unauthorized library provider: clock.monotonic/);
});
test("provider lists must be plain dense unique own-data arrays",()=>{
  assert.match(errors({...base,providers:["fake"]}),/invalid or missing library providers/);
  assert.match(errors({...base,providers:["allocator.explicit","allocator.explicit"]}),
    /invalid or missing library providers/);
  assert.match(errors({...base,nodes:[node("app","app",["core/math"],[],Array(1)),
    node("core/math","core")]}),/invalid inferred provider requirements/);
  let access=0;
  const hostile={...base};
  Object.defineProperty(hostile,"providers",{enumerable:true,get(){access++;return [];}});
  assert.equal(check(hostile).ok,false);
  assert.equal(access,0);
  const injected={...base,nodes:base.nodes.map(x=>({...x}))};
  Object.defineProperty(injected.nodes[1],"providerRequires",
    {enumerable:true,get(){access++;return [];}});
  assert.equal(check(injected).ok,false);
  assert.equal(access,0);
});
test("profile opt-in is mandatory for layer/provider metadata",()=>{
  const noProfile={...base};delete noProfile.libraryProfile;delete noProfile.providers;
  assert.match(errors(noProfile),/layer requires libraryProfile/);
  const missingRequirements={...base,nodes:[{...base.nodes[0],providerRequires:undefined},base.nodes[1]]};
  assert.match(errors(missingRequirements),/invalid inferred provider requirements/);
  const missingField={...base,nodes:[(({providerRequires,...x})=>x)(base.nodes[0]),base.nodes[1]]};
  assert.match(errors(missingField),/missing or invalid inferred provider requirements/);
  const legacy={...noProfile,nodes:base.nodes.map(({layer,providerRequires,...x})=>x)};
  assert.equal(check(legacy).ok,true,errors(legacy));
  assert.match(errors({...legacy,providers:[]}),/providers requires libraryProfile/);
});
test("build-selected freestanding profile cannot be removed or downgraded by graph metadata",()=>{
  // Caller selected freestanding mode independently of source-controlled JSON.
  // Legacy v1 is accepted only without an externally selected library mode.
  const noProfile={...base};
  delete noProfile.libraryProfile;
  delete noProfile.providers;
  const legacy={...noProfile,nodes:base.nodes.map(({layer,providerRequires,...x})=>x)};
  assert.equal(check(legacy).ok,true);
  assert.match(validateClosure(legacy,profiles,"freestanding-core").errors.join("\\n"),
    /missing or mismatched build selection/);
  assert.match(validateClosure({...base,libraryProfile:"hosted"},profiles,"freestanding-core")
    .errors.join("\\n"),/missing or mismatched build selection/);
  assert.match(validateClosure({...base,libraryProfile:"freestanding-actor"},profiles,"freestanding-core")
    .errors.join("\\n"),/missing or mismatched build selection/);
  assert.equal(validateClosure(base,profiles,"freestanding-core").ok,true);
  assert.equal(validateClosure(base,profiles,"hosted").ok,false);
  assert.match(validateClosure(base,profiles,"unrecognized").errors.join("\\n"),
    /invalid build-selected library profile/);
  assert.equal(validateClosure(base,profiles,{}).ok,false);
});

test("deep/cyclic OTP and actor imports validate without recursive overflow",()=>{
  const n=1100;
  const nodes=[
    node("app","app",["otp/0"],[],ACTOR),
    ...Array.from({length:n},(_,i)=>
      node("otp/"+i,"otp",[i===n-1?"actor/runtime":"otp/"+(i+1)],[],ACTOR)),
    node("actor/runtime","actor",[],[],ACTOR)
  ];
  const graph={...base,libraryProfile:"freestanding-otp",nodes,providers:ACTOR};
  assert.equal(check(graph).ok,true,errors(graph));
});
test("JSON schema conditional rules match opt-in authority",async()=>{
  const s=JSON.parse(await readFile(new URL("../schemas/resolved-closure.schema.json",import.meta.url),"utf8"));
  assert.deepEqual(s.$defs.libraryProfile.enum,LIBRARY_PROFILES);
  assert.deepEqual(s.$defs.libraryLayer.enum,LIBRARY_LAYERS);
  assert.deepEqual(s.$defs.libraryProvider.enum,LIBRARY_PROVIDERS);
  assert.deepEqual(s.allOf[0].then.properties.nodes.items.required,["layer","providerRequires"]);
  assert.equal(s.$defs.node.properties.providerRequires.maxItems,LIBRARY_PROVIDERS.length);
  assert.equal(s.$defs.node.properties.providerRequires.items.$ref,"#/$defs/libraryProvider");
});
test("CLI exercises a freestanding closure from fixture",()=>{
  const cli=new URL("../bin/oreslang-target.mjs",import.meta.url).pathname;
  const fixture=new URL("../examples/freestanding-core-closure.json",import.meta.url).pathname;
  const run=spawnSync(process.execPath,[cli,"check-closure",fixture,
    "--target=embedded","--backend=llvm","--grants="],{encoding:"utf8"});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/2 units/);
});
