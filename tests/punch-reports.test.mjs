import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/d1.mjs';
import {changePunchList,readPunchList} from '../src/server/punch-list.ts';
import {prepareReport,deliverReport,reportHistory} from '../src/server/punch-reports.ts';
function setup(){const f=fixture();f.db.exec("INSERT INTO owner_accounts(id,email_normalized,status,created_at) VALUES ('a','a@example.com','active',1),('b','b@example.com','active',1),('i','invite@example.com','invited',1),('r','removed@example.com','removed',1)");return f;}
const batch=labels=>({action:'bulk-create',id:crypto.randomUUID(),labels});
const report=()=>({id:crypto.randomUUID(),owners:['i'],custom:'external@example.com',sort:'name',direction:'asc',includeCompleted:false,timeZone:'America/New_York'});
test('bulk newline parsing, validation, atomic rollback and immutable retry',async()=>{const {db,env}=setup();try{
 const b={...batch(' A\r\n B\rC\n\nA '),allowDuplicates:true};await changePunchList(env,'a',b);await changePunchList(env,'a',b);assert.equal(db.prepare('SELECT count(*) n FROM punch_tasks').get().n,4);
 await assert.rejects(changePunchList(env,'a',{...b,labels:'Changed'}));
 await assert.rejects(changePunchList(env,'a',batch('Good\n'+'x'.repeat(121))));assert.equal(db.prepare('SELECT count(*) n FROM punch_tasks').get().n,4);
 db.exec("CREATE TRIGGER reject_bad BEFORE INSERT ON punch_tasks WHEN NEW.label='bad' BEGIN SELECT RAISE(ABORT,'bad'); END");
 await assert.rejects(changePunchList(env,'a',batch('Good\nbad')));assert.equal(db.prepare('SELECT count(*) n FROM punch_tasks').get().n,4);assert.equal(db.prepare('SELECT count(*) n FROM punch_batches').get().n,1);
 await assert.rejects(changePunchList(env,'r',batch('No')));await assert.rejects(changePunchList(env,'a',batch(Array(101).fill('x').join('\n'))));
 }finally{db.close();}});
test('reports include every sorted matching row, freeze snapshot, hide custom attribution and escape HTML',async()=>{const {db,env}=setup();try{
 await changePunchList(env,'a',batch(Array.from({length:60},(_,n)=>'Task '+String(n).padStart(2,'0')).join('\n')));
 const i={action:'create',id:crypto.randomUUID(),label:'<img src=x onerror=alert(1)>'};await changePunchList(env,'a',i);
 const input=report(),prepared=await prepareReport(env,'a',input);assert.match(prepared.preview,/61 items/);assert.ok(prepared.preview.indexOf('Task 00')<prepared.preview.indexOf('Task 59'));
 await changePunchList(env,'a',{action:'edit',id:i.id,revision:1,label:'CHANGED'});
 const sent=[];await deliverReport(env,'a',prepared.id,async(...args)=>{sent.push(args);return 'receipt';});assert.equal(sent.length,2);
 const custom=sent.find(x=>x[0]==='external@example.com'),owner=sent.find(x=>x[0]==='invite@example.com');assert.ok(!custom[1].includes('a@example.com'));assert.ok(owner[1].includes('a@example.com'));assert.match(custom[2],/&lt;img/);assert.ok(!custom[2].includes('<img'));assert.ok(!custom[1].includes('CHANGED'));
 await deliverReport(env,'a',prepared.id,async()=>{throw Error('must not send again');});assert.equal((await reportHistory(env,'b')).length,2);
 await assert.rejects(deliverReport(env,'b',prepared.id,async()=>''));await assert.rejects(prepareReport(env,'r',report()));await assert.rejects(prepareReport(env,'a',{...report(),owners:['r']}));
 }finally{db.close();}});
