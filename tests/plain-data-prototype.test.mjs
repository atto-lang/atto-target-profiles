import test from "node:test";
import assert from "node:assert/strict";
import {validateClosure,validateRegistry} from "../src/contract.mjs";
import {loadProfiles} from "../src/load-registry.mjs";

const profiles=await loadProfiles();
const unit={id:"main",targets:["browser"],requires:["clock"],imports:[]};
const graph={
  schemaVersion:1,entry:"main",target:"browser",backend:"wasm",
  grants:["clock"],nodes:[unit]
};
const customPrototype=value=>Object.assign(
  Object.create({hiddenAuthority:["fs.write"],toString(){throw Error("untrusted prototype executed")}}),
  value
);
const nullPrototype=value=>Object.assign(Object.create(null),value);

test("closure rejects custom-prototype graph even when mandatory own fields are valid",()=>{
  const forged=customPrototype(graph);
  assert.equal(validateClosure(forged,profiles).ok,false);
  assert.match(validateClosure(forged,profiles).errors.join("\n"),/expected|resolved graph must be an object/);
});

test("closure rejects custom-prototype unit despite valid own authority fields",()=>{
  const forged={...graph,nodes:[customPrototype(unit)]};
  const result=validateClosure(forged,profiles);
  assert.equal(result.ok,false);
  assert.match(result.errors.join("\n"),/expected plain data object/);
});

test("registry rejects custom-prototype profile with own valid fields",()=>{
  const forged=profiles.map((p,i)=>i===0?customPrototype(p):p);
  const result=validateRegistry(forged);
  assert.equal(result.ok,false);
  assert.match(result.errors.join("\n"),/expected plain data object/);
});

test("pure null-prototype dictionaries remain valid without inherited authority",()=>{
  assert.equal(validateClosure(nullPrototype(graph),profiles).ok,true);
  assert.equal(validateClosure({...graph,nodes:[nullPrototype(unit)]},profiles).ok,true);
  assert.equal(validateRegistry(profiles.map((p,i)=>i===0?nullPrototype(p):p)).ok,true);
});

test("ordinary JSON objects remain valid; inherited or surplus grants never authorize",()=>{
  assert.equal(validateClosure(JSON.parse(JSON.stringify(graph)),profiles).ok,true);
  assert.equal(validateClosure({...graph,grants:["clock","random"]},profiles).ok,false);
  const inherited=Object.assign(Object.create({grants:["clock"]}),{
    schemaVersion:1,entry:"main",target:"browser",backend:"wasm",nodes:[unit]
  });
  assert.equal(validateClosure(inherited,profiles).ok,false);
});

test("proxy-backed graph cannot lie about its actual grant data descriptor",()=>{
  let grantReads=0;
  const wrapped=new Proxy({...graph,grants:["clock","fs.write"]},{
    get(target,key,receiver){
      if(key==="grants"){grantReads++;return ["clock"]}
      return Reflect.get(target,key,receiver);
    }
  });
  const result=validateClosure(wrapped,profiles);
  assert.equal(result.ok,false,result.errors.join("; "));
  assert.equal(grantReads,0,"never invoke a proxy authority getter trap");
});

test("transparently wrapped graphs, units, profiles and authority arrays are not plain JSON",()=>{
  const wrapped=value=>new Proxy(value,{});
  const cases=[
    ()=>validateClosure(wrapped(graph),profiles),
    ()=>validateClosure({...graph,nodes:[wrapped(unit)]},profiles),
    ()=>validateClosure({...graph,nodes:wrapped([unit])},profiles),
    ()=>validateClosure({...graph,grants:wrapped(["clock"])},profiles),
    ()=>validateRegistry(wrapped(profiles)),
    ()=>validateRegistry(profiles.map((p,i)=>i===0?wrapped(p):p)),
    ()=>validateRegistry(profiles.map((p,i)=>i===0?{...p,capabilities:wrapped(p.capabilities)}:p))
  ];
  for(const invoke of cases){
    const result=invoke();
    assert.equal(result.ok,false,"proxy-backed authority must fail closed");
  }
});

test("revoked proxies fail closed as validation results, not uncaught TypeErrors",()=>{
  const revoked=value=>{
    const pair=Proxy.revocable(value,{});
    pair.revoke();
    return pair.proxy;
  };
  const cases=[
    ()=>validateClosure(revoked(graph),profiles),
    ()=>validateClosure({...graph,nodes:[revoked(unit)]},profiles),
    ()=>validateClosure({...graph,nodes:revoked([unit])},profiles),
    ()=>validateClosure({...graph,grants:revoked(["clock"])},profiles),
    ()=>validateRegistry(revoked(profiles)),
    ()=>validateRegistry(profiles.map((p,i)=>i===0?revoked(p):p))
  ];
  for(const invoke of cases){
    const result=invoke();
    assert.equal(result.ok,false,"revoked proxy must yield a denial, not throw");
  }
});
