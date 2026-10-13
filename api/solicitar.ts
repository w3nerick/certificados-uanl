/**
 * Relayer de solicitudes (Vercel Function): el estudiante pide, desde la Polkadot App,
 * que una constancia pendiente se asigne a su cuenta.
 *
 *   POST /api/solicitar   { id, titular, usuario } → simula y envía RegistroCertificados.solicitar
 *
 * Pedir no asigna nada: un emisor lo revisa y aprueba en el panel. El contrato limita a
 * 5 solicitudes por certificado, así que el costo que alguien puede causar está acotado.
 */
import type { Hex } from 'viem';
import { simular, enviar } from '../tools/cadena.js';
import { json, opciones, errorDeContrato, contratoEnv, cliente, cuentaRelayer, enFila } from '../tools/relay.js';

export const OPTIONS = opciones;

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { id?: unknown; titular?: unknown; usuario?: unknown } | null;
  const id = typeof body?.id === 'string' && /^\d{1,9}$/.test(body.id) ? BigInt(body.id) : null;
  const titular = typeof body?.titular === 'string' && /^0x[0-9a-fA-F]{40}$/.test(body.titular) ? (body.titular.toLowerCase() as Hex) : null;
  const usuario = typeof body?.usuario === 'string' && body.usuario.length <= 64 && /^[\p{L}\p{N}._-]*$/u.test(body.usuario) ? body.usuario : null;
  if (!id || !titular || usuario == null) return json({ error: 'Solicitud inválida: se esperan id, titular (0x…) y usuario.' }, 400);
  try {
    const client = cliente(), relayer = cuentaRelayer(), contrato = contratoEnv();
    return await enFila(async () => {
      const sim = await simular(client, relayer.address, contrato, 'solicitar', [id, titular, usuario]);
      if (!sim.ok) return errorDeContrato(sim.why);
      const r = await enviar(client, relayer.signer, contrato, sim, { hasta: 'bloque' });
      return json({ ok: true, bloque: r.bloque, tx: r.tx });
    });
  } catch (e) {
    return json({ error: `No se pudo enviar: ${(e as Error).message}` }, 502);
  }
}
