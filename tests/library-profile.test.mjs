import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {validateClosure,LIBRARY_PROFILES,LIBRARY_LAYERS,LIBRARY_PROVIDERS} from "../src/contract.mjs";
import {loadProfiles} from "../src/load-registry.mjs";
const profiles=await loadProfiles();
const node=(id,layer,imports=[],requires=[])=>({
  id,layer,imports,requires,targets:["browser"]
});
const base={
  schemaVersion:1,entry:"app",target:"browser",backend:"wasm",
  grants:[],libraryProfile:"freestanding-core",providers:[],
  nodes:[node("app","app",["core/min"]),node("core/min","core")]
};
const check=value=>validateClosure(value,profiles);
const errors=value=>check(value).errors.join("\n");
const providers=["executor.explicit","mailbox.bounded","control.trusted"];
test("freestanding core admits no-OS scalar closure",()=>{
  assert.equal(check(base).ok,true,errors(base));
});
test("freestanding layer gate rejects direct and transitive std dependencies",()=>{
  const bad={...base,nodes:[
    node("app","app",["core/min"]),node("core/min","core",["host/console"]),
    node("host/console","std")
  ]};
  assert.match(errors(bad),/forbidden library dependency core -> std/);
  assert.match(errors(bad),/library layer std is forbidden/);
});
test("core cannot import alloc even when enclosing profile admits allocation",()=>{
  const bad={...base,libraryProfile:"freestanding-alloc",providers:["allocator.explicit"],nodes:[
    node("app","app",["core/min"]),node("core/min","core",["alloc/vec"]),
    node("alloc/vec","alloc")
  ]};
  assert.match(errors(bad),/forbidden library dependency core -> alloc/);
});
test("alloc requires explicit provider, not ambient heap",()=>{
  const nodes=[node("app","app",["alloc/vec"]),node("alloc/vec","alloc")];
  const noAllocator={...base,libraryProfile:"freestanding-alloc",nodes};
  assert.match(errors(noAllocator),/alloc requires allocator.explicit/);
  assert.equal(check({...noAllocator,providers:["allocator.explicit"]}).ok,true);
  const ambient={...noAllocator,providers:["allocator.explicit"],grants:["heap"],
    nodes:[node("app","app",["alloc/vec"],["heap"]),node("alloc/vec","alloc",[],["heap"])]};
  assert.match(errors(ambient),/ambient host capabilities/);
});
test("bounded actor profile admits explicit execution, not OS threads",()=>{
  const nodes=[node("app","app",["actor/mailbox"]),node("actor/mailbox","actor")];
  const actor={...base,libraryProfile:"freestanding-actor",nodes};
  assert.match(errors(actor),/executor.explicit/);
  assert.match(errors({...actor,providers:["executor.explicit"]}),/mailbox.bounded/);
  assert.match(errors({...actor,providers:providers.slice(0,2)}),/control.trusted/);
  assert.equal(check({...actor,providers}).ok,true);
});
test("OTP remains above actor and needs trusted runtime provider",()=>{
  const nodes=[node("app","app",["otp/gen_server"]),node("otp/gen_server","otp",["actor/mailbox"]),
               node("actor/mailbox","actor")];
  const candidate={...base,libraryProfile:"freestanding-otp",nodes,providers};
  assert.equal(check(candidate).ok,true,errors(candidate));
  assert.match(errors({...candidate,nodes:nodes.slice(0,2).map((n,i)=>i===1?{...n,imports:[]}:n)}),/otp requires transitive actor dependency/);
  const unrelated=[
    node("app","app",["otp/gen_server","actor/mailbox"]),
    node("otp/gen_server","otp"),
    node("actor/mailbox","actor")
  ];
  assert.match(errors({...candidate,nodes:unrelated}),/otp requires transitive actor dependency/);
  assert.match(errors({...candidate,libraryProfile:"freestanding-actor"}),/layer otp is forbidden/);
  const bad={...candidate,nodes:[...nodes,node("std/fs","std")]};
  bad.nodes[1]={...nodes[1],imports:["actor/mailbox","std/fs"]};
  assert.match(errors(bad),/forbidden library dependency otp -> std/);
});
test("core cannot gain ambient effects even in hosted profile",()=>{
  const candidate={...base,libraryProfile:"hosted",grants:["clock"],nodes:[
    node("app","app",["core/clock"],["clock"]),node("core/clock","core",[],["clock"])
  ]};
  assert.match(errors(candidate),/core cannot require any host capability/);
});
test("freestanding app rejects ambient host effects regardless of target grants",()=>{
  const candidate={...base,grants:["net.client"],nodes:[
    node("app","app",["core/min"],["net.client"]),node("core/min","core")
  ]};
  assert.match(errors(candidate),/freestanding nodes cannot require ambient/);
});
test("declaring a layer without opting in is not silently ignored",()=>{
  const bare={...base};delete bare.libraryProfile;delete bare.providers;
  assert.match(errors(bare),/layer requires libraryProfile/);
  const providerOnly={...bare,providers:[]};
  assert.match(errors(providerOnly),/providers requires libraryProfile/);
});
test("missing layers, invalid profiles and invalid providers fail closed",()=>{
  assert.match(errors({...base,libraryProfile:"freestanding-unk"}),/unknown libraryProfile/);
  assert.match(errors({...base,providers:["allocator.explicit","allocator.explicit"]}),/invalid or missing library providers/);
  assert.match(errors({...base,providers:["superuser"]}),/invalid or missing library providers/);
  assert.match(errors({...base,providers:undefined}),/invalid or missing library providers/);
  assert.match(errors({...base,nodes:[{...base.nodes[0],layer:undefined},base.nodes[1]]}),/missing or invalid library layer/);
});
test("library provider authority rejects hostile arrays and getters",()=>{
  const hole=Array(1);
  assert.equal(check({...base,providers:hole}).ok,false);
  let called=0;
  const getter={...base};
  Object.defineProperty(getter,"providers",{get(){called++;return[]},enumerable:true});
  assert.equal(check(getter).ok,false);
  assert.equal(called,0);
  const shadowed=["allocator.explicit"];shadowed.includes=()=>true;
  assert.equal(check({...base,providers:shadowed}).ok,false);
});

