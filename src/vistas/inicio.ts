/** #/: qué es y a dónde ir. */
import { marco, ceja } from './comun';
import { hojaMuestra } from './muestra';
import { el, boton } from '../ui';

const tarjeta = (num: string, titulo: string, texto: string) =>
  el('div', { class: 'tarjeta' }, el('span', { class: 'tarjeta-num' }, num), el('h3', {}, titulo), el('p', {}, texto));

export function vistaInicio(root: HTMLElement): void {
  const titulo = el('h1', {}, 'Tus certificados, ', el('em', {}, 'verificables'), ' por cualquiera');
  marco(root, 'inicio',
    el('section', { class: 'hero' },
      el('div', { class: 'hero-texto' },
        ceja('Universidad Autónoma de Nuevo León'),
        titulo,
        el('p', { class: 'lead' }, 'La UANL registra cada constancia en Polkadot. Búscala con tu nombre, pídela para tu cuenta y compártela.'),
        el('div', { class: 'acciones' },
          boton('Reclamar mi constancia', { href: '#/constancia', icono: 'sealCheck', clase: 'primario' }),
          boton('Verificar un PDF', { href: '#/verificar', icono: 'shield' }),
        ),
      ),
      el('a', { class: 'hero-hoja', href: '#/muestra', 'aria-label': 'Ver un certificado de ejemplo' },
        hojaMuestra(),
        el('p', { class: 'hero-hoja-pie' }, 'Ejemplo · así se ve el tuyo'),
      ),
    ),
    el('div', { class: 'dither', 'aria-hidden': 'true' }),
    el('section', { class: 'seccion', 'aria-labelledby': 'como' },
      el('header', {}, ceja('Cómo funciona', true), el('h2', { id: 'como' }, 'Tres pasos, ', el('em', {}, 'sin saldo'))),
      el('div', { class: 'tarjetas' },
        tarjeta('01', 'Busca', 'Conecta tu cuenta de la Polkadot App y escribe tu nombre completo, tal como aparece en tu constancia.'),
        tarjeta('02', 'Pide', 'Toca «Es mía». El organizador revisa que seas tú y te la asigna. La institución paga la transacción.'),
        tarjeta('03', 'Comparte', 'Agrégala a LinkedIn o comparte su enlace. Quien la vea puede comprobar que es auténtica.'),
      ),
    ),
    el('section', { class: 'bloque-negro' },
      el('div', {}, el('h2', {}, '¿Te enviaron un certificado?'), el('p', {}, 'Suelta el PDF y compáralo con el registro en Polkadot. El archivo no sale de tu dispositivo.')),
      boton('Verificar ahora', { href: '#/verificar', icono: 'arrowRight' }),
    ),
  );
}
