// Encuentra la instalación global de `pad` y carga sus módulos internos.
//
// scripts/manifest.mjs y scripts/check-deploy.mjs reutilizan piezas de `pad` (firmar con tu sesión,
// reconstruir el CAR de un deploy) en vez de reimplementarlas. Esas piezas no son API pública: si una
// versión nueva de `pad` las cambia, estos scripts fallan al importar y lo dicen.
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PKG = join('@polkadot-community-foundation', 'polkadot-app-deploy');
const win = process.platform === 'win32';

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: win }).trim();
  } catch {
    return '';
  }
}

/** Carpeta `dist/` de pad, probando: el binario en el PATH (también con --prefix ~/.local) y `npm root -g`. */
export function padDist() {
  const candidates = [];
  if (win) {
    // C:\Users\…\AppData\Roaming\npm\pad.cmd → …\npm\node_modules\@polkadot-community-foundation\polkadot-app-deploy
    const bin = run('where', ['pad']).split(/\r?\n/)[0];
    if (bin) candidates.push(join(dirname(bin), 'node_modules', PKG, 'dist'));
  } else {
    // …/bin/pad → …/lib/node_modules/@polkadot-community-foundation/polkadot-app-deploy/bin/polkadot-app-deploy
    const bin = run('sh', ['-c', 'command -v pad']);
    if (bin) candidates.push(join(dirname(dirname(realpathSync(bin))), 'dist'));
  }
  const root = run('npm', ['root', '-g']);
  if (root) candidates.push(join(root, PKG, 'dist'));
  const found = candidates.find((d) => existsSync(join(d, 'deploy.js')));
  if (!found) throw new Error('No encontré la instalación de pad. Instálalo con: npm i -g @polkadot-community-foundation/polkadot-app-deploy@latest');
  return found;
}

/** Importa un módulo interno de pad (`deploy.js`, `merkle.js`…). */
export function padImport(file) {
  return import(pathToFileURL(join(padDist(), file)).href);
}
