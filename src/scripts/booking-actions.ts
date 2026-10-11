for(const form of document.querySelectorAll<HTMLFormElement>('.booking-action-form')){
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(form.dataset.busy==='true')return;form.dataset.busy='true';
  const button=form.querySelector<HTMLButtonElement>('button')!,result=form.querySelector<HTMLElement>('.booking-result')!;button.disabled=true;result.textContent='Saving…';
  const data=new FormData(form);
  try{
   const r=await fetch(`/api/${form.dataset.owner==='true'?'owner':'visitor'}/bookings`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:form.dataset.bookingId,revision:Number(form.dataset.revision),action:form.dataset.action,reason:data.get('reason'),acknowledge_simulation:data.get('acknowledge')==='on'})});
   const response=await r.json() as {error?:string};if(!r.ok)throw Error(response.error||'Unable to confirm the change. Reload before retrying.');
   location.reload();
  }catch(error){result.textContent=(error as Error).message;button.disabled=false;form.dataset.busy='false';}
 });
}
