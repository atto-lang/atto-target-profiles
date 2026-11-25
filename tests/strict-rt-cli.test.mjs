import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const cli=new URL('../bin/oreslang-target.mjs',import.meta.url).pathname;
const fixture=new URL('../examples/strict-rt-candidate.json',import.meta.url).pathname;
const run=(...args)=>spawnSync(process.execPath,[cli,'check-rt-candidate',...args],{
  encoding:'utf8',timeout:10000,maxBuffer:1024*1024
});
test('stage-0 CLI explicitly reports NOT CERTIFIED on shaped manifest',()=>{
  const result=run(fixture);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/STRUCTURAL_ONLY/);
  assert.match(result.stdout,/NOT CERTIFIED/);
  assert.doesNotMatch(result.stdout,/^CERTIFIED\b/m);
});
test('stage-0 CLI rejects unexpected flags and missing fixture',()=>{
  assert.notEqual(run(fixture,'--backend=llvm').status,0);
  assert.notEqual(run().status,0);
});
test('stage-0 CLI rejects malformed, duplicated authority and hostile files',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ores-rt-stage0-'));
  try {
    const example=await readFile(fixture,'utf8');
    const obj=JSON.parse(example);
    obj.resources.criticalTurnAllocBytes=1;
    const mutated=join(dir,'mutated.json');
    await writeFile(mutated,JSON.stringify(obj));
    const denied=run(mutated);
    assert.notEqual(denied.status,0);
    assert.match(denied.stderr,/allocation must be zero/);
    const duplicate=join(dir,'duplicate.json');
    await writeFile(duplicate,example.replace('"schemaVersion": 1,','"schemaVersion": 2, "schemaVersion": 1,'));
    assert.notEqual(run(duplicate).status,0);
    const malformed=join(dir,'bad.json');
    await writeFile(malformed,'{"schemaVersion":');
    assert.notEqual(run(malformed).status,0);
    const link=join(dir,'symlink.json');
    await symlink(fixture,link);
    assert.notEqual(run(link).status,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
