// Metadata admission only: the compiler must assign these layers from pinned
// source provenance. Oreslang intentionally has exactly two library layers:
// ores.core (freestanding/no-OS) and ores.std (hosted/platform).
export const LIBRARY_PROFILES=Object.freeze(["core","std"]);
export const LIBRARY_LAYERS=Object.freeze(["app","core","std"]);

// Providers are orthogonal implementation dependencies, not library layers.
export const LIBRARY_PROVIDERS=Object.freeze([
  "allocator.explicit","executor.explicit","mailbox.bounded",
  "control.trusted","clock.monotonic"
]);

const allowed={
  core:new Set(["app","core"]),
  std:new Set(["app","core","std"])
};

const imports={
  app:new Set(LIBRARY_LAYERS),
  core:new Set(["core"]),
  std:new Set(["core","std"])
};

/**
 * Validate compiler-resolved ores.core / ores.std metadata.
 *
 * core means no ambient OS/host capability. Explicit providers are allowed
 * only when compiler-inferred, propagated through imports, and granted by the
 * build. std may use host capabilities admitted by the target profile, while
 * ores.core remains host-effect-free even inside a std build.
 */
export function validateLibraryClosure({nodes,libraryProfile,providers}){
  const errors=[];
  if(!LIBRARY_PROFILES.includes(libraryProfile))
    return {ok:false,errors:["unknown libraryProfile"]};

  const allowedLayers=allowed[libraryProfile];
  const byId=new Map();
  for(const node of nodes)byId.set(node.id,node);

  for(const node of nodes){
    const layer=node.layer;
    if(!LIBRARY_LAYERS.includes(layer)){
      errors.push(node.id+": missing or invalid library layer");
      continue;
    }
    if(!allowedLayers.has(layer))
      errors.push(node.id+": library layer "+layer+" is forbidden in "+libraryProfile);

    if(layer==="core" && node.requires.length)
      errors.push(node.id+": ores.core cannot require ambient host capabilities");
    if(libraryProfile==="core" && node.requires.length)
      errors.push(node.id+": core profile cannot require ambient host capabilities");

    for(const importedId of node.imports){
      const dependency=byId.get(importedId);
      if(dependency && LIBRARY_LAYERS.includes(dependency.layer) &&
         !imports[layer].has(dependency.layer))
        errors.push(node.id+" -> "+importedId+": forbidden library dependency "+
                    layer+" -> "+dependency.layer);
      if(dependency){
        for(const provider of dependency.providerRequires)
          if(!node.providerRequires.includes(provider))
            errors.push(node.id+" -> "+importedId+
                        ": undeclared imported provider "+provider);
      }
    }
  }

  const usedProviders=new Set();
  for(const node of nodes){
    for(const provider of node.providerRequires){
      usedProviders.add(provider);
      if(!providers.includes(provider))
        errors.push(node.id+": missing explicit provider grant "+provider);
    }
  }
  for(const provider of providers)
    if(!usedProviders.has(provider))
      errors.push("unused or unauthorized library provider: "+provider);

  return {ok:errors.length===0,errors};
}
