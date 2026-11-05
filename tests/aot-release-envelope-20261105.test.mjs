import test from "node:test";
import assert from "node:assert/strict";
import {validateAotReleaseEnvelope as validate} from "../src/aot-release-envelope.mjs";
const a="a".repeat(40),b="b".repeat(40),hash="c".repeat(64),other="d".repeat(64);
const fixture=()=>({
 schemaVersion:1,platform:"linux",arch:"x86_64",
 triple:"x86_64-unknown-linux-gnu",backend:"llvm",
 compiler:{head:a,tree:b,binarySha256:hash},
 artifact:{format:"elf",sha256:hash,bytes:4096,entry:"main"},
 run:{id:1,attempt:1,jobId:3,runnerId:"runner-1",head:a,
  steps:[{id:11,phase:"compile",conclusion:"success"},
   {id:12,phase:"link",conclusion:"success"},
   {id:13,phase:"guest-execute",conclusion:"success"}],
  guest:{exitCode:0,stdoutSha256:other,stderrSha256:hash,artifactSha256:hash}}
});
test("Linux, Windows and macOS native envelopes remain structural-only",()=>{
 for(const [platform,arch,triple,format] of [
  ["linux","x86_64","x86_64-unknown-linux-gnu","elf"],
  ["windows","aarch64","aarch64-pc-windows-msvc","pe"],
  ["macos","aarch64","aarch64-apple-darwin","macho"]
 ]) {
  const f=fixture();f.platform=platform;f.arch=arch;f.triple=triple;f.artifact.format=format;
  assert.equal(validate(f).classification,"STRUCTURAL_CANDIDATE_ONLY");
 }
});
test("wrong formats, unsupported backend and inconsistent target triple reject",()=>{
 for(const mutate of [
  f=>f.artifact.format="pe",
  f=>f.triple="wasm32-wasi",
  f=>f.backend="wasm",
  f=>f.platform="freebsd",
  f=>f.artifact.entry="",
  f=>f.artifact.bytes=0
 ]){const f=fixture();mutate(f);assert.throws(()=>validate(f));}
});
test("unbound compiler, artifact and runner fields reject",()=>{
 for(const mutate of [
  f=>f.compiler.head="deadbeef",
  f=>f.compiler.tree="main",
  f=>f.compiler.binarySha256="",
  f=>f.run.head=b,
  f=>f.run.runnerId="",
  f=>f.run.id=0,
  f=>f.run.attempt=0,
  f=>f.run.jobId=0,
  f=>f.run.guest.artifactSha256=other,
  f=>f.run.guest.stdoutSha256="not-a-hash",
  f=>f.run.guest.exitCode=1
 ]){const f=fixture();mutate(f);assert.throws(()=>validate(f));}
});
test("zero/duplicate/pending and missing execution steps fail closed",()=>{
 for(const mutate of [
  f=>f.run.steps=[],
  f=>f.run.steps.pop(),
  f=>f.run.steps[0].conclusion="skipped",
  f=>f.run.steps[1].phase="compile",
  f=>f.run.steps[1].id=11,
  f=>f.run.steps[2].conclusion=null,
  f=>f.run.steps[1].phase="host-reference"
 ]){const f=fixture();mutate(f);assert.throws(()=>validate(f));}
});
test("unexpected fields and inherited authority are not accepted",()=>{
 const f=fixture();f.attested=true;assert.throws(()=>validate(f));
 const inherited=Object.create(fixture());
 assert.throws(()=>validate(inherited));
 const g=fixture();Object.defineProperty(g.run.guest,"exitCode",{get(){throw Error("getter invoked")}});
 // This test only probes own-key shape; do not treat accessor objects as JSON.
 assert.throws(()=>validate(g));
});
