// Exercise the actual HTTP handler and D1 limiter; replace only Workers context
// and the auth provider. The isolated Worker test covers real Better Auth wiring.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {fixture} from './helpers/d1.mjs';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'rb-reset-route-'));
let ALL,state;
try{
 for(const [name,file] of [
  ...['env','crypto','rate-limit','owner-password-reset'].map(n=>[n,`src/server/${n}.ts`]),
  ['route','src/pages/api/owner-auth/[...path].ts'],
 ]){
  const source=readFileSync(file,'utf8').replace(/from '(\.[^']+)'/g,(_,path)=>`from './${path.split('/').at(-1).replace(/\.ts$/,'')}.mjs'`);
  writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 }
 writeFileSync(join(dir,'state.mjs'),'export const state = {};');
 writeFileSync(join(dir,'runtime.mjs'),"import {state} from './state.mjs'; export const runtime=()=>state.env; export const waitUntil=p=>state.pending.push(p);");
 writeFileSync(join(dir,'owner-auth.mjs'),`import {state} from './state.mjs';
  export function ownerAuth(env,purpose){return {
   api:{requestPasswordReset:async(input)=>{state.calls.push({input,purpose});await state.send();}},
   handler:async()=>{state.handlerCalls++;return Response.json({message:'Invalid credentials'},{status:401});}
  }};`);
 ({state}=await import(pathToFileURL(join(dir,'state.mjs'))));
 ({ALL}=await import(pathToFileURL(join(dir,'route.mjs'))));
}finally{rmSync(dir,{recursive:true,force:true});}
function setup(){
 const f=fixture();
 Object.assign(f.env,{APP_ORIGIN:'https://fixture.example.com',AUTH_ENABLED:'true',AUTH_SECRET:'a'.repeat(40),OTP_SECRET:'b'.repeat(40)});
 f.db.exec("INSERT INTO owner_accounts VALUES ('active','active@example.com',NULL,'active',0),('invited','invited@example.com',NULL,'invited',0),('removed','removed@example.com',NULL,'removed',0)");
 Object.assign(state,{env:f.env,pending:[],calls:[],handlerCalls:0,send:async()=>{}});
 return f;
}
function request(email='active@example.com',options={}){
 const {path='request-password-reset',method='POST',origin=state.env.APP_ORIGIN,contentType='application/json',raw,...body}=options;
 return ALL({params:{path},request:new Request(state.env.APP_ORIGIN+'/api/owner-auth/'+path,{
  method,headers:{origin,'content-type':contentType,'cf-connecting-ip':'192.0.2.1'},
  ...(method==='POST'?{body:raw??JSON.stringify({email,...body})}:{}),
 })});
}
const drain=()=>Promise.all(state.pending);
test('known, invited, removed and unknown reset requests have identical public responses',async()=>{
 const {db}=setup();try{
  const results=[];
  for(const email of ['active@example.com','invited@example.com','removed@example.com','unknown@example.com']){
   const r=await request(email,{redirectTo:'https://attacker.invalid/reset',purpose:'owner'});
   results.push({status:r.status,headers:[...r.headers],body:await r.json()});
  }
  assert.equal(results[0].status,200);
  for(const result of results)assert.deepEqual(result,results[0]);
  assert.equal(results[0].body.status,true);
  assert.ok(results[0].headers.some(([k,v])=>k==='cache-control'&&v==='no-store'));
  await drain();
  assert.deepEqual(state.calls.map(c=>c.input.body.email).sort(),['active@example.com','invited@example.com']);
  for(const c of state.calls){assert.equal(c.input.body.redirectTo,state.env.APP_ORIGIN+'/owner/reset');assert.equal(c.purpose,undefined);}
  assert.equal(state.handlerCalls,0);
 }finally{await drain();db.close();}
});
test('response does not wait for account lookup or mail; failures are observed without private logs',{timeout:5000},async()=>{
 const {db,env}=setup(),warnings=[],originalWarn=console.warn;
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const prepare=env.DB.prepare;
 env.DB.prepare=(sql)=>sql.startsWith('SELECT id FROM owner_accounts')?{bind(){return {async first(){await gate;return {id:'active'};}}}}:prepare(sql);
 state.send=async()=>{throw Error('secret token and active@example.com');};
 console.warn=(...args)=>warnings.push(args.join(' '));
 try{
  const response=await request();
  assert.equal(response.status,200);
  assert.equal(state.pending.length,1,'Workers lifetime must cover the background work');
  assert.equal(state.calls.length,0,'Response completed while account lookup was blocked');
  release();await drain();
  assert.equal(state.calls.length,1);
  assert.deepEqual(warnings,['Owner password reset could not be completed.']);
 }finally{release();await drain();console.warn=originalWarn;db.close();}
});
test('concurrent and normalized repeat requests send once until the cooldown expires',async()=>{
 const {db}=setup();try{
  const responses=await Promise.all([request(),request(' ACTIVE@EXAMPLE.COM '),request()]);
  assert.ok(responses.every(r=>r.status===200));await drain();assert.equal(state.calls.length,1);
  db.exec('UPDATE request_limits SET expires_at=0');
  assert.equal((await request()).status,200);await drain();assert.equal(state.calls.length,2);
 }finally{await drain();db.close();}
});
test('origin, method, type and bounded input validation happen before background work',{timeout:5000},async()=>{
 const {db}=setup();try{
  for(const [options,status] of [
   [{origin:'https://attacker.invalid'},403],[{origin:''},403],
   [{method:'GET'},404],[{contentType:'text/plain'},400],
   [{raw:'{'},400],[{raw:'[]'},400],[{raw:'x'.repeat(4097)},400],
   [{path:'sign-up/email'},404],
  ])assert.equal((await request('active@example.com',options)).status,status);
  assert.equal((await request('invalid-email')).status,400);
  assert.equal(state.pending.length,0);assert.equal(state.calls.length,0);
 }finally{await drain();db.close();}
});
test('public IP throttling is account-independent and does not schedule rejected work',async()=>{
 const {db}=setup();try{
  for(let i=0;i<15;i++)assert.equal((await request(`unknown${i}@example.com`)).status,200);
  const r=await request();assert.equal(r.status,429);assert.ok(Number(r.headers.get('retry-after'))>0);
  assert.equal(state.pending.length,15);await drain();assert.equal(state.calls.length,0);
 }finally{await drain();db.close();}
});
test('other supported auth actions still use Better Auth and return uncached responses',async()=>{
 const {db}=setup();try{
  const r=await request('active@example.com',{path:'sign-in/email',password:'fictional'});
  assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(state.handlerCalls,1);assert.equal(state.pending.length,0);
 }finally{db.close();}
});
