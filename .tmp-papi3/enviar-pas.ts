// Transfiere PAS desde la cuenta pública de desarrollo (5DfhGy…, frase dev pública) a una dirección dada.
import { AccountId } from 'polkadot-api';
import { conectar, cuentaDeSemilla, saldoLibre, pas } from '../tools/cadena';
const DEV = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const [to, cantidad = '50'] = process.argv.slice(2);
AccountId().enc(to); // lanza si la dirección o su checksum no son válidos
const c = conectar();
try {
  const dev = cuentaDeSemilla(DEV);
  console.log('desde', dev.address, '→', to, 'antes', pas(await saldoLibre(c, to)));
  const r = await c.getUnsafeApi().tx.Balances.transfer_keep_alive({ dest: { type: 'Id', value: to }, value: BigInt(cantidad) * 10n ** 10n }).createAndSubmit(dev.signer);
  console.log(r.ok ? `ok bloque #${r.block.number}` : `falló ${JSON.stringify(r.dispatchError)}`);
  console.log('después', pas(await saldoLibre(c, to)));
} finally { c.destroy(); }
