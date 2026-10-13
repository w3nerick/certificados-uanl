// Pruebas de lógica de RegistroCertificados en una EVM local (@ethereumjs/vm).
//
// El destino real es pallet-revive (PolkaVM, compilado con resolc). Esto cubre
// la lógica: emisión por lotes, reclamo con firma de la llave del link (y que
// no se pueda redirigir), reasignar, revocar, límites y lecturas. El bytecode
// PolkaVM se prueba aparte con `npm run simulate` / `npm run probar-pvm`.
import { readFileSync } from 'node:fs';
import { createVM } from '@ethereumjs/vm';
import { createBlock } from '@ethereumjs/block';
import { createAddressFromString, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { encodeFunctionData, decodeFunctionResult, decodeErrorResult, keccak256, toHex, encodeAbiParameters } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import assert from 'node:assert/strict';

const abi = JSON.parse(readFileSync(new URL('../out-evm/RegistroCertificados.abi', import.meta.url)));
const bin = '0x' + readFileSync(new URL('../out-evm/RegistroCertificados.bin', import.meta.url), 'utf8').trim();

const vm = await createVM();
const block = createBlock({ header: { number: 14_000_000n, timestamp: 1_792_000_000n, gasLimit: 30_000_000n } }, { common: vm.common });
const admin = createAddressFromString('0x' + '11'.repeat(20));
const intruso = createAddressFromString('0x' + '22'.repeat(20));
const relayer = createAddressFromString('0x' + '33'.repeat(20));
const ALUMNA = '0x' + 'a1'.repeat(20);
const ALUMNO = '0x' + 'b2'.repeat(20);
const LADRON = '0x' + 'cc'.repeat(20);
const ZERO = '0x' + '00'.repeat(20);

const deploy = await vm.evm.runCall({ data: hexToBytes(bin), gasLimit: 15_000_000n, caller: admin, block });
assert.equal(deploy.execResult.exceptionError, undefined, 'deploy');
const to = deploy.createdAddress;
const contrato = to.toString();

async function call(fn, args, caller = admin) {
  const r = await vm.evm.runCall({ to, caller, data: hexToBytes(encodeFunctionData({ abi, functionName: fn, args })), gasLimit: 25_000_000n, block });
  const ret = bytesToHex(r.execResult.returnValue);
  if (r.execResult.exceptionError) {
    const err = ret !== '0x' ? decodeErrorResult({ abi, data: ret }) : { errorName: String(r.execResult.exceptionError.error) };
    return { reverted: err.errorName, args: err.args };
  }
  return { value: ret === '0x' ? undefined : decodeFunctionResult({ abi, functionName: fn, data: ret }) };
}

// Igual que la app: la firma va sobre keccak256(abi.encode(contrato, id, titular)) con prefijo EIP-191.
async function firmar(llave, id, titular) {
  const msg = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'address' }], [contrato, id, titular]));
  return llave.signMessage({ message: { raw: msg } });
}

const pdf = (n) => keccak256(toHex(`pdf-${n}`));
const nuevo = (n, extra = {}) => ({
  nombre: `Estudiante ${n}`,
  programa: 'Polkadot University México — Fase 1',
  institucion: 'Universidad Autónoma de Nuevo León',
  cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
  sha256Pdf: pdf(n),
  fecha: 1_793_000_000n,
  llaveReclamo: ZERO,
  titular: ZERO,
  ...extra,
});

let passed = 0;
const ok = (name) => {
  passed++;
  console.log('  ✓', name);
};

console.log('RegistroCertificados');

assert.equal((await call('total', [])).value, 0n);
assert.equal((await call('admin', [])).value.toLowerCase(), admin.toString());
assert.equal((await call('emisores', [admin.toString()])).value, true);
ok('empieza vacío; quien despliega es admin y emisor');

const llave1 = privateKeyToAccount(generatePrivateKey());
const llave2 = privateKeyToAccount(generatePrivateKey());
let r = await call('emitir', [[nuevo(1, { llaveReclamo: llave1.address }), nuevo(2, { titular: ALUMNO })]]);
assert.equal(r.reverted, undefined);
assert.equal(r.value, 1n);
assert.equal((await call('total', [])).value, 2n);
ok('emite un lote y devuelve el primer id');

