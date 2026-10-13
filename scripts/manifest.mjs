// Publica la ficha de la app en la Polkadot App (nombre, descripción e ícono) firmando con tu
// sesión de `pad login`. Probado con pad 0.16.7 el 1 oct 2026 (Lotería en Cadena).
//
//   npm run manifest                (lo llama `npm run deploy` después de `pad … --no-manifest`)
//   npm run manifest -- --revisar   (no escribe: muestra qué haría, la cuenta y el saldo)
//   npm run manifest -- --quitar    (borra el manifest: la app vuelve a abrir el contenido del nombre)
//
// Por qué existe: el paso de manifest de pad 0.16.7 firma con la cuenta del worker DESPUÉS de
// traspasarte el nombre, y se revierte («revert during setText»). Este script usa las mismas piezas
// de pad que ya firman con tu celular. Depende de archivos internos de pad: si una versión nueva de
// pad lo rompe, revisa docs/09-experto.md.
//
// Con manifest, Polkadot Desktop y la Polkadot App ya NO abren el contenido del nombre: abren el de
// app.<nombre>, y solo si tiene su registro `executable`. Por eso el orden es: subir el ícono →
// app.<nombre> con el mismo contenido → `executable` → manifest. Si algo falla a la mitad, el manifest
// no se escribe y la app sigue abriendo como antes.
//
// Firmas en el celular: 4 la primera vez; 1 en cada versión nueva (el contenido de app.<nombre>).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blake2b } from '@noble/hashes/blake2.js';
import config from '../polkadot-app-deploy.config.mjs';
import { padImport } from './pad.mjs';

const ENV = 'devnet';
const revisar = process.argv.includes('--revisar');
const quitar = process.argv.includes('--quitar');

