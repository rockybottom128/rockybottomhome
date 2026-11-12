// Local-only integration check. Start the auth-local Worker and apply all migrations first.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {digest} from '../src/server/crypto.ts';
const base='http://127.0.0.1:4325';
assert.ok(process.env.RB_ISOLATED_AUTH_TEST==='1','Run npm run test:auth:isolated instead of testing against the user preview');
const config=JSON.parse(readFileSync('wrangler.auth-local.json','utf8'));
assert.equal(config.vars.MAIL_MODE,'test');
assert.equal(config.vars.APP_ORIGIN,base);
const files=readdirSync('.wrangler/state/v3/d1',{recursive:true}).filter(x=>x.endsWith('.sqlite')).filter(x=>{const candidate=new DatabaseSync('.wrangler/state/v3/d1/'+x);try{return !!candidate.prepare("SELECT name FROM sqlite_master WHERE name='auth_user'").get();}finally{candidate.close();}});
assert.equal(files.length,1,'Use an isolated local D1 state for this test');
const db=new DatabaseSync('.wrangler/state/v3/d1/'+files[0]);
const env=Object.fromEntries(readFileSync('.dev.vars','utf8').trim().split('\n').map(x=>x.split('=')));
assert.ok(!env.MAIL_MODE || env.MAIL_MODE==='test','Refuse fixtures when real email is enabled');
assert.ok(!env.MAIL_ALLOWED_RECIPIENTS || env.MAIL_ALLOWED_RECIPIENTS===config.vars.MAIL_ALLOWED_RECIPIENTS,'Refuse non-fictional recipient settings');
async function post(path,data={},cookie='',origin=base,extra={}) {
 return fetch(base+path,{method:'POST',headers:{'content-type':'application/json',origin,cookie,...extra},body:JSON.stringify(data),redirect:'manual'});
}
function mail(email) {return db.prepare('SELECT body FROM local_test_mail WHERE recipient=? ORDER BY created_at DESC LIMIT 1').get(email)?.body;}
async function mailBudget(purpose){return db.prepare('SELECT count FROM request_limits WHERE key=?').get(await digest('mail-budget:'+purpose,env.OTP_SECRET))?.count??0;}
function cookies(response){return response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');}
try {
 db.exec('DELETE FROM request_limits');
 // Check the actual asset server and middleware, not just source declarations.
 for(const path of ['/','/version.json','/owner/','/owner/dashboard/','/api/owner/punch-list']){
  const r=await fetch(base+path,{redirect:'manual'});
  assert.equal(r.headers.get('x-content-type-options'),'nosniff',path);
  assert.equal(r.headers.get('x-frame-options'),'DENY',path);
  assert.match(r.headers.get('content-security-policy')??'',/frame-ancestors 'none'/,path);
  assert.match(r.headers.get('content-security-policy-report-only')??'',/script-src 'self'/,path);
  assert.equal(r.headers.get('strict-transport-security'),null,'HTTP local preview must not set HSTS: '+path);
  if(path==='/version.json')assert.equal(r.headers.get('cache-control'),'no-store');
 }
 for(const path of ['/owner/dashboard','/owner/demo/','/owner/availability/'])assert.equal((await fetch(base+path,{redirect:'manual'})).status,303);
 assert.equal((await post('/api/owner/invite',{email:'intruder@example.com'})).status,401);
 assert.equal((await post('/api/owner/visitor-demo',{enabled:true})).status,401);
 assert.equal((await post('/api/owner-auth/sign-up/email',{email:'intruder@example.com',password:'Not a real password.'})).status,404);
 assert.equal((await post('/api/visitor/send',{email:'visitor@example.com'},'','https://attacker.invalid')).status,400);
 const boot=await post('/api/owner/bootstrap',{},'',base,{authorization:'Bearer '+env.BOOTSTRAP_TOKEN});assert.ok([200,409].includes(boot.status));
 const beforeResetMail=db.prepare("SELECT COUNT(*) n FROM local_test_mail WHERE recipient='owner@example.com'").get().n;
 const knownReset=await post('/api/owner-auth/request-password-reset',{email:'owner@example.com',redirectTo:'https://attacker.invalid/reset',purpose:'owner'});
 const unknownReset=await post('/api/owner-auth/request-password-reset',{email:'unknown@example.com'});
 assert.equal(knownReset.status,200);assert.equal(unknownReset.status,200);
 assert.deepEqual(await knownReset.json(),await unknownReset.json(),'Recovery responses do not disclose account existence');
 assert.equal(knownReset.headers.get('cache-control'),'no-store');
 // waitUntil intentionally returns before mail. Wait for this request's new
 // delivery rather than accidentally using the earlier bootstrap invitation.
 for(let i=0;i<100&&db.prepare("SELECT COUNT(*) n FROM local_test_mail WHERE recipient='owner@example.com'").get().n===beforeResetMail;i++)await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(db.prepare("SELECT COUNT(*) n FROM local_test_mail WHERE recipient='owner@example.com'").get().n,beforeResetMail+1,'Background recovery must actually deliver');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM local_test_mail WHERE recipient='unknown@example.com'").get().n,0);
 assert.ok(mail('owner@example.com').includes(base+'/owner/reset#token='));
 assert.ok(!mail('owner@example.com').includes('attacker.invalid'));
 assert.equal(await mailBudget('owner'),1,'Bootstrap uses the invitation reserve');
 assert.equal(await mailBudget('owner-reset'),1,'Public recovery cannot select the invitation reserve');
 const recovery=mail('owner@example.com').match(/#token=([^\s]+)/)[1];
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_verification WHERE identifier LIKE ?').get('%'+recovery+'%').n,0,'Recovery tokens must be hashed at rest');
 const password='Local-only '+crypto.randomUUID();
 assert.equal((await post('/api/owner-auth/reset-password',{token:recovery,newPassword:password})).status,200);
 assert.equal((await post('/api/owner-auth/reset-password',{token:recovery,newPassword:password})).status,400,'Reset tokens are one-use');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='owner_password_reset'").get().n,1,'Only completed password setup is audited');
 assert.equal((await post('/api/owner-auth/sign-in/email',{email:'owner@example.com',password:'wrong password'})).status,401);
 const login=await post('/api/owner-auth/sign-in/email',{email:'owner@example.com',password});assert.equal(login.status,200);const ownerCookie=cookies(login);
 assert.equal((await post('/api/owner/visitor-demo',{enabled:false},ownerCookie)).status,200);
 assert.equal((await post('/api/visitor/send',{email:'visitor@example.com'})).status,403);
 assert.equal((await post('/api/visitor/verify',{email:'visitor@example.com',code:'00000000'})).status,403);
 assert.equal((await fetch(base+'/viewings/demo/',{redirect:'manual'})).status,303);
 assert.equal((await post('/api/owner/visitor-demo',{enabled:true},ownerCookie)).status,200);
 const denied=await post('/api/visitor/send',{email:'blocked@notallowed.test',purpose:'owner'});
 assert.equal(denied.status,400,'Public callers cannot bypass visitor restrictions by requesting owner mail');
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM visitors WHERE email_normalized='blocked@notallowed.test'").get().n,0,'Rejected recipient must not create a visitor record');
 assert.match(ownerCookie,/rb-owner/);assert.ok(login.headers.getSetCookie().some(c=>/httponly/i.test(c)));
 const dashboard=await fetch(base+'/owner/dashboard',{headers:{cookie:ownerCookie}});assert.equal(dashboard.status,200);const html=await dashboard.text();assert.match(html,/PRIVATE OWNER DASHBOARD/);assert.doesNotMatch(html,/INTERACTIVE WORKFLOW PREVIEW/);assert.match(html,/id="dashboard-menu"/);assert.match(html,/id="punch-visibility-toggle"/);assert.match(html,/id="punch-content" hidden/);assert.match(html,/id="selected-showings"/);assert.match(html,/id="shared-activity"/);assert.doesNotMatch(html,/id="booking-list"/);assert.doesNotMatch(html,/id="activity-log"/);assert.doesNotMatch(html,/id="add-owner"/);assert.equal(dashboard.headers.get('cache-control'),'no-store');
 assert.ok(html.indexOf('id="shared-availability"')<html.indexOf('id="email-heading"'));
 assert.ok(html.indexOf('id="website-stats"')<html.indexOf('id="shared-activity"'));
 assert.match(html,/Owner password set or reset/);
 assert.doesNotMatch(html,/Calendar controls still use fictional browser data/);
 // Report APIs: active-owner gate, CSRF, all-page snapshot and local fake delivery.
 for(const path of ['/api/owner/bookings','/api/visitor/bookings','/api/visitor/profile','/api/owner/visitor-allowlist','/api/owner/punch-list','/api/owner/punch-reports','/api/owner/invite']){
  const malformed=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',origin:base,cookie:ownerCookie},body:'{'});
  assert.equal(malformed.status,400,path+' must treat malformed JSON as invalid input');
  assert.equal((await malformed.json()).error,'Invalid request.');
 }
 assert.equal((await fetch(base+'/api/owner/punch-list?sort=invalid',{headers:{cookie:ownerCookie}})).status,400);
 assert.equal((await post('/api/owner/punch-list',{action:'create',id:crypto.randomUUID(),label:'Bad\nlabel'},ownerCookie)).status,400);
 assert.equal((await post('/api/owner/punch-reports',{action:'prepare'})).status,401);
 const bulkId=crypto.randomUUID();
 assert.equal((await post('/api/owner/punch-list',{action:'bulk-create',id:bulkId,labels:Array.from({length:55},(_,i)=>'Fixture task '+i).join('\n')},ownerCookie)).status,200);
 const punchItem=db.prepare('SELECT id,revision FROM punch_tasks ORDER BY created_at LIMIT 1').get();
 assert.equal((await post('/api/owner/punch-list',{action:'edit',id:punchItem.id,revision:punchItem.revision,label:'Bad\u0007label'},ownerCookie)).status,400);
 assert.equal((await post('/api/owner/punch-list',{action:'edit',id:punchItem.id,revision:punchItem.revision+1,label:'Stale edit'},ownerCookie)).status,409);
 const reportInput={action:'prepare',id:crypto.randomUUID(),owners:[],custom:'report-recipient@example.com',sort:'name',direction:'asc',includeCompleted:false,timeZone:'America/New_York'};
 assert.equal((await post('/api/owner/punch-reports',{...reportInput,sort:'invalid'},ownerCookie)).status,400);
 assert.equal((await post('/api/owner/punch-reports',reportInput,ownerCookie,'https://evil.example')).status,400);
 const reportResponse=await post('/api/owner/punch-reports',reportInput,ownerCookie);assert.equal(reportResponse.status,200);const report=await reportResponse.json();assert.match(report.preview,/55 items/);
 assert.equal(report.deliveryMode,'test');assert.equal((await post('/api/owner/punch-reports',{action:'send',id:report.id,deliveryMode:'resend'},ownerCookie)).status,409);
 const sentReport=await post('/api/owner/punch-reports',{action:'send',id:report.id,deliveryMode:'test'},ownerCookie);assert.equal(sentReport.status,200);const deliveryResult=await sentReport.json();assert.equal(deliveryResult.recipients[0].status,'sent');assert.equal(deliveryResult.recipients[0].localTest,1);
 assert.equal(db.prepare("SELECT count(*) n FROM local_test_mail WHERE recipient='report-recipient@example.com'").get().n,1);
 await post('/api/owner/punch-reports',{action:'send',id:report.id,deliveryMode:'test'},ownerCookie);
 assert.equal(db.prepare("SELECT count(*) n FROM local_test_mail WHERE recipient='report-recipient@example.com'").get().n,1);
 const owner=db.prepare("SELECT id FROM owner_accounts WHERE email_normalized='owner@example.com'").get();
 assert.equal(await mailBudget('report'),1,'Replayed report sends do not spend another allowance');
 assert.equal((await post('/api/owner/remove',{id:owner.id},ownerCookie)).status,409,'Last active owner protected with a conflict response');
 assert.equal((await post('/api/owner/remove',{id:'unknown-owner'},ownerCookie)).status,404);
 assert.equal((await fetch(base+'/owner/dashboard',{headers:{cookie:ownerCookie},redirect:'manual'})).status,200);
 assert.equal((await post('/api/owner/invite',{email:'visitor@example.com'},ownerCookie)).status,200);
 const secondRecovery=mail('visitor@example.com').match(/#token=([^\s]+)/)[1];
 const secondPassword='Another local-only '+crypto.randomUUID();
 assert.equal((await post('/api/owner-auth/reset-password',{token:secondRecovery,newPassword:secondPassword})).status,200);
 const secondLogin=await post('/api/owner-auth/sign-in/email',{email:'visitor@example.com',password:secondPassword});assert.equal(secondLogin.status,200);
 const secondCookie=cookies(secondLogin),second=db.prepare("SELECT id FROM owner_accounts WHERE email_normalized='visitor@example.com'").get();
 assert.equal((await fetch(base+'/owner/dashboard',{headers:{cookie:secondCookie},redirect:'manual'})).status,200);
 // Availability: independent owner cookies share D1; mutations are origin-bound and revision-checked.
 async function calendar(cookie=ownerCookie){const r=await fetch(base+'/api/owner/availability',{headers:{cookie}});assert.equal(r.status,200);return r.json();}
 const available={kind:'available',local_day:null,weekday:-1,start_minute:540,end_minute:1020};
 const change=(data,cookie=ownerCookie,origin=base)=>post('/api/owner/availability',data,cookie,origin);
 assert.equal((await fetch(base+'/api/owner/availability')).status,401);
 assert.equal((await change({revision:0,action:'add',period:available},'')).status,401);
 assert.equal((await change({revision:0,action:'add',period:available},ownerCookie,'https://attacker.invalid')).status,400);
 assert.equal((await change({revision:0,action:'add',period:available})).status,200);
 const sharedCalendar=await calendar(secondCookie);assert.equal(sharedCalendar.revision,1);assert.equal(sharedCalendar.periods.length,1);
 const competing=await Promise.all([ownerCookie,secondCookie].map(cookie=>change({revision:1,action:'add',period:{...available,kind:'blocked',start_minute:600,end_minute:660}},cookie)));
 assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
 assert.equal((await calendar()).revision,2);
 assert.equal((await post('/api/owner/remove',{id:second.id},ownerCookie)).status,200);
 assert.equal((await post('/api/owner/remove',{id:second.id},ownerCookie)).status,404,'Repeated removal does not claim a new successful change');
 assert.equal((await fetch(base+'/owner/dashboard',{headers:{cookie:secondCookie},redirect:'manual'})).status,303,'Removed owner session is immediately invalidated');
 assert.equal((await change({revision:2,action:'add',period:available},secondCookie)).status,401);
 db.exec("UPDATE email_challenges SET last_sent_at=0");
 assert.equal((await post('/api/visitor/send',{email:'VISITOR@example.com'})).status,200);
 const first=mail('visitor@example.com').match(/\d{8}/)[0];
 const before=db.prepare("SELECT id FROM visitors WHERE email_normalized='visitor@example.com'").get();
 assert.equal((await post('/api/visitor/send',{email:'visitor@example.com'})).status,400,'Resend cooldown enforced on server');
 db.exec('UPDATE email_challenges SET last_sent_at=0');
 assert.equal((await post('/api/visitor/send',{email:'visitor@example.com'})).status,200);
 const latest=mail('visitor@example.com').match(/\d{8}/)[0];
 assert.notEqual(first,latest);
 assert.equal((await post('/api/visitor/verify',{email:'visitor@example.com',code:first})).status,400,'Replaced code rejected');
 const responses=await Promise.all([post('/api/visitor/verify',{email:'visitor@example.com',code:latest}),post('/api/visitor/verify',{email:'visitor@example.com',code:latest})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,400],'Concurrent verification consumes the code once');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='visitor_email_verified'").get().n,1,'Concurrent/replayed verification creates only one audit event');
 const visitorCookie=cookies(responses.find(r=>r.status===200));
 assert.equal((await fetch(base+'/owner/dashboard',{headers:{cookie:visitorCookie},redirect:'manual'})).status,303,'Visitor session cannot grant owner access');
 assert.equal((await fetch(base+'/viewings/status/',{headers:{cookie:visitorCookie},redirect:'manual'})).status,200);
 assert.equal(db.prepare("SELECT id FROM visitors WHERE email_normalized='visitor@example.com'").get().id,before.id,'Same email retains visitor ID');
 assert.equal((await fetch(base+'/viewings/demo/',{headers:{cookie:visitorCookie},redirect:'manual'})).status,200);
 const easternDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const tomorrow=new Date(Date.parse(easternDay+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const slotPath=base+`/api/visitor/availability?from=${tomorrow}&to=${tomorrow}`;
 assert.equal((await fetch(slotPath)).status,401);
 assert.equal((await change({revision:2,action:'add',period:available},visitorCookie)).status,401);
 const visitorSlots=await fetch(slotPath,{headers:{cookie:visitorCookie}});assert.equal(visitorSlots.headers.get('cache-control'),'no-store');
 const payload=await visitorSlots.json();assert.deepEqual(Object.keys(payload).sort(),['slots','timeZone']);assert.equal(payload.slots.length,7);assert.ok(!payload.slots.some(s=>s.start==='10:00'));
 const current=await calendar(),block=current.periods.find(p=>p.kind==='blocked');
 assert.equal((await change({revision:current.revision,action:'remove',id:block.id})).status,200);
 assert.equal((await (await fetch(slotPath,{headers:{cookie:visitorCookie}})).json()).slots.length,8);
 assert.equal((await change({revision:3,action:'remove',id:current.periods.find(p=>p.kind==='available').id})).status,200);
 assert.equal((await (await fetch(slotPath,{headers:{cookie:visitorCookie}})).json()).slots.length,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);
 const activityDashboard=await (await fetch(base+'/owner/dashboard/',{headers:{cookie:ownerCookie}})).text();
 assert.match(activityDashboard,/Calendar period removed/);assert.match(activityDashboard,/Visitor email verified/);
 await post('/api/owner/visitor-demo',{enabled:false},ownerCookie);
 assert.equal((await post('/api/visitor/demo-access',{},visitorCookie)).status,403);
 assert.equal((await fetch(slotPath,{headers:{cookie:visitorCookie}})).status,403);
 assert.equal((await change({revision:4,action:'add',period:available})).status,200,'Owners can manage availability while visitor demo is off');
 assert.equal((await fetch(base+'/viewings/demo/',{headers:{cookie:visitorCookie},redirect:'manual'})).status,303);
 await post('/api/owner/visitor-demo',{enabled:true},ownerCookie);
 // Persist visitor details and real holds using authenticated APIs only.
 const profileInput={role:'agent',display_name:'Example Agent',licensed_name:'Example Agent',jurisdiction:'SC',license_number:'TEST-ONLY',brokerage:'Example',revision:0};
 assert.equal((await post('/api/visitor/profile',profileInput)).status,401);
 assert.equal((await post('/api/visitor/profile',profileInput,visitorCookie,'https://attacker.invalid')).status,400);
 assert.equal((await post('/api/visitor/profile',profileInput,visitorCookie)).status,200);
 const savedProfile=await (await fetch(base+'/api/visitor/profile',{headers:{cookie:visitorCookie}})).json();
 assert.equal(savedProfile.profile.validation_status,'simulated_pass');assert.equal(savedProfile.profile.licensed_name,'Example Agent');
 assert.equal((await post('/api/visitor/profile',profileInput,visitorCookie)).status,409);
 const bookingInput={action:'request',day:tomorrow,time:'09:00',request_key:crypto.randomUUID(),agent_attending:true};
 assert.equal((await post('/api/visitor/bookings',bookingInput)).status,401);
 assert.equal((await post('/api/visitor/bookings',bookingInput,visitorCookie,'https://attacker.invalid')).status,400);
 const bookingResponses=await Promise.all([post('/api/visitor/bookings',bookingInput,visitorCookie),post('/api/visitor/bookings',bookingInput,visitorCookie)]);
 assert.deepEqual(bookingResponses.map(r=>r.status),[200,200]);
 const booking=await bookingResponses[0].json();assert.equal((await bookingResponses[1].json()).id,booking.id);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);
 assert.equal((await (await fetch(slotPath,{headers:{cookie:visitorCookie}})).json()).slots.length,7);
 const freshCalendar=await calendar();
 assert.equal((await change({revision:freshCalendar.revision,action:'add',period:{...available,kind:'blocked',local_day:tomorrow,weekday:null}})).status,409,'Cannot silently block a real hold');
 // Owner-managed D1 allowlist: private reads, stale edits, and existing-session exclusion.
 assert.equal((await fetch(base+'/api/owner/visitor-allowlist')).status,401);
 assert.equal((await fetch(base+'/api/owner/visitor-allowlist',{headers:{cookie:visitorCookie}})).status,401);
 const readList=async()=>await (await fetch(base+'/api/owner/visitor-allowlist',{headers:{cookie:ownerCookie}})).json();
 let accessList=await readList();const visitorEntry=accessList.entries.find(e=>e.value==='visitor@example.com');assert.ok(visitorEntry);
 const removeAccess={action:'remove',id:visitorEntry.id,revision:accessList.revision};
 assert.equal((await post('/api/owner/visitor-allowlist',removeAccess,visitorCookie)).status,401);
 assert.equal((await post('/api/owner/visitor-allowlist',removeAccess,secondCookie)).status,401);
 assert.equal((await post('/api/owner/visitor-allowlist',removeAccess,ownerCookie,'https://attacker.invalid')).status,400);
 assert.equal((await post('/api/owner/visitor-allowlist',removeAccess,ownerCookie)).status,200);
 assert.equal((await fetch(slotPath,{headers:{cookie:visitorCookie}})).status,401);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n,1,'Removing access never cancels a booking');
 assert.equal((await post('/api/owner/visitor-allowlist',removeAccess,ownerCookie)).status,409);
 accessList=await readList();
 assert.equal((await post('/api/owner/visitor-allowlist',{action:'add',kind:'email',value:'visitor@example.com',revision:accessList.revision},ownerCookie)).status,200);
 assert.equal((await fetch(slotPath,{headers:{cookie:visitorCookie}})).status,200);
 // Global filter and block mutations use the same private API; master switch wins.
 const policyChange=async change=>{const state=await readList();const r=await post('/api/owner/visitor-allowlist',{...change,revision:state.revision},ownerCookie);assert.equal(r.status,200);return r.json();};
 const filterInput={action:'filter',globalFilter:false,revision:(await readList()).revision};
 assert.equal((await post('/api/owner/visitor-allowlist',filterInput,visitorCookie)).status,401);
 assert.equal((await post('/api/owner/visitor-allowlist',filterInput,ownerCookie,'https://attacker.invalid')).status,400);
 await policyChange({action:'filter',globalFilter:false});
 const withBlock=await policyChange({action:'add',policy:'block',kind:'domain',value:'example.com'});
 assert.equal((await fetch(slotPath,{headers:{cookie:visitorCookie}})).status,200,'Specific Allow overrides blocked domain');
 await post('/api/owner/visitor-demo',{enabled:false},ownerCookie);
 assert.notEqual((await fetch(slotPath,{headers:{cookie:visitorCookie}})).status,200,'Master switch wins over Allow and open filter');
 await post('/api/owner/visitor-demo',{enabled:true},ownerCookie);
 const allow=withBlock.entries.find(e=>e.policy==='allow'&&e.value==='visitor@example.com');
 await policyChange({action:'remove',id:allow.id});
 assert.equal((await fetch(slotPath,{headers:{cookie:visitorCookie}})).status,401,'Block excludes existing session with filter Off');
 await policyChange({action:'remove',id:withBlock.entries.find(e=>e.policy==='block').id});
 assert.equal((await fetch(slotPath,{headers:{cookie:visitorCookie}})).status,200,'Filter Off permits unmatched verified visitor');
 await policyChange({action:'add',policy:'allow',kind:'email',value:'visitor@example.com'});
 await policyChange({action:'filter',globalFilter:true});
 const ownRequests=await (await fetch(base+'/api/visitor/bookings',{headers:{cookie:visitorCookie}})).json();assert.equal(ownRequests.bookings[0].id,booking.id);assert.ok(!('profile_snapshot' in ownRequests.bookings[0]));
 assert.equal((await post('/api/owner/bookings',{id:booking.id,revision:1,action:'approve',acknowledge_simulation:true},visitorCookie)).status,401);
 assert.equal((await post('/api/owner/bookings',{id:booking.id,revision:1,action:'approve'},ownerCookie)).status,400);
 const messageInput={id:booking.id,revision:1,action:'message',request_key:crypto.randomUUID(),message:'Please reply if you need directions.'};
 assert.equal((await post('/api/owner/bookings',messageInput)).status,401);
 assert.equal((await post('/api/owner/bookings',messageInput,visitorCookie)).status,401);
 assert.equal((await post('/api/owner/bookings',messageInput,secondCookie)).status,401);
 assert.equal((await post('/api/owner/bookings',messageInput,ownerCookie,'https://attacker.invalid')).status,400);
 const messageResponse=await post('/api/owner/bookings',messageInput,ownerCookie);assert.equal(messageResponse.status,200);const sentMessage=await messageResponse.json();assert.equal(sentMessage.emailStatus,'sent');
 const retryMail={action:'send-email',email_id:sentMessage.emailId};
 assert.equal((await post('/api/owner/bookings',retryMail,visitorCookie)).status,401);
 assert.equal((await post('/api/owner/bookings',retryMail,ownerCookie,'https://attacker.invalid')).status,400);
 assert.equal((await post('/api/owner/bookings',retryMail,ownerCookie)).status,200);
 await post('/api/owner/bookings',messageInput,ownerCookie);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM local_test_mail WHERE subject='Message about your Rocky Bottom viewing'").get().n,1);
 const pendingDashboard=await (await fetch(base+`/owner/dashboard/?month=${tomorrow.slice(0,7)}&day=${tomorrow}`,{headers:{cookie:ownerCookie}})).text();
 assert.match(pendingDashboard,/has-pending/);assert.match(pendingDashboard,/Please reply if you need directions/);assert.match(pendingDashboard,/Pending review/);
 // Real website conversations use the same authenticated sessions, but do not send email.
 const conversationInput={action:'create',subject:'Question before our viewing',body:'Can our agent join us? '+ '好'.repeat(1400),request_key:crypto.randomUUID()};
 for(const role of ['owner','visitor'])assert.equal((await fetch(base+'/api/'+role+'/messages')).status,401);
 assert.equal((await post('/api/visitor/messages',conversationInput,visitorCookie,'https://attacker.invalid')).status,400);
 assert.equal((await post('/api/owner/messages',conversationInput,visitorCookie)).status,401);
 const started=await post('/api/visitor/messages',conversationInput,visitorCookie);assert.equal(started.status,200);const thread=await started.json();
 assert.equal((await (await post('/api/visitor/messages',conversationInput,visitorCookie)).json()).id,thread.id);
 const inbox=await (await fetch(base+'/api/owner/messages',{headers:{cookie:ownerCookie}})).json();assert.equal(inbox.threads[0].status,'needs_owner');
 assert.match(await (await fetch(base+'/owner/dashboard/',{headers:{cookie:ownerCookie}})).text(),/data-message-count[^>]*>1</);
 const answer={action:'reply',thread_id:thread.id,revision:1,body:'Yes, your agent is welcome.',request_key:crypto.randomUUID()};
 assert.equal((await post('/api/owner/messages',answer,secondCookie)).status,401);
 assert.equal((await post('/api/owner/messages',answer,ownerCookie)).status,200);
 const full=await (await fetch(base+'/api/visitor/messages?thread='+thread.id,{headers:{cookie:visitorCookie}})).json();assert.equal(full.entries.length,2);assert.equal(full.thread.status,'waiting_visitor');assert.equal(full.entries[1].actor_label,'Owner');
 assert.equal((await post('/api/visitor/messages',{...answer,request_key:crypto.randomUUID()},visitorCookie)).status,409);
 assert.equal((await fetch(base+'/viewings/messages/',{headers:{cookie:visitorCookie}})).status,200);
 await post('/api/owner/visitor-demo',{enabled:false},ownerCookie);
 assert.equal((await fetch(base+'/api/visitor/messages',{headers:{cookie:visitorCookie}})).status,403);
 await post('/api/owner/visitor-demo',{enabled:true},ownerCookie);
 const approvedResponse=await post('/api/owner/bookings',{id:booking.id,revision:1,action:'approve',acknowledge_simulation:true},ownerCookie);
 assert.equal(approvedResponse.status,200);assert.equal((await approvedResponse.json()).emailStatus,'sent');
 const approvedDashboard=await (await fetch(base+`/owner/dashboard/?month=${tomorrow.slice(0,7)}&day=${tomorrow}`,{headers:{cookie:ownerCookie}})).text();assert.match(approvedDashboard,/has-approved/);
 assert.match(mail('visitor@example.com'),/viewing is approved/);
 assert.equal((await post('/api/visitor/bookings',{id:booking.id,revision:2,action:'cancel',reason:'Cancel this test request'},visitorCookie)).status,200);
 assert.equal((await (await fetch(slotPath,{headers:{cookie:visitorCookie}})).json()).slots.length,8);
 const requestDashboard=await (await fetch(base+`/owner/dashboard/?month=${tomorrow.slice(0,7)}&day=${tomorrow}`,{headers:{cookie:ownerCookie}})).text();assert.match(requestDashboard,/Example Agent/);assert.match(requestDashboard,/Viewing canceled/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM access_jobs').get().n,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM email_outbox WHERE status='sent'").get().n,3);
 assert.equal(await mailBudget('booking'),3,'Owner and visitor booking routes use the booking allowance');
 assert.equal(await mailBudget('visitor'),2,'Booking emails do not spend verification capacity');
 assert.match(mail('visitor@example.com'),/Cancel this test request/);
 assert.equal((await post('/api/owner/bookings',{...messageInput,revision:3,request_key:crypto.randomUUID()},ownerCookie)).status,409);
 const privateBookings=await (await fetch(base+'/api/visitor/bookings',{headers:{cookie:visitorCookie}})).text();assert.ok(!privateBookings.includes('payload_json'));assert.ok(!privateBookings.includes('Please reply if'));
 // Start the next independent OTP scenario with a clean disposable-fixture limiter.
 db.exec('DELETE FROM request_limits');
 await post('/api/owner/visitor-demo',{enabled:false},ownerCookie);
 assert.equal((await post('/api/visitor/profile',{...profileInput,revision:1},visitorCookie)).status,403);
 assert.equal((await post('/api/visitor/bookings',{...bookingInput,request_key:crypto.randomUUID()},visitorCookie)).status,403);
 await post('/api/owner/visitor-demo',{enabled:true},ownerCookie);
 await post('/api/visitor/sign-out',{},visitorCookie);
 assert.equal((await fetch(base+'/viewings/status/',{headers:{cookie:visitorCookie},redirect:'manual'})).status,303);
 db.exec('UPDATE email_challenges SET last_sent_at=0');
 await post('/api/visitor/send',{email:'visitor@example.com'});
 const attemptCode=mail('visitor@example.com').match(/\d{8}/)[0];
 for(let i=0;i<5;i++)assert.equal((await post('/api/visitor/verify',{email:'visitor@example.com',code:attemptCode==='00000000'?'99999999':'00000000'})).status,400);
 assert.equal((await post('/api/visitor/verify',{email:'visitor@example.com',code:attemptCode})).status,400,'Exhausted challenge rejected');
 db.exec('UPDATE email_challenges SET last_sent_at=0');await post('/api/visitor/send',{email:'visitor@example.com'});
 const expired=mail('visitor@example.com').match(/\d{8}/)[0];db.exec('UPDATE email_challenges SET expires_at=0');
 assert.equal((await post('/api/visitor/verify',{email:'visitor@example.com',code:expired})).status,400,'Expired challenge rejected');
 await post('/api/owner/visitor-demo',{enabled:false},ownerCookie);
 // Only this disposable fixture: exhaust the invitation reserve after saving.
 db.prepare('INSERT OR REPLACE INTO request_limits(key,count,expires_at) VALUES (?,5,?)').run(await digest('mail-budget:owner',env.OTP_SECRET),Date.now()+86400000);
 const savedInvite=await post('/api/owner/invite',{email:'limited-invite@example.com'},ownerCookie);
 assert.equal(savedInvite.status,429,'Real auth provider preserves the invitation email rate limit');
 const savedInviteBody=await savedInvite.json();assert.equal(savedInviteBody.invitationSaved,true);assert.match(savedInviteBody.error,/invitation was saved/);
 assert.equal(db.prepare("SELECT status FROM owner_accounts WHERE email_normalized='limited-invite@example.com'").get().status,'invited');
 assert.equal((await post('/api/owner/invite',{email:'limited-invite@example.com'},ownerCookie)).status,409);
 // Background cleanup uses only this disposable fixture. Keep a live challenge
 // and a recently restarted registration while removing an abandoned visitor.
 const old=Date.now()-3*86400000;
 for(const id of ['cleanup-old','cleanup-live','cleanup-requesting'])db.prepare('INSERT INTO visitors(id,email_normalized,created_at) VALUES (?,?,?)').run(id,id+'@farts.cloud',old);
 for(const id of ['cleanup-old','cleanup-live'])db.prepare("INSERT INTO email_challenges(visitor_id,generation,code_digest,expires_at,last_sent_at,delivery) VALUES (?,?,?,?,?,'sent')").run(id,id,'fixture-digest',id==='cleanup-live'?Date.now()+600000:old,old);
 await post('/api/owner/visitor-demo',{enabled:true},ownerCookie);
 assert.equal((await post('/api/visitor/send',{email:'cleanup-requesting@farts.cloud'})).status,200);
 await post('/api/owner/visitor-demo',{enabled:false},ownerCookie);
 assert.ok(db.prepare("SELECT last_verification_requested_at FROM visitors WHERE id='cleanup-requesting'").get().last_verification_requested_at>old);
 db.prepare("DELETE FROM request_limits WHERE key='maintenance:expired-records:v1'").run();
 for(let i=0;i<30&&db.prepare("SELECT id FROM visitors WHERE id='cleanup-old'").get();i++){
  assert.equal((await fetch(base+'/owner/dashboard/',{headers:{cookie:ownerCookie}})).status,200);
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.equal(db.prepare("SELECT id FROM visitors WHERE id='cleanup-old'").get(),undefined,'Background maintenance must remove an abandoned registration');
 assert.equal(db.prepare("SELECT count(*) n FROM visitors WHERE id IN ('cleanup-live','cleanup-requesting')").get().n,2);
 assert.equal(db.prepare("SELECT count(*) n FROM email_challenges WHERE visitor_id='cleanup-live'").get().n,1);
 assert.equal((await fetch(base+'/owner/dashboard/',{headers:{cookie:ownerCookie}})).status,200,'Cleanup preserves the signed-in owner');
 // Review-only email recovery: real owner gate, CSRF, individual report targets,
 // idempotent audit, stale revisions and no sends through existing retry routes.
 const oldAttempt=Date.now()-16*60000;
 db.prepare("INSERT INTO email_outbox(id,booking_id,booking_revision,kind,deduplication_key,due_at,status,payload_json,created_at,attempted_at) VALUES ('recovery-mail',?,3,'confirmation','recovery-mail',0,'sending',?,0,?)").run(booking.id,JSON.stringify({subject:'Fixture',text:'Review fixture only'}),oldAttempt);
 db.prepare("INSERT INTO punch_report_deliveries(id,report_id,recipient,include_attribution,status,attempted_at) VALUES ('recovery-recipient',?,'recovery@example.com',0,'sending',?)").run(report.id,oldAttempt);
 const recoveryPath='/api/owner/email-recovery';
 assert.equal((await fetch(base+recoveryPath)).status,401);
 assert.equal((await post(recoveryPath,{})).status,401);
 assert.equal((await post(recoveryPath,{},ownerCookie,'https://attacker.invalid')).status,400);
 assert.equal((await fetch(base+recoveryPath,{method:'POST',headers:{origin:base,cookie:ownerCookie,'content-type':'application/json'},body:'{'})).status,400);
 const recoveryList=await (await fetch(base+recoveryPath,{headers:{cookie:ownerCookie}})).json();
 assert.ok(recoveryList.items.some(item=>item.id==='recovery-mail'&&item.canFlag));
 const recoveryMailCount=db.prepare('SELECT count(*) n FROM local_test_mail').get().n;
 for(const [kind,id] of [['booking','recovery-mail'],['report','recovery-recipient']]){
  const flag={kind,id,revision:0,outcome:'flagged',request_key:crypto.randomUUID()};
  assert.equal((await post(recoveryPath,flag,ownerCookie)).status,200);
  assert.equal((await post(recoveryPath,flag,ownerCookie)).status,200);
  const reviewInput={kind,id,revision:1,outcome:'not_accepted',evidence:'Provider confirmed this fictional message was not accepted.',confirmed:true,request_key:crypto.randomUUID()};
  assert.equal((await post(recoveryPath,reviewInput,ownerCookie)).status,200);
  assert.equal((await post(recoveryPath,{...reviewInput,request_key:crypto.randomUUID()},ownerCookie)).status,409);
  const history=await (await fetch(base+recoveryPath+'?kind='+kind+'&id='+id,{headers:{cookie:ownerCookie}})).json();
  assert.equal(history.history.length,2);assert.equal(history.history[0].outcome,'not_accepted');
 }
 const noResend=await (await post('/api/owner/bookings',{action:'send-email',email_id:'recovery-mail'},ownerCookie)).json();assert.equal(noResend.emailStatus,'uncertain');
 await post('/api/owner/punch-reports',{action:'send',id:report.id,deliveryMode:'test'},ownerCookie);
 assert.equal(db.prepare('SELECT count(*) n FROM local_test_mail').get().n,recoveryMailCount,'Recovery cannot send email');
 const reviewedDashboard=await (await fetch(base+'/owner/dashboard/',{headers:{cookie:ownerCookie}})).text();
 assert.match(reviewedDashboard,/Review uncertain emails/);assert.match(reviewedDashboard,/Save review — no email sent/);
 assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='email_delivery_reviewed'").get().n,4);
 // Verify older schema produces actionable errors.
 db.exec('DROP TABLE punch_report_deliveries; DROP TABLE punch_reports; DROP TABLE punch_batches;');
 const oldSchema=await (await fetch(base+'/api/owner/punch-list',{headers:{cookie:ownerCookie}})).json();assert.equal(oldSchema.bulkAvailable,false);assert.equal(oldSchema.reportsAvailable,false);
 for(const path of ['/api/owner/punch-list','/api/owner/punch-reports']){
  const blocked=await post(path,{action:path.endsWith('punch-list')?'bulk-create':'prepare',id:crypto.randomUUID(),labels:'Not saved'},ownerCookie);
  assert.equal(blocked.status,503);assert.match((await blocked.json()).error,/database update is approved and applied/);
 }
 const oldHistory=await fetch(base+'/api/owner/punch-reports',{headers:{cookie:ownerCookie}});assert.equal(oldHistory.status,503);assert.match((await oldHistory.json()).error,/database update/);
 await post('/api/owner-auth/sign-out',{},ownerCookie);
 assert.equal((await fetch(base+'/owner/dashboard',{headers:{cookie:ownerCookie},redirect:'manual'})).status,303);
 console.log('PASS: protected pages, owner password/reset/session, visitor OTP replay/concurrency/expiry/attempts, CSRF, ID reuse and last-owner protection. No real email sent.');
} finally {db.close();}
