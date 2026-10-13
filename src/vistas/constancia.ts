/**
 * #/constancia: el estudiante conecta su cuenta, escribe su nombre completo y pide la
 * constancia que le corresponde. Pedir no la asigna: el organizador revisa y aprueba.
 * El relayer paga la transacción; el estudiante no necesita saldo.
 */
import { marco, hoja } from './comun';
import { el, boton, aviso, esqueleto } from '../ui';
import { todos, coincideNombre, errorLegible, ZERO, type Certificado } from '../lib/registro';
import { resolverCuenta, cuentaDelHost, type Destino } from '../lib/cuenta';
import { insideHost } from '../lib/host';
import { SOLICITAR_URL } from '../lib/red';

export function vistaConstancia(root: HTMLElement): void {
  let destino: Destino | null = null;
  const pasoCuenta = el('div', { class: 'pila-s' });
  const errorCuenta = el('div', { 'aria-live': 'polite' });
  const fallo = (e: unknown) => errorCuenta.replaceChildren(aviso('mal', (e as Error).message));
  const pasoNombre = el('div', { class: 'pila-s' });
  const resultados = el('div', { class: 'pila-s', 'aria-live': 'polite' });

  const usarCuenta = (d: Destino) => {
    destino = d;
    pasoCuenta.replaceChildren(aviso('ok', 'Tu constancia quedará en esta cuenta:', el('p', { class: 'mono' }, d.etiqueta)));
    if (!d.username) pasoCuenta.append(aviso('info', 'Tu cuenta no tiene usuario de la Polkadot App: el organizador no podrá verificar que eres tú. Mejor créalo en tu perfil y vuelve.'));
    pintarNombre();
  };

  const pedirCuenta = () => {
    const input = el('input', { type: 'text', id: 'usuario', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'ana.01' }) as HTMLInputElement;
    const seguir = boton('Continuar', {
      clase: 'primario',
      onClick: async () => {
        errorCuenta.replaceChildren();
        try { usarCuenta(await resolverCuenta(input.value)); } catch (e) { fallo(e); }
      },
    });
    input.onkeydown = e => { if (e.key === 'Enter') (seguir as HTMLButtonElement).click(); };
    pasoCuenta.replaceChildren(...[
      el('h2', {}, '1. Tu cuenta'),
      insideHost() ? el('div', { class: 'acciones' }, boton('Conectar mi cuenta de Polkadot App', {
        icono: 'user',
        clase: 'primario',
        onClick: async () => {
          errorCuenta.replaceChildren();
          try { usarCuenta(await cuentaDelHost()); } catch (e) { fallo(e); }
        },
      })) : null,
      el('div', { class: 'fila-form' }, el('label', { for: 'usuario' }, insideHost() ? 'O escribe tu usuario' : 'Tu usuario de la Polkadot App',
        el('span', { class: 'ayuda' }, 'Lo ves en tu perfil, por ejemplo ana.01.'), input), seguir),
      errorCuenta,
    ].filter((n): n is HTMLElement => n != null));
  };

  function pintarNombre() {
    const nombre = el('input', { type: 'text', id: 'nombre', autocomplete: 'name', placeholder: 'Nombre y apellidos' }) as HTMLInputElement;
    const buscar = boton('Buscar', { icono: 'search', clase: 'primario', onClick: () => buscarPor(nombre.value) });
    nombre.onkeydown = e => { if (e.key === 'Enter') (buscar as HTMLButtonElement).click(); };
    pasoNombre.replaceChildren(
      el('h2', {}, '2. Tu nombre'),
      el('div', { class: 'fila-form' }, el('label', { for: 'nombre' }, 'Tu nombre completo, como aparece en tu constancia', nombre), buscar),
    );
    nombre.focus();
  }

  let cache: Certificado[] | null = null;
  async function buscarPor(texto: string) {
    resultados.replaceChildren(esqueleto(3));
    try {
      cache ??= await todos();
      const pendientes = cache.filter(c => !c.revocado && c.titular.toLowerCase() === ZERO && c.llaveReclamo.toLowerCase() === ZERO);
      const hallados = pendientes.filter(c => coincideNombre(texto, c.nombre));
      if (!hallados.length) {
        resultados.replaceChildren(aviso('info', texto.trim().split(/\s+/).length < 2
          ? 'Escribe al menos un nombre y un apellido.'
          : 'No encontramos una constancia pendiente con ese nombre. Revisa cómo está escrito o pregunta al organizador.'));
        return;
      }
      resultados.replaceChildren(...hallados.map(c => {
        const estado = el('div', { 'aria-live': 'polite' });
        const pedir = boton('Es mía, pedirla', {
          icono: 'sealCheck',
          clase: 'primario',
          onClick: async b => {
            if (!destino) return;
            estado.replaceChildren(aviso('info', 'Enviando tu solicitud a la cadena…'));
            try {
              const r = await fetch(SOLICITAR_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: c.id.toString(), titular: destino.h160, usuario: destino.username ?? '' }),
                signal: AbortSignal.timeout(120_000),
              });
              const j = (await r.json().catch(() => ({}))) as { error?: string };
              if (!r.ok) throw new Error(j.error ?? `el servidor respondió ${r.status}`);
              estado.replaceChildren(aviso('ok', 'Solicitud enviada. Cuando el organizador la apruebe, aparecerá en Mis certificados.', el('a', { href: '#/mis' }, 'Ir a Mis certificados')));
              b.remove();
            } catch (e) {
              estado.replaceChildren(aviso('mal', errorLegible(e)));
            }
          },
        });
        return el('div', { class: 'cert-layout' }, hoja(c), el('div', { class: 'cert-lado' }, el('h3', {}, c.nombre), el('p', { class: 'muted' }, c.programa), pedir, estado));
      }));
    } catch (e) {
      resultados.replaceChildren(aviso('mal', `No se pudo leer la cadena: ${errorLegible(e)}`));
    }
  }

  marco(root, 'constancia',
    el('h1', {}, 'Reclamar mi constancia'),
    el('p', { class: 'muted' }, 'Busca tu constancia por tu nombre y pídela para tu cuenta. El organizador la revisa y te la asigna; no necesitas saldo.'),
    pasoCuenta,
    pasoNombre,
    resultados,
  );
  pedirCuenta();
}