let c = (await call('certificado', [1n])).value;
assert.equal(c.nombre, 'Estudiante 1');
assert.equal(c.institucion, 'Universidad Autónoma de Nuevo León');
assert.equal(c.sha256Pdf, pdf(1));
assert.equal(c.bloque, 14_000_000n);
assert.equal(c.llaveReclamo, llave1.address);
assert.equal(c.titular, ZERO);
assert.equal(c.emitidoPor.toLowerCase(), admin.toString());
ok('guarda datos, huella del PDF, bloque, emisor y llave');

c = (await call('certificado', [2n])).value;
assert.equal(c.titular.toLowerCase(), ALUMNO);
assert.equal(c.reclamadoEn, 1_792_000_000n);
assert.deepEqual((await call('deTitular', [ALUMNO])).value, [2n]);
ok('con titular emite directo, sin reclamo');

assert.equal((await call('porPdf', [pdf(1)])).value, 1n);
assert.equal((await call('porPdf', [pdf(99)])).value, 0n);
ok('busca por la huella del PDF');

assert.equal((await call('emitir', [[nuevo(1, { llaveReclamo: llave2.address })]])).reverted, 'PdfRepetido');
ok('el mismo PDF no se emite dos veces');

assert.equal((await call('emitir', [[nuevo(3, { llaveReclamo: llave2.address })]], intruso)).reverted, 'SoloEmisor');
ok('solo un emisor emite');

assert.equal((await call('emitir', [[nuevo(3, { llaveReclamo: llave2.address, nombre: '' })]])).reverted, 'TextoInvalido');
assert.equal((await call('emitir', [[nuevo(3, { llaveReclamo: llave2.address, programa: 'x'.repeat(257) })]])).reverted, 'TextoInvalido');
assert.equal((await call('emitir', [[nuevo(3, { llaveReclamo: llave2.address, sha256Pdf: '0x' + '00'.repeat(32) })]])).reverted, 'PdfVacio');
assert.equal((await call('emitir', [[]])).reverted, 'LoteInvalido');
assert.equal((await call('emitir', [Array.from({ length: 51 }, (_, i) => nuevo(100 + i, { llaveReclamo: llave2.address }))])).reverted, 'LoteInvalido');
assert.equal((await call('total', [])).value, 2n);
ok('rechaza lotes inválidos sin emitir nada');

let firma = await firmar(llave1, 1n, ALUMNA);
assert.equal((await call('reclamar', [1n, LADRON, firma], relayer)).reverted, 'FirmaInvalida');
ok('la firma no sirve para otro titular (no se puede robar desde la mempool)');

assert.equal((await call('reclamar', [1n, ALUMNA, await firmar(llave2, 1n, ALUMNA)], relayer)).reverted, 'FirmaInvalida');
assert.equal((await call('reclamar', [1n, ALUMNA, '0x1234'], relayer)).reverted, 'FirmaInvalida');
ok('rechaza la firma de otra llave o mal formada');

// Firma maleable: mismo r, s' = n - s, v invertido → ecrecover daría la misma llave
{
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const s = BigInt('0x' + firma.slice(66, 130));
  const v = parseInt(firma.slice(130, 132), 16);
  const mal = firma.slice(0, 66) + (N - s).toString(16).padStart(64, '0') + (v === 27 ? '1c' : '1b');
  assert.equal((await call('reclamar', [1n, ALUMNA, mal], relayer)).reverted, 'FirmaInvalida');
}
ok('rechaza la firma maleable (s alta)');

r = await call('reclamar', [1n, ALUMNA, firma], relayer);
assert.equal(r.reverted, undefined);
c = (await call('certificado', [1n])).value;
assert.equal(c.titular.toLowerCase(), ALUMNA);
assert.deepEqual((await call('deTitular', [ALUMNA])).value, [1n]);
ok('cualquiera envía el reclamo firmado y queda a nombre del titular');

