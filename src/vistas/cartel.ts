/**
 * #/cartel: cartel para imprimir o proyectar en el evento. Un QR grande que lleva a la app
 * y los tres pasos para reclamar la constancia. Se imprime desde un navegador de escritorio
 * (dentro de la Polkadot App no hay impresión).
 */
import { marco, cabecera, ceja } from './comun';
import { el, icono, boton, aviso } from '../ui';
import { qrSvg } from '../lib/qr';
import { APP_DOTNS, IN_APP_LINK, DOTLI_URL } from '../lib/red';

type Destino = 'app' | 'web';

const DESTINOS: Record<Destino, { link: string; dominio: string; pasos: [string, string][] }> = {
  // Dentro de la Polkadot App solo https://<nombre>.dot entra al contenedor (sin ruta).
  app: {
    link: IN_APP_LINK,
    dominio: APP_DOTNS,
    pasos: [
      ['Abre la Polkadot App', `Escanea el código o busca ${APP_DOTNS}.`],
      ['Conecta tu cuenta', 'Toca «Reclamar» y luego «Conectar mi cuenta».'],
      ['Escribe tu nombre completo', 'Tal como aparece en tu constancia, y toca «Es mía».'],
    ],
  },
  // dev-dot.li abre la app en cualquier navegador; ahí se reclama escribiendo el usuario.
  web: {
    link: `${DOTLI_URL}/#/constancia`,
    dominio: new URL(DOTLI_URL).hostname,
    pasos: [
      ['Escanea el código', 'Se abre la app de certificados en tu navegador.'],
      ['Escribe tu usuario', 'El de tu perfil de la Polkadot App, por ejemplo ana.01.'],
      ['Escribe tu nombre completo', 'Tal como aparece en tu constancia, y toca «Es mía».'],
    ],
  },
};

export function vistaCartel(root: HTMLElement): void {
  const qr = el('div', { class: 'cartel-qr-img' });
  const dominio = el('p', { class: 'cartel-dominio' });
  const pasos = el('ol', { class: 'cartel-pasos' });

  let actual: Destino = 'app';
  const pintar = async (d: Destino) => {
    actual = d;
    const D = DESTINOS[d];
    dominio.textContent = D.dominio;
    pasos.replaceChildren(...D.pasos.map(([fuerte, resto], i) =>
      el('li', {}, el('span', { class: 'cartel-num', 'aria-hidden': 'true' }, `0${i + 1}`), el('div', {}, el('strong', {}, fuerte), el('span', {}, resto)))));
    try {
      const svg = await qrSvg(D.link);
      if (actual === d) qr.replaceChildren(svg); // si cambiaron de opción mientras dibujaba, gana la última
    } catch (e) {
      qr.replaceChildren(aviso('mal', `No se pudo dibujar el QR: ${(e as Error).message}`));
    }
  };

  const opcion = (d: Destino, titulo: string, detalle: string) => {
    const radio = el('input', { type: 'radio', name: 'destino', value: d }) as HTMLInputElement;
    radio.checked = d === 'app';
    radio.onchange = () => void pintar(d);
    return el('label', { class: 'opcion' }, radio, el('span', {}, el('strong', {}, titulo), el('br'), el('span', { class: 'muted' }, detalle)));
  };

  marco(root, 'otra',
    el('div', { class: 'pila-s no-imprimir' },
      cabecera('Organizadores', 'Cartel con QR', 'Imprímelo o proyéctalo en el evento. El QR lleva a la app y los pasos dicen qué hacer.'),
      el('div', { class: 'panel pila-s estrecho' },
        ceja('¿A dónde lleva el QR?'),
        opcion('app', 'A la Polkadot App', `Abre ${APP_DOTNS}. Pruébalo con tu celular antes de imprimir: no todas las cámaras abren direcciones .dot.`),
        opcion('web', 'A cualquier navegador', `Abre la app en ${new URL(DOTLI_URL).hostname}; se reclama escribiendo el usuario. Funciona con cualquier cámara.`),
        el('div', { class: 'acciones' }, boton('Imprimir', { icono: 'printer', clase: 'primario', onClick: async () => window.print() })),
      ),
    ),
    el('article', { class: 'cartel', 'aria-label': 'Cartel para imprimir' }, el('div', { class: 'cartel-in' },
      el('div', { class: 'cartel-banda' }),
      el('div', { class: 'cartel-marca' },
        el('span', { class: 'cartel-sello' }, icono('sealCheck')),
        el('span', {}, el('strong', {}, 'Certificados en Cadena'), el('small', {}, 'UANL × Polkadot')),
      ),
      el('div', { class: 'cartel-cab' },
        el('p', { class: 'cartel-ceja' }, 'Polkadot University México · UANL'),
        el('p', { class: 'cartel-titulo' }, 'Reclama tu ', el('em', {}, 'constancia')),
        el('p', { class: 'cartel-entrada' }, 'Queda registrada en Polkadot: cualquiera puede comprobarla y la puedes agregar a LinkedIn.'),
      ),
      el('div', { class: 'cartel-medio' },
        el('figure', { class: 'cartel-qr' }, qr, dominio),
        pasos,
      ),
      el('p', { class: 'cartel-pie' }, 'No necesitas saldo: la institución paga la transacción. El organizador revisa tu solicitud y te asigna la constancia.'),
    )),
  );
  void pintar('app');
}
