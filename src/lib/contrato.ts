/**
 * Leer y escribir contratos de pallet-revive (Asset Hub) desde la app.
 *
 * Receta probada en testalk y la Lotería (docs/06-contratos.md):
 * 1. Leer = simular (`ReviveApi.call`): sin firma ni comisiones.
 * 2. Escribir = permiso ChainSubmit → mapear la cuenta (una vez) → simular
 *    desde la cuenta que firma → enviar con 2× el peso simulado y 1.5× el
 *    depósito → esperar `finalized`.
 * El cálculo automático de peso se queda corto y revierte con OutOfGas: por eso
 * se simula y se envía con margen explícito. Lo que sobra se devuelve.
 */
import { Binary, type PolkadotClient, type PolkadotSigner } from 'polkadot-api';
import { decodeErrorResult, decodeFunctionResult, encodeFunctionData, type Abi } from 'viem';

export interface Contrato {
  /** Dirección H160 del contrato, en hex. */
  address: `0x${string}`;
  abi: Abi;
}

/** Cualquier cuenta sirve de origen para LEER. Esta es pública (frase de desarrollo): nunca firmes con ella. */
const READ_ORIGIN = '5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV';

/** Techo por extrínseco. Por encima de ~900 G de ref_time vuelve como InvalidTxError. */
export const WEIGHT_CAP = { ref_time: 900_000_000_000n, proof_size: 3_000_000n };

type Weight = { ref_time: bigint; proof_size: bigint };
interface CallResult {
  weight_required: Weight;
  storage_deposit?: { type: string; value: bigint };
  result?: { success: boolean; value: unknown };
}

// En polkadot-api 2.2 la dirección ([u8; 20]) va como texto hex y los Vec<u8> llegan como Uint8Array.
const toHex = (d: Uint8Array | string) => (typeof d === 'string' ? d : Binary.toHex(d)) as `0x${string}`;

function dryRun(client: PolkadotClient, origin: string, c: Contrato, data: `0x${string}`): Promise<CallResult> {
  return client.getUnsafeApi().apis.ReviveApi.call(origin, c.address, 0n, undefined, undefined, Binary.fromHex(data)) as Promise<CallResult>;
}

function revertReason(c: Contrato, data: `0x${string}`): string {
  try {
    const e = decodeErrorResult({ abi: c.abi, data });
    return `el contrato rechazó: ${e.errorName}`;
  } catch {
    return `el contrato rechazó (${data.slice(0, 18)}…)`;
  }
}

/** Lee una función `view`. Lanza si revierte o si no se pudo consultar. */
export async function leer<T = unknown>(client: PolkadotClient, c: Contrato, functionName: string, args: readonly unknown[] = []): Promise<T> {
  const data = encodeFunctionData({ abi: c.abi, functionName, args });
  const r = await dryRun(client, READ_ORIGIN, c, data);
  if (!r.result?.success) throw new Error(`la lectura falló: ${describeDispatch(r.result?.value)}`);
  const v = r.result.value as { flags: number; data: Uint8Array | string };
  if (v.flags) throw new Error(revertReason(c, toHex(v.data)));
  return decodeFunctionResult({ abi: c.abi, functionName, data: toHex(v.data) }) as T;
}

export type Simulacion =
  | { ok: true; weight: Weight; deposit: bigint; data: `0x${string}` }
  | { ok: false; why: string };

/** Simula una escritura desde `origin` (la cuenta que va a firmar): dice si pasaría y cuánto pide. */
export async function simular(client: PolkadotClient, origin: string, c: Contrato, functionName: string, args: readonly unknown[] = []): Promise<Simulacion> {
  const data = encodeFunctionData({ abi: c.abi, functionName, args });
  const r = await dryRun(client, origin, c, data);
  if (!r.result?.success) return { ok: false, why: describeDispatch(r.result?.value) };
  const v = r.result.value as { flags: number; data: Uint8Array | string };
  if (v.flags) return { ok: false, why: revertReason(c, toHex(v.data)) };
  return {
    ok: true,
    weight: r.weight_required,
    deposit: r.storage_deposit?.type === 'Charge' ? BigInt(r.storage_deposit.value) : 0n,
    data,
  };
}

