/**
 * RegistroCertificados: lecturas tipadas y textos de error en español.
 * Leer es simular (`ReviveApi.call`): sin firma ni comisiones, desde cualquier dispositivo.
 */
import { Binary, type PolkadotClient } from 'polkadot-api';
import type { Abi, Hex } from 'viem';
import abi from '../abi/RegistroCertificados.json';
import { leer, type Contrato } from './contrato';
import { assetHub } from './cadena';
import { REGISTRO_ADDRESS } from './red';

export interface Certificado {
  id: bigint;
  nombre: string;
  programa: string;
  institucion: string;
  cid: string;
  sha256Pdf: Hex;
  fecha: bigint;
  bloque: bigint;
  reclamadoEn: bigint;
  emitidoPor: Hex;
  llaveReclamo: Hex;
  titular: Hex;
  revocado: boolean;
}

export const ZERO = '0x0000000000000000000000000000000000000000' as const;
export const registroListo = () => REGISTRO_ADDRESS != null;

export function contrato(): Contrato {
  if (!REGISTRO_ADDRESS) throw new Error('El registro de certificados todavía no está desplegado.');
  return { address: REGISTRO_ADDRESS, abi: abi as Abi };
}

async function cliente(): Promise<PolkadotClient> {
  return (await assetHub()).client;
}

export async function total(): Promise<bigint> {
  return leer<bigint>(await cliente(), contrato(), 'total');
}

/** null si el id no existe. */
export async function certificado(id: bigint): Promise<Certificado | null> {
  if (id <= 0n) return null;
  try {
    const c = await leer<Omit<Certificado, 'id'>>(await cliente(), contrato(), 'certificado', [id]);
    return { id, ...c };
  } catch (e) {
    if (/NoExiste/.test((e as Error).message)) return null;
    throw e;
  }
}

export async function motivoRevocacion(id: bigint): Promise<string> {
  return leer<string>(await cliente(), contrato(), 'motivoRevocacion', [id]);
}

/** Id del certificado con esa huella de PDF, o 0n. */
export async function porPdf(sha256: Hex): Promise<bigint> {
  return leer<bigint>(await cliente(), contrato(), 'porPdf', [sha256]);
}

export async function deTitular(h160: Hex): Promise<Certificado[]> {
  const ids = await leer<readonly bigint[]>(await cliente(), contrato(), 'deTitular', [h160]);
  const lista = await Promise.all(ids.map(id => certificado(id)));
  return lista.filter((c): c is Certificado => c != null).sort((a, b) => Number(b.fecha - a.fecha));
}

/**
 * Dirección H160 de una cuenta SS58 en pallet-revive. La da el runtime (no un cálculo
 * propio) y no cambia si la cuenta se mapea después.
 */
export async function h160De(ss58: string): Promise<Hex> {
  const r = (await (await cliente()).getUnsafeApi().apis.ReviveApi.address(ss58)) as Uint8Array | string;
  return (typeof r === 'string' ? r : Binary.toHex(r)).toLowerCase() as Hex;
}

const ERRORES: Record<string, string> = {
  YaReclamado: 'Este certificado ya fue reclamado.',
  FirmaInvalida: 'El link no corresponde a este certificado.',
  EstaRevocado: 'Este certificado fue revocado por la institución.',
  NoExiste: 'Ese certificado no existe.',
  DireccionVacia: 'Falta la cuenta del titular.',
  YaSolicitado: 'Ya pediste esta constancia: espera la aprobación del organizador.',
  DemasiadasSolicitudes: 'Esta constancia ya tiene demasiadas solicitudes. Habla con el organizador.',
  SoloEmisor: 'Tu cuenta no es emisora en el contrato.',
};

/** Traduce "el contrato rechazó: YaReclamado" y similares. */
export function errorLegible(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  for (const [k, v] of Object.entries(ERRORES)) if (m.includes(k)) return v;
  return m;
}

export interface Solicitud {
  titular: Hex;
  usuario: string;
  fecha: bigint;
}

export async function solicitudes(id: bigint): Promise<Solicitud[]> {
  return [...(await leer<readonly Solicitud[]>(await cliente(), contrato(), 'solicitudes', [id]))];
}

/** Todos los certificados, de 50 en 50 (para buscar por nombre y para el panel). */
export async function todos(): Promise<Certificado[]> {
  const n = await total();
  const out: Certificado[] = [];
  for (let desde = 1n; desde <= n; desde += 50n) {
    const [ids, lista] = await leer<readonly [readonly bigint[], readonly Omit<Certificado, 'id'>[]]>(await cliente(), contrato(), 'pagina', [desde, 50n]);
    ids.forEach((id, i) => out.push({ id, ...lista[i] }));
  }
  return out;
}

/** Certificados con solicitudes abiertas, con sus solicitudes. */
export async function conSolicitudes(): Promise<{ id: bigint; solicitudes: Solicitud[] }[]> {
  const n = await total();
  const out: { id: bigint; solicitudes: Solicitud[] }[] = [];
  for (let desde = 1n; desde <= n; desde += 200n) {
    const [ids, listas] = await leer<readonly [readonly bigint[], readonly (readonly Solicitud[])[]]>(await cliente(), contrato(), 'conSolicitudes', [desde, 200n]);
    ids.forEach((id, i) => out.push({ id, solicitudes: [...listas[i]] }));
  }
  return out;
}

/** "María José Garza-Treviño" → "maria jose garza trevino" */
export const normalizarNombre = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Coincide si TODAS las palabras escritas (2+ letras) están en el nombre del certificado.
 * Pide al menos dos palabras: con una sola ("maria") saldría media lista.
 */
export function coincideNombre(busqueda: string, nombre: string): boolean {
  const palabras = normalizarNombre(busqueda).split(' ').filter(p => p.length >= 2);
  if (palabras.length < 2) return false;
  const del = normalizarNombre(nombre).split(' ');
  return palabras.every(p => del.includes(p));
}
