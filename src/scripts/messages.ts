type Thread={id:string;visitor_id:string;email_normalized:string;subject:string;status:string;revision:number;created_at:number;updated_at:number;preview:string;booking_id?:string|null};
type Entry={id:string;actor_role:string;actor_label:string;kind:string;body:string;created_at:number;thread_revision:number};
type Inbox={threads:Thread[];visitors:{id:string;email_normalized:string}[]};
const labels:Record<string,string>={needs_owner:'Needs owner reply',waiting_visitor:'Waiting for visitor',resolved:'Resolved / No reply needed',external:'Continued outside website'};
const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'});
function append(parent:HTMLElement,...children:Node[]){for(const child of children)parent.appendChild(child);}
function el<K extends keyof HTMLElementTagNameMap>(tag:K,text='',cls=''){const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;}
for(const root of document.querySelectorAll<HTMLElement>('[data-messages]')){
 const q=<T=HTMLElement>(s:string)=>root.querySelector(s)! as unknown as T;
 let owner=root.dataset.role==='owner';const demo=root.dataset.demo==='true';
 const notice=q('[data-message-notice]'),list=q('[data-visitors]'),threadList=q('[data-thread-list]'),history=q('[data-history]'),compose=q<HTMLFormElement>('[data-compose]'),recipient=q<HTMLSelectElement>('[data-recipient]'),subject=q<HTMLInputElement>('[data-subject]'),body=q<HTMLTextAreaElement>('[data-body]'),search=q<HTMLInputElement>('[data-search]'),needs=q<HTMLInputElement>('[data-needs]');
 let inbox:Inbox={threads:[],visitors:[]},visitorId='',selected:Thread|null=null,isNew=false,loading=0,mutating=false;
 const drafts=new Map<string,{body:string;subject:string;visitor:string}>();
 const pending=new Map<string,{signature:string;input:Record<string,unknown>}>();
 let savedThreadToRefresh='';
 const samples=sampleInbox();
 const endpoint=()=>`/api/${owner?'owner':'visitor'}/messages`;
 function status(text:string,error=false){notice.textContent=text;notice.classList.toggle('error',error);}
 function draftKey(){return isNew?'new':selected?.id??'';}
 function remember(){const key=draftKey();if(key)drafts.set(key,{body:body.value,subject:subject.value,visitor:recipient.value});}
 function restore(){const d=drafts.get(draftKey());body.value=d?.body??'';subject.value=d?.subject??'';if(d?.visitor)recipient.value=d.visitor;}
 async function request<T>(path='',input?:Record<string,unknown>):Promise<T>{
  const response=await fetch(endpoint()+path,input?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}:{cache:'no-store'});
  const data=await response.json() as {error?:string};if(!response.ok){if(response.status===409&&input)pending.delete(draftKey());throw Error(data.error??'Messages could not be loaded.');}return data as T;
 }
 async function loadInbox(){
  inbox=demo?{threads:structuredClone(samples.threads).filter(t=>owner||t.visitor_id==='sample-a'),visitors:samples.visitors.filter(v=>owner||v.id==='sample-a')}:await request<Inbox>();
  const previous=recipient.value;recipient.replaceChildren(...inbox.visitors.map(v=>{const o=el('option',v.email_normalized);o.value=v.id;return o;}));
  if(inbox.visitors.some(v=>v.id===previous))recipient.value=previous;
  q('[data-attention-filter]').hidden=!owner;
  const count=inbox.threads.filter(t=>t.status==='needs_owner').length;
  document.querySelectorAll('[data-message-count]').forEach(e=>e.textContent=String(count));
  q<HTMLButtonElement>('[data-new]').disabled=!inbox.visitors.length;
  renderList();
 }
 function renderList(){
  list.replaceChildren();const text=search.value.trim().toLowerCase();
  const all=inbox.threads.filter(t=>(!owner||!needs.checked||t.status==='needs_owner')&&`${t.email_normalized} ${t.subject}`.toLowerCase().includes(text));
  const groups=new Map<string,Thread[]>();for(const t of all)groups.set(t.visitor_id,[...(groups.get(t.visitor_id)??[]),t]);
  for(const [id,threads]of groups){
   const latest=threads[0],count=inbox.threads.filter(t=>t.visitor_id===id&&t.status==='needs_owner').length;
   const b=el('button','','message-visitor');b.type='button';b.setAttribute('aria-pressed',String(visitorId===id));
   append(b,el('strong',owner?latest.email_normalized:'Your conversations'));
   if(count)append(b,el('span',`${count} ${count===1?'thread needs':'threads need'} owner reply`,'message-badge'));
   append(b,el('small',latest.subject),el('small',latest.preview.slice(0,85)),el('small',date.format(latest.updated_at)+' ET'));
   b.onclick=()=>{if(mutating)return;remember();visitorId=id;void selectThread(threads[0].id);};append(list,b);
  }
  if(!groups.size)append(list,el('p',inbox.threads.length?'No conversations match this filter.':inbox.visitors.length?'No conversations yet. Start a new topic above.':'Messages become available after a verified visitor submits a viewing request.','hint'));
 }
 function renderThreads(){
  threadList.replaceChildren();if(!visitorId)return;
  const threads=inbox.threads.filter(t=>t.visitor_id===visitorId);
  append(threadList,el('h3',owner?threads[0]?.email_normalized??'Visitor':'Your conversation topics','message-heading-email'));
  for(const t of threads){const b=el('button',t.subject,'message-thread');b.type='button';b.setAttribute('aria-pressed',String(selected?.id===t.id));append(b,el('span',labels[t.status]));b.onclick=()=>{if(mutating)return;remember();void selectThread(t.id);};append(threadList,b);}
 }
 function closed(){return !!selected&&['resolved','external'].includes(selected.status);}
 function updateCloseControls(){
  root.querySelectorAll<HTMLButtonElement>('[data-close-action]').forEach(b=>b.disabled=mutating||closed()||!!body.value.trim());
 }
 function showComposer(newConversation:boolean){
  compose.hidden=false;q('[data-new-fields]').hidden=!newConversation;recipient.disabled=!newConversation;subject.disabled=!newConversation;
  q('[data-reply-help]').hidden=newConversation||!owner;
  q('[data-reply-help]').textContent=closed()?'Sending a reply reopens this thread and changes it to Waiting for visitor.':'Send reply saves your message and changes this thread to Waiting for visitor. No other button is needed.';
  q('[data-composer-label]').textContent=newConversation?'Message':'Your reply';q('[data-send]').textContent=newConversation?'Start conversation':'Send reply';
 }
 async function selectThread(id:string,preserveDraft=true){
  const token=++loading;compose.hidden=true;status('Loading conversation…');
  try{
   const data=demo?{thread:samples.threads.find(t=>t.id===id)!,entries:samples.entries[id]??[]}:await request<{thread:Thread;entries:Entry[]}>('?thread='+encodeURIComponent(id));
   if(token!==loading)return;
   selected={...inbox.threads.find(t=>t.id===id),...data.thread};visitorId=selected!.visitor_id;isNew=false;
   root.classList.add('has-selection');renderList();renderThreads();renderHistory(data.entries);showComposer(false);if(preserveDraft)restore();updateCloseControls();status('');
  }catch(e){if(token===loading)status((e as Error).message,true);}
 }
 function renderHistory(entries:Entry[]){
  history.replaceChildren(el('h3',selected!.subject),el('span',labels[selected!.status],'badge'));
  if(selected!.booking_id){const a=el('a','View related showing request');a.href=owner?'/owner/dashboard/#selected-showings':'/viewings/status/';a.className='text-button';append(history,a);}
  const ul=el('ol','','message-history');ul.setAttribute('aria-label','Full conversation history');
  for(const entry of entries){
   const li=el('li','','message-bubble '+(entry.actor_role==='owner'?'owner':''));
   // Keep owner email private on the visitor side, while distinguishing the author on the owner dashboard.
   const sender=entry.actor_role==='owner'?(owner?`Owner · ${entry.actor_label}`:'Owner'):(owner?entry.actor_label:'You');
   if(entry.kind!=='message'){li.className='message-event';li.textContent=`${sender} · ${labels[entry.kind]} · ${date.format(entry.created_at)} ET`;}
   else{append(li,el('strong',sender),el('p',entry.body),el('small',date.format(entry.created_at)+' ET'));const reply=el('button','Reply in this thread','text-button');reply.type='button';reply.onclick=()=>body.focus();append(li,el('br'),reply);}
   append(ul,li);
  }
  append(history,ul);
  const closePanel=q('[data-close-thread]');closePanel.replaceChildren();closePanel.hidden=!owner;
  if(owner){
   append(closePanel,el('h3',closed()?'Thread closed':'Close without sending a reply'),el('p',closed()?'This thread is already closed. A new message will reopen it.':'Use these only when no message needs to be sent. They do not send your draft. Send or clear any draft first.','hint'));
   const actions=el('div','','message-actions');for(const [action,label]of [['resolved','No reply needed — close thread'],['external','Continued outside website']]){
   const b=el('button',label,'button secondary');b.type='button';b.dataset.closeAction=action;b.disabled=closed();b.onclick=()=>void send(action);append(actions,b);
  }append(closePanel,actions);}
 }
 function newConversation(){
  if(mutating)return;q('[data-close-thread]').hidden=true;remember();++loading;selected=null;isNew=true;visitorId='';history.replaceChildren(el('h3','Start a new conversation'));threadList.replaceChildren();root.classList.add('has-selection');showComposer(true);restore();renderList();status('');subject.focus();
 }
 async function send(action:string){
  if(mutating)return;
  if(['resolved','external'].includes(action)&&(closed()||body.value.trim()))return;
  remember();const beforeKey=draftKey();
  let input:Record<string,unknown>={action,body:body.value};
  if(action==='create'){input.visitor_id=recipient.value;input.subject=subject.value;}else{input.thread_id=selected!.id;input.revision=selected!.revision;}
  const signature=JSON.stringify({...input,revision:undefined});
  const retry=pending.get(beforeKey);
  if(retry?.signature===signature)input=retry.input;
  else{input.request_key=crypto.randomUUID();pending.set(beforeKey,{signature,input});}
  let saved=false;
  mutating=true;root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);body.readOnly=true;subject.readOnly=true;recipient.disabled=true;status('Saving…');
  try{
   const result=demo?sampleSend(input):await request<{id:string}>('',input);
   saved=true;savedThreadToRefresh=result.id;pending.delete(beforeKey);
   if(action==='create'||action==='reply'){drafts.delete(beforeKey);body.value='';}
   compose.hidden=true;await loadInbox();await selectThread(result.id);savedThreadToRefresh='';status(demo?'Saved in this sample tab only.':'Saved on the website.');
  }catch(e){status(saved?'Saved on the website, but history could not refresh. Use Refresh messages.':(e as Error).message,true);}
  finally{mutating=false;root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=false);body.readOnly=false;subject.readOnly=false;recipient.disabled=!isNew;q<HTMLButtonElement>('[data-new]').disabled=!inbox.visitors.length;updateCloseControls();}
 }
 function sampleSend(input:Record<string,unknown>){
  const now=Date.now(),id=input.action==='create'?crypto.randomUUID():String(input.thread_id);let t=samples.threads.find(t=>t.id===id);
  if(!t){const v=samples.visitors.find(v=>v.id===input.visitor_id)!;t={id,visitor_id:v.id,email_normalized:v.email_normalized,subject:String(input.subject),status:'',revision:0,created_at:now,updated_at:now,preview:''};samples.threads.unshift(t);samples.entries[id]=[];}
  if(['resolved','external'].includes(String(input.action))&&['resolved','external'].includes(t.status))return {id};
  t.revision++;t.updated_at=now;t.status=input.action==='resolved'?'resolved':input.action==='external'?'external':owner?'waiting_visitor':'needs_owner';
  const kind=['create','reply'].includes(String(input.action))?'message':String(input.action);if(kind==='message')t.preview=String(input.body);
  samples.entries[id].push({id:crypto.randomUUID(),actor_role:owner?'owner':'visitor',actor_label:owner?'Sample owner':t.email_normalized,kind,body:kind==='message'?String(input.body):'',created_at:now,thread_revision:t.revision});samples.threads.sort((a,b)=>b.updated_at-a.updated_at);return {id};
 }
 compose.addEventListener('submit',e=>{e.preventDefault();void send(isNew?'create':'reply');});
 q('[data-new]').onclick=newConversation;
 q('[data-refresh]').onclick=async()=>{if(mutating)return;remember();status('Refreshing…');try{await loadInbox();if(savedThreadToRefresh||selected){await selectThread(savedThreadToRefresh||selected!.id);savedThreadToRefresh='';}else status('Messages refreshed.');}catch(e){status((e as Error).message,true);}};
 search.oninput=renderList;needs.onchange=renderList;body.addEventListener('input',updateCloseControls);
 q('[data-back]').onclick=()=>{remember();root.classList.remove('has-selection');};
 root.querySelector<HTMLElement>('[data-switch-role]')?.addEventListener('click',async()=>{remember();owner=!owner;q('[data-close-thread]').hidden=true;selected=null;isNew=false;visitorId='';compose.hidden=true;history.replaceChildren();threadList.replaceChildren();root.classList.remove('has-selection');q('[data-switch-role]').textContent=owner?'Switch to visitor view':'Switch to owner view';root.querySelector('h2')!.textContent=owner?'Messages':'My messages';await loadInbox();status(owner?'Sample owner view':'Sample visitor view · alex@example.com');});
 void loadInbox().then(()=>status('')).catch(e=>status(e.message,true));
}
function sampleInbox(){
 const now=Date.now(),visitors=[{id:'sample-a',email_normalized:'alex@example.com'},{id:'sample-b',email_normalized:'jordan@example.com'},{id:'sample-c',email_normalized:'casey@example.com'}];
 const threads:Thread[]=[{id:'sample-1',visitor_id:'sample-a',email_normalized:visitors[0].email_normalized,subject:'A question before our viewing',status:'needs_owner',revision:3,created_at:now-86400000,updated_at:now-120000,preview:'Thank you. May our agent join us as well?'},{id:'sample-2',visitor_id:'sample-b',email_normalized:visitors[1].email_normalized,subject:'Confirming your visit',status:'waiting_visitor',revision:1,created_at:now-3600000,updated_at:now-3600000,preview:'Please let us know if you have any questions before your visit.'},{id:'sample-3',visitor_id:'sample-a',email_normalized:visitors[0].email_normalized,subject:'Following up after our visit',status:'needs_owner',revision:1,created_at:now-7200000,updated_at:now-7200000,preview:'Where should we send our follow-up questions?'}];
 const entries:Record<string,Entry[]>={};for(const t of threads)entries[t.id]=[{id:t.id+'entry',actor_role:t.id==='sample-2'?'owner':'visitor',actor_label:t.id==='sample-2'?'Sample owner':t.email_normalized,kind:'message',body:t.preview,created_at:t.created_at,thread_revision:1}];
 entries['sample-1']=[{id:'a1',actor_role:'visitor',actor_label:visitors[0].email_normalized,kind:'message',body:'We are looking forward to our viewing. Can we use this page for questions?',created_at:now-86400000,thread_revision:1},{id:'a2',actor_role:'owner',actor_label:'Sample owner',kind:'message',body:'Yes, you can keep all your questions here. Any of the owners can reply in this conversation.',created_at:now-82000000,thread_revision:2},{id:'a3',actor_role:'visitor',actor_label:visitors[0].email_normalized,kind:'message',body:threads[0].preview,created_at:now-120000,thread_revision:3}];return {threads,visitors,entries};
}
