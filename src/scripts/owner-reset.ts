import {post,field,message,busy} from './auth-request';
let resetToken=new URLSearchParams(location.hash.slice(1)).get('token');
// Remove recovery token from browser history after reading it. Never save it in browser storage.
history.replaceState(null,'',location.pathname);
if(!resetToken)message('reset-result','This link is invalid or expired. Request a new link from sign-in.');
const form=document.getElementById('owner-reset') as HTMLFormElement;
form.addEventListener('submit',e=>{
  e.preventDefault();
  if(form.hidden)return;
  if(field('new-password').value!==field('confirm-password').value){
    message('reset-result','The passwords do not match.');return;
  }
  void busy(document.querySelector<HTMLButtonElement>('#owner-reset button')!,async()=>{
    if(!resetToken)throw new Error('Request a new password link.');
    await post('/api/owner-auth/reset-password',{token:resetToken,newPassword:field('new-password').value});
    resetToken=null;
    form.reset();
    form.hidden=true;
    document.getElementById('reset-instructions')!.hidden=true;
    document.getElementById('reset-heading')!.textContent='Password saved.';
    message('reset-result','You can now sign in to your owner dashboard.');
    const signIn=document.getElementById('reset-signin') as HTMLAnchorElement;
    signIn.classList.add('button');
    signIn.textContent='Sign in to owner dashboard';
    signIn.focus();
  },'reset-result');
});
