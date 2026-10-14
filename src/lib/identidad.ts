/**
 * Quién es el usuario y con qué llave firma.
 *
 * Dentro del host hay dos llaves (docs/04-identidad-y-firma.md):
 *
 * - **app**: la cuenta de producto que el host deriva para ESTE dominio. Es lo
 *   que entrega `SignerManager.connect()`. Firma sin problema, pero nadie puede
 *   ligarla a una persona, y cambia si cambia el dominio.
 * - **identidad**: la cuenta dueña del username en People chain. Ata la firma a
 *   una persona. Se obtiene así: username → `Resources.UsernameOwnerOf` → llave
 *   → `getAccountsProvider().getLegacyAccountSigner(...)`.
 *
 * Fuera del host: cuenta de desarrollo (Alice), solo para ensayar.
 *
 * NO uses `requestLogin()`: ninguna app que funciona en el devnet lo usa, y
 * esperar ese diálogo dejaba la UI cargando para siempre.
 */
import { AccountId, type PolkadotClient, type PolkadotSigner } from 'polkadot-api';
import { getAccountsProvider } from '@parity/product-sdk-host';
// Solo el tipo: el signer (con sus llaves, ~90 KB) se baja al conectar, no al abrir la app.
import type { SignerManager } from '@parity/product-sdk-signer';
import { insideHost, waitForHost, withTimeout, describeError, TIMED_OUT, HOST_QUERY_MS, HOST_SUBMIT_MS } from './host';
import { people, peopleViaPublic } from './cadena';
import { APP_DOTNS } from './red';

export type Llave = 'app' | 'identidad' | 'ensayo';

export interface Cuenta {
  address: string;
  publicKey: Uint8Array;
}

export interface Sesion {
  app: Cuenta;
  username: string | null;
  identidad: (Cuenta & { signer: PolkadotSigner }) | null;
  /** Por qué no hay llave de identidad, para explicarlo en pantalla. */
  sinIdentidad: string | null;
  ensayo: boolean;
}

const ss58 = AccountId(42);
let manager: SignerManager | null = null;
let sesion: Sesion | null = null;

export const sesionActual = () => sesion;

/** Abre un diálogo del wallet: llámalo solo desde un gesto del usuario (un clic). */
export async function conectar(): Promise<Sesion> {
  const inside = insideHost();
  if (inside && !(await waitForHost())) throw new Error(`No hay canal con el host. Abre ${APP_DOTNS} desde la Polkadot App.`);

  manager ??= new (await import('@parity/product-sdk-signer')).SignerManager({ dappName: APP_DOTNS });
  // connect() también pide el permiso ChainSubmit.
  const r = await withTimeout(manager.connect(inside ? 'host' : 'dev'), HOST_SUBMIT_MS);
  if (r === TIMED_OUT) throw new Error('El wallet no respondió a tiempo.');
  if (!r.ok) throw new Error(describeError(r.error));
  const acc = r.value[0];
  if (!acc) {
    throw new Error(inside
      ? 'El host no entregó ninguna cuenta. ¿El dominio ya está registrado? En dev-dot.li sin sesión tampoco hay cuentas.'
      : 'No hay cuenta de ensayo.');
  }
  manager.selectAccount(acc.address);
  const app: Cuenta = { address: acc.address, publicKey: acc.publicKey };

  if (!inside) {
    sesion = { app, username: null, identidad: null, sinIdentidad: 'fuera del host (ensayo)', ensayo: true };
    return sesion;
  }

  const u = await withTimeout(manager.getUserId(), HOST_QUERY_MS).catch(() => null);
  const username = u && u !== TIMED_OUT && u.ok ? u.value.primaryUsername || null : null;
  let identidad: Sesion['identidad'] = null;
  let sinIdentidad: string | null = null;
  if (!username) {
    sinIdentidad = 'la cuenta no tiene username';
  } else {
    try {
      const owner = await usernameOwner(username);
      const ap = owner ? await withTimeout(getAccountsProvider(), HOST_QUERY_MS) : null;
      if (!owner) sinIdentidad = `${username} no aparece en People chain`;
      else if (!ap || ap === TIMED_OUT) sinIdentidad = 'el host no entregó el proveedor de cuentas';
      else {
        const publicKey = ss58.enc(owner);
        identidad = { address: owner, publicKey, signer: ap.getLegacyAccountSigner({ publicKey, name: username }) };
      }
    } catch (e) {
      sinIdentidad = `no se pudo consultar People chain (${(e as Error).message})`;
    }
  }
  sesion = { app, username, identidad, sinIdentidad, ensayo: false };
  return sesion;
}

