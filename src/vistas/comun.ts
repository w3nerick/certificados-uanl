/**
 * Marco de página con el lenguaje de los sitios de facultades de la UANL (como facpya.uanl.mx): barra
 * gris con la universidad, cabecera blanca con la marca, menú en barra roja, banda azul a la izquierda
 * y pie. Las vistas interiores van en una lámina gris montada sobre un banner, con «Regresar» y migas.
 * Aquí también viven las piezas compartidas (pasos, nota, ficha de cuenta) y la hoja del certificado.
 */
import { el, icono, corta, fechaLarga, aviso, type Icono } from '../ui';
import type { Certificado } from '../lib/registro';
import type { Destino } from '../lib/cuenta';
import { registroListo } from '../lib/registro';
import { qrSvg } from '../lib/qr';

export type Seccion = 'inicio' | 'constancia' | 'mis' | 'verificar' | 'muestra' | 'organizar' | 'cartel' | 'diagnostico' | 'otra';
type Hijo = Node | string | null | undefined | false;

/** Sello de la app + nombre en versales, separados por un filete (como el escudo y el nombre de cada facultad). */
const marca = () => el('a', { class: 'marca', href: '#/' },
  el('span', { class: 'marca-sello', 'aria-hidden': 'true' }, icono('sealCheck')),
  el('span', { class: 'marca-texto' }, el('span', {}, 'Certificados en Cadena'), el('span', {}, 'UANL × Polkadot')),
);

/**
 * Cada vista queda numerada en el historial. «Regresar» vuelve a la anterior si se llegó desde la
 * app; si se entró directo (QR, link del correo) lleva al inicio en vez de salir de la app.
 * Se llama al principio de cada render.
 */
let ultima = -1;
export function numerarVista(): void {
  const n = (history.state as { n?: number } | null)?.n;
  if (typeof n === 'number') { ultima = n; return; }
  ultima += 1;
  // Si el contenedor no deja tocar el historial, «Regresar» simplemente lleva al inicio.
  try { history.replaceState({ n: ultima }, ''); } catch { /* sin historial numerado */ }
}

function regresar(): HTMLElement {
  const a = el('a', { class: 'btn primario chico regresar', href: '#/' }, icono('caretLeft'), el('span', {}, 'Regresar'));
  a.onclick = e => {
    if (((history.state as { n?: number } | null)?.n ?? 0) > 0) {
      e.preventDefault();
      history.back();
    }
  };
  return a;
}

/** «Buscar folio»: el buscador de la cabecera lleva directo a la página del certificado. */
function buscarFolio(): HTMLElement {
  const input = el('input', {
    type: 'text', id: 'buscar-folio', inputmode: 'numeric', pattern: '[0-9]{1,9}', required: '',
    autocomplete: 'off', placeholder: 'Buscar folio', title: 'El número del certificado, por ejemplo 12',
  }) as HTMLInputElement;
  const form = el('form', { class: 'buscar', role: 'search' },
    el('label', { class: 'sr', for: 'buscar-folio' }, 'Buscar un certificado por su folio'),
    input,
    el('button', { type: 'submit', title: 'Buscar' }, icono('search'), el('span', { class: 'sr' }, 'Buscar')),
  ) as HTMLFormElement;
  form.onsubmit = e => {
    e.preventDefault();
    location.hash = `#/c/${input.value.trim()}`;
  };
  return form;
}

function cabeceraSitio(actual: Seccion): HTMLElement[] {
  const link = (href: string, texto: string, s: Seccion, clase?: string) =>
    el('a', { href, ...(s === actual ? { 'aria-current': 'page' } : {}), ...(clase ? { class: clase } : {}) }, texto);
  return [
    el('header', { class: 'sitio' },
      el('div', { class: 'sup' }, el('div', { class: 'contenedor' },
        el('p', { class: 'sup-uanl' }, 'Universidad Autónoma de Nuevo León'),
        el('p', { class: 'sup-nota' }, icono('cube'), 'Constancias registradas en Polkadot'),
      )),
      el('div', { class: 'cab' }, el('div', { class: 'contenedor' },
        marca(),
        el('div', { class: 'cab-der' },
          buscarFolio(),
          el('nav', { class: 'perfiles', 'aria-label': 'Organizadores y soporte' },
            link('#/organizar', 'Organizadores', 'organizar'),
            link('#/cartel', 'Cartel con QR', 'cartel'),
            link('#/diagnostico', 'Diagnóstico', 'diagnostico'),
          ),
        ),
      )),
    ),
    el('nav', { class: 'menu', 'aria-label': 'Secciones' }, el('div', { class: 'contenedor' },
      link('#/', 'Inicio', 'inicio', 'solo-ancho'),
      link('#/constancia', 'Reclamar constancia', 'constancia'),
      link('#/mis', 'Mis certificados', 'mis'),
      link('#/verificar', 'Verificar', 'verificar'),
    )),
  ];
}

