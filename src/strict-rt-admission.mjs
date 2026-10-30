// Candidate-only admission for a named hard-RT target. A passing structural
// check is never a WCET certificate or a tested physical deadline.
const SHA1=/^[0-9a-f]{40}$/;
const SHA256=/^(?!0{64}$)[0-9a-f]{64}$/;
const KEYS=["schemaVersion","profile","identity","budget","closure"];
const IDS=["sourceTreeSha1","compilerSha256","artifactSha256","board","rtos","configSha256"];
const BUDGET=["periodUs","deadlineUs","wcetUs","releaseJitterUs","blockingUs",
  "stackBytes","arenaBytes","mailboxSlots","controlCredits","maxConcurrentHandlers"];
const CLOSURE=["guestFullyCompiled","closedFfiGraph","noTracingGc","noPostBootAlloc",
  "noInterpreter","noUnboundedLoop","cleanupBounded","unknownEffects",
  "qualificationEvidenceReviewed"];

function record(value, keys) {
  if (value === null || typeof value!=="object" || Array.isArray(value)
      || Object.getPrototypeOf(value)!==Object.prototype) return false;
  const names=Object.keys(value);
  return names.length===keys.length && keys.every(key=>{
    const d=Object.getOwnPropertyDescriptor(value,key);
    return d && Object.hasOwn(d,"value");
  }) && names.every(key=>keys.includes(key));
}
const nonempty = str => typeof str==="string" && str.length>=1 && str.length<=128
  && !/[\x00-\x1f\x7f]/.test(str);
const nonnegative = n => Number.isSafeInteger(n) && n>=0;
const positive = n => Number.isSafeInteger(n) && n>0;

export function assessStrictRealtimeTarget(data) {
  const errors=[];
  if (!record(data,KEYS)) return {ok:false,classification:"DENIED",errors:["invalid manifest fields"]};
  if (data.schemaVersion!==1) errors.push("unsupported schema version");
  if (!["llvm-aot-rt-strict","java-rtsj-rt-strict"].includes(data.profile))
    errors.push("hard real-time profile not implemented");
  if (!record(data.identity,IDS)) errors.push("invalid target identity");
  else {
    const i=data.identity;
    if (!SHA1.test(i.sourceTreeSha1) || !SHA256.test(i.compilerSha256)
        || !SHA256.test(i.artifactSha256) || !SHA256.test(i.configSha256))
      errors.push("immutable tree, compiler, image and RTOS configuration hashes required");
    if (!nonempty(i.board)||!nonempty(i.rtos)) errors.push("named board and RTOS required");
  }
  if (!record(data.budget,BUDGET)) errors.push("invalid resource budget");
  else {
    const b=data.budget;
    if (!positive(b.periodUs)||!positive(b.deadlineUs)||!positive(b.wcetUs)
      || !nonnegative(b.releaseJitterUs)||!nonnegative(b.blockingUs)
      || !positive(b.stackBytes)||!positive(b.arenaBytes)||!positive(b.mailboxSlots)
      || !positive(b.controlCredits)||b.maxConcurrentHandlers!==1)
      errors.push("unbounded, invalid or unsupported actor resources");
    else if (b.deadlineUs > b.periodUs ||
      BigInt(b.wcetUs)+BigInt(b.releaseJitterUs)+BigInt(b.blockingUs)>BigInt(b.deadlineUs))
      errors.push("WCET + release jitter + blocking exceeds admitted deadline or period");
  }
  if (!record(data.closure,CLOSURE)) errors.push("invalid compiler closure");
  else {
    const c=data.closure;
    if (CLOSURE.some(key=>typeof c[key]!=="boolean")
      || !c.guestFullyCompiled || !c.closedFfiGraph || !c.noTracingGc
      || !c.noPostBootAlloc || !c.noInterpreter || !c.noUnboundedLoop
      || !c.cleanupBounded || c.unknownEffects || !c.qualificationEvidenceReviewed)
      errors.push("closed source/FFI/effect proof or reviewed evidence missing");
  }
  return {ok:errors.length===0,
    classification:errors.length===0?"CANDIDATE_REVIEW_REQUIRED":"DENIED",
    errors};
}
