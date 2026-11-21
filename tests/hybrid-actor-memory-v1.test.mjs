import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// This validates declarative, fail-closed backend profiles ONLY.
// It is not compiled .atto source, compiler codegen or a guest-runtime test.
const profile=JSON.parse(readFileSync(new URL('../profiles/hybrid-actor-memory-v1.json',import.meta.url),'utf8'));
const repos=['java','llvm','net','forge','wasm','rs','cranelift','js','atto','hdl','realtime'];
const statuses=new Set(['NOT_EXECUTED','UNSUPPORTED','PASSED','FAILED']);

test('hybrid memory contract names every atto-source.* backend exactly once',()=>{
  assert.equal(profile.schema_version,1);
  assert.equal(profile.contract,'atto.hybrid-actor-memory.v1');
  assert.equal(profile.status,'CANDIDATE_AND_UNCERTIFIED');
  assert.deepEqual(Object.keys(profile.backend_status).sort(),[...repos].sort());
  assert.equal(new Set(profile.features).size,profile.features.length);
  assert.ok(profile.features.length === 20);
  for(const name of repos){
    const row=profile.backend_status[name];
    assert.equal(row.repo,'atto-lang/atto-source.'+name);
    assert.ok(profile.abi_kinds.includes(row.storage_abi_candidate));
    assert.ok(row.source_candidate.length>8);
    assert.ok(row.notes.length>20);
    assert.equal(row.storage_provenance,'DRAFT_SOURCE_INSPECTION_NOT_AOT_CERTIFIED');
    assert.equal(row.compiled_guest_memory_parity,'NOT_EXECUTED');
    assert.deepEqual(row.supported_features,[]);
    assert.deepEqual(Object.keys(row.feature_evidence).sort(),[...profile.features].sort());
    for(const evidence of Object.values(row.feature_evidence)) {
      assert.ok(statuses.has(evidence.status));
      assert.equal(evidence.status,'NOT_EXECUTED');
      assert.equal(evidence.receipt,null);
    }
  }
});

test('Ref32 alignment math is exact and the high unsigned range survives',()=>{
  const abi=profile.reference_abi;
  assert.equal(abi.word_bits,32);
  assert.equal(abi.null,0);
  assert.equal(abi.alignment,8);
  const max=(2n**32n-2n)*BigInt(abi.alignment);
  assert.equal(abi.max_logical_start_bytes,max.toString());
  const round=(w)=>w===0?null:(BigInt(w)-1n)*8n;
  for(const w of [1,2,0x7fffffff,0x80000000,0xfffffffe,0xffffffff])
    assert.equal(Number(round(w)/8n+1n),w);
});

test('NET generation16/slot16 is never mistaken for LLVM offset-Ref32',()=>{
  assert.equal(profile.backend_status.llvm.storage_abi_candidate,'offset8_plus_one');
  assert.equal(profile.backend_status.net.storage_abi_candidate,'generation16_slot16');
  assert.equal(profile.backend_status.wasm.storage_abi_candidate,'offset8_plus_one');
  assert.equal(profile.policy.never_reinterpret_ref32_word,true);
  assert.equal(profile.policy.backend_storage_is_not_wire_abi,true);
  assert.equal(profile.policy.backend_must_negotiate_abi,true);
  assert.equal(profile.policy.unsupported_must_fail_closed,true);
});

test('optional wide memory and capability feature names remain independent',()=>{
  for(const f of ['actor_handle32_table','actor_handle64','actor_segments','actor_extended_heap',
    'wasm_memory64','native_pointer_width','capability128_software','capability128_hardware','simd128','simd256',
    'simd512','integer128','gpu_dma_pinning','actor_transfer_take','actor_arena_realtime_prefault'])
    assert.ok(profile.features.includes(f),f);
  assert.equal(profile.policy.compiled_guest_evidence_required,true);
});

test('no unproven metadata upgrades a target to compiled-guest pass',()=>{
  for(const row of Object.values(profile.backend_status)){
    assert.notEqual(row.compiled_guest_memory_parity,'PASSED');
    for(const v of Object.values(row.feature_evidence))
      assert.notEqual(v.status,'PASSED');
  }
});
