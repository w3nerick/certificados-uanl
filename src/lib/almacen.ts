/**
 * Datos del usuario en este dispositivo.
 *
 * Una app .dot se sirve desde el hash de su contenido: cada versión publicada
 * tiene OTRO origen y su `localStorage` empieza vacío. El almacenamiento del
 * host sobrevive a las versiones. localStorage queda solo de respaldo (fuera
 * del host) y, si tampoco hay, memoria.
 *
 * No es compartido: cada persona ve solo lo suyo. Lo común va on-chain.
 */
import { getHostLocalStorage } from '@parity/product-sdk-host';
import { insideHost, waitForHost, withTimeout, TIMED_OUT } from './host';

export interface Almacen {
  kind: 'host' | 'browser' | 'memory';
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
}

let store: Promise<Almacen> | null = null;

export function almacen(): Promise<Almacen> {
  store ??= open();
  return store;
}

async function open(): Promise<Almacen> {
  if (insideHost() && (await waitForHost())) {
    const ls = await withTimeout(getHostLocalStorage(), 5000).catch(() => null);
    if (ls && ls !== TIMED_OUT) {
      return {
        kind: 'host',
        async get<T>(k: string) {
          try { return ((await ls.readJSON(k)) as T) ?? null; } catch { return null; }
        },
        async set(k, v) {
          await ls.writeJSON(k, v);
        },
      };
    }
  }
  try {
    localStorage.setItem('__probe', '1');
    localStorage.removeItem('__probe');
    return {
      kind: 'browser',
      async get<T>(k: string) {
        try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
      },
      async set(k, v) {
        localStorage.setItem(k, JSON.stringify(v));
      },
    };
  } catch { /* sin localStorage */ }
  const mem = new Map<string, unknown>();
  return {
    kind: 'memory',
    async get<T>(k: string) { return (mem.get(k) as T) ?? null; },
    async set(k, v) { mem.set(k, v); },
  };
}
