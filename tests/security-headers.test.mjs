import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {secureResponse,securityHeaders,hsts} from '../src/server/security-headers.ts';

test('headers cover immutable redirects and preserve multiple cookies, status and body',async()=>{
 const redirect=secureResponse(Response.redirect('https://example.com/owner/',303),new URL('https://example.com/owner/dashboard'));
 assert.equal(redirect.status,303);assert.equal(redirect.headers.get('location'),'https://example.com/owner/');
 assert.equal(redirect.headers.get('strict-transport-security'),hsts);
 const headers=new Headers({'cache-control':'no-store','content-type':'application/json'});
 headers.append('set-cookie','one=1; HttpOnly');headers.append('set-cookie','two=2; HttpOnly');
 const r=secureResponse(new Response('{"error":"denied"}',{status:401,headers}),new URL('http://localhost/'));
 assert.equal(r.status,401);assert.equal(r.headers.get('strict-transport-security'),null);
 assert.deepEqual(r.headers.getSetCookie(),headers.getSetCookie());
 assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{error:'denied'});
 for(const [name,value] of Object.entries(securityHeaders))assert.equal(r.headers.get(name),value);
});
test('static rules mirror runtime protections and scope HSTS to deployed hosts',()=>{
 const text=readFileSync('public/_headers','utf8');
 const global=text.split('# Absolute rules')[0];
 for(const [key,value] of Object.entries(securityHeaders))assert.ok(global.includes(`  ${key}: ${value}\n`),key);
 assert.ok(!global.includes('Strict-Transport-Security'));
 for(const host of ['rockybottomhome.com',':worker.accts-e61.workers.dev'])assert.ok(text.includes(`https://${host}/*\n  Strict-Transport-Security: ${hsts}`));
 assert.ok(text.includes('/version.json\n  Cache-Control: no-store'));
});

// Exercise the real middleware while substituting only Astro/Workers and auth.
const dir=mkdtempSync(join(tmpdir(),'rb-middleware-'));
let onRequest,state;
try{
 for(const [name,file] of [['middleware','src/middleware.ts'],['env','src/server/env.ts'],['security-headers','src/server/security-headers.ts']]){
  const source=readFileSync(file,'utf8').replace("from 'astro:middleware'","from './astro.mjs'").replace(/from '(\.[^']+)'/g,(_,p)=>`from './${p.split('/').at(-1).replace(/\.(ts|mjs)$/,'')}.mjs'`);
  writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 }
 writeFileSync(join(dir,'astro.mjs'),'export const defineMiddleware=fn=>fn;');
 writeFileSync(join(dir,'state.mjs'),'export const state={};');
 writeFileSync(join(dir,'runtime.mjs'),"import {state} from './state.mjs';export const runtime=()=>state.env;export const waitUntil=p=>state.pending.push(p);");
 writeFileSync(join(dir,'owner-auth.mjs'),"import {state} from './state.mjs';export const getOwner=async()=>state.owner;");
 writeFileSync(join(dir,'expired-records.mjs'),"import {state} from './state.mjs';export const maybeCleanupExpiredRecords=()=>state.cleanup;");
 ({state}=await import(pathToFileURL(join(dir,'state.mjs'))));
 ({onRequest}=await import(pathToFileURL(join(dir,'middleware.mjs'))));
}finally{rmSync(dir,{recursive:true,force:true});}
test('middleware protects owner paths and adds headers to pages, API failures and redirects',async()=>{
 for(const owner of [null,{id:'owner'}])for(const path of ['/owner/dashboard','/owner/dashboard/','/owner/availability/','/owner/demo/','/owner/reset','/owner/','/viewings/','/api/x','/']){
  Object.assign(state,{env:{DB:{},APP_ORIGIN:'https://example.com',AUTH_ENABLED:'true',AUTH_SECRET:'a'.repeat(40),OTP_SECRET:'b'.repeat(40)},owner,pending:[],cleanup:Promise.resolve()});
  const url=new URL(path,'https://example.com');let called=false;
  const r=await onRequest({url,request:new Request(url),redirect:(to,status)=>Response.redirect(new URL(to,url),status)},async()=>{called=true;return new Response('body',{status:path==='/api/x'?503:200});});
  const protectedPage=/^\/owner\/(dashboard|availability|demo)/.test(path);
  assert.equal(r.status,!owner&&protectedPage?303:path==='/api/x'?503:200,path);
  assert.equal(called,!!owner||!protectedPage,path);
  for(const [name,value] of Object.entries(securityHeaders))assert.equal(r.headers.get(name),value,path);
  assert.equal(r.headers.get('strict-transport-security'),hsts);
  if(path!=='/')assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(state.pending.length,path==='/'?0:1);
 }
});
test('cleanup does not delay responses; unconfigured services do not schedule database work',async()=>{
 const url=new URL('http://localhost/owner/dashboard');
 Object.assign(state,{env:{DB:{},APP_ORIGIN:url.origin,AUTH_ENABLED:'true',AUTH_SECRET:'a'.repeat(40),OTP_SECRET:'b'.repeat(40)},owner:null,pending:[],cleanup:new Promise(()=>{})});
 const context={url,request:new Request(url),redirect:(to,status)=>Response.redirect(new URL(to,url),status)};
 const r=await onRequest(context,async()=>new Response());assert.equal(r.status,303);assert.equal(state.pending.length,1);
 state.env={};state.pending=[];
 const disabled=await onRequest(context,async()=>new Response());assert.equal(disabled.status,303);assert.equal(state.pending.length,0);
});
