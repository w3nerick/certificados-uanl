/**
 * Lo que hace el organizador desde la Polkadot App (mejor en Polkadot Desktop: en el
 * celular la app no deja elegir archivos):
 *
 * 1. Conectar con su cuenta de identidad y comprobar que es emisora.
 * 2. Firmar UNA vez la sesión de subida; el servidor le da un link firmado por PDF
 *    y el PDF sube directo a Pinata (la llave de Pinata nunca llega a la app).
 * 3. Emitir en lotes de pocas constancias por transacción (el límite es el proof_size).
 * 4. Revisar solicitudes y aprobarlas en lote (`asignar`).
 */
import type { Hex } from 'viem';
import { conectar, firmarConIdentidad, firmanteIdentidad, usernameOwner, type Sesion } from './identidad';
import { askChainSubmit } from './permisos';
import { assetHub, freeBalance } from './cadena';
import { simular, escribir, estaMapeada, mapear, WEIGHT_CAP, type Simulacion } from './contrato';
import { contrato, h160De, porPdf, type Solicitud } from './registro';
import { sha256Hex } from './ipfs';
import { textoSesion, SESION_HORAS } from './sesion';
import { SUBIDA_URL } from './red';

export interface Organizador {
  sesion: Sesion;
  ss58: string;
  h160: Hex;
  esEmisor: boolean;
  saldo: bigint;
  mapeada: boolean;
}

export async function conectarOrganizador(usuarioEscrito?: string): Promise<Organizador> {
  const sesion = await conectar(usuarioEscrito);
  if (!sesion.identidad) {
    const e = new Error(`Para emitir hace falta tu cuenta con usuario de la Polkadot App (${sesion.sinIdentidad}). Escribe tu username y vuelve a conectar.`);
    (e as Error & { pideUsuario?: boolean }).pideUsuario = true;
    throw e;
  }
  const ss58 = sesion.identidad.address;
  const chain = await assetHub();
  const h160 = await h160De(ss58);
  const [esEmisor, saldo, mapeada] = await Promise.all([
    import('./contrato').then(m => m.leer<boolean>(chain.client, contrato(), 'emisores', [h160])),
    freeBalance(chain, ss58),
    estaMapeada(chain.client, ss58),
  ]);
  return { sesion, ss58, h160, esEmisor, saldo, mapeada };
}

/** Mapea la cuenta en pallet-revive si hace falta (una sola vez, una firma). */
export async function asegurarMapeo(o: Organizador): Promise<void> {
  if (o.mapeada) return;
  await askChainSubmit();
  await mapear((await assetHub()).client, firmanteIdentidad());
  o.mapeada = true;
}

// ---------- Sesión de subida ----------

let sesionSubida: { ss58: string; expira: number; firma: Hex } | null = null;

async function firmaDeSesion(o: Organizador) {
  const ahora = Math.floor(Date.now() / 1000);
  if (sesionSubida && sesionSubida.ss58 === o.ss58 && sesionSubida.expira > ahora + 300) return sesionSubida;
  const expira = ahora + SESION_HORAS * 3600;
  const sig = await firmarConIdentidad(new TextEncoder().encode(textoSesion(contrato().address, o.ss58, expira)));
  sesionSubida = { ss58: o.ss58, expira, firma: ('0x' + Array.from(sig, b => b.toString(16).padStart(2, '0')).join('')) as Hex };
  return sesionSubida;
}

/** Sube un PDF a Pinata con un link firmado. Devuelve el CID. */
export async function subirPdf(o: Organizador, archivo: string, bytes: Uint8Array): Promise<string> {
  const s = await firmaDeSesion(o);
  const r = await fetch(SUBIDA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...s, archivo }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (r.status === 401) sesionSubida = null;
  if (!r.ok || !j.url) throw new Error(j.error ?? `el servidor de subidas respondió ${r.status}`);
  const form = new FormData();
  form.append('file', new Blob([bytes as BlobPart], { type: 'application/pdf' }), archivo);
  form.append('network', 'public');
  const up = await fetch(j.url, { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) });
  const u = (await up.json().catch(() => ({}))) as { data?: { cid?: string } };
  if (!up.ok || !u.data?.cid) throw new Error(`Pinata rechazó ${archivo} (${up.status})`);
  return u.data.cid;
}

// ---------- PDFs elegidos ----------

export interface PdfElegido {
  archivo: string;
  bytes: Uint8Array;
  sha: Hex;
  nombre: string;
  /** Folio si ese PDF ya está en la cadena. */
  yaEmitido: bigint | null;
  cid?: string;
  folio?: bigint;
}

