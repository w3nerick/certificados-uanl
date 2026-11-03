/**
 * Administración del contrato con la cuenta admin (la que lo desplegó). Pide la frase
 * semilla sin eco, simula y solo firma si escribes CONFIRMAR.
 *
 *   npm run admin -- emisor <usuario|SS58|0x…>            da permiso de emitir y aprobar
 *   npm run admin -- emisor <usuario|SS58|0x…> --quitar   lo quita
 *   npm run admin -- revocar <folio> "<motivo>"           revoca un certificado (el admin también es emisor)
 *
 * Revocar no borra nada: el certificado sigue en la cadena marcado como revocado, con su motivo,
 * y deja de contar como válido en la app. No se puede deshacer.
 */
import { readFileSync } from 'node:fs';
import { createClient, AccountId, type PolkadotClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import type { Hex } from 'viem';
import { conectar, leer, simular, enviar, cuentaDeSemilla, h160De, type Simulacion } from './cadena';
import { preguntar, secreto } from './terminal';

const USO = 'Uso:\n  npm run admin -- emisor <usuario|SS58|0x…> [--quitar]\n  npm run admin -- revocar <folio> "<motivo>"';
const CERO = '0x0000000000000000000000000000000000000000';
const MAX_TEXTO = 256;

const [accion, ...resto] = process.argv.slice(2).filter((a) => a !== '--quitar');
const QUITAR = process.argv.includes('--quitar');
const { devnet } = JSON.parse(readFileSync('contract/deployments.json', 'utf8')) as { devnet: { address: Hex; deployer: string } };
const contrato = devnet.address;

interface Certificado {
  nombre: string;
  programa: string;
  titular: Hex;
  reclamadoEn: bigint;
  revocado: boolean;
}

async function aH160(client: PolkadotClient, t: string): Promise<{ h160: Hex; etiqueta: string }> {
  if (/^0x[0-9a-fA-F]{40}$/.test(t)) return { h160: t.toLowerCase() as Hex, etiqueta: t };
  try {
    AccountId().enc(t);
    return { h160: await h160De(client, t), etiqueta: t };
  } catch { /* no es SS58: es un usuario */ }
  const people = createClient(getWsProvider(['wss://people-paseo.rotko.net', 'wss://people-paseo.gatotech.network']));
  try {
    const owner = (await people.getUnsafeApi().query.Resources.UsernameOwnerOf.getValue(new TextEncoder().encode(t.replace(/\.dot$/, '')))) as string | undefined;
    if (!owner) throw new Error(`No hay ninguna cuenta con el usuario «${t}».`);
    return { h160: await h160De(client, owner), etiqueta: `${t} (${owner})` };
  } finally {
    people.destroy();
  }
}

/** Pide CONFIRMAR y la frase del admin; firma la llamada ya simulada y espera a que se finalice. */
async function firmarComoAdmin(client: PolkadotClient, sim: Extract<Simulacion, { ok: true }>, que: string): Promise<number> {
  if ((await preguntar(`\nEscribe CONFIRMAR para ${que}: `)) !== 'CONFIRMAR') throw new Error('Cancelado. No se firmó nada.');
  const admin = cuentaDeSemilla(await secreto('Frase semilla del admin (no se muestra): '));
  if (admin.address !== devnet.deployer) throw new Error(`Esa frase es de ${admin.address}, no del admin ${devnet.deployer}.`);
  return (await enviar(client, admin.signer, contrato, sim, { hasta: 'final' })).bloque;
}

async function emisor(client: PolkadotClient, quien: string): Promise<void> {
  const { h160, etiqueta } = await aH160(client, quien);
  const ya = await leer<boolean>(client, contrato, 'emisores', [h160]);
  console.log(`Contrato ${contrato}\nCuenta   ${etiqueta}\n         ${h160}\nEmisor   ${ya ? 'sí' : 'no'}`);
  if (ya === !QUITAR) return console.log('Nada que cambiar.');
  const sim = await simular(client, devnet.deployer, contrato, 'cambiarEmisor', [h160, !QUITAR]);
  if (!sim.ok) throw new Error(`La simulación falló: ${sim.why}`);
  const bloque = await firmarComoAdmin(client, sim, `${QUITAR ? 'quitar' : 'dar'} el permiso de emisor`);
  console.log(`Listo en el bloque ${bloque}: emisor = ${await leer<boolean>(client, contrato, 'emisores', [h160])}`);
}

async function revocar(client: PolkadotClient, folio: string, motivo: string): Promise<void> {
  if (!/^[1-9]\d*$/.test(folio)) throw new Error(`Folio inválido: «${folio}».`);
  motivo = motivo.trim();
  if (!motivo) throw new Error('Falta el motivo (va público en la cadena). Ejemplo: "Reemitido con el nombre corregido como folio 29"');
  if (new TextEncoder().encode(motivo).length > MAX_TEXTO) throw new Error(`El motivo pasa de ${MAX_TEXTO} bytes.`);
  const id = BigInt(folio);
  const total = await leer<bigint>(client, contrato, 'total');
  if (id > total) throw new Error(`No existe el folio ${folio} (hay ${total}).`);
  const c = await leer<Certificado>(client, contrato, 'certificado', [id]);
  console.log(`Contrato ${contrato}\nFolio    ${folio}\nNombre   ${c.nombre}\nPrograma ${c.programa}\nTitular  ${c.titular === CERO ? 'ninguno (nadie lo ha reclamado)' : c.titular}\nRevocado ${c.revocado ? 'sí' : 'no'}`);
  if (c.revocado) return console.log(`Ya estaba revocado: «${await leer<string>(client, contrato, 'motivoRevocacion', [id])}». Nada que cambiar.`);
  console.log(`Motivo   «${motivo}»  (público, no se puede cambiar ni deshacer)`);
  const sim = await simular(client, devnet.deployer, contrato, 'revocar', [id, motivo]);
  if (!sim.ok) throw new Error(`La simulación falló: ${sim.why}`);
  const bloque = await firmarComoAdmin(client, sim, `revocar el folio ${folio}`);
  const despues = await leer<Certificado>(client, contrato, 'certificado', [id]);
  console.log(`Listo en el bloque ${bloque}: revocado = ${despues.revocado ? 'sí' : 'no'}, motivo «${await leer<string>(client, contrato, 'motivoRevocacion', [id])}»`);
}

if (!((accion === 'emisor' && resto.length === 1) || (accion === 'revocar' && resto.length >= 1 && !QUITAR))) {
  console.error(USO);
  process.exit(1);
}
const client = conectar();
try {
  if (accion === 'emisor') await emisor(client, resto[0]);
  else await revocar(client, resto[0], resto.slice(1).join(' '));
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  client.destroy();
}
process.exit();
