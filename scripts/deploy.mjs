// Publica la app en el Products Devnet con pad 0.22.1: sube dist/, apunta el nombre y publica la ficha
// (nombre, descripción, ícono y app.<nombre> con su executable) en la misma corrida.
//
//   npm run deploy                  build + pad con ficha
//   npm run deploy -- --sin-ficha   solo el contenido del nombre (pad --no-manifest)
//
// Córrelo en una terminal normal (Terminal.app, PowerShell): `pad` puede pedir que confirmes con Y,
// y en terminales que mandan el proceso a segundo plano esa tecla nunca le llega.
import { spawnSync } from 'node:child_process';
import config from '../polkadot-app-deploy.config.mjs';

const extra = process.argv.slice(2);
const conFicha = !extra.includes('--sin-ficha');
// --env devnet SIEMPRE: el valor por defecto de pad es otra red (paseo-next-v2).
// --js-merkle: no hace falta el binario de IPFS Kubo.
const args = ['dist', config.domain, '--env', 'devnet', '--js-merkle', ...(conFicha ? [] : ['--no-manifest']), ...extra.filter((a) => a !== '--sin-ficha')];
const shell = process.platform === 'win32';

console.log(`\n$ pad ${args.join(' ')}\n`);
const pad = spawnSync('pad', args, { stdio: 'inherit', shell });
process.exit(pad.status ?? 1);