test('completed filter, recipient deduplication, uncertain sends and retry only confirmed failures',async()=>{const {db,env}=setup();try{
 const id=crypto.randomUUID();await changePunchList(env,'a',{action:'create',id,label:'Done'});await changePunchList(env,'a',{action:'complete',id,revision:1});
 await assert.rejects(prepareReport(env,'a',report()));
 const p=await prepareReport(env,'a',{...report(),includeCompleted:true,owners:['i'],custom:'INVITE@example.com external@example.com'});
 let calls=0;await deliverReport(env,'a',p.id,async(to)=>{calls++;if(to==='invite@example.com')throw {uncertain:true};throw Error('preflight');});assert.equal(calls,2);
 await deliverReport(env,'a',p.id,async()=>{calls++;return 'ok';});assert.equal(calls,3);
 const rows=await reportHistory(env,'a');assert.ok(rows.some(r=>r.status==='uncertain'));assert.ok(rows.some(r=>r.status==='sent'));
 assert.equal(db.prepare("SELECT include_attribution FROM punch_report_deliveries WHERE recipient='invite@example.com'").get().include_attribution,0);
 await assert.rejects(prepareReport(env,'a',{...report(),includeCompleted:true,custom:'a\nbad'}));
 }finally{db.close();}});
test('schema capability check identifies unavailable features without changing existing data',async()=>{
 const {punchCapabilities,requirePunchSetup,PunchSetupRequired}=await import('../src/server/punch-schema.ts');
 const {db,env}=setup();try{
 assert.deepEqual(await punchCapabilities(env),{bulkAvailable:true,reportsAvailable:true});
 db.exec('DROP TABLE punch_report_deliveries; DROP TABLE punch_reports; DROP TABLE punch_batches;');
 assert.deepEqual(await punchCapabilities(env),{bulkAvailable:false,reportsAvailable:false});
 await assert.rejects(requirePunchSetup(env,'bulk'),PunchSetupRequired);await assert.rejects(requirePunchSetup(env,'reports'),PunchSetupRequired);
 assert.equal(db.prepare('SELECT count(*) n FROM owner_accounts').get().n,4);
 await changePunchList(env,'a',{action:'create',id:crypto.randomUUID(),label:'Single still works'});
 assert.equal((await readPunchList(env,'a',new URLSearchParams())).items.length,1);
 }finally{db.close();}
});

test('bulk duplicates warn for normalized pasted/existing names, allow explicit override, and keep retries idempotent',async()=>{
 const {db,env}=setup();try{
 const original={action:'create',id:crypto.randomUUID(),label:'Paint   Door'};await changePunchList(env,'a',original);
 await changePunchList(env,'a',{action:'complete',id:original.id,revision:1});
 const b=batch('paint door\nNew task\nNEW TASK');
 await assert.rejects(changePunchList(env,'a',b),e=>e.message.includes('Line 1 matches an existing completed item')&&e.message.includes('Line 3 repeats line 2'));
 assert.equal(db.prepare('SELECT count(*) n FROM punch_tasks').get().n,1);
 assert.equal(db.prepare('SELECT count(*) n FROM punch_batches').get().n,0);
 await changePunchList(env,'a',{...b,allowDuplicates:true});await changePunchList(env,'a',{...b,allowDuplicates:true});
 assert.equal(db.prepare('SELECT count(*) n FROM punch_tasks').get().n,4);
 await assert.rejects(changePunchList(env,'a',{...b,labels:'Altered'}));
 }finally{db.close();}
});
test('report mode and historical test receipts are explicit even after configuration changes',async()=>{
 const {reportDeliveryLabel,reportModeNotice}=await import('../src/lib/report-delivery.ts');
 assert.match(reportModeNotice('test'),/No email is sent/);assert.match(reportDeliveryLabel('sent',true),/NO email sent/);
 assert.match(reportDeliveryLabel('sent',false),/inbox delivery unconfirmed/);assert.match(reportDeliveryLabel('failed',false),/Not sent/);
 const {db,env}=setup();try{
 env.MAIL_MODE='test';await changePunchList(env,'a',batch('Example'));
 const p=await prepareReport(env,'a',report());assert.equal(p.deliveryMode,'test');
 const delivered=await deliverReport(env,'a',p.id,async()=> 'local-test');assert.ok(delivered.recipients.every(r=>r.localTest===1));
 env.MAIL_MODE='resend';const history=await reportHistory(env,'a');assert.ok(history.every(r=>r.localTest===1));
 }finally{db.close();}
});
