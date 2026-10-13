/**
 * Links de subida a Pinata para el panel del organizador (Vercel Function).
 *
 *   POST /api/subida   { ss58, expira, firma, archivo } → { url }   (url válida 5 min, un PDF ≤ 15 MB)
 *
 * El organizador firma una vez el texto de sesión (src/lib/sesion.ts) con su cuenta de la
 * Polkadot App. Aquí se comprueba la firma sr25519 y que esa cuenta sea EMISORA en el
 * contrato. La llave de Pinata (PINATA_JWT) nunca sale del servidor: el navegador recibe
 * un link firmado que solo sirve para subir un PDF a la red pública, al grupo del evento.
 */
import { AccountId } from 'polkadot-api';
import { verify } from '@scure/sr25519';
import { leer, h160De } from '../tools/cadena.js';
import { json, opciones, contratoEnv, cliente } from '../tools/relay.js';
import { textoSesion, variantesFirmadas, SESION_HORAS } from '../src/lib/sesion.js';

export const OPTIONS = opciones;

const hexABytes = (h: string) => Uint8Array.from(h.slice(2).match(/../g)!.map(b => parseInt(b, 16)));

/** `verify` de @scure/sr25519 lanza con firmas mal formadas: aquí eso es solo "no válida". */
function firmaValida(mensaje: Uint8Array, firma: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return verify(mensaje, firma, publicKey);
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  const jwt = process.env.PINATA_JWT?.trim();
  if (!jwt) return json({ error: 'Las subidas no están configuradas (PINATA_JWT).' }, 503);
  const body = (await request.json().catch(() => null)) as { ss58?: unknown; expira?: unknown; firma?: unknown; archivo?: unknown } | null;
  const ss58 = typeof body?.ss58 === 'string' ? body.ss58 : '';
  const expira = typeof body?.expira === 'number' ? body.expira : 0;
  const firma = typeof body?.firma === 'string' && /^0x[0-9a-fA-F]{128}$/.test(body.firma) ? hexABytes(body.firma) : null;
  const archivo = typeof body?.archivo === 'string' ? body.archivo.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 120) || 'certificado.pdf' : 'certificado.pdf';
  const ahora = Math.floor(Date.now() / 1000);
  if (!firma || !ss58) return json({ error: 'Falta la firma de sesión.' }, 400);
  if (expira < ahora || expira > ahora + SESION_HORAS * 3600 + 300) return json({ error: 'La sesión venció: vuelve a firmar.' }, 401);

  let publicKey: Uint8Array;
  try { publicKey = AccountId().enc(ss58); } catch { return json({ error: 'Cuenta inválida.' }, 400); }
  let contrato;
  try { contrato = contratoEnv(); } catch (e) { return json({ error: (e as Error).message }, 503); }
  const texto = textoSesion(contrato, ss58, expira);
  if (!variantesFirmadas(texto).some(m => firmaValida(m, firma, publicKey))) return json({ error: 'La firma de sesión no es válida.' }, 401);

  try {
    const client = cliente();
    const esEmisor = await leer<boolean>(client, contrato, 'emisores', [await h160De(client, ss58)]);
    if (!esEmisor) return json({ error: 'Tu cuenta no es emisora en el contrato.' }, 403);
  } catch (e) {
    return json({ error: `No se pudo consultar el contrato: ${(e as Error).message}` }, 502);
  }

  const r = await fetch('https://uploads.pinata.cloud/v3/files/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      network: 'public',
      expires: 300,
      date: ahora,
      filename: archivo,
      max_file_size: 15 * 1024 * 1024,
      allow_mime_types: ['application/pdf'],
      ...(process.env.PINATA_GROUP_ID ? { group_id: process.env.PINATA_GROUP_ID } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) return json({ error: `Pinata respondió ${r.status}.` }, 502);
  const { data } = (await r.json()) as { data?: string };
  return data ? json({ url: data }) : json({ error: 'Pinata no devolvió el link.' }, 502);
}