// CID del ícono igual que pad: versión 1 · códec raw (0x55) · blake2b-256 (0xb220 = a0 e4 02) · 32 bytes
function iconCid(bytes) {
  const digest = blake2b(bytes, { dkLen: 32 });
  const cid = Uint8Array.from([0x01, 0x55, 0xa0, 0xe4, 0x02, 0x20, ...digest]);
  const A = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let val = 0;
  let out = 'b';
  for (const b of cid) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += A[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += A[(val << (5 - bits)) & 31];
  return out;
}

const root = fileURLToPath(new URL('..', import.meta.url));
const iconBytes = readFileSync(join(root, config.icon.path));
const cid = iconCid(iconBytes);
const manifest = JSON.stringify({ $v: 1, displayName: config.displayName, description: config.description, icon: { cid, format: config.icon.format } });
const app = config.executables.find((e) => e.kind === 'app');
const executable = JSON.stringify({ $v: 1, kind: 'app', appVersion: app.appVersion });
const label = config.domain.replace(/\.dot$/, '');
const APP = `app.${label}`;

// Las piezas de pad que ya firman con tu celular (instalación global de pad)
const { DotNS } = await padImport('index.js');
const { resolveDotnsConnectOptions, storeFile, setBulletinEndpoints, resolveBulletinEndpoints, BLAKE2B_256_MULTIHASH_CODE } = await padImport('deploy.js');
const { getAuthClient } = await padImport('auth-config.js');
const { resolveSigner } = await padImport('auth/index.js');
const { loadEnvironments, resolveEndpoints, getPopSelfServeConfig } = await padImport('environments.js');

const { doc } = await loadEnvironments();
const env = resolveEndpoints(doc, ENV);
const owner = await resolveSigner(await getAuthClient(ENV), {});
const dotns = new DotNS();
const fmt = (x) => `${(Number(x) / 1e10).toFixed(4)} PAS`;
try {
  await dotns.connect({
    ...resolveDotnsConnectOptions(
      { signer: owner.signer, signerAddress: owner.address },
      env.assetHub,
      env.autoAccountMapping,
      env.contracts,
      env.nativeToEthRatio,
      ENV,
      getPopSelfServeConfig(doc, ENV),
      env.registerStorageDeposit,
      env.tld,
    ),
    phoneSigner: true,
  });

  const text = (name, key) => dotns.getTextRecord(name, key).catch(() => null);
  const rootHash = await dotns.getContenthash(label);
  const sub = await dotns.checkSubdomainOwnership('app', label);
  const appHash = sub.owned ? await dotns.getContenthash(APP).catch(() => '0x') : null;
  const execNow = sub.owned ? await text(APP, 'executable') : null;
  const manifestNow = await text(label, 'manifest');
  const free = await dotns.readFreeBalance(owner.address).catch(() => null);

  console.log(`\nFicha de ${config.domain} · firma ${owner.address}${free === null ? '' : ` · saldo ${fmt(free)}`}`);
  console.log(`  contenido del nombre:  ${rootHash}`);
  console.log(`  ${APP}.dot:  ${sub.owned ? `tuyo · contenido ${appHash === rootHash ? 'igual ✓' : appHash}` : sub.owner ? `de otra cuenta (${sub.owner})` : 'no existe'}`);
  console.log(`  executable:  ${execNow === executable ? 'igual ✓' : execNow || '(vacío)'}`);
  console.log(`  manifest:    ${manifestNow === manifest ? 'igual ✓' : manifestNow || '(vacío)'}\n`);

  if (quitar) {
    if (!manifestNow) console.log('✓ No hay manifest: nada que quitar.');
    else {
      dotns.setPhoneSignatureTotal?.(1);
      await dotns.setTextRecord(label, 'manifest', '');
      console.log(`✓ Manifest quitado: la app vuelve a abrir el contenido de ${config.domain}`);
    }
  } else {
    if (!rootHash || rootHash === '0x') throw new Error(`${config.domain} no tiene contenido: primero npm run deploy`);
    if (sub.owner && !sub.owned) throw new Error(`${APP}.dot es de ${sub.owner}, no de la cuenta que firma`);
    const pasos = [
      !sub.owned && 'crear el subnombre app.',
      appHash !== rootHash && 'apuntar app. al contenido publicado',
      execNow !== executable && 'escribir el registro executable',
      manifestNow !== manifest && 'escribir el manifest (nombre, descripción e ícono)',
    ].filter(Boolean);
    console.log(pasos.length ? `Firmas en el celular (${pasos.length}):\n${pasos.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}\n` : '✓ Todo está al día.');
    if (revisar) {
      console.log(pasos.length ? '(--revisar: no se escribió nada)' : '');
    } else {
      // El ícono vive en Bulletin y caduca como la app. Si sigue ahí, storeFile no lo vuelve a subir
      // (conserva su caducidad original); si ya caducó, lo sube de nuevo con el mismo CID.
      // pad elige al azar una de sus 10 cuentas del pool y casi todas están sin autorización en
      // Bulletin (oct 2026). Se fija la 0, autorizada hasta ≈27 oct; si vence, prueba otra con
      // BULLETIN_POOL_ACCOUNT_INDEX=<n> (consulta con `npm run autorizacion` de la guía).
      process.env.BULLETIN_POOL_ACCOUNT_INDEX ??= '0';
      setBulletinEndpoints(resolveBulletinEndpoints(env.bulletin));
      console.log(`Subiendo icon.png (${iconBytes.length} B) a Bulletin…`);
      const subido = await storeFile(iconBytes, { hashCode: BLAKE2B_256_MULTIHASH_CODE });
      if (subido !== cid) throw new Error(`Bulletin devolvió ${subido} y el manifest espera ${cid}`);
      if (pasos.length) {
        dotns.setPhoneSignatureTotal?.(pasos.length);
        if (!sub.owned) await dotns.registerSubdomain('app', label);
        if (appHash !== rootHash) await dotns.setContenthash(APP, rootHash, { feeAsset: 'pgas' });
        await dotns.setTextRecord(APP, 'executable', executable);
        await dotns.setTextRecord(label, 'manifest', manifest);
      }
      console.log(`✓ Ficha publicada: ${config.displayName} con su ícono (${cid})`);
    }
  }
} finally {
  try { dotns.disconnect(); } catch {}
  try { owner.destroy(); } catch {}
}
process.exit(0);
