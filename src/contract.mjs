export const CAPABILITIES = Object.freeze(["clock","random","net.client","net.server","fs.read","fs.write","threads","interop.java","interop.native","device.camera","device.gpio","dynamic.code","heap","gc"]);
export const ENVIRONMENTS = Object.freeze(["server","desktop","browser","edge-js","edge-wasi","ios","android","embedded"]);
export const BACKENDS = Object.freeze(["llvm","graal","wasm","javascript","dex","c","bytecode"]);
// Authority-bearing lists must be dense, own-indexed, unique JSON-like arrays.
// Array#every skips holes, and inherited numeric entries can otherwise mask
// absent capabilities/targets, making a malformed build graph appear valid.
// JSON-like authority arrays must have ONLY own, non-accessor numeric slots.
// In particular, allow no shadowed includes/every/entries, custom prototypes
// or sparse slots: all can subvert policy checks despite a correct length.
const ownDenseArray=(a,max=4096)=>{
  if(!Array.isArray(a)||Object.getPrototypeOf(a)!==Array.prototype||a.length>max)return false;
  if(Reflect.ownKeys(a).length!==a.length+1)return false;
  for(let i=0;i<a.length;i++){
    const slot=Object.getOwnPropertyDescriptor(a,String(i));
    if(!slot||!Object.hasOwn(slot,'value'))return false;
  }
  return true;
};
const dataOnly=o=>Reflect.ownKeys(o).every(key=>
  typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(o,key),'value'));
const unique = a => {
  if(!ownDenseArray(a))return false;
  const seen=new Set();
  for(let i=0;i<a.length;i++){
    const x=a[i];
    if(typeof x!=='string'||x.length===0||seen.has(x))return false;
    seen.add(x);
  }
  return true;
};
// Never dispatch policy checks through caller-controlled array methods.
const subset=(a,b)=>{
  const allowed=new Set();
  for(let i=0;i<b.length;i++)allowed.add(b[i]);
  for(let i=0;i<a.length;i++)if(!allowed.has(a[i]))return false;
  return true;
};

