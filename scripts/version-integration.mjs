import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { check, identity, root } from './versioning.mjs';

export default function versionIntegration() {
  const directory = resolve(root, 'src/generated');
  const target = resolve(directory, 'build-info.json');
  function generate() {
    const value = JSON.stringify(identity(), null, 2) + '\n';
    mkdirSync(directory, { recursive: true });
    let old;
    try { old = readFileSync(target, 'utf8'); } catch {}
    if (old !== value) writeFileSync(target, value);
  }
  return {
    name: 'rockybottom-site-version',
    hooks: {
      'astro:config:setup': () => { check(); generate(); },
      'astro:server:setup': ({ server }) => {
        let timer;
        const refresh = () => { try { generate(); } catch (error) { server.config.logger.error(`Version metadata: ${error.message}`); } };
        // Git commits/index changes are normally excluded by Vite's file watcher.
        const gitTimer = setInterval(refresh, 2000);
        gitTimer.unref();
        server.watcher.on('all', (_event, path) => {
          const relative = path.replaceAll('\\', '/').slice(root.replaceAll('\\', '/').length);
          if (/^(node_modules|\.git|\.astro|\.wrangler|dist|src\/generated)\//.test(relative)) return;
          clearTimeout(timer);
          timer = setTimeout(refresh, 100);
        });
        server.httpServer?.once('close', () => { clearTimeout(timer); clearInterval(gitTimer); });
      },
    },
  };
}