/** Lee un storage de People chain con tope de tiempo. Lanza si no se pudo consultar. */
async function consultarPeople<T>(leer: (client: PolkadotClient) => Promise<T>): Promise<T> {
  // La primera consulta baja la metadata: un endpoint lento tardó 23 s (testalk, sep 2026).
  const consulta = async (client: PolkadotClient) => {
    const r = await withTimeout(leer(client), 15_000);
    if (r === TIMED_OUT) throw new Error('People chain no respondió');
    return r;
  };
  const chain = await people();
  try {
    return await consulta(chain.client);
  } catch (e) {
    // El host entregó People pero no contesta: un intento más por RPC público (permiso Remote al arrancar).
    if (chain.source !== 'host') throw e;
    return consulta(peopleViaPublic().client);
  }
}

/** Dueño (SS58) de un username en People chain, o null si no existe. Lanza si no se pudo consultar. */
export async function usernameOwner(username: string): Promise<string | null> {
  const r = await consultarPeople(c =>
    c.getUnsafeApi().query.Resources.UsernameOwnerOf.getValue(new TextEncoder().encode(username)) as Promise<string | undefined>);
  return r ?? null;
}

type Bytes = Uint8Array | string | undefined;

/**
 * Username de una cuenta (`Resources.Consumers`): el completo si es persona verificada,
 * si no el lite (esserick.01). null si la cuenta no tiene. Lanza si no se pudo consultar.
 */
export async function usernameDe(ss58: string): Promise<string | null> {
  const c = await consultarPeople(cl =>
    cl.getUnsafeApi().query.Resources.Consumers.getValue(ss58) as Promise<{ full_username?: Bytes; lite_username?: Bytes } | undefined>);
  const u = c?.full_username ?? c?.lite_username;
  if (u == null) return null;
  if (typeof u !== 'string') return new TextDecoder().decode(u);
  return /^0x([0-9a-f]{2})*$/i.test(u) ? new TextDecoder().decode(Uint8Array.from(u.slice(2).match(/../g) ?? [], b => parseInt(b, 16))) : u;
}

/**
 * Firma bytes con la cuenta de IDENTIDAD (la del username). El host puede envolverlos en
 * `<Bytes>…</Bytes>`: quien verifica prueba las dos formas (lib/sesion.ts).
 */
export async function firmarConIdentidad(bytes: Uint8Array): Promise<Uint8Array> {
  if (!sesion?.identidad) throw new Error(`Sin cuenta de identidad: ${sesion?.sinIdentidad ?? 'conecta primero'}.`);
  const sig = await withTimeout(sesion.identidad.signer.signBytes(bytes), HOST_SUBMIT_MS);
  if (sig === TIMED_OUT) throw new Error('La firma no llegó a tiempo. Revisa el celular emparejado.');
  return sig;
}

/** Firmante de transacciones de la cuenta de identidad. Antes, `askChainSubmit()` (permisos.ts). */
export function firmanteIdentidad(): PolkadotSigner {
  if (!sesion?.identidad) throw new Error(`Sin cuenta de identidad: ${sesion?.sinIdentidad ?? 'conecta primero'}.`);
  return sesion.identidad.signer;
}
