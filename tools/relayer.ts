/**
 * Cuenta del relayer (la que paga los reclamos de los estudiantes).
 *
 *   npm run relayer -- nueva    Crea una cuenta nueva. La frase queda SOLO en .env.relayer (fuera de git)
 *                               y en pantalla sale solo la dirección.
 *   npm run relayer -- estado   Dirección, saldo y si ya está mapeada en pallet-revive.
 *   npm run relayer -- mapear   Revive.map_account (una vez, antes del primer reclamo). Pide escribir MAPEAR.
 *
 * Para Vercel: `vercel env add RELAYER_SEED production < .env.relayer` sube la frase sin mostrarla.
 * Esta cuenta no tiene ningún rol en el contrato; si se filtra, solo se pierde su saldo de comisiones.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateMnemonic } from '@polkadot-labs/hdkd-helpers';
import { conectar, cuentaDeSemilla, saldoLibre, estaMapeada, pas } from './cadena';
import { preguntar } from './terminal';

const ARCHIVO = '.env.relayer';
const accion = process.argv[2] ?? 'estado';

function leerSemilla(): string {
  if (!existsSync(ARCHIVO)) throw new Error(`No existe ${ARCHIVO}: crea la cuenta con npm run relayer -- nueva`);
  return readFileSync(ARCHIVO, 'utf8').trim();
}

if (accion === 'nueva') {
  if (existsSync(ARCHIVO)) {
    console.error(`${ARCHIVO} ya existe; no lo sobrescribo. Bórralo a mano si de verdad quieres otra cuenta.`);
    process.exit(1);
  }
  const frase = generateMnemonic(128);
  writeFileSync(ARCHIVO, frase + '\n', { mode: 0o600 });
  console.log(`Cuenta del relayer: ${cuentaDeSemilla(frase).address}`);
  console.log(`La frase quedó en ${ARCHIVO} (solo tú puedes leerla). Fondéala en https://faucet.polkadot.io (Asset Hub, Paseo).`);
  process.exit(0);
}

const cuenta = cuentaDeSemilla(leerSemilla());
const client = conectar();
try {
  const [saldo, mapeada] = await Promise.all([saldoLibre(client, cuenta.address), estaMapeada(client, cuenta.address)]);
  console.log(`Relayer ${cuenta.address}\nSaldo   ${pas(saldo)}\nMapeada ${mapeada ? 'sí' : 'no'}`);
  if (accion === 'mapear') {
    if (mapeada) console.log('Ya estaba mapeada: nada que hacer.');
    else if (saldo < 10n ** 10n) console.log('Primero fondéala (al menos 1 PAS).');
    else if ((await preguntar('Escribe MAPEAR para firmar Revive.map_account: ')) === 'MAPEAR') {
      const r = await client.getUnsafeApi().tx.Revive.map_account().signAndSubmit(cuenta.signer);
      console.log(r.ok ? `Mapeada en el bloque ${r.block.number} ✓` : `Falló: ${JSON.stringify(r.dispatchError)}`);
    } else console.log('Cancelado.');
  }
} finally {
  client.destroy();
}
process.exit(0);
