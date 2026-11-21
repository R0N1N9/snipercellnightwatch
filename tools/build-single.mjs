// Builds dist/sniper-cell.html: the whole game in one file that runs when opened directly (file://).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => resolve(root, p);

// Worlds and transitions still flagged wip in the registry are left out of the bundle:
// they may be half-written, and matches never visit them anyway.
const wip = new Set();
for (const line of readFileSync(r('src/multiverse/registry.js'), 'utf8').split('\n')) {
  const m = /wip: true.*import\('([^']+)'\)/.exec(line);
  if (m) wip.add(m[1]);
}

const result = await build({
  entryPoints: [r('src/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: ['es2020', 'safari15'],
  alias: { three: r('vendor/three.module.js') },
  plugins: [{
    name: 'three-addons',
    setup(b) {
      b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: r('vendor/addons/' + a.path.slice('three/addons/'.length)) }));
      // The registry lists worlds and transitions that are not built yet (wip): bundle a
      // stub for those, so loading one fails cleanly instead of breaking the build.
      b.onResolve({ filter: /^\.\/(dimensions|transitions)\// }, (a) => {
        const file = resolve(a.resolveDir, a.path);
        return existsSync(file) && !wip.has(a.path) ? null : { path: file, namespace: 'missing-module' };
      });
      b.onLoad({ filter: /.*/, namespace: 'missing-module' }, () => ({ contents: 'export default null;', loader: 'js' }));
    },
  }],
  logLevel: 'warning',
});
const js = result.outputFiles[0].text;
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
const css = ['style.css', 'src/multiverse/multiverse.css', 'src/multiverse/input.css', 'src/cell/cell.css'].map((f) => readFileSync(r(f), 'utf8')).join('\n');
const peer = readFileSync(r('vendor/peerjs.min.js'), 'utf8');
const icon = 'data:image/svg+xml;base64,' + Buffer.from(readFileSync(r('icon.svg'))).toString('base64');
let html = readFileSync(r('index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${icon}" type="image/svg+xml" />`)
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace(/<link rel="stylesheet" href="style\.css(\?[^"]*)?" \/>/, () => `<style>\n${css}\n</style>`)
  .replace(/\s*<link rel="stylesheet" href="src\/(multiverse|cell)\/[^"]+" \/>/g, '')
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace('<script src="vendor/peerjs.min.js"></script>', () => `<script>${esc(peer)}</script>`)
  .replace(/<script type="module" src="src\/main\.js(\?[^"]*)?"><\/script>/, () => `<script>${esc(js)}</script>`);
mkdirSync(r('dist'), { recursive: true });
writeFileSync(r('dist/sniper-cell.html'), html);
console.log(`dist/sniper-cell.html  ${(html.length / 1024).toFixed(0)} KB`);
