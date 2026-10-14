/** Marco de página (barra + contenido + pie), piezas compartidas y la hoja del certificado. */
import { el, icono, corta, fechaLarga, type Icono } from '../ui';
import type { Certificado } from '../lib/registro';
import type { Destino } from '../lib/cuenta';
import { registroListo } from '../lib/registro';
import { aviso } from '../ui';

type Seccion = 'inicio' | 'constancia' | 'mis' | 'verificar' | 'otra';
type Hijo = Node | string | null | undefined | false;

const marca = () => el('a', { class: 'marca', href: '#/' },
  el('span', { class: 'marca-sello' }, icono('sealCheck')),
  el('span', { class: 'marca-texto' }, el('strong', {}, 'Certificados en Cadena'), el('small', {}, 'UANL × Polkadot')),
);

function pie(): HTMLElement {
  const col = (titulo: string, ...links: [string, string][]) =>
    el('div', {}, el('h4', {}, titulo), el('ul', {}, ...links.map(([href, texto]) => el('li', {}, el('a', { href }, texto)))));
  return el('footer', { class: 'pie' }, el('div', { class: 'pie-in' },
    el('div', { class: 'pie-top' },
      el('div', {}, marca(), el('p', {}, 'Constancias de la Universidad Autónoma de Nuevo León registradas en Polkadot Asset Hub. Cualquiera puede comprobarlas.')),
      col('Estudiantes', ['#/constancia', 'Reclamar constancia'], ['#/mis', 'Mis certificados']),
      col('Verificar', ['#/verificar', 'Verificar un PDF'], ['#/muestra', 'Ver un ejemplo']),
      col('Organizadores', ['#/organizar', 'Panel del organizador'], ['#/diagnostico', 'Diagnóstico']),
    ),
    el('div', { class: 'pie-base' }, el('span', {}, 'Polkadot University México · UANL'), el('span', {}, 'Registrado en Polkadot')),
  ));
}

export function marco(root: HTMLElement, actual: Seccion, ...contenido: Hijo[]): void {
  const link = (href: string, texto: string, s: Seccion) =>
    el('a', s === actual ? { href, 'aria-current': 'page' } : { href }, texto);
  const barra = el('header', { class: 'barra' }, el('div', { class: 'barra-in' },
    marca(),
    el('nav', { 'aria-label': 'Secciones' },
      link('#/constancia', 'Reclamar', 'constancia'),
      link('#/mis', 'Mis certificados', 'mis'),
      link('#/verificar', 'Verificar', 'verificar'),
    ),
  ));
  const main = el('main', { class: 'pila entra' });
  if (!registroListo()) main.append(aviso('info', 'El registro de certificados todavía no está desplegado. Las búsquedas funcionarán en cuanto lo esté.'));
  main.append(...contenido.filter((n): n is Node | string => n != null && n !== false));
  root.replaceChildren(barra, main, pie());
  window.scrollTo(0, 0);
}

/** Etiqueta en Space Mono sobre un título. */
export const ceja = (texto: string, centro = false) => el('p', { class: centro ? 'ceja centro' : 'ceja' }, texto);

/** Encabezado de página: etiqueta, título y entrada. */
export function cabecera(etiqueta: string, titulo: string, entrada?: string): HTMLElement {
  return el('header', { class: 'cabecera' }, ceja(etiqueta), el('h1', {}, titulo), entrada ? el('p', { class: 'lead' }, entrada) : null);
}

export type EstadoPaso = 'activo' | 'hecho' | 'bloqueado';

/** Bloque numerado de un flujo (01 Tu cuenta, 02 Tu nombre…). */
export function paso(num: string, titulo: string, ayuda: string, ...cuerpo: Hijo[]): HTMLElement & { estado(e: EstadoPaso): void } {
  const s = el('section', { class: 'paso', 'aria-label': titulo },
    el('div', { class: 'paso-cab' }, el('span', { class: 'paso-num', 'aria-hidden': 'true' }, num), el('h2', {}, titulo), el('p', {}, ayuda)),
    ...cuerpo,
  ) as HTMLElement & { estado(e: EstadoPaso): void };
  s.estado = e => {
    s.classList.toggle('hecho', e === 'hecho');
    s.classList.toggle('bloqueado', e === 'bloqueado');
  };
  return s;
}

/** Recuadro de ayuda: etiqueta y una lista corta con íconos. */
export function nota(etiqueta: string, ...puntos: [Icono, string, string][]): HTMLElement {
  return el('aside', { class: 'nota' }, el('span', { class: 'nota-etiqueta' }, etiqueta),
    el('ul', {}, ...puntos.map(([ic, fuerte, resto]) => el('li', {}, icono(ic), el('span', {}, el('strong', {}, fuerte), ' ', resto)))));
}

/** La cuenta elegida: usuario y dirección corta, más un botón opcional (Cambiar). */
export function fichaCuenta(d: Destino, ...extra: Hijo[]): HTMLElement {
  const dir = d.ss58 ?? d.h160;
  return el('div', { class: 'ficha-cuenta' }, icono('user'),
    el('div', {}, el('strong', {}, d.username ?? 'Cuenta sin usuario'), el('span', { class: 'mono muted' }, `${dir.slice(0, 8)}…${dir.slice(-6)}`)),
    ...extra);
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
