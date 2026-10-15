import test from "node:test";
import assert from "node:assert/strict";
import {validateRegistry,validateClosure,CORE_IO_POLICY} from "../src/contract.mjs";
import {loadProfiles} from "../src/load-registry.mjs";
const profiles=await loadProfiles();
const graph=backend=>({schemaVersion:1,entry:"main",target:"server",backend,grants:[],nodes:[{id:"main",targets:["server"],requires:[],imports:[]}]});
test("every profile declares mandatory async-only I/O",()=>{
  assert.equal(CORE_IO_POLICY,"native-async-only");
  assert.equal(validateRegistry(profiles).ok,true);
  for(const profile of profiles)assert.equal(profile.coreIoPolicy,CORE_IO_POLICY);
  for(const mode of [undefined,null,"off","legacy-blocking",false]){
    const changed=structuredClone(profiles);
    changed[0].coreIoPolicy=mode;
    assert.equal(validateRegistry(changed).ok,false);
  }
  const missing=structuredClone(profiles);delete missing[0].coreIoPolicy;
  assert.equal(validateRegistry(missing).ok,false);
});
test("graph default is mandatory and explicit assertions cannot downgrade it",()=>{
  for(const backend of ["graal","llvm","net","forge"]){
    const accepted=validateClosure(graph(backend),profiles);
    assert.equal(accepted.ok,true,accepted.errors.join(";"));
    assert.equal(accepted.coreIoPolicy,CORE_IO_POLICY);
    assert.equal(validateClosure({...graph(backend),coreIoPolicy:CORE_IO_POLICY},profiles).ok,true);
    for(const mode of [undefined,null,"off","legacy-blocking",false])
      assert.equal(validateClosure({...graph(backend),coreIoPolicy:mode},profiles).ok,false);
  }
  const browser={...graph("wasm"),target:"browser",nodes:[{id:"main",targets:["browser"],requires:[],imports:[]}]};
  assert.equal(validateClosure(browser,profiles).coreIoPolicy,CORE_IO_POLICY);
  assert.equal(validateClosure({...browser,coreIoPolicy:"off"},profiles).ok,false);
});
