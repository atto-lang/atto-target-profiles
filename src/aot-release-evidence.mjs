// Local AOT artifact identity gate. This is NOT a code-signature verifier,
// a native execution receipt, target ABI certification, or compiler provenance.
import {openSync,readFileSync,closeSync,lstatSync,realpathSync,constants} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {types as nodeTypes} from 'node:util';
const sha1=/^[0-9a-f]{40}$/, sha256=/^[0-9a-f]{64}$/;
const fields=['schemaVersion','target','backend','sourceHead','sourceTree',
 'compilerHead','compilerTree','compilerBinarySha256','artifactSha256','artifactBytes'];
const targets=new Set(['linux-x86_64','linux-aarch64','windows-x86_64',
 'windows-aarch64','macos-x86_64','macos-aarch64']);
const backends=new Set(['llvm','graalvm','nativeaot','cranelift']);
const MAX_BYTES=64*1024*1024;
const fail=message=>{throw new Error('AOT_ARTIFACT_UNVERIFIED: '+message);};
function ownRecord(value,keys){
 if(!value||typeof value!=='object'||nodeTypes.isProxy(value)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
 const own=Reflect.ownKeys(value);
 return own.length===keys.length&&own.every(k=>{
  const d=Object.getOwnPropertyDescriptor(value,k);
  return typeof k==='string'&&keys.includes(k)&&d.enumerable&&Object.hasOwn(d,'value');
 });
}
export function inspectLocalAotArtifact(manifest,file){
 if(!ownRecord(manifest,fields))fail('manifest is not exact own data');
 if(manifest.schemaVersion!==1||!targets.has(manifest.target)||
    !backends.has(manifest.backend))fail('unsupported target/backend profile');
 for(const k of ['sourceHead','sourceTree','compilerHead','compilerTree'])
   if(!sha1.test(manifest[k]))fail('invalid full source/compiler Git SHA: '+k);
 for(const k of ['compilerBinarySha256','artifactSha256'])
   if(!sha256.test(manifest[k]))fail('invalid full binary SHA-256: '+k);
 if(!Number.isSafeInteger(manifest.artifactBytes)||manifest.artifactBytes<4||
    manifest.artifactBytes>MAX_BYTES)fail('invalid bounded artifact size');
 if(typeof file!=='string'||!file.startsWith('/')||realpathSync(file)!==resolve(file))
   fail('artifact path is not an absolute, unredirected path');
 if(lstatSync(file).isSymbolicLink())fail('symlinked artifact');
 let fd;
 try{
  fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const bytes=readFileSync(fd);
  if(bytes.byteLength!==manifest.artifactBytes||bytes.byteLength>MAX_BYTES)
    fail('artifact byte size mismatch');
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==manifest.artifactSha256)fail('artifact content fingerprint mismatch');
  const first=bytes.subarray(0,4).toString('hex');
  if(manifest.target.startsWith('linux-')&&first!=='7f454c46')
    fail('artifact does not have ELF magic');
  if(manifest.target.startsWith('windows-')&&first.slice(0,4)!=='4d5a')
    fail('artifact does not have PE/DOS magic');
  if(manifest.target.startsWith('macos-')&&
     !new Set(['cffaedfe','feedfacf','cafebabe','bebafeca']).has(first))
    fail('artifact does not have Mach-O/fat magic');
  return Object.freeze({classification:'LOCAL_BINARY_INTEGRITY_ONLY',
    target:manifest.target,backend:manifest.backend,artifactSha256:hash,
    artifactBytes:bytes.byteLength,guestExecution:'NOT_EXECUTED',
    codeSignature:'NOT_VERIFIED',targetAbi:'NOT_VERIFIED'});
 }finally{if(fd!==undefined)closeSync(fd);}
}
