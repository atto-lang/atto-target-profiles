// Offline profile compatibility is a metadata upper bound, never a permission
// grant, compiled guest proof, or security sandbox admission.
const SHA=/^[0-9a-f]{40}$/;
const CAP=/^[a-z][a-z0-9._-]{0,79}$/;
const SYMBOL=/^[a-z][a-z0-9._-]{0,79}$/;
const problem=(kind,field)=>({kind,field});
export function assessTargetProfileEvidence({profile,backend,grants=[],receipt=null}={}){
  const issues=[];
  if(!profile||typeof profile!=='object'||Array.isArray(profile)||profile.schemaVersion!==1||
     !SYMBOL.test(profile.name??'')||!Array.isArray(profile.backends)||profile.backends.length===0||
     profile.backends.some(x=>typeof x!=='string'||!SYMBOL.test(x))||
     new Set(profile.backends).size!==profile.backends.length||
     !Array.isArray(profile.capabilities)||profile.capabilities.some(x=>typeof x!=='string'||!CAP.test(x))||
     new Set(profile.capabilities).size!==profile.capabilities.length)
    issues.push(problem('PROFILE_UNVERIFIED','profile'));
  if(typeof backend!=='string'||!SYMBOL.test(backend)||!Array.isArray(profile?.backends)||!profile.backends.includes(backend))
    issues.push(problem('BACKEND_NOT_ALLOWED','backend'));
  if(!Array.isArray(grants)||grants.some(x=>typeof x!=='string'||!CAP.test(x))||new Set(grants).size!==grants.length)
    issues.push(problem('GRANTS_MALFORMED','grants'));
  else if(grants.some(x=>!Array.isArray(profile?.capabilities)||!profile.capabilities.includes(x)))
    issues.push(problem('GRANTS_OUTSIDE_PROFILE','grants'));
  if(issues.length)return {state:'DENIED',issues,metadataCompatible:false,guestCertified:false,releaseAuthorized:false};
  if(receipt===null)return {state:'METADATA_COMPATIBLE_ONLY',issues,metadataCompatible:true,guestCertified:false,releaseAuthorized:false};
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||!SHA.test(receipt.sourceHeadSha??'')||
     !SHA.test(receipt.compilerHeadSha??'')||receipt.backend!==backend||receipt.profile!==profile.name)
    issues.push(problem('RECEIPT_IDENTITY_UNVERIFIED','receipt'));
  if(!Number.isSafeInteger(receipt?.runId)||receipt.runId<=0||!Number.isSafeInteger(receipt?.attempt)||receipt.attempt<1||
     !Number.isSafeInteger(receipt?.jobId)||receipt.jobId<1||receipt?.runHeadSha!==receipt.sourceHeadSha||
     receipt?.jobRunId!==receipt.runId||receipt?.jobAttempt!==receipt.attempt)
    issues.push(problem('RECEIPT_RUN_BINDING_MISMATCH','receipt'));
  if(receipt?.jobConclusion!=='success'||!Array.isArray(receipt?.steps)||receipt.steps.length===0||
     !receipt.steps.some(x=>x.name==='Run target guest'&&x.status==='completed'&&x.conclusion==='success'))
    issues.push(problem('GUEST_STEP_NOT_OBSERVED','steps'));
  // No attestation signature or independent implementation verifier here.
  return {state:issues.length?'EVIDENCE_UNVERIFIED':'HOST_RECEIPT_CANDIDATE',issues,
    metadataCompatible:true,guestCertified:false,releaseAuthorized:false};
}
