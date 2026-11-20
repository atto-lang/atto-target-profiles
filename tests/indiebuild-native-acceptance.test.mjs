import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const file = fileURLToPath(new URL('../.github/workflows/indiebuild-native-acceptance.yml', import.meta.url));
const source = readFileSync(file, 'utf8');
test('the real GitHub runner acceptance fixture remains manual only',()=>{
  assert.match(source, /^on:\n  workflow_dispatch:\n/m);
  assert.doesNotMatch(source, /^  (push|pull_request|schedule|repository_dispatch):/m);
  assert.match(source, /permissions:\n  contents: read\n/);
  assert.match(source, /cancel-in-progress: true/);
});
test('both jobs require the private one-job runner label',()=>{
  assert.equal((source.match(/runs-on: indiebuild-linux-arm64/g)||[]).length,2);
  assert.match(source, /consume:\n    name: Consume and verify artifact\n    needs: produce\n/);
  assert.match(source, /if: \$\{\{ needs\.produce\.result == 'success' \}\}/);
  assert.equal((source.match(/timeout-minutes: 12/g)||[]).length,2);
});
test('checkout is immutable and artifact roundtrip is tamper checked',()=>{
  assert.match(source, /ref: \$\{\{ github.sha \}\}/);
  assert.match(source, /persist-credentials: false/);
  assert.match(source, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
  assert.match(source, /\(cd proof && sha256sum commit\.sha > commit\.sha256\)/);
  assert.match(source, /sha256sum --check commit\.sha256/);
  assert.match(source, /test "\$\(cat commit\.sha\)" = "\$EXPECTED_COMMIT"/);
  assert.match(source, /if-no-files-found: error/);
  assert.match(source, /retention-days: 1/);
});
test('all remote actions are pinned to exact Git commits',()=>{
  const uses=[...source.matchAll(/^\s+uses: ([^\n]+)/gm)].map(m=>m[1].split(' #')[0]);
  assert.equal(uses.length,3);
  for(const action of uses) assert.match(action,/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+@[a-f0-9]{40}$/);
});

test('artifact checksum survives upload/download directory layout and rejects corruption',()=>{
  const root=mkdtempSync(join(tmpdir(),'indiebuild-proof-'));
  const proof=join(root,'proof');
  try {
    mkdirSync(proof);
    const expected='a'.repeat(40);
    writeFileSync(join(proof,'commit.sha'),expected+'\n');
    const checksum=execFileSync('sha256sum',['commit.sha'],{cwd:proof,encoding:'utf8'});
    writeFileSync(join(proof,'commit.sha256'),checksum);
    assert.match(checksum,/^[a-f0-9]{64}  commit\.sha\n$/);
    assert.match(execFileSync('sha256sum',['--check','commit.sha256'],{cwd:proof,encoding:'utf8'}),/commit\.sha: OK/);
    assert.equal(readFileSync(join(proof,'commit.sha'),'utf8').trim(),expected);
    writeFileSync(join(proof,'commit.sha'),'tampered\n');
    assert.throws(()=>execFileSync('sha256sum',['--check','commit.sha256'],{cwd:proof,stdio:'pipe'}));
  } finally {
    rmSync(root,{recursive:true,force:true});
  }
});
