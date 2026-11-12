/**
 * Quién es el usuario y con qué llave firma.
 *
 * Dentro del host hay dos llaves (docs/04-identidad-y-firma.md):
 *
 * - **app**: la cuenta de producto que el host deriva para ESTE dominio. Es lo
 *   que entrega `SignerManager.connect()`. Firma sin problema, pero nadie puede
 *   ligarla a una persona, y cambia si cambia el dominio.
 * - **identidad**: la cuenta dueña del username. Ata la firma a una persona. Se
 *   obtiene así: username → `Resources.UsernameOwnerOf` (People chain) o, si no
 *   está, `DotnsGateway.LiteLabelOwner` (Asset Hub) → llave →
 *   `getAccountsProvider().getLegacyAccountSigner(...)`.
 *
 * Fuera del host: cuenta de desarrollo (Alice), solo para ensayar.
 *
 * NO uses `requestLogin()`: ninguna app que funciona en el devnet lo usa, y
 * esperar ese diálogo dejaba la UI cargando para siempre.
 */
import { AccountId, type PolkadotClient } from 'polkadot-api';
import type { SignerTxCreator as PolkadotSigner } from 'polkadot-api/tx-creator';
import { getAccountsProvider } from '@parity/product-sdk-host';
// Solo el tipo: el signer (con sus llaves, ~90 KB) se baja al conectar, no al abrir la app.
import type { SignerManager } from '@parity/product-sdk-signer';
import { insideHost, waitForHost, withTimeout, describeError, TIMED_OUT, HOST_QUERY_MS, HOST_SUBMIT_MS } from './host';
import { assetHub, people, peopleViaPublic } from './cadena';
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

/** Abre un diálogo del wallet: llámalo solo desde un gesto del usuario (un clic).
 * `usuarioEscrito`: username que escribió la persona, para cuando el Host no lo entrega
 * (Polkadot Desktop 0.1.4: «No primary username for this session»). */
export async function conectar(usuarioEscrito?: string): Promise<Sesion> {
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

  // El host puede mostrar un cuadro para compartir la identidad (SDK 0.39): tiempo de diálogo, no de consulta
  const u = await withTimeout(manager.getUserId(), HOST_SUBMIT_MS).catch((e: unknown) => ({ ok: false as const, error: e }));
  const username = u !== TIMED_OUT && u.ok ? u.value.primaryUsername || null : null;
  let identidad: Sesion['identidad'] = null;
  let sinIdentidad: string | null = u === TIMED_OUT ? 'el host no entregó el username a tiempo (¿aprobaste compartir tu identidad?)'
    : !u.ok ? `el host no entregó el username: ${describeError(u.error)}`
    : 'la cuenta no tiene username';
  if (username) {
    try {
      const owner = await usernameOwner(username);
      const ap = owner ? await withTimeout(getAccountsProvider(), HOST_QUERY_MS) : null;
      if (!owner) sinIdentidad = `${username} no aparece en People chain ni en Asset Hub`;
      else if (!ap || ap === TIMED_OUT) sinIdentidad = 'el host no entregó el proveedor de cuentas';
      else {
        const publicKey = ss58.enc(owner);
        identidad = { address: owner, publicKey, signer: ap.getLegacyAccountSigner({ publicKey, name: username }) };
      }
    } catch (e) {
      sinIdentidad = `no se pudo buscar la cuenta de ${username} (${(e as Error).message})`;
    }
  }
  // Sin username del Host, o uno que no se encontró: el username escrito o las cuentas del wallet.
  // Firmar con la identidad no necesita el username, solo su llave pública (getLegacyAccountSigner).
  if (!identidad) {
    const respaldo = await identidadSinUsername(usuarioEscrito).catch((e: Error) => e.message);
    if (respaldo && typeof respaldo === 'object') {
      sesion = { app, username: respaldo.username, identidad: respaldo.identidad, sinIdentidad: null, ensayo: false };
      return sesion;
    }
    if (typeof respaldo === 'string') sinIdentidad = `${sinIdentidad}; ${respaldo}`;
  } else {
    sinIdentidad = null;
  }
  sesion = { app, username, identidad, sinIdentidad, ensayo: false };
  return sesion;
}

/**
 * Identidad sin el username del Host. Primero el username escrito; si no hay, las cuentas del wallet
 * (getLegacyAccounts) que tengan username en People chain. Null si no se encontró ninguna.
 */
