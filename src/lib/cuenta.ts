/**
 * ¿A qué cuenta va un certificado? El estudiante escribe su usuario de la Polkadot App
 * (ana.01), una dirección SS58 o una H160. Dentro del host se detecta sola.
 *
 * Se usa la cuenta de IDENTIDAD (la dueña del username en People chain): es la misma
 * en todas las apps. La cuenta de producto que da el host cambia con cada dominio.
 */
import { AccountId } from 'polkadot-api';
import type { Hex } from 'viem';
import { usernameOwner, usernameDe, conectar } from './identidad';
import { h160De } from './registro';
import { assetHub } from './cadena';

export interface Destino {
  h160: Hex;
  ss58: string | null;
  /** Lo que se le muestra a la persona para confirmar. */
  etiqueta: string;
  username: string | null;
}

const ss58 = AccountId(42);

export async function resolverCuenta(texto: string): Promise<Destino> {
  const t = texto.trim();
  if (!t) throw new Error('Escribe tu usuario de la Polkadot App o una dirección.');
  if (/^0x[0-9a-fA-F]{40}$/.test(t)) return { h160: t.toLowerCase() as Hex, ss58: null, etiqueta: t.toLowerCase(), username: null };
  if (/^[1-9A-HJ-NP-Za-km-z]{46,48}$/.test(t)) {
    try { ss58.enc(t); } catch { throw new Error('Esa dirección no es válida.'); }
    return { h160: await h160De(t), ss58: t, etiqueta: t, username: null };
  }
  const username = t.replace(/^@/, '').replace(/\.dot$/, '').toLowerCase();
  const owner = await usernameOwner(username);
  if (!owner) throw new Error(`No hay ninguna cuenta con el usuario «${username}». Revísalo en tu perfil de la Polkadot App.`);
  return { h160: await h160De(owner), ss58: owner, etiqueta: `${username} (${owner.slice(0, 6)}…${owner.slice(-6)})`, username };
}

/**
 * Al revés: el usuario de la Polkadot App detrás de una dirección H160 (p. ej. quien emitió
 * un certificado). H160 → `Revive.OriginalAccount` (Asset Hub) → username (People).
 * null si la cuenta no está mapeada o no tiene usuario.
 */
export async function usuarioDe(h160: Hex): Promise<string | null> {
  const ah = (await assetHub()).client;
  const ss58 = (await ah.getUnsafeApi().query.Revive.OriginalAccount.getValue(h160)) as string | undefined;
  return ss58 ? usernameDe(ss58) : null;
}

/** Dentro de la Polkadot App: identidad del usuario, o su cuenta de la app si no tiene username. Abre un diálogo: solo desde un clic. */
export async function cuentaDelHost(): Promise<Destino> {
  const s = await conectar();
  const owner = s.identidad?.address ?? (s.username ? await usernameOwner(s.username).catch(() => null) : null);
  const cuenta = owner ?? s.app.address;
  return {
    h160: await h160De(cuenta),
    ss58: cuenta,
    etiqueta: s.username ? `${s.username} (${cuenta.slice(0, 6)}…${cuenta.slice(-6)})` : `${cuenta.slice(0, 6)}…${cuenta.slice(-6)} (cuenta de esta app)`,
    username: s.username,
  };
}
