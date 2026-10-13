/**
 * Códigos de reclamo: lo que va en el link del correo.
 *
 * Al emitir, `tools/emitir.ts` genera un código al azar por certificado y guarda en
 * el contrato solo la dirección de la llave que sale de él. Para reclamar, el
 * navegador del estudiante vuelve a derivar la llave del código y firma
 * (contrato, id, titular). El contrato acepta la firma de cualquiera que la envíe
 * (el relayer paga), pero el titular queda fijo: copiar la transacción no sirve
 * para quedarse con el certificado.
 *
 * Sin dependencias del host: lo usan la app, la web, el relayer y las herramientas.
 */
import { encodeAbiParameters, keccak256, toBytes, concat, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const DOMINIO = 'certificados-uanl/reclamo/v1';

/** 16 bytes al azar en base64url (22 caracteres): corto para un link y imposible de adivinar. */
export function nuevoCodigo(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const codigoValido = (c: string) => /^[A-Za-z0-9_-]{22}$/.test(c);

/** La llave secp256k1 que sale del código. Su dirección es `llaveReclamo` en el contrato. */
export function llaveDeCodigo(codigo: string) {
  if (!codigoValido(codigo)) throw new Error('El código del link no es válido.');
  return privateKeyToAccount(keccak256(concat([toBytes(DOMINIO), toBytes(codigo)])));
}

/** Igual que `mensajeReclamo` del contrato: keccak256(abi.encode(contrato, id, titular)). */
export function mensajeReclamo(contrato: Hex, id: bigint, titular: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'address' }], [contrato, id, titular]));
}

/** Firma EIP-191 que el contrato comprueba con ecrecover. */
export function firmarReclamo(codigo: string, contrato: Hex, id: bigint, titular: Hex): Promise<Hex> {
  return llaveDeCodigo(codigo).signMessage({ message: { raw: mensajeReclamo(contrato, id, titular) } });
}

/** El código va después del `#`: el navegador nunca lo manda a ningún servidor. */
export const linkReclamo = (base: string, id: bigint | number | string, codigo: string) => `${base}/#/reclamar/${id}/${codigo}`;

export function leerRutaReclamo(hash: string): { id: bigint; codigo: string } | null {
  const m = /^#\/reclamar\/(\d{1,9})\/([A-Za-z0-9_-]{22})$/.exec(hash);
  return m ? { id: BigInt(m[1]), codigo: m[2] } : null;
}
