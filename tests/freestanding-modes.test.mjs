import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateModes,admitDeclaredDependencies} from '../src/freestanding-modes.mjs';
const reference=JSON.parse(fs.readFileSync(new URL('../contracts/freestanding-target-modes-v1.json',import.meta.url),'utf8'));
const fresh=()=>structuredClone(reference);
const denied=(prefix,f)=>assert.throws(f,new RegExp('^TypeError: '+prefix+':'));
const q=(mode,libraries,services=[],unknownImports=[])=>({mode,libraries,services,unknownImports});
test('the frozen profile matrix stays explicitly unverified',()=>{
  assert.deepEqual(validateModes(fresh()),{structurallyValid:true,freestandingCompiled:false,backendParityVerified:false});
});
test('core has neither heap nor OS prerequisites',()=>{
  assert.equal(admitDeclaredDependencies(fresh(),q('freestanding-core',['core'])).declaredAdmission,true);
  denied('E_FREESTANDING_FORBIDDEN_IMPORT',()=>admitDeclaredDependencies(fresh(),q('freestanding-core',['alloc'])));
  denied('E_FREESTANDING_FORBIDDEN_IMPORT',()=>admitDeclaredDependencies(fresh(),q('freestanding-core',['std'])));
  denied('E_FREESTANDING_HOST_EFFECT',()=>admitDeclaredDependencies(fresh(),q('freestanding-core',['core'],['os'])));
  denied('E_FREESTANDING_HOST_EFFECT',()=>admitDeclaredDependencies(fresh(),q('freestanding-core',['core'],['heap'])));
  denied('E_FREESTANDING_HOST_EFFECT',()=>admitDeclaredDependencies(fresh(),q('freestanding-core',['core'],['host_scheduler'])));
});
test('alloc requires an explicit allocator, not OS or hidden malloc',()=>{
  denied('E_ALLOCATOR_REQUIRED',()=>admitDeclaredDependencies(fresh(),q('freestanding-alloc',['core','alloc'])));
  assert.equal(admitDeclaredDependencies(fresh(),q('freestanding-alloc',['core','alloc'],['explicit_allocator'])).declaredAdmission,true);
  denied('E_FREESTANDING_HOST_EFFECT',()=>admitDeclaredDependencies(fresh(),q('freestanding-alloc',['alloc'],['explicit_allocator','libc'])));
  denied('E_FREESTANDING_FORBIDDEN_IMPORT',()=>admitDeclaredDependencies(fresh(),q('freestanding-alloc',['std'],['explicit_allocator'])));
});
test('hosted std needs a host adapter and allocator; unknown imports always fail',()=>{
  denied('E_TARGET_UNSUPPORTED',()=>admitDeclaredDependencies(fresh(),q('hosted-std',['core','alloc','std'],['allocator'])));
  denied('E_ALLOCATOR_REQUIRED',()=>admitDeclaredDependencies(fresh(),q('hosted-std',['std'],['host_adapter'])));
  assert.equal(admitDeclaredDependencies(fresh(),q('hosted-std',['core','alloc','std'],['host_adapter','allocator'])).declaredAdmission,true);
  denied('E_FREESTANDING_UNRESOLVED',()=>admitDeclaredDependencies(fresh(),q('hosted-std',['std'],['host_adapter','allocator'],['libc.so'])));
});
test('reject tampered profile fields and fabricated guest evidence',()=>{
  const edits=[
    x=>x.status='PASS',x=>x.modes[0].libraries.push('std'),
    x=>x.modes[0].requiredServices.push('os'),
    x=>x.modes[1].prohibitedServices=x.modes[1].prohibitedServices.filter(s=>s!=='libc'),
    x=>x.modes[2].requiredServices=[],
    x=>x.modes[0].execution='PASS',
    x=>x.proof.compiledGuestCases=1,
    x=>x.proof.independentGuestExecution=true,
    x=>x.proof.sourceTreeSha='a'.repeat(40),
    x=>x.targetBackends.pop(),x=>x.extra=true
  ];
  for(const edit of edits){const x=fresh();edit(x);assert.throws(()=>validateModes(x),TypeError);}
});
test('deny ambiguous request metadata, unknown modes and duplicate imported layers',()=>{
  denied('E_TARGET_PROFILE',()=>admitDeclaredDependencies(fresh(),q('core',['core'])));
  denied('E_TARGET_PROFILE',()=>admitDeclaredDependencies(fresh(),q('freestanding-core',['core','core'])));
  denied('E_TARGET_PROFILE',()=>admitDeclaredDependencies(fresh(),{...q('freestanding-core',['core']),extra:true}));
});