export function validateRegistry(profiles) {
  const errors=[],seen=new Set();
  if (!ownDenseArray(profiles)) return {ok:false,errors:["registry must be a dense own-indexed array"]};
  for (const [i,p] of profiles.entries()) {
    const at="profiles["+i+"]";
    if (!p || typeof p!=="object" || Array.isArray(p) || !dataOnly(p)) {errors.push(at+": expected plain data object");continue}
    const missing=["schemaVersion","name","backends","capabilities"].filter(k=>!Object.hasOwn(p,k));
    if(missing.length){errors.push(at+": missing own registry fields "+missing.join(","));continue}
    if (p.schemaVersion!==1 || !ENVIRONMENTS.includes(p.name)) errors.push(at+": unknown schema or target");
    if (seen.has(p.name)) errors.push(at+": duplicate environment "+p.name);
    seen.add(p.name);
    if (!unique(p.backends)||p.backends.length===0||!subset(p.backends,BACKENDS)) errors.push(at+": invalid backends");
    if (!unique(p.capabilities)||!subset(p.capabilities,CAPABILITIES)) errors.push(at+": invalid capabilities");
    if (p.notes!==undefined && typeof p.notes!=="string") errors.push(at+": notes must be a string");
    for (const k of Object.keys(p)) if (!["schemaVersion","name","backends","capabilities","notes"].includes(k)) errors.push(at+": unknown property "+k);
  }
  for (const name of ENVIRONMENTS) if (!seen.has(name)) errors.push("missing profile "+name);
  return {ok:errors.length===0,errors};
}
export function validateClosure(input,profiles) {
  const errors=[];
  if(!input||typeof input!=="object"||Array.isArray(input)||!dataOnly(input))
    return {ok:false,errors:["resolved graph must be an object"]};
  const keys=["schemaVersion","nodes","entry","target","backend","grants"];
  for(const field of Object.keys(input))
    if(!keys.includes(field))errors.push("unknown resolved graph property "+field);
  for(const field of ["schemaVersion","nodes","entry","target","backend"])
    if(!Object.hasOwn(input,field))errors.push("missing resolved graph property "+field);
  const {schemaVersion,nodes,entry,target,backend}=input;
  // Optional authority must never be inherited through a prototype chain.
  const grants=Object.hasOwn(input,"grants")?input.grants:[];
  if(schemaVersion!==1)errors.push("unsupported or missing resolved-graph schemaVersion");
  if(typeof backend!=="string"||!BACKENDS.includes(backend))errors.push("missing or unknown backend");
  const registry=validateRegistry(profiles);
  if (!registry.ok) return registry;
  const profile=profiles.find(x=>x.name===target);
  if (!profile) errors.push("unknown requested target: "+target);
  if (backend!==undefined && (!BACKENDS.includes(backend)||!profile?.backends.includes(backend))) errors.push("backend "+backend+" is not declared for "+target);
  if (!unique(grants)||!subset(grants,CAPABILITIES)) errors.push("invalid or duplicate grants");
  if (profile && unique(grants) && !subset(grants,profile.capabilities)) errors.push("capability grant unavailable in "+target);
  if (!Array.isArray(nodes)||nodes.length===0) return {ok:false,errors:[...errors,"nodes must be a nonempty array"]};
  if(nodes.length>4096)return {ok:false,errors:[...errors,"resolved graph exceeds 4096 units"]};
  if(!ownDenseArray(nodes))return {ok:false,errors:[...errors,"nodes must be a dense own-indexed array"]};
  const ids=new Map();
  for(const [i,node] of nodes.entries()){
    const at="nodes["+i+"]";
    if(!node||typeof node!=="object"||Array.isArray(node)||!dataOnly(node)){errors.push(at+": expected plain data object");continue}
    const missing=["id","targets","requires","imports"].filter(k=>!Object.hasOwn(node,k));
    if(missing.length){errors.push(at+": missing own node fields "+missing.join(","));continue}
    if(typeof node.id!=="string"||node.id.length===0||node.id.length>512||node.id.includes("\u0000")){errors.push(at+": invalid id");continue}
    if(ids.has(node.id))errors.push(at+": duplicate id "+node.id);
    ids.set(node.id,node);
    if(!unique(node.targets)||node.targets.length===0||!subset(node.targets,ENVIRONMENTS))errors.push(node.id+": invalid targets");
    if(!unique(node.requires)||!subset(node.requires,CAPABILITIES))errors.push(node.id+": invalid requires");
    if(!unique(node.imports)||node.imports.length>256||node.imports.some(x=>x.length>512||x.includes("\u0000")))errors.push(node.id+": invalid or excessive imports");
    for(const field of Object.keys(node))if(!["id","targets","requires","imports"].includes(field))errors.push(node.id+": unknown property "+field);
  }
  if(!ids.has(entry))errors.push("missing entry "+entry);
  if(errors.length) return {ok:false,errors};
  // Iterative graph traversal avoids adversarial recursion depth and ensures
  // cycles terminate. Check the promised target set of *every* import edge,
  // not just compatibility with today's selected compilation target.
  const visited=new Set();
  const pending=[entry];
  let edges=0;
  while(pending.length){
    const id=pending.pop();
    if(visited.has(id))continue;
    visited.add(id);
    const a=ids.get(id);
    if(!a.targets.includes(target))errors.push(id+": target "+target+" not admitted");
    if(!subset(a.requires,grants))errors.push(id+": missing build grants "+a.requires.filter(x=>!grants.includes(x)).join(","));
    if(profile&&!subset(a.requires,profile.capabilities))errors.push(id+": target "+target+" lacks declared capabilities");
    for(const dep of a.imports){
      edges++;
      if(edges>65536)return {ok:false,errors:[...errors,"resolved graph exceeds 65536 import edges"]};
      if(!ids.has(dep)){errors.push(id+": unresolved import "+dep);continue}
      const b=ids.get(dep);
      if(!subset(a.targets,b.targets))errors.push(id+" -> "+dep+": imported targets do not cover importer targets");
      if(!subset(b.requires,a.requires))errors.push(id+" -> "+dep+": imported requirements are not declared by importer");
      if(!visited.has(dep))pending.push(dep);
    }
  }
  if(visited.size!==ids.size) errors.push("graph contains "+(ids.size-visited.size)+" unreachable units; supply exact linked closure");
  return {ok:errors.length===0,errors,visited:visited.size};
}