assert.equal((await call('reclamar', [1n, ALUMNA, firma], relayer)).reverted, 'YaReclamado');
ok('un link se usa una sola vez');

assert.equal((await call('reclamar', [9n, ALUMNA, firma], relayer)).reverted, 'NoExiste');
assert.equal((await call('certificado', [0n])).reverted, 'NoExiste');
ok('ids inexistentes revierten');

assert.equal((await call('reasignar', [1n, ALUMNO], intruso)).reverted, 'SoloEmisor');
assert.equal((await call('reasignar', [1n, ALUMNO])).reverted, undefined);
assert.deepEqual((await call('deTitular', [ALUMNA])).value, []);
assert.deepEqual((await call('deTitular', [ALUMNO])).value, [2n, 1n]);
ok('el emisor reasigna y las listas de titulares se actualizan');

assert.equal((await call('reasignar', [1n, ZERO])).reverted, undefined);
assert.equal((await call('certificado', [1n])).value.titular, ZERO);
assert.deepEqual((await call('deTitular', [ALUMNO])).value, [2n]);
assert.equal((await call('reclamar', [1n, ALUMNA, firma], relayer)).reverted, undefined);
assert.equal((await call('certificado', [1n])).value.titular.toLowerCase(), ALUMNA);
ok('reasignar a cero reabre el reclamo con el mismo link');

assert.equal((await call('revocar', [2n, 'Error en el nombre'], intruso)).reverted, 'SoloEmisor');
assert.equal((await call('revocar', [2n, 'Error en el nombre'])).reverted, undefined);
assert.equal((await call('certificado', [2n])).value.revocado, true);
assert.equal((await call('motivoRevocacion', [2n])).value, 'Error en el nombre');
assert.equal((await call('revocar', [2n, 'otra vez'])).reverted, 'EstaRevocado');
ok('el emisor revoca con motivo');

const llave3 = privateKeyToAccount(generatePrivateKey());
await call('emitir', [[nuevo(3, { llaveReclamo: llave3.address })]]);
await call('revocar', [3n, 'duplicado']);
assert.equal((await call('reclamar', [3n, ALUMNA, await firmar(llave3, 3n, ALUMNA)], relayer)).reverted, 'EstaRevocado');
ok('un certificado revocado no se reclama');

let [ids, lista] = (await call('pagina', [1n, 10n])).value;
assert.deepEqual(ids, [1n, 2n, 3n]);
assert.equal(lista[2].nombre, 'Estudiante 3');
[ids] = (await call('pagina', [2n, 1n])).value;
assert.deepEqual(ids, [2n]);
[ids] = (await call('pagina', [9n, 5n])).value;
assert.deepEqual(ids, []);
[ids] = (await call('pagina', [1n, 0n])).value;
assert.deepEqual(ids, []);
ok('pagina recorre los certificados');

r = await call('emitir', [Array.from({ length: 50 }, (_, i) => nuevo(200 + i, { llaveReclamo: llave3.address }))]);
assert.equal(r.reverted, undefined);
assert.equal((await call('total', [])).value, 53n);
ok('acepta el lote máximo (50)');

assert.equal((await call('cambiarEmisor', [intruso.toString(), true], intruso)).reverted, 'SoloAdmin');
assert.equal((await call('cambiarEmisor', [intruso.toString(), true])).reverted, undefined);
assert.equal((await call('emitir', [[nuevo(300, { titular: ALUMNA })]], intruso)).reverted, undefined);
assert.equal((await call('cambiarEmisor', [intruso.toString(), false])).reverted, undefined);
assert.equal((await call('emitir', [[nuevo(301, { titular: ALUMNA })]], intruso)).reverted, 'SoloEmisor');
ok('el admin agrega y quita emisores');

// ---------- Solicitud por nombre + aprobación del emisor ----------
const total0 = (await call('total', [])).value;
r = await call('emitir', [[nuevo(400), nuevo(401)]]);
assert.equal(r.reverted, undefined);
const p1 = total0 + 1n, p2 = total0 + 2n;
c = (await call('certificado', [p1])).value;
assert.equal(c.llaveReclamo, ZERO);
assert.equal(c.titular, ZERO);
ok('emite pendientes de solicitud (sin llave ni titular)');

