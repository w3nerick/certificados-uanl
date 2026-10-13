// Revisión antes de publicar. Sin dependencias. Falla (exit 1) si algo rompería la app.
//
//   npm run check
//
// 1. El SDK está fijado a versiones exactas y habla el códec del host (1 en sep–oct 2026).
// 2. El nombre cumple las reglas de DotNS y no pide personhood.
// 3. El ícono existe, es PNG o JPEG y mide 512×512.
// 4. Vite usa rutas relativas.
// 5. dist/ no trae archivos que nadie pide (pad los sube igual).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../polkadot-app-deploy.config.mjs';
import { checkLabel } from './nombre.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CODEC = 1;
const PINNED = ['@parity/product-sdk-host', '@parity/product-sdk-signer', '@parity/product-sdk-statement-store'];

let fails = 0;
const ok = (m) => console.log(`✓ ${m}`);
const warn = (m) => console.log(`! ${m}`);
const fail = (m) => { fails++; console.log(`✗ ${m}`); };


const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// 1. SDK
for (const name of PINNED) {
  const v = pkg.dependencies?.[name];
  if (!v) continue;
  if (/^\d+\.\d+\.\d+$/.test(v)) ok(`${name} fijado en ${v}`);
  else fail(`${name} es "${v}": fíjalo exacto (sin ^ ni ~). Una actualización puede cambiar el códec y el host deja de contestar`);
}
const client = join(ROOT, 'node_modules/@parity/truapi/dist/generated/client.js');
if (existsSync(client)) {
  const codec = Number(/TRUAPI_CODEC_VERSION = (\d+)/.exec(readFileSync(client, 'utf8'))?.[1]);
  if (codec === CODEC) ok(`códec del protocolo: ${codec}`);
  else fail(`códec del protocolo: ${codec}, el host espera ${CODEC} (docs/03-contenedor.md)`);
  const copies = [];
  const walk = (dir, depth) => {
    if (depth > 6 || !existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      if (e === '@parity') { if (existsSync(join(dir, e, 'truapi/package.json'))) copies.push(join(dir, e, 'truapi')); }
      const p = join(dir, e, 'node_modules');
      if (existsSync(p)) walk(p, depth + 1);
      if (e.startsWith('@')) for (const s of readdirSync(join(dir, e))) { const q = join(dir, e, s, 'node_modules'); if (existsSync(q)) walk(q, depth + 1); }
    }
  };
  walk(join(ROOT, 'node_modules'), 0);
  if (copies.length <= 1) ok('una sola copia de @parity/truapi');
  else fail(`${copies.length} copias de @parity/truapi: dos códecs en el mismo bundle (npm ls @parity/truapi)`);
} else warn('sin node_modules: corre npm install para revisar el códec');

// 2. Nombre
const label = String(config.domain ?? '').replace(/\.dot$/, '');
const l = checkLabel(label);
if (l.ok) ok(`${config.domain}: ${l.why}`);
else fail(`${config.domain}: ${l.why}`);
if (label === 'mi-primera-app-dot') warn('sigues con el nombre de la plantilla: cámbialo en polkadot-app-deploy.config.mjs');

// 3. Ícono
const iconPath = join(ROOT, config.icon?.path ?? 'icon.png');
if (!existsSync(iconPath)) fail(`falta el ícono ${config.icon?.path}`);
else {
  const b = readFileSync(iconPath);
  const isPng = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = b[0] === 0xff && b[1] === 0xd8;
  if (!(isPng || isJpeg)) fail('el ícono debe ser PNG o JPEG');
  else if ((isPng ? 'png' : 'jpeg') !== config.icon.format) fail(`el ícono es ${isPng ? 'png' : 'jpeg'} pero la config dice ${config.icon.format}`);
  else if (isPng) {
    const w = b.readUInt32BE(16);
    const h = b.readUInt32BE(20);
    if (w === 512 && h === 512) ok(`ícono PNG 512×512 (${(b.length / 1024).toFixed(1)} KB)`);
    else warn(`ícono de ${w}×${h}: se recomienda 512×512`);
  } else ok('ícono JPEG');
}

// 4. Vite
const vite = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
if (/base:\s*['"]\.\/['"]/.test(vite)) ok("vite usa base: './'");
else fail("vite.config.ts necesita base: './' (la app se sirve desde un hash, no desde /)");

// 5. dist/
const dist = join(ROOT, 'dist');
if (existsSync(dist)) {
  let total = 0;
  const big = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else { total += s.size; if (s.size > 1024 * 1024 || e.endsWith('.wasm')) big.push(`${p.slice(dist.length + 1)} (${(s.size / 1048576).toFixed(1)} MB)`); }
    }
  };
  walk(dist);
  const mb = total / 1048576;
  (mb > 5 ? warn : ok)(`dist/ pesa ${mb.toFixed(2)} MB${mb > 5 ? ': ¿todo se usa? pad sube cada archivo' : ''}`);
  for (const f of big) warn(`archivo grande: ${f}`);
}

console.log(fails ? `\n${fails} problema(s).` : '\nTodo en orden.');
process.exit(fails ? 1 : 0);
