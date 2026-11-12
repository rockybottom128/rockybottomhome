import { env } from 'cloudflare:workers';
export {waitUntil} from 'cloudflare:workers';
import type { AppEnv } from './env';
export function runtime():Partial<AppEnv> { return env as unknown as Partial<AppEnv>; }
