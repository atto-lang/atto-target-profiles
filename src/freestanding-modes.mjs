import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const assertObject=(o,fields,where)=>{
  if(o===null||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype||
    Reflect.ownKeys(o).length!==fields.length || fields.some(field=>!Object.hasOwn(o,field)))
    throw new TypeError('E_PROFILE_SCHEMA: '+where);
};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const LAYERS=['core','alloc','std'];
const BASE=[
 ['freestanding-core',['core'],[],['os','libc','heap','host_io','host_scheduler','dynamic_loader','host_gc'],'platform-defined','platform-defined','none-by-default'],
 ['freestanding-alloc',['core','alloc'],['explicit_allocator'],['os','libc','host_io','host_scheduler','dynamic_loader','host_gc','implicit_allocator'],'platform-defined','platform-defined','none-by-default'],
 ['hosted-std',['core','alloc','std'],['host_adapter','allocator'],['unapproved_host_import'],'host-adapter','host-or-platform','host-or-explicit']
];
const BACKENDS=['llvm','java','net','wasm','forge','rs','embedded'];
const PERMITTED_SERVICES={
  'freestanding-core':['pure','target.atomic','target.mmio'],
  'freestanding-alloc':['pure','target.atomic','target.mmio','explicit_allocator'],
  'hosted-std':['pure','allocator','host_adapter','os','libc','host_io','host_scheduler',
    'os.fs','os.net','os.process','os.clock','os.stdio','target.atomic','target.mmio']
};
export function validateModes(m){
  assertObject(m,['schema','status','modes','targetBackends','proof'],'root');
  if(m.schema!=='atto.target.library-modes.v1'||m.status!=='PROPOSAL_NOT_EXECUTED')
    throw new TypeError('E_PROFILE_SCHEMA: version/status');
  if(!same(m.targetBackends,BACKENDS)||!Array.isArray(m.modes)||m.modes.length!==3)
    throw new TypeError('E_PROFILE_SCHEMA: backend/mode inventory');
  BASE.forEach(([name,libs,required,forbidden,entry,panic,executor],i)=>{
    const x=m.modes[i];
    assertObject(x,['name','libraries','requiredServices','prohibitedServices','entry','panic','executor','execution'],'mode');
    if(x.name!==name||!same(x.libraries,libs)||!same(x.requiredServices,required)||
      !same(x.prohibitedServices,forbidden)||x.entry!==entry||x.panic!==panic||
      x.executor!==executor||x.execution!=='NOT_EXECUTED')
      throw new TypeError('E_PROFILE_BOUNDARY: '+name);
  });
  assertObject(m.proof,['sourceTreeSha','freestandingImageSha256','compiledGuestCases','negativeNoArtifactCases','independentGuestExecution'],'proof');
  const p=m.proof;
  if(p.sourceTreeSha!==null||p.freestandingImageSha256!==null||p.compiledGuestCases!==0||
    p.negativeNoArtifactCases!==0||p.independentGuestExecution!==false)
    throw new TypeError('E_PROFILE_EVIDENCE: no guest proof in declaration');
  return {structurallyValid:true,freestandingCompiled:false,backendParityVerified:false};
}
// Declarative admission: cannot prove that the provided import list matches the final binary.
export function admitDeclaredDependencies(m, request){
  validateModes(m);
  assertObject(request,['mode','libraries','services','unknownImports'],'request');
  const selected=m.modes.find(x=>x.name===request.mode);
  if(!selected)throw new TypeError('E_TARGET_PROFILE: unknown mode');
  for(const field of ['libraries','services','unknownImports']){
    if(!Array.isArray(request[field])||request[field].some(x=>typeof x!=='string')||
      new Set(request[field]).size!==request[field].length)
      throw new TypeError('E_TARGET_PROFILE: invalid '+field);
  }
  if(request.unknownImports.length)throw new TypeError('E_FREESTANDING_UNRESOLVED: unknown imports');
  for(const layer of request.libraries){
    if(!LAYERS.includes(layer)||!selected.libraries.includes(layer))
      throw new TypeError('E_FREESTANDING_FORBIDDEN_IMPORT: '+layer);
  }
  for(const forbidden of selected.prohibitedServices){
    if(request.services.includes(forbidden))
      throw new TypeError('E_FREESTANDING_HOST_EFFECT: '+forbidden);
  }
  for(const service of request.services){
    if(!PERMITTED_SERVICES[request.mode].includes(service))
      throw new TypeError('E_TARGET_UNSUPPORTED: unrecognized service '+service);
  }
  for(const required of selected.requiredServices){
    if(!request.services.includes(required))
      throw new TypeError(required.includes('allocator')?
        'E_ALLOCATOR_REQUIRED: '+required:'E_TARGET_UNSUPPORTED: '+required);
  }
  return {declaredAdmission:true,guestImageInspected:false,guestExecutable:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const file=new URL('../contracts/freestanding-target-modes-v1.json',import.meta.url);
    console.log(validateModes(JSON.parse(fs.readFileSync(file,'utf8'))));
  }catch(e){console.error(e);process.exitCode=1;}
}
