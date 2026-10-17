#!/usr/bin/env node
// Compiler-attested resolved graph only; this CLI cannot parse .ores sources.
import {readFile} from "node:fs/promises";
import {validateFreestandingClosure} from "../src/freestanding.mjs";
try {
 if(process.argv.length!==3)throw Error("usage: oreslang-freestanding <resolved-closure.json>");
 const graph=JSON.parse(await readFile(process.argv[2],"utf8"));
 const result=validateFreestandingClosure(graph);
 if(!result.ok){console.error(result.errors.join("\n"));process.exitCode=1}
 else console.log("OK: "+result.visited+" source units admitted (metadata only)");
}catch(e){console.error(e.message);process.exitCode=2}