/** pallet-revive solo acepta cuentas mapeadas a su H160. La dirección la da el runtime, no un cálculo propio. */
export async function estaMapeada(client: PolkadotClient, ss58: string): Promise<boolean> {
  const api = client.getUnsafeApi();
  const h160 = toHex((await api.apis.ReviveApi.address(ss58)) as Uint8Array | string);
  return (await api.query.Revive.OriginalAccount.getValue(h160)) != null;
}

/** `Revive.map_account`: una vez por cuenta, antes de su primera escritura. */
export function mapear(client: PolkadotClient, signer: PolkadotSigner, onSigned?: () => void) {
  return enviar(client.getUnsafeApi().tx.Revive.map_account(), signer, onSigned);
}

/** Envía una escritura ya simulada, con margen sobre la simulación. Resuelve en `finalized`. */
export function escribir(client: PolkadotClient, signer: PolkadotSigner, c: Contrato, sim: Extract<Simulacion, { ok: true }>, onSigned?: () => void) {
  const cap = (x: bigint, max: bigint) => (x * 2n < max ? x * 2n : max);
  const tx = client.getUnsafeApi().tx.Revive.call({
    dest: c.address,
    value: 0n,
    weight_limit: { ref_time: cap(sim.weight.ref_time, WEIGHT_CAP.ref_time), proof_size: cap(sim.weight.proof_size, WEIGHT_CAP.proof_size) },
    storage_deposit_limit: (sim.deposit * 3n) / 2n + 10n ** 9n,
    data: Binary.fromHex(sim.data),
  });
  return enviar(tx, signer, onSigned);
}

interface TxEvent {
  type: string;
  found?: boolean;
  ok?: boolean;
  txHash?: string;
  block?: { number: number };
  dispatchError?: unknown;
}
type Tx = { signSubmitAndWatch(s: PolkadotSigner): { subscribe(o: { next(e: TxEvent): void; error(e: unknown): void }): { unsubscribe(): void } } };

/**
 * Firma, envía y espera `finalized`. Corta antes si el primer bloque ya dice que falló.
 * Pon un tope de ~240 s por fuera; si se vence, RELEE el contrato antes de reintentar.
 */
function enviar(tx: Tx, signer: PolkadotSigner, onSigned?: () => void): Promise<{ block: number; txHash: string }> {
  return new Promise((resolve, reject) => {
    const sub = tx.signSubmitAndWatch(signer).subscribe({
      next: e => {
        if (e.type === 'signed') onSigned?.();
        if (e.type === 'txBestBlocksState' && e.found && e.ok === false) {
          sub.unsubscribe();
          reject(new Error(describeDispatch(e.dispatchError)));
        }
        if (e.type === 'finalized') {
          sub.unsubscribe();
          if (e.ok) resolve({ block: e.block?.number ?? 0, txHash: e.txHash ?? '' });
          else reject(new Error(describeDispatch(e.dispatchError)));
        }
      },
      error: err => reject(err instanceof Error ? err : new Error(String(err))),
    });
  });
}

const DISPATCH_ES: Record<string, string> = {
  'Revive.AccountUnmapped': 'la cuenta no está mapeada (falta Revive.map_account)',
  'Revive.StorageDepositNotEnoughFunds': 'el saldo no alcanza para el depósito',
  'Revive.OutOfGas': 'se quedó sin peso (OutOfGas)',
};

function describeDispatch(e: unknown): string {
  const m = e as { type?: string; value?: { type?: string; value?: { type?: string } } } | undefined;
  if (m?.type === 'Module' && m.value?.type) {
    const name = `${m.value.type}.${m.value.value?.type ?? '?'}`;
    return DISPATCH_ES[name] ? `${DISPATCH_ES[name]} (${name})` : name;
  }
  return m?.type ?? 'error desconocido';
}
