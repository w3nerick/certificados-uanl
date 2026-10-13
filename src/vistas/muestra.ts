/** #/muestra: cómo se ve un certificado, con datos de ejemplo (marca de agua MUESTRA). Para revisar el diseño con la UANL. */
import { marco, hoja } from './comun';
import { el, aviso } from '../ui';
import type { Certificado } from '../lib/registro';

const EJEMPLO: Certificado = {
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

export function vistaMuestra(root: HTMLElement): void {
  const h = hoja(EJEMPLO);
  h.classList.add('muestra');
  marco(root, 'otra',
    el('h1', {}, 'Así se ve un certificado'),
    aviso('info', 'Datos de ejemplo. Los certificados reales salen de la cadena.'),
    el('div', { style: 'max-width: 860px' }, h),
  );
}
