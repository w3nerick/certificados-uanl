/** Utilidades de DOM sin framework. */
import sealCheck from '@phosphor-icons/core/assets/regular/seal-check.svg?raw';
import certificate from '@phosphor-icons/core/assets/regular/certificate.svg?raw';
import filePdf from '@phosphor-icons/core/assets/regular/file-pdf.svg?raw';
import download from '@phosphor-icons/core/assets/regular/download-simple.svg?raw';
import linkedin from '@phosphor-icons/core/assets/regular/linkedin-logo.svg?raw';
import share from '@phosphor-icons/core/assets/regular/share-network.svg?raw';
import copy from '@phosphor-icons/core/assets/regular/copy.svg?raw';
import search from '@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw';
import arrowLeft from '@phosphor-icons/core/assets/regular/arrow-left.svg?raw';
import arrowRight from '@phosphor-icons/core/assets/regular/arrow-right.svg?raw';
import warning from '@phosphor-icons/core/assets/regular/warning-circle.svg?raw';
import checkCircle from '@phosphor-icons/core/assets/regular/check-circle.svg?raw';
import xCircle from '@phosphor-icons/core/assets/regular/x-circle.svg?raw';
import user from '@phosphor-icons/core/assets/regular/user-circle.svg?raw';
import upload from '@phosphor-icons/core/assets/regular/upload-simple.svg?raw';
import shield from '@phosphor-icons/core/assets/regular/shield-check.svg?raw';
import cube from '@phosphor-icons/core/assets/regular/cube.svg?raw';
import qr from '@phosphor-icons/core/assets/regular/qr-code.svg?raw';
import printer from '@phosphor-icons/core/assets/regular/printer.svg?raw';
import caretLeft from '@phosphor-icons/core/assets/regular/caret-left.svg?raw';

const ICONOS = { sealCheck, certificate, filePdf, download, linkedin, share, copy, search, arrowLeft, arrowRight, warning, checkCircle, xCircle, user, upload, shield, cube, qr, printer, caretLeft };
export type Icono = keyof typeof ICONOS;

type Hijo = Node | string | null | undefined | false;

/** Crea un elemento con atributos e hijos (los null/false se omiten). */
export function el(tag: string, attrs: Record<string, string> = {}, ...children: Hijo[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) if (c != null && c !== false) e.append(c);
  return e;
}

/** Ícono de Phosphor (SVG en línea, hereda el color del texto). */
export function icono(nombre: Icono, clase = 'ico'): HTMLElement {
  const s = el('span', { class: clase, 'aria-hidden': 'true' });
  s.innerHTML = ICONOS[nombre];
  return s;
}

/** Botón o enlace con ícono. */
export function boton(texto: string, opts: { icono?: Icono; href?: string; clase?: string; onClick?: (b: HTMLButtonElement) => unknown } = {}): HTMLElement {
  const clase = `btn ${opts.clase ?? ''}`.trim();
  const hijos = [opts.icono ? icono(opts.icono) : null, el('span', {}, texto)];
  if (opts.href) return el('a', { class: clase, href: opts.href }, ...hijos);
  const b = el('button', { class: clase, type: 'button' }, ...hijos) as HTMLButtonElement;
  if (opts.onClick) {
    b.onclick = async () => {
      b.disabled = true;
      b.setAttribute('aria-busy', 'true');
      try { await opts.onClick!(b); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    };
  }
  return b;
}

export const corta = (hex: string, n = 6) => (hex.length > 2 * n + 2 ? `${hex.slice(0, n + 2)}…${hex.slice(-n)}` : hex);

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Fecha en segundos Unix → "29 de octubre de 2026" (hora de Monterrey). */
export function fechaLarga(segundos: bigint | number): string {
  const d = new Date(Number(segundos) * 1000);
  const p = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Monterrey', day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
  const v = (t: string) => Number(p.find(x => x.type === t)?.value);
  return `${v('day')} de ${MESES[v('month') - 1]} de ${v('year')}`;
}

/** Placeholder con la forma del contenido final mientras carga. */
export const esqueleto = (lineas = 3) => el('div', { class: 'esqueleto', 'aria-busy': 'true' }, ...Array.from({ length: lineas }, () => el('span')));

export type Cargando = HTMLElement & { decir(texto: string): void };

/**
 * Esqueleto con una línea que dice en qué va («Conectando con Polkadot…») en vez de
 * esperar callado. Si pasa de 6 s, explica por qué: la primera lectura baja la
 * descripción de la cadena (~1.3 MB); las siguientes ya no.
 */
export function cargando(texto: string, lineas = 3): Cargando {
  const linea = el('p', { class: 'cargando-texto', role: 'status' }, texto);
  const e = el('div', { class: 'cargando' }, linea, esqueleto(lineas)) as Cargando;
  e.decir = t => { linea.textContent = t; };
  setTimeout(() => {
    if (e.isConnected) e.insertBefore(el('p', { class: 'ayuda' }, 'La primera conexión con Polkadot tarda unos segundos; después va más rápido.'), linea.nextSibling);
  }, 6000);
  return e;
}

export function aviso(tipo: 'ok' | 'mal' | 'info', texto: string, ...extra: Hijo[]): HTMLElement {
  const ic: Icono = tipo === 'ok' ? 'checkCircle' : tipo === 'mal' ? 'warning' : 'shield';
  return el('div', { class: `aviso aviso-${tipo}`, role: tipo === 'mal' ? 'alert' : 'status' }, icono(ic), el('div', {}, el('p', {}, texto), ...extra));
}

/** replaceChildren que ignora null/false (para hijos opcionales). */
export function poner(padre: Element, ...hijos: Hijo[]): void {
  padre.replaceChildren(...hijos.filter((h): h is Node | string => h != null && h !== false));
}
