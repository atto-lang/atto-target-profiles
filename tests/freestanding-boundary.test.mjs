import test from "node:test";
import assert from "node:assert/strict";
import {validateClosure} from "../src/contract.mjs";
import {loadProfiles} from "../src/load-registry.mjs";

// Generic target/effect admission checks. The library-specific core/std
// boundary is enforced by library-profile.test.mjs.
const profiles=await loadProfiles();
const unit=(id,requires=[],imports=[])=>({id,targets:["embedded"],requires,imports});
const graph=(nodes,grants=[])=>({
  schemaVersion:1,entry:nodes[0].id,target:"embedded",backend:"llvm",grants,nodes
});
const admit=(nodes,grants=[])=>validateClosure(graph(nodes,grants),profiles);

test("bare-metal source requires no libc or OS authority",()=>{
  const result=admit([unit("ores.core/numeric")]);
  assert.equal(result.ok,true,result.errors.join("; "));
  assert.equal(result.visited,1);
});

test("host effects never appear without explicit target grants",()=>{
  for(const required of ["heap","fs.read","fs.write","clock","threads","interop.native"]){
    const result=admit([
      unit("ores.core/numeric",[],["dependency"]),
      unit("dependency",[required])
    ]);
    assert.equal(result.ok,false,required);
    assert.match(result.errors.join("\n"),/imported requirements|missing build grants/);
  }
});

test("heap capability admission is explicit and cannot be inherited accidentally",()=>{
  const units=[unit("vector",["heap"],["ores.core/numeric"]),unit("ores.core/numeric")];
  assert.match(admit(units).errors.join("\n"),/missing build grants/);
  const admitted=admit(units,["heap"]);
  assert.equal(admitted.ok,true,admitted.errors.join("; "));
  assert.equal(admit([unit("ores.core/numeric")],["heap"]).ok,false,
    "a no-heap graph must not accept an unused ambient heap grant");
});

test("Wasm and build-time schemas are not implicit bare-metal privileges",()=>{
  const base=graph([unit("ores.core/numeric")]);
  assert.equal(validateClosure({...base,backend:"wasm"},profiles).ok,false);
  for(const forbidden of ["interop.java","net.client","dynamic.code","gc"])
    assert.equal(admit([unit("ores.core/numeric",[forbidden])],[forbidden]).ok,false,forbidden);
});
