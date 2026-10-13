// La firma de sesión del organizador: lo que verifica api/subida.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify, getPublicKey, secretFromSeed } from '@scure/sr25519';
import { textoSesion, variantesFirmadas } from '../src/lib/sesion';

const secreto = secretFromSeed(crypto.getRandomValues(new Uint8Array(32)));
const pub = getPublicKey(secreto);
const texto = textoSesion('0x5E122D6822E57B943AE964D0D345BD924AC44607', '5FbxaBJgockZXZcYwHXXEDDfwoVpRZfADs3JBcNKh8qdj4No', 1_800_000_000);
const acepta = (firma: Uint8Array, t = texto) => variantesFirmadas(t).some(m => { try { return verify(m, firma, pub); } catch { return false; } });

test('el texto de sesión fija contrato (en minúsculas), cuenta y vencimiento', () => {
  assert.equal(texto, 'certificados-uanl/sesion/v1|0x5e122d6822e57b943ae964d0d345bd924ac44607|5FbxaBJgockZXZcYwHXXEDDfwoVpRZfADs3JBcNKh8qdj4No|1800000000');
});

test('acepta la firma de los bytes tal cual y la envuelta en <Bytes> (como firma el host)', () => {
  const [plano, envuelto] = variantesFirmadas(texto);
  assert.ok(acepta(sign(secreto, plano)));
  assert.ok(acepta(sign(secreto, envuelto)));
});

test('rechaza otra sesión, otra llave o bytes basura sin lanzar', () => {
  const firma = sign(secreto, variantesFirmadas(texto)[0]);
  assert.ok(!acepta(firma, texto.replace('1800000000', '1900000000')));
  const otra = sign(secretFromSeed(crypto.getRandomValues(new Uint8Array(32))), variantesFirmadas(texto)[0]);
  assert.ok(!acepta(otra));
  assert.ok(!acepta(new Uint8Array(64).fill(0xab)));
});
