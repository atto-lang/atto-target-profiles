import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";

const cli=new URL("../bin/oreslang-target.mjs",import.meta.url).pathname;
const fixture=new URL("../examples/atolang-portable-closure.json",import.meta.url);
const run=(grants)=>spawnSync(process.execPath,[
 cli,"check-closure",fixture.pathname,"--target=browser","--backend=wasm","--grants="+grants
],{encoding:"utf8"});

test("canonical .atto import-closure IDs preserve portable admission",async()=>{
 const graph=JSON.parse(await readFile(fixture,"utf8"));
 assert.equal(graph.entry,"app.atto");
 assert.deepEqual(graph.nodes.map(n=>n.id),["app.atto","net.atto"]);
 assert.deepEqual(graph.nodes[0].imports,["net.atto"]);
 const accepted=run("clock,net.client");
 assert.equal(accepted.status,0,accepted.stderr);
 assert.match(accepted.stdout,/2 units checked/);
});

test("canonical .atto import graph cannot gain a missing capability",()=>{
 const rejected=run("clock");
 assert.equal(rejected.status,1,rejected.stderr);
 assert.match(rejected.stderr,/missing build grants|invalid or duplicate grants/);
});

test("canonical .atto graph cannot execute with wrong backend",()=>{
 const rejected=spawnSync(process.execPath,[
  cli,"check-closure",fixture.pathname,
  "--target=browser","--backend=graal","--grants=clock,net.client"
 ],{encoding:"utf8"});
 assert.equal(rejected.status,1,rejected.stderr);
 assert.match(rejected.stderr,/backend/);
});
