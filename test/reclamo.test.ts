// Pruebas sin red: códigos y links de reclamo, y que la firma de la app la acepte el contrato.
//
//   npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverMessageAddress } from 'viem';
import { nuevoCodigo, codigoValido, llaveDeCodigo, mensajeReclamo, firmarReclamo, linkReclamo, leerRutaReclamo } from '../src/lib/reclamo';

const CONTRATO = '0x1111111111111111111111111111111111111111' as const;
const ALUMNA = '0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1' as const;

test('los códigos son de 22 caracteres base64url y no se repiten', () => {
  const vistos = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const c = nuevoCodigo();
    assert.ok(codigoValido(c), c);
    assert.ok(!vistos.has(c));
    vistos.add(c);
  }
  assert.ok(!codigoValido('corto'));
  assert.ok(!codigoValido('a'.repeat(21) + '!'));
});

test('la llave sale siempre igual del mismo código y distinta de otro', () => {
  const c = nuevoCodigo();
  assert.equal(llaveDeCodigo(c).address, llaveDeCodigo(c).address);
  assert.notEqual(llaveDeCodigo(c).address, llaveDeCodigo(nuevoCodigo()).address);
  assert.throws(() => llaveDeCodigo('no-valido'));
});

test('la firma del reclamo recupera la llave del código (lo que comprueba ecrecover)', async () => {
  const c = nuevoCodigo();
  const firma = await firmarReclamo(c, CONTRATO, 7n, ALUMNA);
  const llave = await recoverMessageAddress({ message: { raw: mensajeReclamo(CONTRATO, 7n, ALUMNA) }, signature: firma });
  assert.equal(llave, llaveDeCodigo(c).address);
  // Otro titular u otro id dan otro mensaje: la firma no sirve para ellos
  const otro = await recoverMessageAddress({ message: { raw: mensajeReclamo(CONTRATO, 7n, '0x' + 'cc'.repeat(20) as `0x${string}`) }, signature: firma });
  assert.notEqual(otro, llave);
});

test('el link lleva el código después del # y se lee de vuelta', () => {
  const c = nuevoCodigo();
  const link = linkReclamo('https://certificados-uanl.vercel.app', 42n, c);
  assert.equal(link, `https://certificados-uanl.vercel.app/#/reclamar/42/${c}`);
  assert.deepEqual(leerRutaReclamo(new URL(link).hash), { id: 42n, codigo: c });
  assert.equal(leerRutaReclamo('#/reclamar/42/corto'), null);
  assert.equal(leerRutaReclamo('#/c/42'), null);
});
