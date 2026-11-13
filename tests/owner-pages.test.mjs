import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {configured} from '../src/server/env.ts';

// Execute each page's real frontmatter without middleware. Substitute only the
// Workers environment, session lookup and Astro redirect; use real configuration
// validation. Integration tests separately exercise real sessions and rendering.
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const pages=['availability','demo'].map(name=>{
 const source=readFileSync(`src/pages/owner/${name}.astro`,'utf8').split('---')[1];
 const parsed=ts.createSourceFile(name+'.ts',source,ts.ScriptTarget.Latest,true);
 const statements=parsed.statements.filter(s=>!ts.isImportDeclaration(s));
 const body=statements.map(s=>s.getText(parsed)).join('\n').replace(/export\s+const\s+prerender/,'const prerender');
 const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return {name,run:new AsyncFunction('Astro','runtime','configured','getOwner',js)};
});
const origin='https://fixture.example.com';
const settings=()=>({DB:{},APP_ORIGIN:origin,AUTH_ENABLED:'true',AUTH_SECRET:'a'.repeat(40),OTP_SECRET:'b'.repeat(40)});
function context(name){return {request:new Request(`${origin}/owner/${name}/`),redirect:(path,status)=>Response.redirect(new URL(path,origin),status)};}
function denied(response){assert.equal(response.status,303);assert.equal(response.headers.get('location'),origin+'/owner/');}
test('owner pages redirect without a session even when middleware is absent',async()=>{
 for(const {name,run} of pages){
  const env=settings(),astro=context(name);let calls=0;
  denied(await run(astro,()=>env,configured,async(e,request)=>{assert.equal(e,env);assert.equal(request,astro.request);calls++;return null;}));
  assert.equal(calls,1,name);
 }
});
test('owner pages reject unconfigured services before attempting session lookup',async()=>{
 for(const {name,run} of pages)for(const patch of [{DB:undefined},{AUTH_ENABLED:'false'},{AUTH_SECRET:'short'},{OTP_SECRET:'replace-'+'x'.repeat(40)},{APP_ORIGIN:'https://other.example.com'}]){
  denied(await run(context(name),()=>({...settings(),...patch}),configured,async()=>assert.fail('Unconfigured page attempted authentication')));
 }
});
test('owner pages allow active owners to reach rendering',async()=>{
 for(const {name,run} of pages){
  let calls=0;const astro=context(name);astro.redirect=()=>assert.fail('Signed-in owner was redirected');
  assert.equal(await run(astro,settings,configured,async()=>{calls++;return {id:'owner',email_normalized:'owner@example.com'};}),undefined);
  assert.equal(calls,1,name);
 }
});
test('owner pages do not render when authentication lookup fails',async()=>{
 for(const {name,run} of pages)await assert.rejects(run(context(name),settings,configured,async()=>{throw Error('fixture authentication unavailable');}),/fixture authentication unavailable/);
});
