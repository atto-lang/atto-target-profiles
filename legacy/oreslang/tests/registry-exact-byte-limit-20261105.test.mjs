import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readProfileFile} from '../src/load-registry.mjs';

test('admit exactly 64 KiB, reject the next byte, and recover using the same descriptor path',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'atto-registry-boundary-'));
 const path=join(dir,'profile.json');
 try{
  const valid='{"schemaVersion":1,"name":"boundary"}';
  const boundary=valid+' '.repeat(65536-Buffer.byteLength(valid));
  assert.equal(Buffer.byteLength(boundary),65536);
  await writeFile(path,boundary);
  assert.deepEqual(await readProfileFile(path),{schemaVersion:1,name:'boundary'});
  await writeFile(path,boundary+' ');
  await assert.rejects(readProfileFile(path),/exceeds 64 KiB/);
  await writeFile(path,valid);
  assert.equal((await readProfileFile(path)).name,'boundary');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('reject invalid UTF-8 surrogate bytes and escaped duplicate names without poisoning later reads',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'atto-registry-reject-'));
 const path=join(dir,'profile.json');
 try{
  await writeFile(path,Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xed,0xa0,0x80,0x22,0x7d]));
  await assert.rejects(readProfileFile(path));
  await writeFile(path,'{"resource":1,"res\\u006furce":2}');
  await assert.rejects(readProfileFile(path),/duplicate object key/);
  await writeFile(path,'{"resource":2}');
  assert.deepEqual(await readProfileFile(path),{resource:2});
 }finally{await rm(dir,{recursive:true,force:true});}
});