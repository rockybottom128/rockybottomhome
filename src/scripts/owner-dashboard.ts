import {post,field,message,busy} from './auth-request';
document.getElementById('owner-signout')!.addEventListener('click',e=>void busy(e.currentTarget as HTMLButtonElement,async()=>{await post('/api/owner-auth/sign-out',{});location.assign('/owner/');},'owner-action-result'));
document.getElementById('owner-invite')!.addEventListener('submit',e=>{e.preventDefault();void busy(document.querySelector<HTMLButtonElement>('#owner-invite button')!,async()=>{await post('/api/owner/invite',{email:field('invite-email').value});location.reload();},'owner-action-result');});
document.querySelectorAll<HTMLButtonElement>('[data-remove-owner]').forEach(button=>button.addEventListener('click',()=>{if(!confirm('Remove this owner’s access and sign them out?'))return;void busy(button,async()=>{await post('/api/owner/remove',{id:button.dataset.removeOwner});location.reload();},'owner-action-result');}));

const bookingToggle=document.getElementById('visitor-booking-toggle') as HTMLButtonElement;
const bookingState=document.getElementById('visitor-booking-state')!;
bookingToggle.addEventListener('click',async()=>{
 if(bookingToggle.disabled)return;
 const enabled=bookingToggle.getAttribute('aria-checked')!=='true';
 bookingToggle.disabled=true;bookingToggle.setAttribute('aria-busy','true');
 message('visitor-settings-result','Saving…');
 try{
  const saved=await post('/api/owner/visitor-demo',{enabled}) as {enabled?:boolean};
  if(typeof saved.enabled!=='boolean')throw Error('Saved setting was not confirmed.');
  bookingToggle.setAttribute('aria-checked',String(saved.enabled));
  bookingState.textContent=saved.enabled?'Enabled':'Disabled';
  message('visitor-settings-result','Saved.');
  bookingToggle.disabled=false;
 }catch{
  // The database may have committed even if the response was interrupted.
  // Do not present the previous value as current or guess the next toggle.
  bookingState.textContent='Status unconfirmed';
  message('visitor-settings-result','Unable to confirm the change. Refresh to check before trying again.');
  document.getElementById('visitor-settings-reload')!.hidden=false;
 }finally{bookingToggle.removeAttribute('aria-busy');}
});

const dashboardTop=document.getElementById('dashboard-top');
if(dashboardTop){
 const updateOffset=()=>document.documentElement.style.setProperty('--dashboard-top-height',`${dashboardTop.getBoundingClientRect().height}px`);
 updateOffset();new ResizeObserver(updateOffset).observe(dashboardTop);
}
