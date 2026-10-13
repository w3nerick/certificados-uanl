// Publica la app en el Products Devnet: `pad` sube dist/ y apunta el nombre, y después
// scripts/manifest.mjs publica la ficha (nombre, descripción e ícono) firmando con tu celular.
//
//   npm run deploy                  build + pad + ficha
//   npm run deploy -- --sin-ficha   solo el contenido del nombre. OJO: si la app ya tiene ficha, Desktop
//                                   abre app.<nombre> y seguirá mostrando la versión anterior.
//
// Córrelo en una terminal normal (Terminal.app, PowerShell): `pad` puede pedir que confirmes con Y,
// y en terminales que mandan el proceso a segundo plano esa tecla nunca le llega.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import config from '../polkadot-app-deploy.config.mjs';

const extra = process.argv.slice(2);
const conFicha = !extra.includes('--sin-ficha');
// --env devnet SIEMPRE: el valor por defecto de pad es otra red (paseo-next-v2).
// --no-manifest: el paso de manifest de pad 0.16.7 falla con `pad login` (docs/02-primera-app.md).
const args = ['dist', config.domain, '--env', 'devnet', '--no-manifest', ...extra.filter((a) => a !== '--sin-ficha')];
const shell = process.platform === 'win32';

console.log(`\n$ pad ${args.join(' ')}\n`);
const pad = spawnSync('pad', args, { stdio: 'inherit', shell });
if (pad.status !== 0) process.exit(pad.status ?? 1);
if (!conFicha) process.exit(0);

const ficha = spawnSync(process.execPath, [fileURLToPath(new URL('./manifest.mjs', import.meta.url))], { stdio: 'inherit' });
process.exit(ficha.status ?? 1);