/** "03_mariana-garza_treviño.pdf" → "Mariana Garza Treviño" (se puede corregir a mano). */
export function nombreDeArchivo(archivo: string): string {
  return archivo
    .replace(/\.pdf$/i, '')
    .replace(/^[\d\s._-]+/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es-MX')
    .replace(/(^|\s)(\p{L})/gu, (_m, s: string, l: string) => s + l.toLocaleUpperCase('es-MX'))
    .replace(/\b(De|Del|La|Las|Los|Y)\b/g, w => (w === 'Y' ? 'y' : w.toLowerCase()));
}

export async function leerPdfs(files: FileList | File[]): Promise<PdfElegido[]> {
  const out: PdfElegido[] = [];
  for (const f of Array.from(files)) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error(`${f.name} no es un PDF.`);
    if (bytes.length > 15 * 1024 * 1024) throw new Error(`${f.name} pasa de 15 MB.`);
    const sha = await sha256Hex(bytes);
    if (out.some(p => p.sha === sha)) throw new Error(`${f.name} es idéntico a otro PDF elegido.`);
    const ya = await porPdf(sha);
    out.push({ archivo: f.name, bytes, sha, nombre: nombreDeArchivo(f.name), yaEmitido: ya === 0n ? null : ya });
  }
  return out;
}

// ---------- Emitir ----------

export interface DatosLote {
  programa: string;
  institucion: string;
  /** Segundos Unix */
  fecha: bigint;
}

const ZERO = '0x0000000000000000000000000000000000000000';
type Lote = { pdfs: PdfElegido[]; sim: Extract<Simulacion, { ok: true }> };

const nuevo = (p: PdfElegido, d: DatosLote) => ({
  nombre: p.nombre.trim(),
  programa: d.programa.trim(),
  institucion: d.institucion.trim(),
  cid: p.cid ?? '',
  sha256Pdf: p.sha,
  fecha: d.fecha,
  llaveReclamo: ZERO,
  titular: ZERO,
});

const pesada = (s: Extract<Simulacion, { ok: true }>) => s.weight.ref_time * 2n > WEIGHT_CAP.ref_time || s.weight.proof_size * 2n > WEIGHT_CAP.proof_size;

async function partir(pdfs: PdfElegido[], d: DatosLote, origen: string): Promise<Lote[]> {
  const client = (await assetHub()).client;
  const sim = await simular(client, origen, contrato(), 'emitir', [pdfs.map(p => nuevo(p, d))]);
  if (sim.ok && !pesada(sim)) return [{ pdfs, sim }];
  if (pdfs.length === 1) throw new Error(`${pdfs[0].archivo}: ${sim.ok ? 'demasiado pesado para una transacción' : sim.why}`);
  const m = Math.ceil(pdfs.length / 2);
  return [...(await partir(pdfs.slice(0, m), d, origen)), ...(await partir(pdfs.slice(m), d, origen))];
}

/** Arma lotes de hasta 5 y los simula desde la cuenta del organizador. */
export async function planear(o: Organizador, pdfs: PdfElegido[], d: DatosLote): Promise<Lote[]> {
  const lotes: Lote[] = [];
  for (let i = 0; i < pdfs.length; i += 5) lotes.push(...(await partir(pdfs.slice(i, i + 5), d, o.ss58)));
  return lotes;
}

/** Firma y envía cada lote (una aprobación en el celular por transacción). */
export async function emitir(lotes: Lote[], onAvance: (hecho: number, total: number) => void): Promise<void> {
  await askChainSubmit();
  const client = (await assetHub()).client;
  const signer = firmanteIdentidad();
  for (const [i, l] of lotes.entries()) {
    onAvance(i, lotes.length);
    await escribir(client, signer, contrato(), l.sim);
    for (const p of l.pdfs) p.folio = await porPdf(p.sha);
  }
  onAvance(lotes.length, lotes.length);
}

// ---------- Solicitudes ----------

export interface SolicitudRevisada extends Solicitud {
  /** El usuario escrito es dueño de la cuenta que pide (comprobado en People chain). */
  verificada: boolean;
}

export async function revisar(s: Solicitud): Promise<SolicitudRevisada> {
  if (!s.usuario) return { ...s, verificada: false };
  try {
    const owner = await usernameOwner(s.usuario);
    return { ...s, verificada: owner != null && (await h160De(owner)) === s.titular.toLowerCase() };
  } catch {
    return { ...s, verificada: false };
  }
}

/** Aprueba en lote: asigna cada certificado a la cuenta elegida. */
export async function aprobar(o: Organizador, pares: { id: bigint; titular: Hex }[]): Promise<void> {
  const client = (await assetHub()).client;
  const sim = await simular(client, o.ss58, contrato(), 'asignar', [pares.map(p => p.id), pares.map(p => p.titular)]);
  if (!sim.ok) throw new Error(sim.why);
  await askChainSubmit();
  await escribir(client, firmanteIdentidad(), contrato(), sim);
}
