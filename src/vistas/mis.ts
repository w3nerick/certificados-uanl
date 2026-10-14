/**
 * #/mis: los certificados de una cuenta. En la Polkadot App se detecta la cuenta;
 * en un navegador se busca por usuario (ana.01) o dirección. Se recuerda el último
 * usuario en el almacenamiento del host (sobrevive a cada versión de la app).
 */
import { marco, hoja, cabecera, fichaCuenta, ceja } from './comun';
import { el, boton, aviso, cargando } from '../ui';
import { deTitular, conSolicitudes, certificado, errorLegible } from '../lib/registro';
import { resolverCuenta, cuentaDelHost, type Destino } from '../lib/cuenta';
import { almacen } from '../lib/almacen';
import { insideHost } from '../lib/host';

const CLAVE = 'ultima-cuenta';

export async function vistaMis(root: HTMLElement): Promise<void> {
  const resultado = el('div', { class: 'pila-s', 'aria-live': 'polite' });
  const input = el('input', { type: 'search', id: 'buscar-cuenta', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'ana.01' }) as HTMLInputElement;

  const mostrar = async (obtener: () => Promise<Destino>, primero: string) => {
    const carga = cargando(primero);
    resultado.replaceChildren(carga);
    try {
      const d = await obtener();
      carga.decir(`Leyendo los certificados de ${d.username ?? 'esta cuenta'}…`);
      const [certs, abiertas] = await Promise.all([deTitular(d.h160), conSolicitudes().catch(() => [])]);
      const mias = abiertas.filter(a => a.solicitudes.some(s => s.titular.toLowerCase() === d.h160));
      const pendientes = (await Promise.all(mias.map(a => certificado(a.id)))).filter(c => c != null);
      void almacen().then(a => a.set(CLAVE, d.username ?? d.ss58 ?? d.h160)).catch(() => undefined);
      resultado.replaceChildren(
        fichaCuenta(d),
        ...pendientes.map(c => aviso('info', `Pediste la constancia de ${c!.nombre} (folio ${c!.id}). Falta que el organizador la apruebe.`)),
        certs.length
          ? el('div', { class: 'pila-s' },
            ceja(certs.length === 1 ? '1 certificado' : `${certs.length} certificados`),
            el('div', { class: 'lista-cert' }, ...certs.map(c => el('a', { href: `#/c/${c.id}` }, hoja(c),
              el('div', { class: 'lista-cert-pie' }, el('span', {}, `Folio ${c.id}${c.revocado ? ' · revocado' : ''}`), el('span', {}, c.programa))))))
          : aviso('info', 'Esta cuenta todavía no tiene certificados asignados.', el('a', { href: '#/constancia' }, 'Reclamar mi constancia')),
      );
    } catch (e) {
      resultado.replaceChildren(aviso('mal', errorLegible(e)));
    }
  };

  const buscar = boton('Buscar', { icono: 'search', clase: insideHost() ? '' : 'primario', onClick: () => mostrar(() => resolverCuenta(input.value), 'Buscando la cuenta en Polkadot…') });
  input.onkeydown = e => { if (e.key === 'Enter') (buscar as HTMLButtonElement).click(); };

  marco(root, 'mis',
    cabecera('Estudiantes', 'Mis certificados', 'Los certificados asignados a tu cuenta, listos para compartir.'),
    el('div', { class: 'panel pila-s estrecho' },
      insideHost()
        ? el('div', { class: 'acciones' }, boton('Usar mi cuenta de Polkadot App', { icono: 'user', clase: 'primario', onClick: () => mostrar(cuentaDelHost, 'Conectando tu cuenta: aprueba en la Polkadot App si te lo pide…') }))
        : null,
      el('div', { class: 'fila-form' },
        el('label', { for: 'buscar-cuenta' }, insideHost() ? 'O busca otra cuenta' : 'Usuario de la Polkadot App o dirección',
          el('span', { class: 'ayuda' }, 'Por ejemplo ana.01, o una dirección 5… / 0x…'), input),
        buscar,
      ),
    ),
    resultado,
  );

  const ultima = await almacen().then(a => a.get<string>(CLAVE)).catch(() => null);
  if (ultima && !input.value) {
    input.value = ultima;
    void mostrar(() => resolverCuenta(ultima), `Buscando ${ultima} en Polkadot…`);
  }
}
