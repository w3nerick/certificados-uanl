// Comprueba en PolkaVM, con dry-runs contra el devnet (no firma ni gasta nada):
//   1. que RegistroCertificados se puede instanciar y cuánto depósito pide;
//   2. que ecrecover (la verificación del reclamo) funciona en pallet-revive:
//      el constructor de test/pvm/ProbarFirma.sol revierte si la llave recuperada
//      no coincide, así que una firma buena debe pasar y una mala revertir.
//
//   npm run probar-pvm
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Binary } from 'polkadot-api';
import { encodeAbiParameters, keccak256, toHex } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { connect, simulateInstantiate, SIM_ORIGIN, HERE, pas } from './lib.mjs';

const { client, api } = connect();
const ok = (r) => r.result?.success && !r.result.value.result.flags;

const { code, r: main } = await simulateInstantiate(api);
const dep = main.storage_deposit?.type === 'Charge' ? main.storage_deposit.value : 0n;
console.log(`RegistroCertificados: ${code.length} bytes PolkaVM · instancia ${ok(main) ? 'OK' : 'FALLA'} · depósito ${pas(dep)}`);

const probe = readFileSync(resolve(HERE, '../out-test/ProbarFirma.sol:ProbarFirma.pvm'));
const llave = privateKeyToAccount(generatePrivateKey());
const mensaje = keccak256(toHex('certificados-uanl/probar-pvm'));
const firma = await llave.signMessage({ message: { raw: mensaje } });
const otra = privateKeyToAccount(generatePrivateKey()).address;

async function probar(esperada) {
  const args = encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes' }, { type: 'address' }], [mensaje, firma, esperada]);
  return api.apis.ReviveApi.instantiate(
    SIM_ORIGIN, 0n, undefined, undefined,
    { type: 'Upload', value: Binary.fromHex('0x' + probe.toString('hex')) },
    Binary.fromHex(args), undefined,
  );
}

const buena = await probar(llave.address);
const mala = await probar(otra);
console.log(`ecrecover con la llave correcta: ${ok(buena) ? 'pasa ✓' : 'REVIERTE ✗'}`);
console.log(`ecrecover con otra llave:        ${ok(mala) ? 'PASA ✗' : 'revierte ✓'}`);
const todo = ok(main) && ok(buena) && !ok(mala);
console.log(todo ? '\nPolkaVM OK: el reclamo por firma funciona en pallet-revive.' : '\nAlgo falló: revisar antes de desplegar.');
client.destroy();
process.exit(todo ? 0 : 1);
