import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createDevSnapshot} from '../scripts/development/dev-snapshot.mjs';
const cwd=mkdtempSync(join(tmpdir(),'rocky-dev-snapshot-'));
const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try{
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.com');
 writeFileSync(join(cwd,'content'),'base');git('add','.');git('commit','-m','base');const base=git('rev-parse','HEAD');
 writeFileSync(join(cwd,'old-only'),'must not leak');git('add','.');git('commit','-m','previous batch');const previous=git('rev-parse','HEAD');
 git('checkout','--detach',base);writeFileSync(join(cwd,'content'),'new approved batch');git('add','.');git('commit','-m','new batch');const source=git('rev-parse','HEAD');
 const snapshot=createDevSnapshot(git,source,previous,'karen/photos');
 assert.equal(git('rev-parse',`${snapshot}^{tree}`),git('rev-parse',`${source}^{tree}`));
 assert.equal(git('show',`${snapshot}:content`),'new approved batch');
 assert.throws(()=>git('show',`${snapshot}:old-only`));
 git('merge-base','--is-ancestor',previous,snapshot);
 assert.equal(git('rev-parse','HEAD'),source,'Feature branch must stay unchanged');
 assert.equal(createDevSnapshot(git,source,source,'karen/photos'),source);
 // A second contributor's intervening update is not an ancestor of our snapshot.
 const concurrent=git('commit-tree',`${previous}^{tree}`,'-p',previous,'-m','concurrent batch');
 assert.throws(()=>git('merge-base','--is-ancestor',concurrent,snapshot));
 console.log('PASS: exact feature contents, preserved dev history, untouched feature, concurrent push protection');
}finally{rmSync(cwd,{recursive:true,force:true});}
