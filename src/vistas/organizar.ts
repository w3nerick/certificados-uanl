/**
 * #/organizar: panel del organizador dentro de la Polkadot App (Polkadot Desktop).
 * Conectar → elegir PDFs de la UANL → subir y emitir → aprobar solicitudes.
 */
import { marco, cabecera, paso } from './comun';
import { el, boton, aviso, esqueleto, corta, poner, icono } from '../ui';
import { insideHost } from '../lib/host';
import { pas } from '../lib/cadena';
import { certificado, conSolicitudes, errorLegible, todos } from '../lib/registro';
import {
  conectarOrganizador, asegurarMapeo, leerPdfs, subirPdf, planear, emitir, revisar, aprobar,
  type Organizador, type PdfElegido, type SolicitudRevisada,
} from '../lib/organizador';
import { APP_DOTNS } from '../lib/red';
import type { Hex } from 'viem';

const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
/** Mediodía en Monterrey: la fecha no cambia de día en ninguna zona de México. */
const fechaUnix = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return BigInt(Date.UTC(y, m - 1, d, 18) / 1000);
};

export function vistaOrganizar(root: HTMLElement): void {
  let org: Organizador | null = null;
  const cuenta = el('div', { class: 'pila-s' });
  const emitirZona = el('div', { class: 'pila-s' }, el('p', { class: 'ayuda' }, 'Conecta tu cuenta de emisor para elegir los PDFs.'));
  const solicitudesZona = el('div', { class: 'pila-s' }, el('p', { class: 'ayuda' }, 'Aquí aparecen los estudiantes que pidieron una constancia.'));
  const pasoCuenta = paso('1', 'Conectar', 'Tu cuenta de la Polkadot App con permiso de emisor.');
  const pasoEmitir = paso('2', 'Emitir constancias', 'Sube los PDFs de la UANL y regístralos en la cadena.', emitirZona);
  const pasoSolicitudes = paso('3', 'Aprobar solicitudes', 'Compara el nombre de la constancia con el usuario que la pide.', solicitudesZona);
  pasoEmitir.estado('bloqueado');
  pasoSolicitudes.estado('bloqueado');

  // ---------- 1. Conectar ----------
  const pintarCuenta = () => {
    if (!org) return;
    const o = org;
    cuenta.replaceChildren(
      aviso(o.esEmisor ? 'ok' : 'mal',
        o.esEmisor ? `Conectado como ${o.sesion.username}: puedes emitir y aprobar.` : `${o.sesion.username} todavía no es emisor en el contrato.`,
        el('p', { class: 'mono' }, o.ss58),
        el('p', { class: 'muted' }, `Saldo ${pas(o.saldo)}. Cada constancia deja unos 0.05 PAS de depósito.`),
        !o.esEmisor ? el('p', {}, 'Pide al administrador que ejecute: ', el('span', { class: 'mono' }, `npm run admin -- emisor ${o.ss58}`)) : null,
      ),
    );
    pasoCuenta.estado(o.esEmisor ? 'hecho' : 'activo');
    if (o.esEmisor) {
      pasoEmitir.estado('activo');
      pasoSolicitudes.estado('activo');
      pintarEmitir();
      void pintarSolicitudes();
    }
  };

  // Polkadot Desktop 0.1.4 puede no tener el username en la sesión: entonces se escribe a mano
  const usuario = el('input', { type: 'text', id: 'usuario-org', placeholder: 'tu-usuario.01', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Tu username de la Polkadot App' }) as HTMLInputElement;
  const conectarBtn = boton('Conectar como organizador', {
    icono: 'user',
    clase: 'primario',
    onClick: async () => {
      cuenta.replaceChildren(esqueleto(2));
      try {
        org = await conectarOrganizador(usuario.value);
        pintarCuenta();
      } catch (e) {
        const pide = (e as { pideUsuario?: boolean }).pideUsuario;
        cuenta.replaceChildren(aviso('mal', errorLegible(e)), ...(pide ? [el('label', { for: 'usuario-org' }, 'Tu username'), usuario] : []));
      }
    },
  });

  // ---------- 2. Emitir ----------
  function pintarEmitir() {
    const o = org!;
    let pdfs: PdfElegido[] = [];
    const programa = el('input', { type: 'text', id: 'programa', placeholder: 'Polkadot University México · Taller de desarrollo' }) as HTMLInputElement;
    const institucion = el('input', { type: 'text', id: 'institucion', value: 'Universidad Autónoma de Nuevo León' }) as HTMLInputElement;
    const fecha = el('input', { type: 'date', id: 'fecha', value: hoy() }) as HTMLInputElement;
    const archivos = el('input', { type: 'file', id: 'pdfs', accept: 'application/pdf,.pdf', multiple: '' }) as HTMLInputElement;
    const tabla = el('div', { class: 'pila-s' });
    const estado = el('div', { 'aria-live': 'polite' });

    const pintarTabla = () => {
      const nuevos = pdfs.filter(p => p.yaEmitido == null);
      poner(tabla,
        ...pdfs.map(p => {
          const nombre = el('input', { type: 'text', value: p.nombre, 'aria-label': `Nombre para ${p.archivo}` }) as HTMLInputElement;
          nombre.oninput = () => { p.nombre = nombre.value; };
          return el('div', { class: 'fila-pdf' },
            p.yaEmitido != null ? el('span', { class: 'muted' }, `Ya emitido, folio ${p.yaEmitido}`) : nombre,
            el('span', { class: 'muted mono' }, p.archivo),
          );
        }),
        pdfs.length ? el('p', { class: 'muted' }, `${nuevos.length} por emitir${pdfs.length - nuevos.length ? `, ${pdfs.length - nuevos.length} ya estaban en la cadena` : ''}. Revisa cada nombre: queda público y no se puede cambiar.`) : null,
      );
    };

    archivos.onchange = async () => {
      estado.replaceChildren(esqueleto(2));
      try {
        pdfs = await leerPdfs(archivos.files ?? []);
        estado.replaceChildren();
        pintarTabla();
      } catch (e) {
        estado.replaceChildren(aviso('mal', (e as Error).message));
      }
    };

    const emitirBtn = boton('Subir y emitir', {
      icono: 'upload',
      clase: 'primario',
      onClick: async () => {
        const nuevos = pdfs.filter(p => p.yaEmitido == null);
        if (!nuevos.length) return void estado.replaceChildren(aviso('mal', 'Elige al menos un PDF nuevo.'));
        if (!programa.value.trim()) return void estado.replaceChildren(aviso('mal', 'Escribe el nombre del programa o evento.'));
        if (nuevos.some(p => p.nombre.trim().split(/\s+/).length < 2)) return void estado.replaceChildren(aviso('mal', 'Cada constancia necesita nombre completo (nombre y apellido).'));
        const datos = { programa: programa.value, institucion: institucion.value, fecha: fechaUnix(fecha.value || hoy()) };
        try {
          await asegurarMapeo(o);
          for (const [i, p] of nuevos.entries()) {
            if (p.cid) continue;
            estado.replaceChildren(aviso('info', `Subiendo PDF ${i + 1} de ${nuevos.length} a IPFS… ${i === 0 ? 'Si es la primera vez, aprueba la firma de sesión en tu celular.' : ''}`));
            p.cid = await subirPdf(o, p.archivo, p.bytes);
          }
          estado.replaceChildren(aviso('info', 'Calculando transacciones…'));
          const lotes = await planear(o, nuevos, datos);
          const deposito = lotes.reduce((s, l) => s + l.sim.deposit, 0n);
          const confirmar = boton(`Firmar ${lotes.length} transacción${lotes.length === 1 ? '' : 'es'}`, {
            clase: 'primario',
            onClick: async () => {
              try {
                await emitir(lotes, (h, t) => estado.replaceChildren(aviso('info', h < t ? `Aprueba la transacción ${h + 1} de ${t} en tu celular…` : 'Listo.')));
                estado.replaceChildren(aviso('ok', `${nuevos.length} constancias emitidas. Los estudiantes ya pueden pedirlas por su nombre.`,
                  el('p', {}, ...nuevos.flatMap(p => [el('a', { href: `#/c/${p.folio}` }, `Folio ${p.folio}: ${p.nombre}`), el('br')]))));
                for (const p of nuevos) p.yaEmitido = p.folio ?? null;
                pintarTabla();
              } catch (e) {
                estado.replaceChildren(aviso('mal', `Se detuvo: ${errorLegible(e)}. Vuelve a elegir los mismos PDFs: los que ya entraron aparecen como emitidos.`));
              }
            },
          });
          estado.replaceChildren(aviso('info', `PDFs en IPFS. Falta registrarlos: ${lotes.length} transacción${lotes.length === 1 ? '' : 'es'}, depósito ${pas(deposito)}.`, confirmar));
        } catch (e) {
          estado.replaceChildren(aviso('mal', errorLegible(e)));
        }
      },
    });

    emitirZona.replaceChildren(
      el('label', { for: 'programa' }, 'Programa o evento', programa),
      el('div', { class: 'dos-col' },
        el('label', { for: 'institucion' }, 'Institución', institucion),
        el('label', { for: 'fecha' }, 'Fecha', fecha),
      ),
      el('label', { class: 'soltar', for: 'pdfs' }, icono('filePdf'), el('strong', {}, 'Elige los PDFs de la UANL'),
        el('span', { class: 'ayuda' }, 'Si cada archivo se llama como el estudiante, el nombre se llena solo.'), archivos),
      tabla,
      el('div', { class: 'acciones' }, emitirBtn),
      estado,
    );
  }

  // ---------- 3. Solicitudes ----------
  async function pintarSolicitudes() {
    const o = org!;
    solicitudesZona.replaceChildren(esqueleto(3));
    try {
      const lista = await conSolicitudes();
      const elegidas = new Map<bigint, Hex>();
      const filas: HTMLElement[] = [];
      for (const { id, solicitudes } of lista) {
        const c = await certificado(id);
        if (!c) continue;
        const revisadas: SolicitudRevisada[] = await Promise.all(solicitudes.map(revisar));
        const opciones = revisadas.map(s => {
          const radio = el('input', { type: 'radio', name: `sol-${id}`, value: s.titular }) as HTMLInputElement;
          radio.onchange = () => elegidas.set(id, s.titular);
          return el('label', { class: 'opcion' }, radio,
            el('span', {}, s.usuario || '(sin usuario)', ' ',
              el('span', { class: s.verificada ? 'ok' : 'muted' }, s.verificada ? 'verificado' : 'sin verificar'),
              el('br'), el('span', { class: 'mono muted' }, corta(s.titular))));
        });
        filas.push(el('div', { class: 'solicitud' }, el('strong', {}, `${c.nombre} · folio ${id}`), ...opciones));
      }
      const estado = el('div', { 'aria-live': 'polite' });
      const aprobarBtn = boton('Aprobar seleccionadas', {
        clase: 'primario',
        icono: 'checkCircle',
        onClick: async () => {
          if (!elegidas.size) return void estado.replaceChildren(aviso('mal', 'Elige al menos una solicitud.'));
          try {
            estado.replaceChildren(aviso('info', 'Aprueba la transacción en tu celular…'));
            await aprobar(o, [...elegidas].map(([id, titular]) => ({ id, titular })));
            estado.replaceChildren(aviso('ok', `${elegidas.size} constancias asignadas.`));
            setTimeout(() => void pintarSolicitudes(), 1500);
          } catch (e) {
            estado.replaceChildren(aviso('mal', errorLegible(e)));
          }
        },
      });
      const totales = await todos();
      const sinTitular = totales.filter(c => !c.revocado && /^0x0{40}$/i.test(c.titular)).length;
      poner(solicitudesZona,
        el('p', { class: 'muted' }, `${totales.length} constancias emitidas, ${sinTitular} sin titular.`),
        ...(filas.length ? filas : [aviso('info', 'No hay solicitudes por revisar.')]),
        el('div', { class: 'acciones' }, filas.length ? aprobarBtn : null, boton('Actualizar', { clase: filas.length ? 'fantasma' : '', onClick: () => pintarSolicitudes() })),
        estado,
      );
    } catch (e) {
      solicitudesZona.replaceChildren(aviso('mal', errorLegible(e)));
    }
  }

  pasoCuenta.append(
    insideHost()
      ? el('div', { class: 'acciones' }, conectarBtn)
      : aviso('info', `Abre ${APP_DOTNS} en Polkadot Desktop para emitir y aprobar: firma con tu cuenta de la Polkadot App.`),
    cuenta,
  );
  marco(root, 'organizar',
    cabecera('Organizadores', 'Panel del organizador', 'Emite las constancias del evento y aprueba a quién le corresponde cada una.'),
    el('div', { class: 'pila-s' }, pasoCuenta, pasoEmitir, pasoSolicitudes),
  );
}
