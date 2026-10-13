/**
 * El canal con el host (Polkadot App, Polkadot Desktop o dev-dot.li).
 *
 * Dos reglas que ahorran días:
 * 1. Espera a que el canal esté `connected` antes de cualquier llamada.
 * 2. Ponle tope de tiempo a TODAS las llamadas. Una promesa que el host nunca
 *    contesta no rechaza: se queda pendiente para siempre y el try/catch no la ve.
 */
import { isInsideContainerSync, subscribeConnectionStatus } from '@parity/product-sdk-host';

/** Valores de TWR.DOT, confirmados en testalk y la Lotería. */
export const HOST_CONNECT_MS = 12_000;
export const HOST_QUERY_MS = 8_000;
/** Diálogos y firmas: la persona tiene que ir al celular y aprobar. */
export const HOST_SUBMIT_MS = 90_000;
/** Subidas a Bulletin: esperan inclusión en bloque. */
export const HOST_UPLOAD_MS = 180_000;

export const TIMED_OUT = Symbol('timed_out');

export function withTimeout<T>(p: Promise<T>, ms: number = HOST_QUERY_MS): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<typeof TIMED_OUT>(resolve => { timer = setTimeout(() => resolve(TIMED_OUT), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/** ¿Corre dentro de un host? Es una heurística: no dice que el canal funcione. */
export const insideHost = (): boolean => isInsideContainerSync();

let ready: Promise<boolean> | null = null;

/**
 * Espera el canal. Suscribirse no es pasivo: según la doc del SDK, el primer
 * subscribe es lo que construye el transporte. Sin él, las llamadas se encolan.
 */
export function waitForHost(ms: number = HOST_CONNECT_MS): Promise<boolean> {
  if (!insideHost()) return Promise.resolve(false);
  ready ??= new Promise<boolean>(resolve => {
    let unsub: (() => void) | undefined;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { unsub?.(); } catch { /* ya desuscrito */ }
      if (!ok) ready = null; // se puede reintentar
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), ms);
    try {
      // El callback puede llegar síncrono, antes de que `unsub` exista.
      unsub = subscribeConnectionStatus(status => { if (status === 'connected') finish(true); });
      if (settled) { try { unsub(); } catch { /* ya desuscrito */ } }
    } catch {
      finish(false);
    }
  });
  return ready;
}

/** Los errores del host son uniones etiquetadas; esto saca algo legible. */
export function describeError(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const tag = (e as { tag?: unknown }).tag;
    const value = (e as { value?: unknown }).value;
    const reason = value && typeof value === 'object' ? (value as { reason?: unknown }).reason : undefined;
    if (typeof tag === 'string') return reason ? `${tag}: ${String(reason)}` : tag;
    try { return JSON.stringify(e, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)); } catch { /* abajo */ }
  }
  return String(e);
}
