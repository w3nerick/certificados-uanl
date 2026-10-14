/**
 * #/constancia: el estudiante conecta su cuenta, escribe su nombre completo y pide la
 * constancia que le corresponde. Pedir no la asigna: el organizador revisa y aprueba.
 * El relayer paga la transacción; el estudiante no necesita saldo.
 */
import { marco, hoja, cabecera, paso, fichaCuenta, ceja, nota } from './comun';
import { el, boton, aviso, esqueleto, fechaLarga } from '../ui';
import { todos, coincideNombre, errorLegible, ZERO, type Certificado } from '../lib/registro';
import { resolverCuenta, cuentaDelHost, type Destino } from '../lib/cuenta';
import { insideHost } from '../lib/host';
import { SOLICITAR_URL } from '../lib/red';

export function vistaConstancia(root: HTMLElement): void {
  let destino: Destino | null = null;
  const cuerpoCuenta = el('div', { class: 'pila-s' });
  const errorCuenta = el('div', { 'aria-live': 'polite' });
  const fallo = (e: unknown) => errorCuenta.replaceChildren(aviso('mal', (e as Error).message));
  const cuerpoNombre = el('div', { class: 'pila-s' });
  const resultados = el('div', { class: 'pila-s', 'aria-live': 'polite' });
  const pasoCuenta = paso('01', 'Tu cuenta', 'Donde quedará tu constancia.', cuerpoCuenta, errorCuenta);
  const pasoNombre = paso('02', 'Tu nombre', 'Como aparece en tu constancia.', cuerpoNombre);

  const usarCuenta = (d: Destino) => {
    destino = d;
    pasoCuenta.estado('hecho');
    cuerpoCuenta.replaceChildren(
      fichaCuenta(d, boton('Cambiar', { clase: 'fantasma', onClick: async () => pedirCuenta() })),
    );
    if (!d.username) cuerpoCuenta.append(aviso('info', 'Tu cuenta no tiene usuario de la Polkadot App: el organizador no podrá verificar que eres tú. Mejor créalo en tu perfil y vuelve.'));
    pintarNombre(true);
  };

  const pedirCuenta = () => {
    destino = null;
    pasoCuenta.estado('activo');
    resultados.replaceChildren();
    const input = el('input', { type: 'text', id: 'usuario', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'ana.01' }) as HTMLInputElement;
    const seguir = boton('Continuar', {
      clase: 'primario',
      onClick: async () => {
        errorCuenta.replaceChildren();
        try { usarCuenta(await resolverCuenta(input.value)); } catch (e) { fallo(e); }
      },
    });
    input.onkeydown = e => { if (e.key === 'Enter') (seguir as HTMLButtonElement).click(); };
    cuerpoCuenta.replaceChildren(...[
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
    ].filter((n): n is HTMLElement => n != null));
    pintarNombre(false);
  };

  function pintarNombre(listo: boolean) {
    pasoNombre.estado(listo ? 'activo' : 'bloqueado');
    const nombre = el('input', { type: 'text', id: 'nombre', autocomplete: 'name', placeholder: 'Nombre y apellidos' }) as HTMLInputElement;
    const buscar = boton('Buscar', { icono: 'search', clase: 'primario', onClick: () => buscarPor(nombre.value) }) as HTMLButtonElement;
    nombre.onkeydown = e => { if (e.key === 'Enter') buscar.click(); };
    nombre.disabled = buscar.disabled = !listo;
    cuerpoNombre.replaceChildren(
      el('div', { class: 'fila-form' }, el('label', { for: 'nombre' }, 'Nombre completo',
        el('span', { class: 'ayuda' }, listo ? 'Sin importar acentos ni mayúsculas.' : 'Primero elige tu cuenta.'), nombre), buscar),
    );
    if (listo) nombre.focus();
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
      resultados.replaceChildren(
        ceja(hallados.length === 1 ? '1 constancia encontrada' : `${hallados.length} constancias encontradas`),
        ...hallados.map(c => {
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
          return el('article', { class: 'resultado' }, hoja(c), el('div', { class: 'resultado-lado' },
            ceja(`Folio ${c.id}`),
            el('h3', {}, c.nombre),
            el('p', { class: 'muted' }, c.programa, el('br'), fechaLarga(c.fecha)),
            el('div', { class: 'acciones' }, pedir),
            estado,
          ));
        }),
      );
    } catch (e) {
      resultados.replaceChildren(aviso('mal', `No se pudo leer la cadena: ${errorLegible(e)}`));
    }
  }

  marco(root, 'constancia',
    cabecera('Estudiantes', 'Reclamar mi constancia', 'Búscala por tu nombre y pídela para tu cuenta. El organizador la revisa y te la asigna; no necesitas saldo.'),
    el('div', { class: 'con-nota' },
      el('div', { class: 'pila-s' }, pasoCuenta, pasoNombre, resultados),
      nota('Antes de empezar',
        ['user', 'Tu usuario de la Polkadot App.', 'Lo ves en tu perfil, por ejemplo ana.01.'],
        ['certificate', 'Tu nombre completo,', 'tal como aparece en tu constancia.'],
        ['shield', 'Nada de saldo:', 'la institución paga la transacción.'],
        ['checkCircle', 'El organizador revisa', 'tu solicitud y te asigna la constancia.'],
      ),
    ),
  );
  pedirCuenta();
}
