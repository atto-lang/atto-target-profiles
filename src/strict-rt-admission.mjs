// Candidate-only admission for a named hard-RT target. A passing structural
// check is never a WCET certificate or a tested physical deadline.
const SHA1=/^[0-9a-f]{40}$/;
const validSha1 = value => typeof value === "string" && SHA1.test(value);
const validSha256 = value => typeof value === "string" && SHA256.test(value);
const SHA256=/^(?!0{64}$)[0-9a-f]{64}$/;
const KEYS=["schemaVersion","profile","identity","budget","closure"];
const IDS=["sourceTreeSha1","compilerSha256","artifactSha256","board","rtos","configSha256"];
const BUDGET=["periodUs","deadlineUs","wcetUs","releaseJitterUs","blockingUs",
  "stackBytes","arenaBytes","mailboxSlots","controlCredits","maxConcurrentHandlers"];
const CLOSURE=["guestFullyCompiled","closedFfiGraph","noTracingGc","noPostBootAlloc",
  "noInterpreter","noUnboundedLoop","cleanupBounded","unknownEffects",
  "qualificationEvidenceReviewed"];

// Snapshot exact own data descriptors before semantic validation. Reading the
// original untrusted object after checking descriptors would allow Proxy get
// traps to substitute values or perform side effects.
function record(value, keys) {
  try {
    if (value === null || typeof value!=="object" || Array.isArray(value)
        || Object.getPrototypeOf(value)!==Object.prototype) return null;
    const names=Reflect.ownKeys(value);
    if (names.length!==keys.length) return null;
    const snapshot=Object.create(null);
    for (const key of names) {
      if (typeof key!=="string" || !keys.includes(key)) return null;
      const d=Object.getOwnPropertyDescriptor(value,key);
      if (!d || d.enumerable!==true || !Object.hasOwn(d,"value")) return null;
      snapshot[key]=d.value;
    }
    return snapshot;
  } catch {
    return null; // Throwing reflection/proxy trap is not RT evidence.
  }
}
const nonempty = str => typeof str==="string" && str.length>=1 && str.length<=128
  && !/[\x00-\x1f\x7f]/.test(str);
const nonnegative = n => Number.isSafeInteger(n) && n>=0;
const positive = n => Number.isSafeInteger(n) && n>0;

function assessStrictRealtimeTargetUnchecked(data) {
  const errors=[];
  const top=record(data,KEYS);
  if (!top) return {ok:false,classification:"DENIED",errors:["invalid manifest fields"]};
  if (top.schemaVersion!==1) errors.push("unsupported schema version");
  if (!["llvm-aot-rt-strict","java-rtsj-rt-strict"].includes(top.profile))
    errors.push("hard real-time profile not implemented");
  const i=record(top.identity,IDS);
  if (!i) errors.push("invalid target identity");
  else {
    if (!validSha1(i.sourceTreeSha1) || !validSha256(i.compilerSha256)
        || !validSha256(i.artifactSha256) || !validSha256(i.configSha256))
      errors.push("immutable tree, compiler, image and RTOS configuration hashes required");
    if (!nonempty(i.board)||!nonempty(i.rtos)) errors.push("named board and RTOS required");
  }
  const b=record(top.budget,BUDGET);
  if (!b) errors.push("invalid resource budget");
  else {
    if (!positive(b.periodUs)||!positive(b.deadlineUs)||!positive(b.wcetUs)
      || !nonnegative(b.releaseJitterUs)||!nonnegative(b.blockingUs)
      || !positive(b.stackBytes)||!positive(b.arenaBytes)||!positive(b.mailboxSlots)
      || !positive(b.controlCredits)||b.maxConcurrentHandlers!==1)
      errors.push("unbounded, invalid or unsupported actor resources");
    else if (b.deadlineUs > b.periodUs ||
      BigInt(b.wcetUs)+BigInt(b.releaseJitterUs)+BigInt(b.blockingUs)>BigInt(b.deadlineUs))
      errors.push("WCET + release jitter + blocking exceeds admitted deadline or period");
  }
  const c=record(top.closure,CLOSURE);
  if (!c) errors.push("invalid compiler closure");
  else {
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

/** A hostile caller's Proxy or field coercion must never escape admission. */
export function assessStrictRealtimeTarget(data) {
  try {
    return assessStrictRealtimeTargetUnchecked(data);
  } catch {
    return {ok:false,classification:"DENIED",
      errors:["malformed manifest or untrusted reflection trap"]};
  }
}
