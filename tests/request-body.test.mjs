import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readJson,body} from '../src/server/env.ts';
const origin='https://fixture.example.com';
const request=(text,headers={})=>new Request(origin,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:text});
test('malformed or non-object JSON has one safe validation error',async()=>{
 for(const text of ['','{','{"private":"secret",}','[]','null','42','"text"']){
  await assert.rejects(readJson(request(text)),error=>error.message==='Invalid request.'&&!(error instanceof SyntaxError));
 }
 assert.deepEqual(await readJson(request('{"label":"Repair door"}')),{label:'Repair door'});
});
test('size limits count UTF-8 bytes and oversized cloned bodies reject promptly',{timeout:5000},async()=>{
 const text=JSON.stringify({label:'好'}),size=new TextEncoder().encode(text).byteLength;
 assert.deepEqual(await readJson(request(text),size),{label:'好'});
 await assert.rejects(readJson(request(text).clone(),size-1),/Request too large/);
 await assert.rejects(readJson({body:null}),/Invalid request/);
});
test('chunked input remains bounded and failed origin or type validation cannot return a body',async()=>{
 const chunks=['{"label":','"two chunks"}'];
 const stream=new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(new TextEncoder().encode(chunk));c.close();}});
 assert.deepEqual(await readJson({body:stream}),{label:'two chunks'});
 for(const headers of [{origin:''},{origin:'https://attacker.invalid'},{'content-type':'text/plain'}])await assert.rejects(body(request('{}',headers),{APP_ORIGIN:origin}),/Invalid request/);
});