async function identidadSinUsername(usuarioEscrito?: string): Promise<{ username: string; identidad: NonNullable<Sesion['identidad']> } | null> {
  const ap = await withTimeout(getAccountsProvider(), HOST_QUERY_MS);
  if (!ap || ap === TIMED_OUT) throw new Error('el host no entregó el proveedor de cuentas');
  const escrito = usuarioEscrito?.trim().toLowerCase();
  if (escrito) {
    const owner = await usernameOwner(escrito);
    if (!owner) throw new Error(`${escrito} no aparece en People chain ni en Asset Hub`);
    const publicKey = ss58.enc(owner);
    return { username: escrito, identidad: { address: owner, publicKey, signer: ap.getLegacyAccountSigner({ publicKey, name: escrito }) } };
  }
  const cuentas = await withTimeout(ap.getLegacyAccounts().match(v => v, () => []), HOST_QUERY_MS);
  if (cuentas === TIMED_OUT || cuentas.length === 0) return null;
  for (const c of cuentas) {
    const address = ss58.dec(c.publicKey);
    const nombre = await usernameDe(address).catch(() => null);
    if (nombre) return { username: nombre, identidad: { address, publicKey: c.publicKey, signer: ap.getLegacyAccountSigner({ publicKey: c.publicKey, name: nombre }) } };
  }
  return null;
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

/** Lee un storage de Asset Hub con tope de tiempo. Lanza si no se pudo consultar. */
async function consultarAssetHub<T>(leer: (client: PolkadotClient) => Promise<T>): Promise<T> {
  // Holgado: la primera consulta baja la metadata de Asset Hub (~1.3 MB).
  const r = await withTimeout(leer((await assetHub()).client), 45_000);
  if (r === TIMED_OUT) throw new Error('Asset Hub no respondió');
  return r;
}

/**
 * Dueño (SS58) de un username, o null si no existe. Lanza si no se pudo consultar.
 * Primero People chain; si no está ahí, `DotnsGateway.LiteLabelOwner` en Asset Hub: los hosts
 * nuevos (TrUAPI 0.26+) leen el nombre de ahí, y una cuenta restaurada puede tener ahí otro
 * nombre lite que People chain no conoce (eserick.01 en Asset Hub, esserick.01 en People).
 */
export function usernameOwner(username: string): Promise<string | null> {
  const bytes = new TextEncoder().encode(username);
  return peopleOAssetHub(
    consultarPeople(c =>
      c.getUnsafeApi().query.Resources.UsernameOwnerOf.getValue(bytes) as Promise<string | undefined>).then(r => r ?? null),
    consultarAssetHub(c =>
      c.getUnsafeApi().query.DotnsGateway.LiteLabelOwner.getValue(bytes) as Promise<string | undefined>).then(r => r ?? null),
  );
}

/**
 * Las dos consultas ya van en paralelo (la primera de cada cadena baja su metadata). Gana People;
 * Asset Hub solo cuenta si People no tiene nada. Lanza si no hay respuesta confiable.
 */
async function peopleOAssetHub<T>(dePeople: Promise<T | null>, deAssetHub: Promise<T | null>): Promise<T | null> {
  deAssetHub.catch(() => {}); // sin «unhandled rejection» cuando People gana
  let errorPeople: unknown = null;
  const p = await dePeople.catch((e: unknown) => { errorPeople = e; return null; });
  if (p != null) return p;
  let a: T | null;
  try {
    a = await deAssetHub;
  } catch (e) {
    throw errorPeople ?? e;
  }
  if (a == null && errorPeople) throw errorPeople;
  return a;
}

type Bytes = Uint8Array | string | undefined;

function texto(u: Bytes | null): string | null {
  if (u == null) return null;
  if (typeof u !== 'string') return new TextDecoder().decode(u);
  return /^0x([0-9a-f]{2})*$/i.test(u) ? new TextDecoder().decode(Uint8Array.from(u.slice(2).match(/../g) ?? [], b => parseInt(b, 16))) : u;
}

/**
 * Username de una cuenta (`Resources.Consumers` de People chain): el completo si es persona
 * verificada, si no el lite (esserick.01). Si People no tiene ninguno, el de
 * `DotnsGateway.AccountNames` en Asset Hub. null si la cuenta no tiene. Lanza si no se pudo consultar.
 */
export function usernameDe(ss58: string): Promise<string | null> {
  return peopleOAssetHub(
    consultarPeople(cl =>
      cl.getUnsafeApi().query.Resources.Consumers.getValue(ss58) as Promise<{ full_username?: Bytes; lite_username?: Bytes } | undefined>)
      .then(c => texto(c?.full_username ?? c?.lite_username ?? null)),
    consultarAssetHub(cl =>
      cl.getUnsafeApi().query.DotnsGateway.AccountNames.getValue(ss58) as Promise<{ full?: { label?: Bytes }; lite?: { label?: Bytes } } | undefined>)
      .then(n => texto(n?.full?.label ?? n?.lite?.label ?? null)),
  );
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
