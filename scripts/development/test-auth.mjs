import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, symlinkSync, openSync, closeSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const home=resolve(root,'.auth-test');mkdirSync(home,{recursive:true});
const work=mkdtempSync(resolve(home,'isolated-'));
const log=resolve(work,'test.log'), fd=openSync(log,'w');
let worker;
try {
 execFileSync('git',['clone','--quiet','--shared','--no-hardlinks',root,work+'/repo'],{stdio:['ignore',fd,fd]});
 const cwd=work+'/repo';
 const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root}).toString().split('\0').filter(Boolean);
 for(const file of files){mkdirSync(dirname(resolve(cwd,file)),{recursive:true});copyFileSync(resolve(root,file),resolve(cwd,file));}
 symlinkSync(resolve(root,'node_modules'),resolve(cwd,'node_modules'),'dir');
 const c=JSON.parse(readFileSync(resolve(cwd,'wrangler.auth-local.json'),'utf8'));
 c.vars.APP_ORIGIN='http://127.0.0.1:4325';
 writeFileSync(resolve(cwd,'wrangler.auth-local.json'),JSON.stringify(c));
 writeFileSync(resolve(cwd,'.dev.vars'),['AUTH_SECRET','OTP_SECRET','BOOTSTRAP_TOKEN'].map(key=>key+'='+randomBytes(32).toString('hex')).join('\n')+'\n',{mode:0o600});
 const env={...process.env,RB_LOCAL_AUTH:'1',RB_AUTH_DEV:'0',RB_ISOLATED_AUTH_TEST:'1',ASTRO_TELEMETRY_DISABLED:'1',XDG_CONFIG_HOME:resolve(work,'config')};
 // Do not inherit real mail configuration into the fixture Worker.
 for(const key of ['RESEND_API_KEY','MAIL_MODE','MAIL_ALLOWED_RECIPIENTS','AUTH_SECRET','OTP_SECRET','BOOTSTRAP_TOKEN','WRANGLER_SEND_METRICS'])delete env[key];
 const run=args=>execFileSync(process.execPath,args,{cwd,env,stdio:['ignore',fd,fd]});
 run(['node_modules/astro/bin/astro.mjs','build']);
 run(['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config','wrangler.auth-local.json']);
 worker=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--port','4325','--ip','127.0.0.1','--inspector-port','9245','--persist-to','.wrangler/state'],{cwd,env,stdio:['ignore',fd,fd]});
 let ready=false;
 for(let i=0;i<60;i++){
  if(worker.exitCode!==null)throw Error('Fixture server exited');
  try{const r=await fetch(c.vars.APP_ORIGIN+'/owner/');if(r.ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,500));
 }
 if(!ready)throw Error('Fixture server did not start');
 run(['tests/auth-integration.mjs']);
 console.log('PASS: isolated owner authentication, email verification, dashboard and demo gate. No real mail or preview records touched.');
}catch(error){
 console.error('Authentication integration failed. Local diagnostic log: '+log);
 process.exitCode=1;
}finally{
 if(worker && worker.exitCode===null){worker.kill('SIGTERM');await new Promise(r=>worker.once('exit',r));}
 closeSync(fd);
 if(!process.exitCode)rmSync(work,{recursive:true,force:true});
}
