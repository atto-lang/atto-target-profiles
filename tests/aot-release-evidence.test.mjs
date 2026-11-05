import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm,symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {admitAotCandidate,verifyLocalAotArtifact} from "../src/aot-release-evidence.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex");
const h40="a".repeat(40),h64="b".repeat(64);
const expected={sourceHead:h40,sourceTree:h40,compilerHead:h40,compilerSha256:h64};
function candidate(bytes) {
  return {schemaVersion:1,...expected,backend:"llvm",
    target:{os:"linux",arch:"x86_64",abi:"gnu"},
    artifact:{sha256:sha(bytes),bytes:bytes.length,format:"elf"},
    run:{repository:"example/compiler",runId:12,attempt:2,jobId:18,runnerId:7,
      steps:[{name:"checkout",conclusion:"success"},{name:"native guest",conclusion:"success"}],
      conclusion:"success",guestStdoutSha256:sha("guest output"),guestExitCode:0}};
}
test("stepful candidate is admitted as a claim, never certified",()=>{
  const r=candidate(Buffer.from("native executable"));
  assert.deepEqual(admitAotCandidate(r,expected),{ok:true,errors:[]});
});
test("zero-step, failed attempts, wrong head and false OS formats fail closed",()=>{
  const bytes=Buffer.from("native executable");
  const r=candidate(bytes);
  for(const m of [
    {...r,sourceHead:"c".repeat(40)},
    {...r,run:{...r.run,steps:[]}},
    {...r,run:{...r.run,runnerId:0}},
    {...r,run:{...r.run,guestExitCode:1}},
    {...r,artifact:{...r.artifact,format:"pe"}},
    {...r,target:{...r.target,os:"freebsd"}}
  ]) assert.equal(admitAotCandidate(m,expected).ok,false);
});
test("accessors, proxies and unexpected authority fields are rejected without invoking getters",()=>{
  const r=candidate(Buffer.from("binary"));
  let calls=0;
  Object.defineProperty(r.run,"guestExitCode",{enumerable:true,get(){calls++;return 0;}});
  assert.equal(admitAotCandidate(r,expected).ok,false);
  assert.equal(calls,0);
  assert.equal(admitAotCandidate(new Proxy(candidate(Buffer.from("binary")),{}),expected).ok,false);
});
test("real local file bytes are checked, but runner execution is not authenticated",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"atto-aot-"));
  try{
    const bytes=Buffer.from("native executable");
    const path=join(dir,"guest.elf");
    await writeFile(path,bytes);
    const r=candidate(bytes);
    const ok=await verifyLocalAotArtifact(r,expected,path);
    assert.equal(ok.ok,true);
    assert.equal(ok.evidenceClass,"LOCAL_ARTIFACT_BYTES_ONLY");
    await writeFile(path,Buffer.from("altered executable"));
    assert.equal((await verifyLocalAotArtifact(r,expected,path)).ok,false);
    const link=join(dir,"link");
    await symlink(path,link);
    assert.equal((await verifyLocalAotArtifact(r,expected,link)).ok,false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
