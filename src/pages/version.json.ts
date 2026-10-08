import build from '../generated/build-info.json';
import { publicIdentity } from '../../scripts/version-policy.mjs';

export const prerender = true;
export function GET() {
  return new Response(JSON.stringify(publicIdentity(build)) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
