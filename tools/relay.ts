/**
 * Piezas comunes de las funciones de Vercel (relayer y subidas): configuración,
 * respuestas JSON con CORS y una fila para no mandar dos transacciones a la vez.
 */
import type { PolkadotClient } from 'polkadot-api';
import type { Hex } from 'viem';
import { conectar, cuentaDeSemilla } from './cadena.js';

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });

export const opciones = () => new Response(null, { status: 204, headers: CORS });

/** Errores del contrato → [HTTP, texto para el estudiante] */
export const ERRORES: Record<string, [number, string]> = {
  YaReclamado: [409, 'Este certificado ya tiene titular.'],
  FirmaInvalida: [403, 'El link no corresponde a este certificado.'],
  EstaRevocado: [410, 'Este certificado fue revocado por la institución.'],
  NoExiste: [404, 'Ese certificado no existe.'],
  DireccionVacia: [400, 'Falta la cuenta del titular.'],
  YaSolicitado: [409, 'Ya pediste este certificado; espera la aprobación del organizador.'],
  DemasiadasSolicitudes: [429, 'Este certificado ya tiene demasiadas solicitudes. Habla con el organizador.'],
  TextoInvalido: [400, 'El usuario es demasiado largo.'],
};

export function errorDeContrato(why: string): Response {
  const clave = Object.keys(ERRORES).find(k => why.includes(k));
  if (clave) return json({ error: ERRORES[clave][1] }, ERRORES[clave][0]);
  if (why.includes('AccountUnmapped')) return json({ error: 'El relayer todavía no está listo (falta mapear su cuenta).' }, 503);
  return json({ error: `La simulación falló: ${why}` }, 502);
}

let client: PolkadotClient | null = null;
let relayer: ReturnType<typeof cuentaDeSemilla> | null = null;

export function contratoEnv(): Hex {
  const c = process.env.REGISTRO_ADDRESS?.trim();
  if (!c || !/^0x[0-9a-fA-F]{40}$/.test(c)) throw new Error('Falta REGISTRO_ADDRESS.');
  return c as Hex;
}

export function cliente(): PolkadotClient {
  client ??= conectar();
  return client;
}

export function cuentaRelayer() {
  const seed = process.env.RELAYER_SEED;
  if (!seed) throw new Error('El relayer no está configurado (RELAYER_SEED).');
  relayer ??= cuentaDeSemilla(seed);
  return relayer;
}

// Una transacción a la vez: dos envíos simultáneos de la misma cuenta chocarían en el nonce.
let fila: Promise<unknown> = Promise.resolve();
export function enFila<T>(tarea: () => Promise<T>): Promise<T> {
  const p = fila.then(tarea);
  fila = p.catch(() => undefined);
  return p;
}
