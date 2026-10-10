import assert from 'node:assert/strict';
export function createDevSnapshot(git,source,previous,branch){
 // Retain dev ancestry, but use only the approved feature's tree. A concurrent
 // dev update will cause the ordinary fast-forward push to fail safely.
 if(source === previous)return source;
 const commit=git('commit-tree',`${source}^{tree}`,'-p',source,'-p',previous,'-m',`Test ${branch} at ${source} on shared development site`);
 assert.equal(git('rev-parse',`${commit}^{tree}`),git('rev-parse',`${source}^{tree}`));
 return commit;
}
