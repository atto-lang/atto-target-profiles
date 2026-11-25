import {open} from "node:fs/promises";
import {constants} from "node:fs";
import {createHash} from "node:crypto";
import {types} from "node:util";

// This is candidate-input admission, NOT authentication of a CI runner or a
// certification. The caller must independently verify the GitHub job identity,
// live repository permissions, signatures, and native guest execution.
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^[0-9a-f]{64}$/;
const SAFE=/^[a-zA-Z0-9._:/ -]{1,160}$/;
function ownData(x, keys) {
  if (!x || typeof x !== "object" || Array.isArray(x) || types.isProxy(x)) return false;
  if (![Object.prototype,null].includes(Object.getPrototypeOf(x))) return false;
  const own=Reflect.ownKeys(x);
  return own.length===keys.length && own.every(k => {
    if (typeof k!=="string" || !keys.includes(k)) return false;
    const d=Object.getOwnPropertyDescriptor(x,k);
    return d.enumerable && Object.hasOwn(d,"value");
  });
}
export function admitAotCandidate(r, expected) {
  const errors=[];
  const top=["schemaVersion","sourceHead","sourceTree","compilerHead","compilerSha256","backend","target","artifact","run"];
  if (!ownData(r,top)) return {ok:false,errors:["candidate must be exact own-data record"]};
  if (!ownData(expected,["sourceHead","sourceTree","compilerHead","compilerSha256"]))
    return {ok:false,errors:["expected pins must be exact own-data record"]};
  if (r.schemaVersion!==1) errors.push("unsupported candidate schema");
  for (const k of ["sourceHead","sourceTree","compilerHead"]) {
    if (!SHA40.test(r[k]) || r[k]!==expected[k]) errors.push("mismatched "+k);
  }
  if (!SHA256.test(r.compilerSha256) || r.compilerSha256!==expected.compilerSha256)
    errors.push("mismatched compiler bytes");
  if (!["llvm","java-graal","net-nativeaot","forge"].includes(r.backend))
    errors.push("unsupported backend");
  if (!ownData(r.target,["os","arch","abi"]) ||
    !["linux","windows","macos"].includes(r.target.os) ||
    !["x86_64","aarch64"].includes(r.target.arch) ||
    typeof r.target.abi!=="string" || !SAFE.test(r.target.abi))
    errors.push("invalid native target");
  if (!ownData(r.artifact,["sha256","bytes","format"]) ||
    !SHA256.test(r.artifact.sha256) || !Number.isSafeInteger(r.artifact.bytes) ||
    r.artifact.bytes<=0 || r.artifact.bytes>268435456 ||
    !["elf","pe","macho"].includes(r.artifact.format) ||
    (r.target.os==="linux" && r.artifact.format!=="elf") ||
    (r.target.os==="windows" && r.artifact.format!=="pe") ||
    (r.target.os==="macos" && r.artifact.format!=="macho"))
    errors.push("invalid artifact digest, size or OS format");
  if (!ownData(r.run,["repository","runId","attempt","jobId","runnerId","steps","conclusion","guestStdoutSha256","guestExitCode"]) ||
      typeof r.run.repository!=="string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r.run.repository) ||
      !["runId","attempt","jobId","runnerId"].every(k=>Number.isSafeInteger(r.run[k]) && r.run[k]>0) ||
      r.run.conclusion!=="success" || r.run.guestExitCode!==0 ||
      !SHA256.test(r.run.guestStdoutSha256) ||
      types.isProxy(r.run.steps) || !Array.isArray(r.run.steps) ||
      Object.getPrototypeOf(r.run.steps)!==Array.prototype || r.run.steps.length<2 ||
      r.run.steps.length>128 || Reflect.ownKeys(r.run.steps).length!==r.run.steps.length+1 ||
      !r.run.steps.every(s=>ownData(s,["name","conclusion"]) &&
        typeof s.name==="string" && SAFE.test(s.name) && s.conclusion==="success"))
    errors.push("missing or malformed stepful execution claim");
  return {ok:errors.length===0,errors};
}
export async function verifyLocalAotArtifact(candidate,expected,path) {
  const admitted=admitAotCandidate(candidate,expected);
  if (!admitted.ok) return {...admitted,evidenceClass:"NOT_ADMITTED"};
  if (!Number.isInteger(constants.O_NOFOLLOW) || !Number.isInteger(constants.O_NONBLOCK))
    return {ok:false,errors:["secure local artifact read unsupported"],evidenceClass:"NOT_ADMITTED"};
  let fd;
  try {
    fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const before=await fd.stat({bigint:true});
    if (!before.isFile() || before.size!==BigInt(candidate.artifact.bytes))
      throw Error("artifact file is not regular or has unexpected size");
    const h=createHash("sha256");
    const buffer=Buffer.alloc(65536);
    let count=0;
    while (true) {
      const result=await fd.read(buffer,0,Math.min(buffer.length,candidate.artifact.bytes-count),null);
      if (result.bytesRead===0) break;
      count+=result.bytesRead;
      if (count>candidate.artifact.bytes) throw Error("artifact grew during reading");
      h.update(buffer.subarray(0,result.bytesRead));
      if (count===candidate.artifact.bytes) {
        const tail=Buffer.alloc(1);
        if ((await fd.read(tail,0,1,null)).bytesRead!==0) throw Error("artifact trailing bytes");
        break;
      }
    }
    const after=await fd.stat({bigint:true});
    if (count!==candidate.artifact.bytes || before.dev!==after.dev ||
        before.ino!==after.ino || before.size!==after.size ||
        before.mtimeNs!==after.mtimeNs || before.ctimeNs!==after.ctimeNs)
      throw Error("artifact changed during bounded read");
    if (h.digest("hex")!==candidate.artifact.sha256) throw Error("artifact SHA-256 mismatch");
    return {ok:true,errors:[],evidenceClass:"LOCAL_ARTIFACT_BYTES_ONLY"};
  } catch(error) {
    return {ok:false,errors:[String(error.message)],evidenceClass:"NOT_ADMITTED"};
  } finally { if (fd) await fd.close(); }
}

// Supplemental local integrity-only contract; retain existing async admission API.
export {inspectLocalAotArtifact} from './aot-local-integrity.mjs';
