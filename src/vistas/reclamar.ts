/**
 * #/reclamar/<id>/<código>: lo que abre el link del correo.
 *
 * 1. Lee el certificado (¿existe, está revocado, ya tiene titular?).
 * 2. La persona dice a qué cuenta va: dentro de la Polkadot App se detecta;
 *    en un navegador escribe su usuario (ana.01) o pega una dirección.
 * 3. El navegador firma (contrato, id, titular) con la llave del código y el
 *    relayer lo envía y paga. Nadie más puede cambiar el titular.
 */
import { marco, hoja } from './comun';
import { el, boton, aviso, esqueleto } from '../ui';
import { certificado, contrato, errorLegible, ZERO, type Certificado } from '../lib/registro';
import { firmarReclamo, llaveDeCodigo } from '../lib/reclamo';
import { resolverCuenta, cuentaDelHost, type Destino } from '../lib/cuenta';
import { insideHost } from '../lib/host';
import { RELAYER_URL } from '../lib/red';

export async function vistaReclamar(root: HTMLElement, id: bigint, codigo: string): Promise<void> {
  marco(root, 'otra', esqueleto(4));
  let c: Certificado | null;
  try {
    c = await certificado(id);
  } catch (e) {
    marco(root, 'otra', aviso('mal', `No se pudo leer la cadena: ${errorLegible(e)}`, boton('Reintentar', { onClick: () => vistaReclamar(root, id, codigo) })));
    return;
  }
  if (!c) return marco(root, 'otra', aviso('mal', 'Este link no corresponde a ningún certificado. Revisa que esté completo.'));
  if (c.revocado) return marco(root, 'otra', aviso('mal', 'Este certificado fue revocado por la institución.', el('a', { href: `#/c/${id}` }, 'Ver el certificado')));
  if (c.llaveReclamo.toLowerCase() !== llaveDeCodigo(codigo).address.toLowerCase()) {
    return marco(root, 'otra', aviso('mal', 'El link no corresponde a este certificado. Copia el link completo de tu correo.'));
  }
  if (c.titular.toLowerCase() !== ZERO) {
    return marco(root, 'otra', aviso('ok', 'Este certificado ya fue reclamado.', el('a', { href: `#/c/${id}` }, 'Ver el certificado')));
  }
  const cert = c;

  let destino: Destino | null = null;
  const zona = el('div', { class: 'pila-s' });
  const estado = el('div', { 'aria-live': 'polite' });

  const confirmar = (d: Destino) => {
    destino = d;
    zona.replaceChildren(
      aviso('info', 'Tu certificado quedará a nombre de esta cuenta para siempre:', el('p', { class: 'mono' }, d.etiqueta)),
      el('div', { class: 'acciones' },
        boton('Reclamar certificado', { icono: 'sealCheck', clase: 'primario', onClick: reclamar }),
        boton('Usar otra cuenta', { clase: 'fantasma', onClick: async () => pedirCuenta() }),
      ),
    );
  };

  const pedirCuenta = () => {
    destino = null;
    const input = el('input', { type: 'text', id: 'cuenta', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'ana.01' }) as HTMLInputElement;
    const buscar = boton('Continuar', {
      clase: 'primario',
      onClick: async () => {
        estado.replaceChildren();
        try { confirmar(await resolverCuenta(input.value)); } catch (e) { estado.replaceChildren(aviso('mal', (e as Error).message)); }
      },
    });
    input.onkeydown = e => { if (e.key === 'Enter') (buscar as HTMLButtonElement).click(); };
    zona.replaceChildren(...[
      insideHost() ? el('div', { class: 'acciones' }, boton('Usar mi cuenta de Polkadot App', {
        icono: 'user',
        clase: 'primario',
        onClick: async () => {
          estado.replaceChildren();
          try { confirmar(await cuentaDelHost()); } catch (e) { estado.replaceChildren(aviso('mal', (e as Error).message)); }
        },
      })) : null,
      el('div', { class: 'fila-form' },
        el('label', { for: 'cuenta' }, 'Tu usuario de la Polkadot App',
          el('span', { class: 'ayuda' }, 'Lo ves en tu perfil, por ejemplo ana.01. También puedes pegar una dirección.'), input),
        buscar,
      ),
    ].filter((n): n is HTMLElement => n != null));
  };

  async function reclamar() {
    if (!destino) return;
    const d = destino;
    estado.replaceChildren(aviso('info', 'Enviando el reclamo a la cadena. Tarda unos 20 segundos…'));
    try {
      const firma = await firmarReclamo(codigo, contrato().address, id, d.h160);
      const r = await fetch(RELAYER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: id.toString(), titular: d.h160, firma }),
        signal: AbortSignal.timeout(120_000),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? `el relayer respondió ${r.status}`);
    } catch (e) {
      // Pudo haber entrado aunque la respuesta se perdiera: releer antes de dar error.
      const ahora = await certificado(id).catch(() => null);
      if (ahora?.titular.toLowerCase() !== d.h160) {
        estado.replaceChildren(aviso('mal', `No se pudo reclamar: ${errorLegible(e)}`));
        return;
      }
    }
    location.hash = `#/c/${id}`;
  }

  marco(root, 'otra',
    el('div', { class: 'cert-layout' },
      hoja(cert),
      el('aside', { class: 'cert-lado' },
        el('h2', {}, `Hola, ${cert.nombre.split(' ')[0]}`),
        el('p', { class: 'muted' }, 'Este certificado está registrado en Polkadot. Reclámalo para que quede ligado a tu cuenta y puedas compartirlo. No necesitas saldo: la institución paga la transacción.'),
        zona,
        estado,
      ),
    ),
  );
  pedirCuenta();
}
