/**
 * Relayer de reclamos por link (Vercel Function).
 *
 *   GET  /api/reclamar   estado: cuenta del relayer, saldo y contrato (lo usa #/diagnostico)
 *   POST /api/reclamar   { id, titular, firma } → simula y envía RegistroCertificados.reclamar
 *
 * La cuenta del relayer (RELAYER_SEED) NO tiene ningún rol en el contrato: solo paga
 * comisiones. La firma de la llave del link fija el titular, así que el relayer no
 * puede cambiarlo. Antes de gastar simula: lo inválido se rechaza sin costo.
 */
import type { Hex } from 'viem';
import { simular, enviar, saldoLibre, estaMapeada, pas } from '../tools/cadena.js';
import { json, opciones, errorDeContrato, contratoEnv, cliente, cuentaRelayer, enFila } from '../tools/relay.js';

export const OPTIONS = opciones;

export async function GET(): Promise<Response> {
  try {
    const client = cliente(), relayer = cuentaRelayer();
    const [saldo, mapeada] = await Promise.all([saldoLibre(client, relayer.address), estaMapeada(client, relayer.address)]);
    return json({ cuenta: relayer.address, saldo: pas(saldo), mapeada, contrato: contratoEnv() });
  } catch (e) {
    return json({ error: (e as Error).message }, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { id?: unknown; titular?: unknown; firma?: unknown } | null;
  const id = typeof body?.id === 'string' && /^\d{1,9}$/.test(body.id) ? BigInt(body.id) : null;
  const titular = typeof body?.titular === 'string' && /^0x[0-9a-fA-F]{40}$/.test(body.titular) ? (body.titular.toLowerCase() as Hex) : null;
  const firma = typeof body?.firma === 'string' && /^0x[0-9a-fA-F]{130}$/.test(body.firma) ? (body.firma as Hex) : null;
  if (!id || !titular || !firma) return json({ error: 'Solicitud inválida: se esperan id, titular (0x…) y firma.' }, 400);
  try {
    const client = cliente(), relayer = cuentaRelayer(), contrato = contratoEnv();
    return await enFila(async () => {
      const sim = await simular(client, relayer.address, contrato, 'reclamar', [id, titular, firma]);
      if (!sim.ok) return errorDeContrato(sim.why);
      const r = await enviar(client, relayer.signer, contrato, sim, { hasta: 'bloque' });
      return json({ ok: true, bloque: r.bloque, tx: r.tx });
    });
  } catch (e) {
    return json({ error: `No se pudo enviar: ${(e as Error).message}` }, 502);
  }
}
