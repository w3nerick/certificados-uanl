// ¿Quedó todo el deploy on-chain, y hasta cuándo? Córrelo justo después de `npm run deploy`
// (sin volver a compilar: usa el manifest que `pad` deja en dist/.bulletin-deploy/).
//
//   npm run check-deploy
//   npm run check-deploy -- --nombre otra-app --dist ../otra-app/dist     (revisar otra app)
//
// 1. DotNS: el CID al que apunta el nombre (con el CLI `dotns`).
// 2. Reconstruye desde dist/ los chunks del deploy con el mismo código de `pad` y comprueba que dan
//    ese CID.
// 3. Bulletin: busca la raíz y cada chunk en TransactionStorage.TransactionByContentHash, que dice en
//    qué bloque se guardó cada uno; de ahí sale cuándo caduca.
// 4. Gateway IPFS y dev-dot.li: el deploy se puede bajar y es idéntico a dist/.
//
// `pad` no vuelve a subir los chunks que ya venían en el deploy anterior: conservan la caducidad de su
// primera subida. La fecha que importa es «lo primero que caduca». Sale con 0 si todo está, 1 si no.
// Adaptado de testalk (app/scripts/check-deploy.ts).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { Blake2128Concat, Twox128 } from '@polkadot-api/substrate-bindings';
import { CID } from 'multiformats/cid';
import config from '../polkadot-app-deploy.config.mjs';
import { padImport } from './pad.mjs';

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const LABEL = (arg('--nombre') ?? config.domain).replace(/\.dot$/, '');
const DIST = resolve(arg('--dist') ?? fileURLToPath(new URL('../dist', import.meta.url)));
const BULLETIN_WS = ['wss://bulletin-paseo.tservices.es:8443', 'wss://bullet.sik.rocks'];
const IPFS_GATEWAY = 'https://devnet-ipfs.api.polkadotcommunity.foundation/ipfs';
const WEB = `https://${LABEL}.dev-dot.li`;

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
let fails = 0;
const check = (good, s) => { console.log(`${good ? c.ok('✓') : c.bad('✗')} ${s}`); if (!good) fails++; };

// 1. DotNS
let dotns = '';
try {
  dotns = execFileSync('dotns', ['content', 'view', LABEL, '--env', 'devnet'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' });
} catch { /* sin dotns o sin nombre */ }
const onchain = /cid:\s+(\S+)/.exec(dotns)?.[1];
if (!onchain) { console.error(`dotns no devolvió un CID para ${LABEL}.dot (¿está publicado? ¿tienes dotns instalado?)`); process.exit(1); }
console.log(`${c.bold(`${LABEL}.dot`)} → ${onchain}`);

// 2. Reconstrucción con el código de pad. DotNS no apunta al directorio sino a un nodo que enlaza
//    los chunks del CAR (computeStorageCid).
const manifestPath = resolve(DIST, '.bulletin-deploy/manifest.json');
if (!existsSync(manifestPath)) { console.error(`Falta ${manifestPath}: corre esto justo después de publicar, sin volver a compilar.`); process.exit(1); }
const { merkleizeWithStableOrder } = await padImport('merkle.js');
const { computeStorageCid } = await padImport('deploy.js');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const log = console.log;
console.log = () => {};
const car = await merkleizeWithStableOrder(DIST, manifest.stableBlockOrder, { useKubo: false });
console.log = log;
const root = computeStorageCid(car.chunks);
check(root === onchain, `dist/ reconstruido da el mismo CID ${c.dim(`(${car.chunkCids.length} chunks, ${(car.carBytes.length / 1e6).toFixed(2)} MB)`)}`);

// 3. Bulletin: bloque de cada chunk → caducidad
const client = createClient(getWsProvider(BULLETIN_WS));
const rpc = (method, params = []) => client._request(method, params);
const retention = Number(await client.getUnsafeApi().query.TransactionStorage.RetentionPeriod.getValue());
const current = parseInt((await rpc('chain_getHeader')).number, 16);
const enc = (s) => new TextEncoder().encode(s);
const prefix = Buffer.concat([Twox128(enc('TransactionStorage')), Twox128(enc('TransactionByContentHash'))]);
const key = (cid) => '0x' + Buffer.concat([prefix, Blake2128Concat(CID.parse(cid).multihash.digest)]).toString('hex');
const cids = [root, ...car.chunkCids];
const [changes] = await rpc('state_queryStorageAt', [cids.map(key)]);
client.destroy();
const stored = new Map(changes?.changes ?? []);

// Bloques reales de 6.5 a 7.7 s: las fechas son aproximadas.
const when = (blocks, secs) => new Date(Date.now() + blocks * secs * 1000).toISOString().slice(0, 16).replace('T', ' ');
let first = Infinity;
for (const cid of cids) {
  const v = stored.get(key(cid));
  const name = `${cid === root ? 'raíz ' : 'chunk'} ${cid.slice(0, 20)}…`;
  if (!v || v === '0x') { check(false, `${name} no está en Bulletin`); continue; }
  const block = Buffer.from(v.slice(2), 'hex').readUInt32LE(0);
  const left = block + retention - current;
  first = Math.min(first, left);
  check(left > 0, `${name} bloque ${block} ${c.dim(`→ caduca ~${when(left, 6.9)} UTC`)}`);
}
if (first < Infinity) console.log(`  Lo primero que caduca: en ${first} bloques, ${c.bold(`entre ${when(first, 6.5)} y ${when(first, 7.7)} UTC`)}`);

// 4. El gateway sirve el CID como el CAR completo del deploy.
const sha = (b) => createHash('sha256').update(b).digest('hex');
try {
  const r = await fetch(`${IPFS_GATEWAY}/${onchain}`, { signal: AbortSignal.timeout(120_000) });
  const remote = new Uint8Array(await r.arrayBuffer());
  check(r.ok && sha(remote) === sha(car.carBytes), 'el gateway IPFS entrega el deploy idéntico byte por byte a dist/');
} catch (e) {
  check(false, `gateway IPFS: ${e.message}`);
}
const web = await fetch(WEB, { signal: AbortSignal.timeout(30_000) }).catch((e) => ({ ok: false, status: e.message }));
check(web.ok, `${WEB} responde ${web.status}`);

console.log(fails ? c.bad(`\n${fails} problema(s)`) : c.ok('\nTodo on-chain y legible.'));
process.exit(fails ? 1 : 0);
