import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inspectLocalAotArtifact} from '../src/aot-release-evidence.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const base=Object.freeze({schemaVersion:1,target:'linux-x86_64',backend:'llvm',
 sourceHead:'a'.repeat(40),sourceTree:'b'.repeat(40),
 compilerHead:'c'.repeat(40),compilerTree:'d'.repeat(40),
 compilerBinarySha256:'e'.repeat(64)});
test('physical ELF signature and exact hash yield integrity-only classification',()=>{
 const dir=mkdtempSync(join(tmpdir(),'atto-aot-evidence-'));
 try{
  const bytes=Buffer.from([0x7f,0x45,0x4c,0x46,1,2,3,4]);
  const path=join(dir,'guest');writeFileSync(path,bytes);
  const m={...base,artifactBytes:bytes.length,artifactSha256:hash(bytes)};
  const result=inspectLocalAotArtifact(m,path);
  assert.equal(result.classification,'LOCAL_BINARY_INTEGRITY_ONLY');
  assert.equal(result.guestExecution,'NOT_EXECUTED');
  assert.equal(result.codeSignature,'NOT_VERIFIED');
  assert.throws(()=>inspectLocalAotArtifact({...m,artifactSha256:'0'.repeat(64)},path),/fingerprint mismatch/);
  assert.throws(()=>inspectLocalAotArtifact({...m,artifactBytes:9},path),/size mismatch/);
  assert.throws(()=>inspectLocalAotArtifact({...m,target:'windows-x86_64'},path),/PE\/DOS magic/);
  const alias=join(dir,'alias');symlinkSync(path,alias);
  assert.throws(()=>inspectLocalAotArtifact(m,alias),/unredirected|symlink/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('forged metadata descriptors and invalid compiler pins are rejected without getters',()=>{
 const dir=mkdtempSync(join(tmpdir(),'atto-aot-evidence-'));
 try{
  const bytes=Buffer.from([0x7f,0x45,0x4c,0x46]);
  const path=join(dir,'guest');writeFileSync(path,bytes);
  const good={...base,artifactBytes:4,artifactSha256:hash(bytes)};
  let invoked=0;
  const getter={...good};
  Object.defineProperty(getter,'artifactSha256',{enumerable:true,get(){invoked++;throw Error('getter');}});
  for(const value of [getter,{...good,compilerHead:'bad'},Object.assign(Object.create(good),{}),
     {...good,unknown:true},new Proxy(good,{})])
    assert.throws(()=>inspectLocalAotArtifact(value,path),/AOT_ARTIFACT_UNVERIFIED/);
  assert.equal(invoked,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
