import {types as nodeTypes} from "node:util";

// A strict metadata validator, NOT a source compiler, linker or security sandbox.
// Only consume exact, compiler-resolved and effect-inferred source closure.
// The caller must authenticate that producer; path labels alone prove nothing.
export const FREESTANDING_TIERS = Object.freeze({
  "freestanding-core": {layers:["core"], providers:[]},
  "freestanding-alloc": {layers:["core","alloc"], providers:["memory.explicit"]},
  "freestanding-actor": {layers:["core","actor"], providers:["executor","mailbox.bounded","control.auth"]},
  "freestanding-otp": {layers:["core","alloc","actor","otp"], providers:[
    "memory.explicit","executor","mailbox.bounded","control.auth","clock.monotonic"
  ]}
});
const IMPORTS = Object.freeze({
  core:["core"],
  alloc:["core","alloc"],
  actor:["core","actor"],
  otp:["core","alloc","actor","otp"],
  host:["core","alloc","actor","otp","host"]
});
const PROVIDERS = Object.freeze([
  "memory.explicit","executor","mailbox.bounded","control.auth","clock.monotonic",
  "os.libc","os.filesystem","os.network","os.process","java.interop","threads"
]);
const BACKENDS = Object.freeze(["llvm","graal","wasm","javascript","dex","c","bytecode"]);
const isPlain=o=>{
  try {
    if(o===null||typeof o!=="object"||Array.isArray(o)||nodeTypes.isProxy(o))return false;
    const p=Object.getPrototypeOf(o);
    if(p!==null&&p!==Object.prototype)return false;
    for(const k of Reflect.ownKeys(o)){
      if(typeof k!=="string")return false;
      const d=Object.getOwnPropertyDescriptor(o,k);
      if(!d||!Object.hasOwn(d,"value"))return false;
    }
    return true;
  } catch {return false}
};
const uniqueStrings=(a,max=4096)=>{
  try {
    if(!Array.isArray(a)||nodeTypes.isProxy(a)||Object.getPrototypeOf(a)!==Array.prototype||a.length>max)return false;
    if(Reflect.ownKeys(a).length!==a.length+1)return false;
    const s=new Set();
    for(let i=0;i<a.length;i++){
      const d=Object.getOwnPropertyDescriptor(a,String(i));
      if(!d||!Object.hasOwn(d,"value")||typeof d.value!=="string"||!d.value||s.has(d.value))return false;
      s.add(d.value);
    }
    return true;
  }catch{return false}
};
const subset=(a,b)=>a.every(x=>b.includes(x));
const identity=s=>typeof s==="string"&&s.length>=1&&s.length<=512&&!s.includes("\u0000");
const fields=(o,required,optional=[])=>{
  const good=[...required,...optional];
  return required.every(k=>Object.hasOwn(o,k))&&Object.keys(o).every(k=>good.includes(k));
};

export function validateFreestandingClosure(graph) {
  const errors=[];
  if(!isPlain(graph)||!fields(graph,
      ["schemaVersion","entry","target","backend","grants","nodes"]))
    return {ok:false,errors:["expected plain exact freestanding closure record"]};
  if(graph.schemaVersion!==1)errors.push("unsupported schemaVersion");
  if(!identity(graph.entry))errors.push("invalid entry");
  if(typeof graph.target!=="string"||!Object.hasOwn(FREESTANDING_TIERS,graph.target))
    errors.push("unknown freestanding target");
  if(typeof graph.backend!=="string"||!BACKENDS.includes(graph.backend))
    errors.push("unknown backend");
  if(!uniqueStrings(graph.grants)||!subset(graph.grants,PROVIDERS))
    errors.push("invalid grants");
  if(!Array.isArray(graph.nodes)||nodeTypes.isProxy(graph.nodes)||
     Object.getPrototypeOf(graph.nodes)!==Array.prototype||
     graph.nodes.length===0||graph.nodes.length>4096||
     Reflect.ownKeys(graph.nodes).length!==graph.nodes.length+1)
    errors.push("invalid node collection");
  if(errors.length)return {ok:false,errors};
  const tier=FREESTANDING_TIERS[graph.target];
  if(!subset(graph.grants,tier.providers))
    errors.push("provider unavailable in "+graph.target);
  const nodes=new Map();
  for(let i=0;i<graph.nodes.length;i++){
    const d=Object.getOwnPropertyDescriptor(graph.nodes,String(i));
    if(!d||!Object.hasOwn(d,"value")||!isPlain(d.value)||
       !fields(d.value,["id","layer","requires","imports"])){
      errors.push("nodes["+i+"]: invalid source unit");
      continue;
    }
    const n=d.value;
    if(!identity(n.id)||nodes.has(n.id))errors.push("invalid or duplicate node identity");
    if(typeof n.layer!=="string"||!Object.hasOwn(IMPORTS,n.layer))
      errors.push("unknown source layer: "+n.id);
    if(!uniqueStrings(n.requires,64)||!subset(n.requires,PROVIDERS))
      errors.push("unknown or duplicate inferred effects: "+n.id);
    if(!uniqueStrings(n.imports,256)||!n.imports.every(identity))
      errors.push("bad resolved imports: "+n.id);
    if(errors.length)continue;
    nodes.set(n.id,n);
    if(!tier.layers.includes(n.layer))errors.push(n.id+": forbidden layer "+n.layer);
    if(n.layer==="core"&&n.requires.length!==0)
      errors.push(n.id+": freestanding core must be effect-free");
    if(!subset(n.requires,graph.grants))
      errors.push(n.id+": missing explicit provider grant");
  }
  if(errors.length)return {ok:false,errors};
  if(!nodes.has(graph.entry))errors.push("entry not in resolved closure");
  let edges=0;
  const seen=new Set(),stack=[graph.entry];
  while(stack.length){
    const id=stack.pop();
    if(seen.has(id))continue;
    seen.add(id);
    const n=nodes.get(id);
    if(!n)continue;
    for(const targetId of n.imports){
      if(++edges>65536)return {ok:false,errors:["import edge limit exceeded"]};
      const imported=nodes.get(targetId);
      if(!imported){errors.push(id+": unresolved import "+targetId);continue}
      if(!IMPORTS[n.layer].includes(imported.layer))
        errors.push(id+": illegal "+n.layer+" -> "+imported.layer+" layer dependency");
      if(!subset(imported.requires,n.requires))
        errors.push(id+": imported effect requirements not declared by importer");
      if(!seen.has(targetId))stack.push(targetId);
    }
  }
  if(seen.size!==nodes.size)errors.push("unreachable source units in supplied closure");
  const used=new Set();
  for(const n of nodes.values())for(const p of n.requires)used.add(p);
  for(const g of graph.grants)if(!used.has(g))errors.push("unused provider grant "+g);
  return {ok:errors.length===0,errors,visited:seen.size};
}
