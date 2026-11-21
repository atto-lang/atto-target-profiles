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
  assert.equal(profile.backend_status.net.control_plane_storage_abi_candidate,
    'control_generation12_slot20_v1');
  assert.equal(profile.backend_status.net.control_plane_slot_bits,20);
  assert.equal(profile.backend_status.net.control_plane_generation_bits,12);
  assert.equal(profile.backend_status.net.control_plane_slot_bits+
    profile.backend_status.net.control_plane_generation_bits,32);
  assert.notEqual(profile.backend_status.net.control_plane_storage_abi_candidate,
    profile.backend_status.net.storage_abi_candidate);
  assert.equal(profile.backend_status.net.control_plane_compiled_guest_parity,'NOT_EXECUTED');
  assert.equal(profile.policy.net_control_plane_ref32_is_not_actor_guest_ref32,true);

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

test('canonical linked-node .atto guest corpus is tracked without invented backend passes',()=>{
 const corpus=profile.canonical_compiled_guest_corpus;
 assert.equal(corpus.repo,'atto-lang/atto-platform-conformance');
 assert.equal(corpus.pr,461);
 assert.equal(corpus.positive_blob_sha,'d472cccb3da24ee8f9fed44f99c1c7742d3240de');
 assert.equal(corpus.negative_blob_sha,'7544665f302167451fdc47ce11f5f108f703b7ed');
 assert.notEqual(corpus.positive_blob_sha,corpus.negative_blob_sha);
 const level=Object.fromEntries(Object.entries(profile.backend_status)
   .map(([name,row])=>[name,row.node_graph_implementation_level]));
 assert.equal(level.net,'NARROW_GUEST_COMPILER_SOURCE_AUTHORED');
 assert.equal(level.rs,'SCALAR_ACTOR_GUEST_EXISTS_NODE_GRAPH_NEGATIVE_AUTHORED');
 assert.equal(level.llvm,'SCALAR_ACTOR_GUEST_EXISTS_NODE_GRAPH_NEGATIVE_AUTHORED');
 assert.equal(level.wasm,'SCALAR_ACTOR_POOLED_WASM_GUEST_EXISTS_NODE_GRAPH_NEGATIVE_AUTHORED');
 for(const name of ['js','cranelift','hdl'])
   assert.equal(level[name],'FAIL_CLOSED_SOURCE_AUTHORED');
 assert.equal(level.atto,'STAGE0_SCALAR_ATTO_GUEST_ONLY_NO_SELFHOSTING');
 assert.equal(level.realtime,'BOOTSTRAP_PROFILE_NOT_IMPLEMENTED');
 for(const row of Object.values(profile.backend_status)){
   assert.equal(row.node_graph_positive_guest,'NOT_EXECUTED');
   assert.equal(row.node_graph_negative_guest,'NOT_EXECUTED');
   assert.equal(row.node_graph_compiled_guest_receipt,null);
 }
 assert.equal(profile.policy.zero_step_ci_is_not_guest_evidence,true);
 assert.equal(profile.policy.fail_closed_source_rejection_is_not_positive_guest_parity,true);
});

test('local exact-blob source corpus proof cannot be mistaken for guest execution',()=>{
 const evidence=profile.canonical_compiled_guest_corpus.source_validation;
 assert.equal(evidence.status,'EXECUTED_LOCAL_SOURCE_ONLY');
 assert.equal(evidence.scope,'NODE_SOURCE_FIXTURE_AND_STATUS_INTEGRITY_ONLY_NOT_COMPILER');
 assert.equal(evidence.source_test_git_blob,'cd8d7591823d2487be3ee04bdde8acd6bfb2558f');
 assert.equal(evidence.fixture_manifest_git_blob,'9e686ce4e56087b19be391a7d8ff55003af9a2a6');
 assert.deepEqual(evidence.result,{tests:3,passed:3,failed:0});
 assert.equal(evidence.ci_runner_status,'GITHUB_ALTERNATE_RUNNER_ZERO_STEPS_NOT_EXECUTED');
 for(const row of Object.values(profile.backend_status))
   assert.equal(row.node_graph_compiled_guest_receipt,null);
});
