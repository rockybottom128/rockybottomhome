// Actual handler, account operations, limiter and SQLite triggers. Only Workers
// context, password hashing and the auth/mail provider are fixture substitutes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {fixture} from './helpers/d1.mjs';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'rb-owner-management-'));
let POST,state,RateLimitError;
try{
 for(const [name,file] of [
  ...['env','crypto','rate-limit','owners','settings'].map(n=>[n,`src/server/${n}.ts`]),
  ['route','src/pages/api/owner/[action].ts'],
 ]){
  const source=readFileSync(file,'utf8').replace("from 'better-auth/crypto'","from './password.mjs'").replace(/from '(\.[^']+)'/g,(_,path)=>`from './${path.split('/').at(-1).replace(/\.(ts|mjs)$/,'')}.mjs'`);
  writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
 }
 writeFileSync(join(dir,'password.mjs'),"export const hashPassword=async()=> 'fixture-password-hash';");
 writeFileSync(join(dir,'state.mjs'),'export const state={};');
 writeFileSync(join(dir,'runtime.mjs'),"import {state} from './state.mjs'; export const runtime=()=>state.env;");
 writeFileSync(join(dir,'owner-auth.mjs'),`import {state} from './state.mjs';
  export const getOwner=async(env,request)=>env.DB.prepare("SELECT id FROM owner_accounts WHERE id=? AND status='active'").bind(request.headers.get('cookie')??'').first();
  export const sendOwnerInvitation=async(env,email)=>{state.sends.push(email);await state.send();};`);
 ({state}=await import(pathToFileURL(join(dir,'state.mjs'))));
 ({POST}=await import(pathToFileURL(join(dir,'route.mjs'))));
 ({RateLimitError}=await import(pathToFileURL(join(dir,'rate-limit.mjs'))));
}finally{rmSync(dir,{recursive:true,force:true});}
function setup(){
 const f=fixture();Object.assign(f.env,{APP_ORIGIN:'https://fixture.example.com',AUTH_ENABLED:'true',AUTH_SECRET:'a'.repeat(40),OTP_SECRET:'b'.repeat(40)});
 for(const [id,status] of [['a','active'],['b','active'],['pending','invited'],['removed','removed']]){
  f.db.prepare('INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,1,0,0)').run(id,id,id+'@example.com');
  f.db.prepare('INSERT INTO owner_accounts VALUES (?,?,?,?,0)').run(id,id+'@example.com',id,status);
 }
 f.db.exec("INSERT INTO auth_session(id,expires_at,token,created_at,updated_at,user_id) VALUES ('session-b',9999999999999,'fixture-session',0,0,'b')");
 Object.assign(state,{env:f.env,sends:[],send:async()=>{}});return f;
}
function request(action,input={},options={}){
 const {cookie='a',origin=state.env.APP_ORIGIN,raw}=options;
 return POST({params:{action},request:new Request(state.env.APP_ORIGIN+'/api/owner/'+action,{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:raw??JSON.stringify(input)})});
}
test('missing and removed owners return 404; real removals revoke sessions and audit once',async()=>{
 const {db}=setup();try{
  assert.equal((await request('remove',{id:'missing'})).status,404);
  assert.equal((await request('remove',{id:'removed'})).status,404);
  assert.equal((await request('remove',{id:'b'})).status,200);
  assert.equal(db.prepare("SELECT status FROM owner_accounts WHERE id='b'").get().status,'removed');
  assert.equal(db.prepare("SELECT count(*) n FROM auth_session WHERE user_id='b'").get().n,0);
  assert.equal((await request('remove',{id:'b'})).status,404);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='owner_removed'").get().n,1);
  const last=await request('remove',{id:'a'});assert.equal(last.status,409);assert.match((await last.json()).error,/last active owner/);
  assert.equal(db.prepare("SELECT status FROM owner_accounts WHERE id='a'").get().status,'active');
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='owner_removed'").get().n,1,'Trigger rolls back the audit insert too');
 }finally{db.close();}
});
test('duplicate owners conflict while invalid input and unauthorized requests keep their own statuses',async()=>{
 const {db}=setup();try{
  for(const email of ['a@example.com','pending@example.com'])assert.equal((await request('invite',{email})).status,409);
  assert.equal((await request('invite',{email:'not-an-email'})).status,400);
  assert.equal((await request('remove',{id:42})).status,400);
  assert.equal((await request('remove',{id:'bad\nidentifier'})).status,400);
  assert.equal((await request('remove',{id:'b'},{cookie:''})).status,401);
  assert.equal((await request('invite',{email:'new@example.com'},{origin:'https://attacker.invalid'})).status,400);
  assert.equal((await request('invite',{}, {raw:'{'})).status,400);
  assert.equal((await request('unknown')).status,404);
  assert.equal(state.sends.length,0);
  assert.equal(db.prepare('SELECT count(*) n FROM owner_accounts').get().n,4);
 }finally{db.close();}
});
test('owner-management rate limits return 429 before saving an invitation',async()=>{
 const {db}=setup();try{
  for(let i=0;i<10;i++)assert.equal((await request('remove',{id:'missing'})).status,404);
  const limited=await request('invite',{email:'new@example.com'});
  assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
  assert.equal((await limited.json()).invitationSaved,undefined);
  assert.equal(db.prepare("SELECT count(*) n FROM owner_accounts WHERE email_normalized='new@example.com'").get().n,0);
 }finally{db.close();}
});
test('delivery failures distinguish a saved invitation from a failed account operation',async()=>{
 for(const limited of [false,true]){
  const {db}=setup();try{
   state.send=async()=>{throw limited?new RateLimitError(90):Error('private provider failure');};
   const r=await request('invite',{email:'new@example.com'}),data=await r.json();
   assert.equal(r.status,limited?429:503);assert.equal(data.invitationSaved,true);
   assert.match(data.error,/invitation was saved/);assert.match(data.error,/Set or reset my password/);assert.doesNotMatch(data.error,/private provider/);
   if(limited)assert.equal(r.headers.get('retry-after'),'90');
   assert.equal(db.prepare("SELECT status FROM owner_accounts WHERE email_normalized='new@example.com'").get().status,'invited');
   assert.equal((await request('invite',{email:'new@example.com'})).status,409);
  }finally{db.close();}
 }
});
test('unexpected database errors are 503, but wrapped last-owner trigger errors remain 409',async()=>{
 const {db,env}=setup();try{
  env.DB.batch=async()=>{throw Error('private database failure');};
  const failure=await request('remove',{id:'b'});assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/private database/);
  env.DB.batch=async()=>{throw new Error('D1_ERROR',{cause:Error('Cannot remove the last active owner: SQLITE_CONSTRAINT')});};
  assert.equal((await request('remove',{id:'a'})).status,409);
 }finally{db.close();}
});