test("hosted stdlib cannot import app modules (no privileged callback back-edge)",()=>{
  const hosted={...base,libraryProfile:"hosted",nodes:[
    node("app","app",["std/logger"]),node("std/logger","std",["app"])
  ]};
  assert.match(errors(hosted),/forbidden library dependency std -> app/);
  // The inverse edge is permitted: applications can call the hosted stdlib.
  assert.equal(check({...hosted,nodes:[
    node("app","app",["std/logger"]),node("std/logger","std")
  ]}).ok,true);
});
test("providers obey least authority and cannot disguise absent layers",()=>{
  const extraAlloc={...base,libraryProfile:"freestanding-alloc",providers:["allocator.explicit"]};
  assert.match(errors(extraAlloc),/unused or unauthorized library provider/);
  const extraClock={...base,providers:["clock.monotonic"]};
  assert.match(errors(extraClock),/unused or unauthorized library provider/);
  const allocNodes=[node("app","app",["alloc/vec"]),node("alloc/vec","alloc")];
  assert.match(errors({...base,libraryProfile:"freestanding-alloc",
    nodes:allocNodes,providers:["allocator.explicit","control.trusted"]}),
    /unused or unauthorized library provider: control.trusted/);
  const actorNodes=[node("app","app",["actor/mailbox"]),node("actor/mailbox","actor")];
  assert.equal(check({...base,libraryProfile:"freestanding-actor",
    nodes:actorNodes,providers:[...providers,"clock.monotonic"]}).ok,true);
  // A scheduler may use an explicit arena without importing a dynamic alloc module.
  assert.equal(check({...base,libraryProfile:"freestanding-actor",
    nodes:actorNodes,providers:[...providers,"allocator.explicit"]}).ok,true);
});
test("reverse actor reachability handles long import chains without recursion",()=>{
  const n=1400;
  const nodes=[node("app","app",["otp/entry"]),node("otp/entry","otp",["otp/hop0"])];
  for(let i=0;i<n;i++)
    nodes.push(node("otp/hop"+i,"otp",[i===n-1?"actor/mailbox":"otp/hop"+(i+1)]));
  nodes.push(node("actor/mailbox","actor"));
  const actual={...base,libraryProfile:"freestanding-otp",providers,nodes};
  assert.equal(check(actual).ok,true,errors(actual));
});

test("library schema vocabulary stays pinned to runtime admission",async()=>{
  const schema=JSON.parse(await readFile(new URL("../schemas/resolved-closure.schema.json",import.meta.url),"utf8"));
  assert.deepEqual(schema.$defs.libraryProfile.enum,LIBRARY_PROFILES);
  assert.deepEqual(schema.$defs.libraryLayer.enum,LIBRARY_LAYERS);
  assert.deepEqual(schema.$defs.libraryProvider.enum,LIBRARY_PROVIDERS);
  assert.equal(schema.properties.providers.maxItems,LIBRARY_PROVIDERS.length);
  assert.equal(schema.$defs.node.properties.layer.$ref,"#/$defs/libraryLayer");
  const rule=schema.allOf[0];
  assert.deepEqual(rule.if.required,["libraryProfile"]);
  assert.deepEqual(rule.then.required,["providers"]);
  assert.deepEqual(rule.then.properties.nodes.items.required,["layer"]);
  assert.deepEqual(rule.else.not.required,["providers"]);
  assert.deepEqual(rule.else.properties.nodes.items.not.required,["layer"]);
});

test("CLI admits a freestanding core manifest and rejects std injection",async()=>{
  const cli=new URL("../bin/oreslang-target.mjs",import.meta.url).pathname;
  const fixture=new URL("../examples/freestanding-core-closure.json",import.meta.url).pathname;
  const result=spawnSync(process.execPath,[cli,"check-closure",fixture,
    "--target=embedded","--backend=llvm","--grants="],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/2 units/);
});
