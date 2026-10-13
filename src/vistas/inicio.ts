/** #/: qué es y a dónde ir. */
import { marco } from './comun';
import { el, boton } from '../ui';

export function vistaInicio(root: HTMLElement): void {
  marco(root, 'inicio',
    el('section', { class: 'hero' },
      el('h1', {}, 'Tus certificados, verificables por cualquiera'),
      el('p', {}, 'La UANL registra cada constancia en Polkadot. Búscala con tu nombre, pídela para tu cuenta y compártela.'),
      el('div', { class: 'acciones' },
        boton('Reclamar mi constancia', { href: '#/constancia', icono: 'sealCheck', clase: 'primario' }),
        boton('Verificar un PDF', { href: '#/verificar', icono: 'shield' }),
      ),
    ),
    el('section', { class: 'pasos', 'aria-label': 'Cómo funciona' },
      el('div', {}, el('h3', {}, 'Busca'), el('p', {}, 'Conecta tu cuenta de la Polkadot App y escribe tu nombre completo.')),
      el('div', {}, el('h3', {}, 'Pide'), el('p', {}, 'Toca «Es mía». El organizador lo revisa y te la asigna. No necesitas saldo.')),
      el('div', {}, el('h3', {}, 'Comparte'), el('p', {}, 'Agrégala a LinkedIn. Quien la vea puede comprobar que es auténtica.')),
    ),
    el('p', { class: 'muted' }, el('a', { href: '#/organizar' }, 'Soy organizador')),
  );
}
