import {types as nodeTypes} from 'node:util';
// AOT release *envelope* admission. Untrusted JSON is never an attestation.
// This is a host-side structural preflight, NOT compiler or platform proof.
const sha40=/^[0-9a-f]{40}$/;
const sha256=/^[0-9a-f]{64}$/;
const triples={
 linux:{x86_64:"x86_64-unknown-linux-gnu",aarch64:"aarch64-unknown-linux-gnu"},
 windows:{x86_64:"x86_64-pc-windows-msvc",aarch64:"aarch64-pc-windows-msvc"},
 macos:{x86_64:"x86_64-apple-darwin",aarch64:"aarch64-apple-darwin"}
};
const formats={linux:"elf",windows:"pe",macos:"macho"};
const backends=new Set(["llvm","graalvm-native","net-nativeaot","cranelift"]);
const own=(o,k)=>Object.hasOwn(o,k);
const record=v=>v!==null&&typeof v==="object"&&!nodeTypes.isProxy(v)&&!Array.isArray(v)&&
  (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const keys=(v,required)=>record(v)&&Reflect.ownKeys(v).length===required.length&&
 required.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const isSha=(v,re)=>typeof v==='string'&&re.test(v);
const stepsArray=v=>!nodeTypes.isProxy(v)&&Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length===3&&Reflect.ownKeys(v).length===4&&[0,1,2].every(i=>{const d=Object.getOwnPropertyDescriptor(v,String(i));return d?.enumerable&&Object.hasOwn(d,'value');});
const validInt=(n,min)=>Number.isSafeInteger(n)&&n>=min;
export function validateAotReleaseEnvelope(envelope) {
 const fail=reason=>{throw new Error("AOT envelope: "+reason)};
 if(!keys(envelope,["schemaVersion","platform","arch","triple","backend","compiler","artifact","run"]))
  fail("invalid release envelope shape");
 if(envelope.schemaVersion!==1||typeof envelope.platform!=='string'||typeof envelope.arch!=='string'||!own(triples,envelope.platform)||!own(triples[envelope.platform],envelope.arch))
  fail("unsupported target platform/arch");
 if(envelope.triple!==triples[envelope.platform][envelope.arch]||!backends.has(envelope.backend))
  fail("target triple or backend mismatch");
 const c=envelope.compiler;
 if(!keys(c,["head","tree","binarySha256"])||
    !isSha(c.head,sha40)||!isSha(c.tree,sha40)||!isSha(c.binarySha256,sha256))
  fail("incomplete compiler provenance");
 const artifact=envelope.artifact;
 if(!keys(artifact,["format","sha256","bytes","entry"])||
    artifact.format!==formats[envelope.platform]||
    !isSha(artifact.sha256,sha256)||!validInt(artifact.bytes,1)||
    artifact.entry!=="main")
  fail("missing or wrong native artifact identity");
 const run=envelope.run;
 if(!keys(run,["id","attempt","jobId","runnerId","head","steps","guest"])||
    !validInt(run.id,1)||!validInt(run.attempt,1)||!validInt(run.jobId,1)||
    typeof run.runnerId!=="string"||run.runnerId.trim()===""||
    run.head!==c.head)
  fail("missing exact-head runner admission");
 if(!stepsArray(run.steps))
  fail("executed compile/link/guest phases missing");
 const phases=new Set(),ids=new Set();
 for(let i=0;i<3;i++) { const step=run.steps[i];
  if(!keys(step,["id","phase","conclusion"])||!validInt(step.id,1)||
    ids.has(step.id)||!["compile","link","guest-execute"].includes(step.phase)||
    step.conclusion!=="success"||phases.has(step.phase))
   fail("duplicate, unexecuted, or unsupported workflow phase");
  ids.add(step.id);phases.add(step.phase);
 }
 if(phases.size!==3)fail("all three native execution phases required");
 if(!keys(run.guest,["exitCode","stdoutSha256","stderrSha256","artifactSha256"])||
    run.guest.exitCode!==0||!isSha(run.guest.stdoutSha256,sha256)||
    !isSha(run.guest.stderrSha256,sha256)||
    run.guest.artifactSha256!==artifact.sha256)
  fail("guest result not bound to artifact");
 // The entire envelope is caller-supplied. A trusted publisher must compare
 // every claimed identifier and digest to live CI, compiler and artifact data.
 return Object.freeze({classification:"STRUCTURAL_CANDIDATE_ONLY",platform:envelope.platform,
  backend:envelope.backend,triple:envelope.triple});
}