function pie(): HTMLElement {
  const col = (titulo: string, ...links: [string, string][]) =>
    el('div', {}, el('h2', {}, titulo), el('ul', {}, ...links.map(([href, texto]) => el('li', {}, el('a', { href }, texto)))));
  return el('footer', { class: 'pie' },
    el('div', { class: 'pie-cuerpo' }, el('div', { class: 'contenedor pie-rejilla' },
      el('div', { class: 'pie-marca' }, marca(), el('p', {}, 'Constancias de la Universidad Autónoma de Nuevo León registradas en Polkadot Asset Hub. Cualquiera puede comprobarlas.')),
      col('Estudiantes', ['#/constancia', 'Reclamar constancia'], ['#/mis', 'Mis certificados']),
      col('Verificar', ['#/verificar', 'Verificar un PDF'], ['#/muestra', 'Ver un ejemplo']),
      col('Organizadores', ['#/organizar', 'Panel del organizador'], ['#/cartel', 'Cartel con QR'], ['#/diagnostico', 'Diagnóstico']),
    )),
    el('div', { class: 'pie-legal' }, el('div', { class: 'contenedor' },
      el('span', {}, 'Universidad Autónoma de Nuevo León · Polkadot México'),
      el('span', {}, 'Registrado en Polkadot'),
    )),
  );
}

/**
 * Pinta la página entera. El inicio va a todo lo ancho; las demás vistas van en la lámina gris
 * (banner, «Regresar» y su contenido).
 */
export function marco(root: HTMLElement, actual: Seccion, ...contenido: Hijo[]): void {
  const piezas = contenido.filter((n): n is Node | string => n != null && n !== false);
  const sinRegistro = registroListo() ? null : aviso('info', 'El registro de certificados todavía no está desplegado. Las búsquedas funcionarán en cuanto lo esté.');
  const main = el('main', { id: 'contenido', class: actual === 'inicio' ? 'inicio entra' : 'interior entra' });
  if (actual === 'inicio') {
    if (sinRegistro) main.append(el('div', { class: 'contenedor aviso-arriba' }, sinRegistro));
    main.append(...piezas);
  } else {
    const lamina = el('div', { class: 'lamina' }, regresar());
    if (sinRegistro) lamina.append(sinRegistro);
    lamina.append(...piezas);
    main.append(el('div', { class: 'portada-int', 'aria-hidden': 'true' }), lamina);
  }
  // Con rutas en `#`, un href="#contenido" cambiaría de vista: el salto mueve el foco a mano.
  const saltar = el('a', { class: 'saltar', href: '#/' }, 'Saltar al contenido');
  saltar.onclick = e => {
    e.preventDefault();
    const destino = main.querySelector<HTMLElement>('h1') ?? main;
    destino.setAttribute('tabindex', '-1');
    destino.focus();
  };
  root.replaceChildren(saltar, el('div', { class: 'banda-uanl', 'aria-hidden': 'true' }), ...cabeceraSitio(actual), main, pie());
  window.scrollTo(0, 0);
  anunciar(main);
}

/**
 * Al cambiar de vista el foco quedaba en el vacío (el enlace tocado ya no existe): se lleva
 * al título nuevo, para que el lector de pantalla diga dónde estás y el tabulador siga desde ahí.
 * Si el foco sigue en un campo o botón vivo, no se toca.
 */
function anunciar(main: HTMLElement): void {
  const titulo = main.querySelector<HTMLElement>('h1, h2');
  document.title = titulo?.textContent ? `${titulo.textContent} · Certificados en Cadena` : 'Certificados en Cadena';
  const activo = document.activeElement;
  if (activo && activo !== document.body && document.contains(activo)) return;
  const destino = titulo ?? main;
  destino.setAttribute('tabindex', '-1');
  destino.focus({ preventScroll: true });
}

/** Etiqueta oscura, como las de categoría de las noticias: «Folio 12», «2 certificados». */
export const ceja = (texto: string) => el('p', { class: 'ceja' }, texto);

/** Migas de pan entre filetes, como en las páginas de las facultades: Inicio ▸ sección. */
export function migas(...partes: string[]): HTMLElement {
  return el('nav', { class: 'migas', 'aria-label': 'Ruta' }, el('ol', {},
    el('li', {}, el('a', { href: '#/' }, 'Inicio')),
    ...partes.map(p => el('li', {}, p)),
  ));
}

/** Encabezado de una vista interior: migas (Inicio ▸ sección), título y entrada. */
export function cabecera(seccion: string, titulo: string, entrada?: string): HTMLElement {
  return el('header', { class: 'cabecera' }, migas(seccion),
    el('div', { class: 'cabecera-texto' }, el('h1', {}, titulo), entrada ? el('p', { class: 'lead' }, entrada) : null));
}

export type EstadoPaso = 'activo' | 'hecho' | 'bloqueado';

/** Bloque numerado de un flujo (1 Tu cuenta, 2 Tu nombre…). */
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

/** Columna de ayuda junto a un formulario: título y una lista corta con íconos. */
export function nota(titulo: string, ...puntos: [Icono, string, string][]): HTMLElement {
  return el('aside', { class: 'nota' }, el('h2', { class: 'nota-titulo' }, titulo),
    el('ul', {}, ...puntos.map(([ic, fuerte, resto]) => el('li', {}, icono(ic), el('span', {}, el('strong', {}, fuerte), ' ', resto)))));
}

/** Sección de la columna lateral (Verificación, Documento, Compartir), separada por doble filete. */
export const seccionLateral = (titulo: string, ...cuerpo: Hijo[]) => el('section', { class: 'lateral-sec' }, el('h2', {}, titulo), ...cuerpo);

/** QR con el enlace escrito debajo, por si la cámara no lo lee. */
export async function figuraQr(link: string, leyenda: string, clase = 'qr'): Promise<HTMLElement> {
  return el('figure', { class: clase }, await qrSvg(link), el('figcaption', {}, el('span', {}, leyenda), el('span', { class: 'mono' }, link)));
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
