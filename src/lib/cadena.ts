/**
 * Clientes de cadena: primero por el host (`getHostProvider(genesis)`), y si no
 * llega a tiempo, por un RPC público. La cadena es la misma por cualquier camino.
 * Polkadot Desktop 0.1.3 no entregó Asset Hub en testalk: el respaldo no es opcional.
 */
import { createClient, type PolkadotClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { getHostProvider } from '@parity/product-sdk-host';
import { insideHost, waitForHost, withTimeout, TIMED_OUT, HOST_CONNECT_MS } from './host';
import { ASSET_HUB_GENESIS, ASSET_HUB_WS, PEOPLE_GENESIS, PEOPLE_WS } from './red';

export type Source = 'host' | 'public';

interface Chain {
  client: PolkadotClient;
  source: Source;
  /** Por qué no fue el host, si no lo fue. */
  hostProblem: string | null;
}

async function open(genesis: `0x${string}`, publicWs: string[]): Promise<Chain> {
  if (!insideHost()) return { client: createClient(getWsProvider(publicWs)), source: 'public', hostProblem: null };
  let problem: string;
  try {
    if (!(await waitForHost())) throw new Error('sin canal con el host');
    const p = await withTimeout(getHostProvider(genesis), HOST_CONNECT_MS);
    if (p === TIMED_OUT) throw new Error(`el host no entregó la cadena en ${HOST_CONNECT_MS / 1000} s`);
    if (!p) throw new Error('el host no entregó la cadena');
    return { client: createClient(p), source: 'host', hostProblem: null };
  } catch (e) {
    problem = (e as Error).message;
  }
  // Respaldo: necesita el permiso Remote para estos dominios (permisos.ts).
  console.warn('[cadena] RPC público:', problem);
  return { client: createClient(getWsProvider(publicWs)), source: 'public', hostProblem: problem };
}

const cache = new Map<string, Promise<Chain>>();

function get(genesis: `0x${string}`, ws: string[]): Promise<Chain> {
  let c = cache.get(genesis);
  if (!c) {
    c = open(genesis, ws);
    cache.set(genesis, c);
    c.catch(() => cache.delete(genesis));
  }
  return c;
}

export const assetHub = () => get(ASSET_HUB_GENESIS, ASSET_HUB_WS);
export const people = () => get(PEOPLE_GENESIS, PEOPLE_WS);

let peoplePublic: Chain | null = null;
/** People por RPC público, para reintentar cuando el host la entregó pero no responde (cliente ligero lento). */
export function peopleViaPublic(): Chain {
  peoplePublic ??= { client: createClient(getWsProvider(PEOPLE_WS)), source: 'public', hostProblem: null };
  return peoplePublic;
}

/** Siguiente bloque finalizado (no "best": un best puede desaparecer en un reorg). */
export async function nextFinalizedBlock(chain: Pick<Chain, 'client'>, ms = 30_000): Promise<{ number: number; hash: string }> {
  return new Promise((resolve, reject) => {
    let done = false;
    let sub: { unsubscribe(): void } | undefined;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      sub?.unsubscribe();
      fn();
    };
    const t = setTimeout(() => finish(() => reject(new Error(`sin bloques en ${ms / 1000} s`))), ms);
    // Si ya hay un bloque, el observable lo entrega SÍNCRONO, antes de que `sub` exista.
    sub = chain.client.finalizedBlock$.subscribe({
      next: b => finish(() => resolve({ number: b.number, hash: b.hash })),
      error: e => finish(() => reject(e)),
    });
    if (done) sub.unsubscribe();
  });
}

/** Saldo libre en planck (1 PAS = 10^10 planck). */
export async function freeBalance(chain: Chain, ss58: string): Promise<bigint> {
  const acc = (await chain.client.getUnsafeApi().query.System.Account.getValue(ss58)) as { data?: { free?: bigint } } | undefined;
  return BigInt(acc?.data?.free ?? 0n);
}

export const pas = (planck: bigint) => `${(Number(planck) / 1e10).toFixed(4)} PAS`;
