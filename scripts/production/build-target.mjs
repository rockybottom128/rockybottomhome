/** Only an actual Cloudflare main build selects production resources. */
export function buildConfig(env) {
 if(env.RB_AUTH_DEV==='1')return 'wrangler.auth-dev.json';
 if(env.RB_LOCAL_AUTH==='1')return 'wrangler.auth-local.json';
 if(env.WORKERS_CI==='1' && env.WORKERS_CI_BRANCH==='main' && /^[a-f0-9]{40}$/.test(env.WORKERS_CI_COMMIT_SHA??''))return 'wrangler.production.json';
 return 'wrangler.json';
}
