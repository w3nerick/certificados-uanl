/** #/muestra: cómo se ve un certificado, con datos de ejemplo (marca de agua MUESTRA). Para revisar el diseño con la UANL. */
import { marco, hoja, cabecera } from './comun';
import { el, boton } from '../ui';
import type { Certificado } from '../lib/registro';

export const EJEMPLO: Certificado = {
  id: 1n,
  nombre: 'Mariana Garza Treviño',
  programa: 'Polkadot University México · Taller de desarrollo en Polkadot',
  institucion: 'Universidad Autónoma de Nuevo León',
  cid: '',
  sha256Pdf: '0x9f2c41e07b5d3a8806c1f4e2d7b39a5c0e8f61d24b7a93c5e0d1f6a2b8c47e13',
  fecha: 1_793_318_400n,
  bloque: 14_215_380n,
  reclamadoEn: 0n,
  emitidoPor: '0x0000000000000000000000000000000000000000',
  llaveReclamo: '0x0000000000000000000000000000000000000000',
  titular: '0x0000000000000000000000000000000000000000',
  revocado: false,
};

/** La hoja de ejemplo con su marca de agua. */
export function hojaMuestra(): HTMLElement {
  const h = hoja(EJEMPLO);
  h.classList.add('muestra');
  return h;
}

export function vistaMuestra(root: HTMLElement): void {
  marco(root, 'muestra',
    cabecera('Ejemplo', 'Así se ve un certificado', 'Datos de ejemplo. Los certificados reales salen de la cadena: nombre, programa, fecha y la huella del PDF quedan registrados en Polkadot.'),
    el('div', { style: 'max-width: 860px; padding-right: 8px' }, hojaMuestra()),
    el('div', { class: 'acciones' }, boton('Reclamar mi constancia', { href: '#/constancia', icono: 'sealCheck', clase: 'primario' })),
  );
}
