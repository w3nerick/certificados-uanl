/**
 * #/: qué es y a dónde ir. Sigue la portada de las facultades de la UANL: carrusel con título
 * en slab y regla roja, «Próximos eventos» en franja gris y «Repositorio institucional» en roja.
 */
import { marco } from './comun';
import { hojaMuestra } from './muestra';
import { el, boton } from '../ui';

/** Un paso con el bloque de fecha de «Próximos eventos»: el número grande y el verbo en la franja roja. */
const pasoInicio = (num: string, verbo: string, titulo: string, href: string, texto: string) =>
  el('li', {},
    el('span', { class: 'bloque-num', 'aria-hidden': 'true' }, el('span', {}, num), el('span', {}, verbo)),
    el('div', {}, el('h3', {}, el('a', { href }, titulo)), el('p', {}, texto)),
  );

const comprueba = (titulo: string, texto: string) => el('li', {}, el('strong', {}, titulo), el('span', {}, texto));

export function vistaInicio(root: HTMLElement): void {
  marco(root, 'inicio',
    el('section', { class: 'portada', 'aria-labelledby': 'portada-titulo' },
      el('div', { class: 'contenedor portada-rejilla' },
        el('div', { class: 'portada-texto' },
          el('h1', { id: 'portada-titulo' }, 'Tus certificados, verificables por cualquiera'),
          el('p', { class: 'lead' }, 'La UANL registra cada constancia en Polkadot. Búscala con tu nombre, pídela para tu cuenta y compártela.'),
          el('div', { class: 'acciones' },
            boton('Reclamar mi constancia', { href: '#/constancia', icono: 'sealCheck', clase: 'primario' }),
            boton('Mis certificados', { href: '#/mis', icono: 'certificate', clase: 'claro' }),
          ),
        ),
        el('a', { class: 'portada-hoja', href: '#/muestra', 'aria-label': 'Ver un certificado de ejemplo' },
          hojaMuestra(),
          el('p', {}, 'Ejemplo: así se ve el tuyo'),
        ),
      ),
      el('div', { class: 'contenedor' }, el('div', { class: 'regla' })),
    ),
    el('section', { class: 'franja gris', 'aria-labelledby': 'como' },
      el('div', { class: 'contenedor' },
        el('header', { class: 'franja-cab' }, el('h2', { id: 'como' }, 'Cómo funciona'), el('a', { href: '#/muestra' }, 'Ver un ejemplo')),
        el('ol', { class: 'pasos-inicio' },
          pasoInicio('1', 'Busca', 'Encuentra tu constancia', '#/constancia', 'Conecta tu cuenta de la Polkadot App y escribe tu nombre completo, tal como aparece en tu constancia.'),
          pasoInicio('2', 'Pide', 'Pídela para tu cuenta', '#/constancia', 'Toca «Es mía». El organizador revisa que seas tú y te la asigna. La institución paga la transacción.'),
          pasoInicio('3', 'Comparte', 'Compártela', '#/mis', 'Agrégala a LinkedIn o comparte su enlace. Quien la vea puede comprobar que es auténtica.'),
        ),
      ),
    ),
    el('section', { class: 'franja roja', 'aria-labelledby': 'verificar-titulo' },
      el('div', { class: 'contenedor' },
        el('header', { class: 'franja-cab' },
          el('h2', { id: 'verificar-titulo' }, '¿Te enviaron un certificado?'),
          boton('Verificar ahora', { href: '#/verificar', icono: 'shield', clase: 'claro' }),
        ),
        el('p', { class: 'franja-sub' }, 'Suelta el PDF y compáralo con el registro en Polkadot. Esto es lo que se comprueba:'),
        el('ul', { class: 'comprueba' },
          comprueba('La huella del PDF, byte por byte', 'Si el archivo cambió aunque sea un poco, ya no coincide.'),
          comprueba('Quién lo emitió', 'Que lo registró un emisor autorizado, con su folio y su bloque.'),
          comprueba('Si sigue vigente', 'Si la institución lo revocó después de emitirlo.'),
          comprueba('Tu archivo no sale de tu dispositivo', 'Solo se calcula su huella y se busca en Polkadot.'),
        ),
      ),
    ),
  );
}
