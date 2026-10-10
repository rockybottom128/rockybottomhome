import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createDevSnapshot} from './dev-snapshot.mjs';
import {validateFeatureBranch} from './auth-dev-policy.mjs';
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(process.argv[2],'--publish','This publishes the approved committed batch. Run npm run publish:dev -- --publish only with user authorization.');
assert.equal(git('remote','get-url','--push','origin'),'https://github.com/rockybottom128/rockybottomhome.git','Unexpected publication repository');
const branch=git('branch','--show-current');
validateFeatureBranch(branch);
assert.equal(git('status','--porcelain'),'','Commit or resolve local changes before publishing');
const source=git('rev-parse','HEAD');
git('fetch','origin','main');
git('merge-base','--is-ancestor','origin/main',source);
execFileSync(process.execPath,['scripts/versioning.mjs','check'],{stdio:'inherit'});
const existing=git('ls-remote','origin','refs/heads/dev');
let deployment=source;
if(existing){
 git('fetch','origin','refs/heads/dev');
 const previous=git('rev-parse','FETCH_HEAD');
 deployment=createDevSnapshot(git,source,previous,branch);
}
execFileSync('git',['push','--atomic','origin',`${source}:refs/heads/${branch}`,`${deployment}:refs/heads/dev`],{stdio:'inherit'});
console.log(`Published feature ${source} and dev ${deployment}. Wait for the dev Cloudflare build and verify /version.json before reporting deployment success.`);
