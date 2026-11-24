import test from "node:test";
import assert from "node:assert/strict";
import {validateRegistry, validateClosure} from "../src/contract.mjs";
import {loadProfiles} from "../src/load-registry.mjs";

const profiles = await loadProfiles();
const pure = (target, backend = "wasm") => ({
  schemaVersion: 1,
  entry: "app",
  target,
  backend,
  libraryProfile: "core",
  providers: [],
  grants: [],
  nodes: [{
    id: "app",
    layer: "app",
    targets: [target],
    imports: ["ores.core/constant"],
    requires: [],
    providerRequires: []
  },{
    id: "ores.core/constant",
    layer: "core",
    targets: [target],
    imports: [],
    requires: [],
    providerRequires: []
  }]
});
const inspect = graph => validateClosure(graph, profiles, graph.libraryProfile);
const diagnostic = graph => inspect(graph).errors.join("; ");

test("server and desktop metadata admit only portable pure Wasm scalar graphs", () => {
  assert.equal(validateRegistry(profiles).ok, true);
  for(const target of ["server","desktop"]){
    const result = inspect(pure(target));
    assert.equal(result.ok, true, target+": "+result.errors.join("; "));
    assert.equal(result.visited, 2);
  }
});

test("hosted Wasm cannot borrow broad server/desktop host capabilities", () => {
  for(const target of ["server","desktop"])
    for(const capability of ["clock","random","net.client","fs.read",
      "threads","gc","dynamic.code","interop.native","interop.java"]){
      const g=pure(target);
      g.grants=[capability];
      g.nodes[0].requires=[capability];
      assert.match(diagnostic(g), /hosted wasm scalar profile admits zero host capability grants/,
        target+" / "+capability);
    }
});

test("hosted Wasm cannot bypass no-import ABI by moving effects to an imported unit", () => {
  for(const target of ["server","desktop"]){
    const g=pure(target);
    g.nodes[1].requires=["net.server"];
    const denied = inspect(g);
    assert.equal(denied.ok, false);
    assert.match(denied.errors.join("; "), /ores\.core\/constant: ores\.core cannot require ambient host capabilities/);
    g.grants=["net.server"];
    g.nodes[0].requires=["net.server"];
    assert.match(diagnostic(g),/hosted wasm scalar profile admits zero host capability grants/);
  }
});

test("existing browser Wasm, Java desktop and Node server profile remain available",()=>{
  assert.equal(inspect(pure("browser")).ok, true,diagnostic(pure("browser")));
  assert.equal(inspect(pure("desktop","graal")).ok,true);
  assert.equal(inspect(pure("server","javascript")).ok,true);
  assert.match(diagnostic(pure("desktop","javascript")),
    /backend javascript is not declared for desktop/);
});
