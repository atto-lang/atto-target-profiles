import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLibraryClosure as validate} from '../src/library-profile.mjs';

const n=(id,layer,imports=[],requires=[],providerRequires=[])=>({id,layer,imports,requires,providerRequires});

test('core-only compilation admits only freestanding core and app dependencies',()=>{
 const nodes=[n('core.math','core'),n('app','app',['core.math'])];
 assert.deepEqual(validate({nodes,libraryProfile:'core',providers:[]}),{ok:true,errors:[]});
 assert.deepEqual(validate({nodes,libraryProfile:'std',providers:[]}),{ok:true,errors:[]});
});

test('ores.core cannot acquire std dependency or an ambient clock even inside std build',()=>{
 const nodes=[n('core.clock','core',['std.clock'],['clock'],[]),
   n('std.clock','std',[],['clock'],['clock.monotonic'])];
 const result=validate({nodes,libraryProfile:'std',providers:['clock.monotonic']});
 assert.equal(result.ok,false);
 assert.ok(result.errors.some(x=>x.includes('forbidden library dependency core -> std')));
 assert.ok(result.errors.some(x=>x.includes('ores.core cannot require ambient host capabilities')));
});

test('provider edges must propagate across each import before accepting an app',()=>{
 const std=n('std.clock','std',[],['clock'],['clock.monotonic']);
 const app=n('app','app',['std.clock'],['clock'],[]);
 const denied=validate({nodes:[std,app],libraryProfile:'std',providers:['clock.monotonic']});
 assert.ok(denied.errors.some(x=>x.includes('undeclared imported provider clock.monotonic')));
 app.providerRequires=['clock.monotonic'];
 assert.deepEqual(validate({nodes:[std,app],libraryProfile:'std',providers:['clock.monotonic']}),{ok:true,errors:[]});
});

test('cycles do not manufacture duplicate grants or mutate caller-owned metadata',()=>{
 const a=n('std.a','std',['std.b'],[],['clock.monotonic']);
 const b=n('std.b','std',['std.a'],[],['clock.monotonic']);
 const before=JSON.stringify([a,b]);
 assert.deepEqual(validate({nodes:[a,b],libraryProfile:'std',providers:['clock.monotonic']}),{ok:true,errors:[]});
 assert.equal(JSON.stringify([a,b]),before);
 assert.ok(validate({nodes:[a,b],libraryProfile:'std',providers:[]}).errors.some(x=>x.includes('missing explicit provider grant')));
});
