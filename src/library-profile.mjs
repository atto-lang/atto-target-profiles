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
  std:new Set(LIBRARY_LAYERS)
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
    if(libraryProfile!=="hosted" && node.requires.length)
      errors.push(node.id+": freestanding nodes cannot require ambient host capabilities");
    for(const importedId of node.imports){
      const dependency=byId.get(importedId);
      if(dependency && LIBRARY_LAYERS.includes(dependency.layer) &&
         !imports[layer].has(dependency.layer))
        errors.push(node.id+" -> "+importedId+": forbidden library dependency "+
                    layer+" -> "+dependency.layer);
    }
  }
  if(present.has("otp") && !present.has("actor"))
    errors.push("otp requires actor layer in resolved closure");
  if(present.has("alloc") && !providers.includes("allocator.explicit"))
    errors.push("alloc requires allocator.explicit provider");
  if(present.has("actor") || present.has("otp")){
    for(const required of actorProviders)
      if(!providers.includes(required))
        errors.push("actor/otp requires "+required+" provider");
  }
  if(libraryProfile==="freestanding-core" && providers.length)
    errors.push("freestanding-core forbids runtime providers");
  return {ok:errors.length===0,errors};
}
