import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCoreWasmArtifact, CORE_WASM_ABI} from '../src/artifact.mjs';

const hash = letter => letter.repeat(64);
const manifest = () => ({
  schemaVersion:1,
  artifactType:CORE_WASM_ABI,
  target:'wasm32', environment:'browser', backend:'wasm',
  entry:'main', wasmSha256:hash('a'), wasmBytes:64,
  requiredCapabilities:[], imports:[],
  memory:{maximumPages:2},
  producer:{compilerSha256:hash('a'),sourceSha256:hash('b'),llvmIrSha256:hash('c')}
});
const check = item => validateCoreWasmArtifact(item, []);

test('invalid top-level manifest descriptor rejects before any getter', () => {
  const item = manifest();
  let called = 0;
  Object.defineProperty(item,'entry',{enumerable:true,get(){called++;return 'main';}});
  const result = check(item);
  assert.equal(result.ok,false);
  assert.match(result.errors.join(' '),/exactly its own data fields/);
  assert.equal(called,0);
});

test('invalid nested provenance and memory descriptors never execute getters', () => {
  for (const name of ['memory','producer']) {
    const item = manifest();
    let called=0;
    const property=name==='memory'?'maximumPages':'sourceSha256';
    Object.defineProperty(item[name],property,{enumerable:true,get(){called++;return 2;}});
    const result=check(item);
    assert.equal(result.ok,false);
    assert.match(result.errors.join(' '),/plain own data/);
    assert.equal(called,0);
  }
});

test('proxy manifests and nonempty capabilities or imports are refused', () => {
  const item = manifest();
  let accessed = 0;
  const proxy = new Proxy(item,{get(target,key){accessed++;return Reflect.get(target,key);}});
  assert.equal(check(proxy).ok,false);
  assert.equal(accessed,0);
  for (const key of ['requiredCapabilities','imports']) {
    const invalid=manifest();
    invalid[key] = ['unexpected'];
    const result=check(invalid);
    assert.equal(result.ok,false);
    assert.match(result.errors.join(' '),/empty capability\/import arrays/);
  }
});

test('unexpected own fields and missing mandatory fields are refused', () => {
  const withExtra=manifest();
  withExtra.extra=true;
  assert.equal(check(withExtra).ok,false);
  const missing=manifest();
  delete missing.entry;
  assert.equal(check(missing).ok,false);
});