/**
 * Utilidades de cadena para las herramientas de Node (emitir, relayer) y la función de Vercel.
 * Misma receta que la app: simular con ReviveApi.call, enviar con 2× el peso y 1.5× el depósito.
 */
import { createClient, Binary, AccountId, type PolkadotClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import { getTxCreator } from 'polkadot-api/tx-creator';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers';
import { decodeErrorResult, decodeFunctionResult, encodeFunctionData, type Abi, type Hex } from 'viem';
import abiJson from '../src/abi/RegistroCertificados.json' with { type: 'json' };

export const abi = abiJson as Abi;
/** Firmante de polkadot-api 3 (TxCreator con nonce y extensiones comunes). */
type PolkadotSigner = ReturnType<typeof getTxCreator>;
export const RPC = ['wss://asset-hub-paseo-rpc.n.dwellir.com', 'wss://sys.turboflakes.io/asset-hub-paseo'];
/** Cuenta pública de desarrollo: solo como origen de LECTURAS simuladas. Nunca firma. */
export const READ_ORIGIN = '5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV';
export const WEIGHT_CAP = { ref_time: 900_000_000_000n, proof_size: 3_000_000n };

export const pas = (planck: bigint) => `${(Number(planck) / 1e10).toFixed(4)} PAS`;
const toHex = (d: Uint8Array | string) => (typeof d === 'string' ? d : Binary.toHex(d)) as Hex;

export function conectar(): PolkadotClient {
  return createClient(getWsProvider(RPC));
}

/** Par sr25519 de una frase semilla (sin ruta, como la wallet). */
export function cuentaDeSemilla(mnemonic: string): { address: string; signer: PolkadotSigner } {
  const words = mnemonic.trim().split(/\s+/).length;
  if (words < 12) throw new Error(`La frase semilla tiene ${words} palabras; se esperan 12 o 24.`);
  const pair = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(mnemonic.trim())))('');
  return { address: AccountId().dec(pair.publicKey), signer: getTxCreator(pair.publicKey, 'Sr25519', pair.sign) };
}

type Weight = { ref_time: bigint; proof_size: bigint };
interface DryRun { weight_required: Weight; storage_deposit?: { type: string; value: bigint }; result?: { success: boolean; value: unknown } }

function dryRun(client: PolkadotClient, origin: string, dest: Hex, data: Hex): Promise<DryRun> {
  return client.getUnsafeApi().apis.ReviveApi.call(origin, dest, 0n, undefined, undefined, Binary.fromHex(data)) as Promise<DryRun>;
}

function motivo(data: Hex): string {
  try {
    const e = decodeErrorResult({ abi, data });
    return `${e.errorName}${e.args?.length ? `(${e.args.join(', ')})` : ''}`;
  } catch {
    return `revert ${data.slice(0, 18)}`;
  }
}

export async function leer<T>(client: PolkadotClient, dest: Hex, functionName: string, args: readonly unknown[] = []): Promise<T> {
  const r = await dryRun(client, READ_ORIGIN, dest, encodeFunctionData({ abi, functionName, args }));
  if (!r.result?.success) throw new Error(`lectura falló: ${JSON.stringify(r.result?.value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
  const v = r.result.value as { flags: number; data: Uint8Array | string };
  if (v.flags) throw new Error(motivo(toHex(v.data)));
  return decodeFunctionResult({ abi, functionName, data: toHex(v.data) }) as T;
}

export type Simulacion = { ok: true; weight: Weight; deposit: bigint; data: Hex; pesada: boolean } | { ok: false; why: string };

export async function simular(client: PolkadotClient, origin: string, dest: Hex, functionName: string, args: readonly unknown[]): Promise<Simulacion> {
  const data = encodeFunctionData({ abi, functionName, args });
  const r = await dryRun(client, origin, dest, data);
  if (!r.result?.success) {
    const m = r.result?.value as { type?: string; value?: { type?: string; value?: { type?: string } } } | undefined;
    return { ok: false, why: m?.type === 'Module' ? `${m.value?.type}.${m.value?.value?.type}` : JSON.stringify(m, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) };
  }
  const v = r.result.value as { flags: number; data: Uint8Array | string };
  if (v.flags) return { ok: false, why: motivo(toHex(v.data)) };
  const w = r.weight_required;
  return {
    ok: true,
    weight: w,
    deposit: r.storage_deposit?.type === 'Charge' ? BigInt(r.storage_deposit.value) : 0n,
    data,
    pesada: w.ref_time * 2n > WEIGHT_CAP.ref_time || w.proof_size * 2n > WEIGHT_CAP.proof_size,
  };
}

/**
 * Envía una llamada ya simulada. Resuelve cuando entra en un bloque (`hasta: 'bloque'`)
 * o cuando se finaliza. Rechaza si el bloque dice que falló.
 */
export function enviar(client: PolkadotClient, signer: PolkadotSigner, dest: Hex, sim: Extract<Simulacion, { ok: true }>, opts: { hasta?: 'bloque' | 'final'; nonce?: number } = {}): Promise<{ bloque: number; tx: string }> {
  const cap = (x: bigint, max: bigint) => (x * 2n < max ? x * 2n : max);
  const tx = client.getUnsafeApi().tx.Revive.call({
    dest,
    value: 0n,
    weight_limit: { ref_time: cap(sim.weight.ref_time, WEIGHT_CAP.ref_time), proof_size: cap(sim.weight.proof_size, WEIGHT_CAP.proof_size) },
    storage_deposit_limit: (sim.deposit * 3n) / 2n + 10n ** 9n,
    data: Binary.fromHex(sim.data),
  });
  const hasta = opts.hasta ?? 'final';
  return new Promise((resolve, reject) => {
    const sub = tx.createSubmitAndWatch(signer, opts.nonce != null ? { nonce: opts.nonce } : undefined).subscribe({
      next: (e: { type: string; ok?: boolean; block?: { number: number }; txHash?: string; dispatchError?: unknown }) => {
        const fallo = () => reject(new Error(`la transacción falló: ${JSON.stringify(e.dispatchError, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`));
        if (e.type === 'inBestBlock') {
          if (e.ok === false) { sub.unsubscribe(); return fallo(); }
          if (hasta === 'bloque') { sub.unsubscribe(); return resolve({ bloque: e.block?.number ?? 0, tx: e.txHash ?? '' }); }
        }
        if (e.type === 'finalized') {
          sub.unsubscribe();
          if (e.ok) resolve({ bloque: e.block?.number ?? 0, tx: e.txHash ?? '' });
          else fallo();
        }
      },
      error: (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))),
    });
  });
}

export async function saldoLibre(client: PolkadotClient, ss58: string): Promise<bigint> {
  const acc = (await client.getUnsafeApi().query.System.Account.getValue(ss58)) as { data?: { free?: bigint } } | undefined;
  return BigInt(acc?.data?.free ?? 0n);
}

export async function estaMapeada(client: PolkadotClient, ss58: string): Promise<boolean> {
  const api = client.getUnsafeApi();
  const h160 = toHex((await api.apis.ReviveApi.address(ss58)) as Uint8Array | string);
  return (await api.query.Revive.OriginalAccount.getValue(h160)) != null;
}

export async function h160De(client: PolkadotClient, ss58: string): Promise<Hex> {
  return toHex((await client.getUnsafeApi().apis.ReviveApi.address(ss58)) as Uint8Array | string).toLowerCase() as Hex;
}
