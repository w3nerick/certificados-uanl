/**
 * Bajar el PDF de IPFS y comprobarlo contra la huella guardada en la cadena.
 *
 * El PDF vive fijado en Pinata; la cadena guarda su sha256. Si un gateway entrega
 * otro archivo (o uno alterado), la huella no coincide y se dice en pantalla.
 * Dentro del host cada gateway necesita el permiso Remote (permisos.ts).
 */
import type { Hex } from 'viem';
import { IPFS_GATEWAYS } from './red';

const MAX_BYTES = 15 * 1024 * 1024;

export async function sha256Hex(bytes: Uint8Array): Promise<Hex> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return ('0x' + Array.from(d, b => b.toString(16).padStart(2, '0')).join('')) as Hex;
}

export const urlIpfs = (cid: string, gateway = IPFS_GATEWAYS[0]) => `${gateway}/${cid}`;

export interface PdfBajado {
  bytes: Uint8Array;
  url: string;
  integro: boolean;
}

/** Prueba cada gateway con tope de 20 s. Devuelve el primero que responde; null si ninguno. */
export async function bajarPdf(cid: string, esperado: Hex): Promise<PdfBajado | null> {
  for (const g of IPFS_GATEWAYS) {
    const url = urlIpfs(cid, g);
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) continue;
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_BYTES) continue;
      return { bytes, url, integro: (await sha256Hex(bytes)) === esperado.toLowerCase() };
    } catch {
      // siguiente gateway
    }
  }
  return null;
}