assert.equal((await call('reclamar', [p1, ALUMNA, await firmar(llave1, p1, ALUMNA)], relayer)).reverted, 'FirmaInvalida');
ok('un pendiente no se reclama con firma de ninguna llave');

assert.equal((await call('solicitar', [p1, ALUMNA, 'ana.01'], relayer)).reverted, undefined);
assert.equal((await call('solicitar', [p1, LADRON, 'otro.99'], relayer)).reverted, undefined);
assert.equal((await call('solicitar', [p1, ALUMNA, 'ana.01'], relayer)).reverted, 'YaSolicitado');
let sol = (await call('solicitudes', [p1])).value;
assert.equal(sol.length, 2);
assert.equal(sol[0].titular.toLowerCase(), ALUMNA);
assert.equal(sol[0].usuario, 'ana.01');
assert.equal((await call('certificado', [p1])).value.titular, ZERO);
ok('solicitar no asigna: solo deja la petición (con usuario) para el emisor');

assert.equal((await call('solicitar', [p2, ALUMNO, 'x'.repeat(65)], relayer)).reverted, 'TextoInvalido');
for (let i = 0; i < 5; i++) assert.equal((await call('solicitar', [p2, '0x' + (i + 1).toString(16).padStart(40, '0'), `u${i}`], relayer)).reverted, undefined);
assert.equal((await call('solicitar', [p2, ALUMNO, 'tarde'], relayer)).reverted, 'DemasiadasSolicitudes');
ok('máximo 5 solicitudes por certificado y usuario de hasta 64 bytes');

let [idsS, listaS] = (await call('conSolicitudes', [1n, 1000n])).value;
assert.deepEqual(idsS, [p1, p2]);
assert.equal(listaS[0].length, 2);
assert.equal(listaS[1].length, 5);
ok('conSolicitudes da al panel solo los que tienen peticiones');

assert.equal((await call('asignar', [[p1], [ALUMNA]], relayer)).reverted, 'SoloEmisor');
assert.equal((await call('asignar', [[p1], [ALUMNA, ALUMNO]])).reverted, 'LargosDistintos');
assert.equal((await call('asignar', [[p1, p2], [ALUMNA, ALUMNO]])).reverted, undefined);
assert.equal((await call('certificado', [p1])).value.titular.toLowerCase(), ALUMNA);
assert.equal((await call('certificado', [p2])).value.titular.toLowerCase(), ALUMNO);
assert.deepEqual((await call('solicitudes', [p1])).value, []);
[idsS] = (await call('conSolicitudes', [1n, 1000n])).value;
assert.deepEqual(idsS, []);
ok('el emisor aprueba en lote y se limpian las solicitudes');

assert.equal((await call('asignar', [[p1], [ALUMNO]])).reverted, 'YaReclamado');
assert.equal((await call('solicitar', [p1, ALUMNO, 'b'], relayer)).reverted, 'YaReclamado');
ok('no se aprueba ni se pide un certificado que ya tiene titular');

await call('emitir', [[nuevo(402)]]);
const p3 = total0 + 3n;
await call('solicitar', [p3, ALUMNA, 'ana.01'], relayer);
await call('revocar', [p3, 'error']);
assert.deepEqual((await call('solicitudes', [p3])).value, []);
assert.equal((await call('solicitar', [p3, ALUMNA, 'ana.01'], relayer)).reverted, 'EstaRevocado');
ok('revocar limpia y bloquea solicitudes');

assert.equal((await call('cambiarAdmin', [ZERO])).reverted, 'DireccionVacia');
assert.equal((await call('cambiarAdmin', [intruso.toString()])).reverted, undefined);
assert.equal((await call('cambiarEmisor', [relayer.toString(), true])).reverted, 'SoloAdmin');
ok('el admin se puede traspasar');

console.log(`\n${passed} pruebas OK`);
