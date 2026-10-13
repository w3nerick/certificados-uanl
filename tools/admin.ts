/**
 * Administración del contrato con la cuenta admin (la que lo desplegó). Pide la frase
 * semilla sin eco, simula y solo firma si escribes CONFIRMAR.
 *
 *   npm run admin -- emisor <usuario|SS58|0x…>            da permiso de emitir y aprobar
 *   npm run admin -- emisor <usuario|SS58|0x…> --quitar   lo quita
 */
import { readFileSync } from 'node:fs';
import { createClient, AccountId } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import type { Hex } from 'viem';
import { conectar, leer, simular, enviar, cuentaDeSemilla, h160De } from './cadena';
import { preguntar, secreto } from './terminal';

const [accion, quien] = process.argv.slice(2);
const QUITAR = process.argv.includes('--quitar');
if (accion !== 'emisor' || !quien) {
  console.error('Uso: npm run admin -- emisor <usuario|SS58|0x…> [--quitar]');
  process.exit(1);
}
const { devnet } = JSON.parse(readFileSync('contract/deployments.json', 'utf8')) as { devnet: { address: Hex; deployer: string } };
const contrato = devnet.address;
const client = conectar();

async function aH160(t: string): Promise<{ h160: Hex; etiqueta: string }> {
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

try {
  const { h160, etiqueta } = await aH160(quien);
  const ya = await leer<boolean>(client, contrato, 'emisores', [h160]);
  console.log(`Contrato ${contrato}\nCuenta   ${etiqueta}\n         ${h160}\nEmisor   ${ya ? 'sí' : 'no'}`);
  if (ya === !QUITAR) {
    console.log('Nada que cambiar.');
  } else {
    const sim = await simular(client, devnet.deployer, contrato, 'cambiarEmisor', [h160, !QUITAR]);
    if (!sim.ok) throw new Error(`La simulación falló: ${sim.why}`);
    if ((await preguntar(`\nEscribe CONFIRMAR para ${QUITAR ? 'quitar' : 'dar'} el permiso de emisor: `)) !== 'CONFIRMAR') throw new Error('Cancelado. No se firmó nada.');
    const admin = cuentaDeSemilla(await secreto('Frase semilla del admin (no se muestra): '));
    if (admin.address !== devnet.deployer) throw new Error(`Esa frase es de ${admin.address}, no del admin ${devnet.deployer}.`);
    const r = await enviar(client, admin.signer, contrato, sim, { hasta: 'final' });
    console.log(`Listo en el bloque ${r.bloque}: emisor = ${await leer<boolean>(client, contrato, 'emisores', [h160])}`);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  client.destroy();
}
process.exit();
