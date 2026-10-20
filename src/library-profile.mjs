// A metadata admission gate, not a source parser, linker or proof of bare-metal codegen.
// The compiler must assign library layers from resolved, pinned source provenance.
export const LIBRARY_PROFILES=Object.freeze([
  "freestanding-core","freestanding-alloc","freestanding-actor",
  "freestanding-otp","hosted"
]);
export const LIBRARY_LAYERS=Object.freeze(["app","core","alloc","actor","otp","std"]);
export const LIBRARY_PROVIDERS=Object.freeze([
  "allocator.explicit","executor.explicit","mailbox.bounded",
  "control.trusted","clock.monotonic"
]);

const allowed={
  "freestanding-core":new Set(["app","core"]),
  "freestanding-alloc":new Set(["app","core","alloc"]),
  "freestanding-actor":new Set(["app","core","alloc","actor"]),
  "freestanding-otp":new Set(["app","core","alloc","actor","otp"]),
  hosted:new Set(LIBRARY_LAYERS)
};
const imports={
  app:new Set(LIBRARY_LAYERS),
  core:new Set(["core"]),
  alloc:new Set(["core","alloc"]),
  actor:new Set(["core","alloc","actor"]),
  otp:new Set(["core","alloc","actor","otp"]),
  // Built-in stdlib must not depend on application modules (confused deputy).
  std:new Set(["core","alloc","actor","otp","std"])
};
// These are minimum required providers when the corresponding resolved layer
// occurs. Supplying a provider does not itself establish a backend capability.
const actorProviders=["executor.explicit","mailbox.bounded","control.trusted"];

/**
 * Validate explicit library partition metadata for an already-verified graph.
 * Caller must first enforce plain own records/dense arrays, unique IDs,
 * resolved imports, target compatibility, effect/grant closure and bounded size.
 * Return 'contract-pass' only; this never certifies guest compilation/execution.
 */
export function validateLibraryClosure({nodes,libraryProfile,providers}){
  const errors=[];
  if(!LIBRARY_PROFILES.includes(libraryProfile))
    return {ok:false,errors:["unknown libraryProfile"]};
  const allowedLayers=allowed[libraryProfile];
  const byId=new Map();
  for(const node of nodes)byId.set(node.id,node);
  const present=new Set();
  const reverseImports=new Map();
  for(const node of nodes){
    const layer=node.layer;
    if(!LIBRARY_LAYERS.includes(layer)){
      errors.push(node.id+": missing or invalid library layer");
      continue;
    }
    present.add(layer);
    if(!allowedLayers.has(layer))
      errors.push(node.id+": library layer "+layer+" is forbidden in "+libraryProfile);
    if(layer==="core" && node.requires.length)
      errors.push(node.id+": core cannot require any host capability");
    if(layer==="core" && node.providerRequires.length)
      errors.push(node.id+": core cannot require any runtime provider");
    const implicit=layer==="actor"?actorProviders:
                   layer==="alloc"?["allocator.explicit"]:[];
    for(const provider of implicit)
      if(!node.providerRequires.includes(provider))
        errors.push(node.id+": "+layer+" requires declaration of "+provider);
    if(libraryProfile!=="hosted" && node.requires.length)
      errors.push(node.id+": freestanding nodes cannot require ambient host capabilities");
    for(const importedId of node.imports){
      // Track reverse edges so OTP admission proves a real dependency path
      // to actor, not merely the presence of an unrelated actor in the graph.
      if(!reverseImports.has(importedId))reverseImports.set(importedId,[]);
      reverseImports.get(importedId).push(node.id);
      const dependency=byId.get(importedId);
      if(dependency && LIBRARY_LAYERS.includes(dependency.layer) &&
         !imports[layer].has(dependency.layer))
        errors.push(node.id+" -> "+importedId+": forbidden library dependency "+
                    layer+" -> "+dependency.layer);
      // Every consumer must explicitly reflect the transitive provider needs
      // of its imports; no hidden implicit allocator/executor acquisition.
      if(dependency){
        for(const provider of dependency.providerRequires)
          if(!node.providerRequires.includes(provider))
            errors.push(node.id+" -> "+importedId+": undeclared imported provider "+provider);
      }
    }
  }
  // Fixed-point reverse traversal: all units that genuinely depend on at
  // least one actor library unit. Iterative and O(nodes + import edges).
  const actorReachable=new Set();
  const queue=[];
  for(const node of nodes){
    if(node.layer==="actor"){
      actorReachable.add(node.id);
      queue.push(node.id);
    }
  }
  for(let i=0;i<queue.length;i++){
    for(const parent of reverseImports.get(queue[i])??[]){
      if(!actorReachable.has(parent)){
        actorReachable.add(parent);
        queue.push(parent);
      }
    }
  }
  for(const node of nodes){
    if(node.layer==="otp" && !actorReachable.has(node.id))
      errors.push(node.id+": otp requires transitive actor dependency");
  }
  if(present.has("alloc") && !providers.includes("allocator.explicit"))
    errors.push("alloc requires allocator.explicit provider");
  if(present.has("actor") || present.has("otp")){
    for(const required of actorProviders)
      if(!providers.includes(required))
        errors.push("actor/otp requires "+required+" provider");
  }
  // A provider is authorized only if its demand is recorded in at least one
  // resolved unit. A caller-authored label is NOT evidence of real demand:
  // compiler trusted-effect inference remains a separate prerequisite.
  const usedProviders=new Set();
  for(const node of nodes){
    for(const provider of node.providerRequires){
      usedProviders.add(provider);
      if(!providers.includes(provider))
        errors.push(node.id+": missing explicit provider grant "+provider);
    }
  }
  // Extra runtime authority is not harmless. An unused provider can mask an
  // accidentally missing dependency or widen an embedder's grants.
  const permittedProviders=new Set();
  if(present.has("alloc")||present.has("actor")||present.has("otp"))
    permittedProviders.add("allocator.explicit");
  // Hosted standard-library adapters may explicitly use allocator/clock
  // providers without importing the freestanding alloc or actor libraries.
  // This does not authorize CONTROL, executor or mailbox privileges.
  if(libraryProfile==="hosted"&&present.has("std")){
    permittedProviders.add("allocator.explicit");
    permittedProviders.add("clock.monotonic");
  }
  if(present.has("actor")||present.has("otp")){
    for(const provider of actorProviders)permittedProviders.add(provider);
    permittedProviders.add("clock.monotonic");
  }
  for(const provider of providers){
    if(!permittedProviders.has(provider)||!usedProviders.has(provider))
      errors.push("unused or unauthorized library provider: "+provider);
  }
  if(libraryProfile==="freestanding-core" && providers.length)
    errors.push("freestanding-core forbids runtime providers");
  return {ok:errors.length===0,errors};
}
