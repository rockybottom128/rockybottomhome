import {validateAuthDevConfig, validateAuthDevBranch} from './auth-dev-policy.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
process.chdir(root);
const config='wrangler.auth-dev.json';
const check=file=>validateAuthDevConfig(JSON.parse(readFileSync(file,'utf8')));
const branch=process.env.WORKERS_CI_BRANCH || execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
validateAuthDevBranch(branch);
check(config);
const run=(args,env=process.env)=>execFileSync(process.execPath,args,{stdio:'inherit',env});
const action=process.argv[2];
if(action==='build'){
 run(['node_modules/astro/bin/astro.mjs','build'],{...process.env,RB_AUTH_DEV:'1',RB_LOCAL_AUTH:'0'});
 check('dist/server/wrangler.json');
}else if(action==='deploy'){
 check('dist/server/wrangler.json');
 // Apply only pending development migrations; never recreate the DB or reset settings.
 run(['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--remote','--config',config]);
 run(['node_modules/wrangler/bin/wrangler.js','deploy','--config','dist/server/wrangler.json']);
}else if(action==='check'){
 check('dist/server/wrangler.json');
 console.log('PASS: isolated development Worker, origin, database and branch');
}else throw Error('Use build, deploy or check');
