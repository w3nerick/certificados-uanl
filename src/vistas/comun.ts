/** Marco de página (barra + contenido) y la hoja del certificado. */
import { el, icono, corta, fechaLarga } from '../ui';
import type { Certificado } from '../lib/registro';
import { registroListo } from '../lib/registro';
import { aviso } from '../ui';

type Seccion = 'inicio' | 'constancia' | 'mis' | 'verificar' | 'otra';

export function marco(root: HTMLElement, actual: Seccion, ...contenido: (Node | null)[]): void {
  const link = (href: string, texto: string, s: Seccion) =>
    el('a', s === actual ? { href, 'aria-current': 'page' } : { href }, texto);
  const barra = el('header', { class: 'barra' },
    el('a', { class: 'marca', href: '#/' }, icono('sealCheck'), 'Certificados en Cadena'),
    el('nav', { 'aria-label': 'Secciones' },
      link('#/constancia', 'Reclamar', 'constancia'),
      link('#/mis', 'Mis certificados', 'mis'),
      link('#/verificar', 'Verificar', 'verificar'),
    ),
  );
  const main = el('main', { class: 'pila entra' });
  if (!registroListo()) main.append(aviso('info', 'El registro de certificados todavía no está desplegado. Las búsquedas funcionarán en cuanto lo esté.'));
  main.append(...contenido.filter((n): n is Node => n != null));
  root.replaceChildren(barra, main);
  window.scrollTo(0, 0);
}

/** La hoja tipo diploma, dibujada solo con datos on-chain (se ve aunque IPFS falle). */
export function hoja(c: Certificado): HTMLElement {
  return el('article', { class: `hoja${c.revocado ? ' revocada' : ''}`, 'aria-label': `Certificado de ${c.nombre}` }, el('div', { class: 'hoja-in' },
    el('div', { class: 'hoja-banda' }),
    el('div', {},
      el('p', { class: 'hoja-inst' }, c.institucion),
      el('p', { class: 'hoja-con' }, 'Registrado en Polkadot'),
    ),
    el('div', { class: 'hoja-cuerpo' },
      el('p', { class: 'hoja-titulo' }, 'Certificado'),
      el('p', { class: 'hoja-se' }, 'Se otorga a'),
      el('p', { class: 'hoja-nombre' }, c.nombre),
      el('span', { class: 'hoja-linea' }),
      el('p', { class: 'hoja-programa' }, c.programa),
      el('p', { class: 'hoja-fecha' }, fechaLarga(c.fecha)),
    ),
    el('div', { class: 'hoja-pie' },
      el('p', { class: 'hoja-folio' }, `Folio ${c.id}`, el('br'), `PDF ${corta(c.sha256Pdf, 8)}`),
      el('div', { class: 'sello' },
        el('span', { class: 'sello-disco' }, icono('sealCheck')),
        el('span', {}, 'Verificado en', el('br'), `Asset Hub · bloque ${c.bloque}`),
      ),
    ),
  ));
}
