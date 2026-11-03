/**
 * #/c/<id>: la página pública de un certificado (lo que se comparte, como la de la PBA).
 * Todo sale de la cadena; el PDF se baja de IPFS y se compara con su huella.
 */
import { marco, migas, seccionLateral, figuraQr } from './comun';
import { visorPdf } from './visor';
import { el, icono, boton, aviso, cargando, corta, fechaLarga } from '../ui';
import { certificado, motivoRevocacion, esEmisor, cadenaLista, errorLegible, ZERO, type Certificado } from '../lib/registro';
import { usuarioDe } from '../lib/cuenta';
import type { PdfBajado } from '../lib/ipfs';
import { abrirFuera } from '../lib/permisos';
import { insideHost } from '../lib/host';
import { WEB_URL, DOTLI_URL, EXPLORER_BLOCK } from '../lib/red';

/** Para compartir: la app .dot vista desde el gateway de Polkadot. */
export const linkCompartir = (id: bigint) => `${DOTLI_URL}/#/c/${id}`;
/** Para LinkedIn y todo lo que deba abrir dentro de años: la web en Vercel. */
export const linkPermanente = (id: bigint) => `${WEB_URL}/#/c/${id}`;

function linkLinkedIn(c: Certificado): string {
  const d = new Date(Number(c.fecha) * 1000);
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: c.programa,
    organizationName: c.institucion,
    issueYear: String(d.getUTCFullYear()),
    issueMonth: String(d.getUTCMonth() + 1),
    certUrl: linkPermanente(c.id),
    certId: String(c.id),
  });
  return `https://www.linkedin.com/profile/add?${q}`;
}

export async function vistaCertificado(root: HTMLElement, id: bigint): Promise<void> {
  const carga = cargando('Conectando con Polkadot…', 4);
  marco(root, 'otra', carga);
  let c: Certificado | null;
  try {
    await cadenaLista();
    carga.decir(`Leyendo el folio ${id} en el registro…`);
    c = await certificado(id);
  } catch (e) {
    marco(root, 'otra', aviso('mal', `No se pudo leer la cadena: ${errorLegible(e)}`, boton('Reintentar', { onClick: () => vistaCertificado(root, id) })));
    return;
  }
  if (!c) {
    marco(root, 'otra', aviso('mal', `No existe ningún certificado con el folio ${id}.`, el('p', {}, el('a', { href: '#/verificar' }, 'Verificar un PDF'))));
    return;
  }
  const cert = c;

  // El PDF original, tal como lo diseñó la institución (se baja una sola vez: también se usa abajo)
  let pdf: PdfBajado | null = null;
  const area = visorPdf(cert, { alCargar: p => actualizarPdf(p) });

  // Verificación
  const checkPdf = el('li', {}, icono('cube', 'ico espera'), el('div', {}, 'PDF original', el('small', {}, 'Bajando de IPFS y comparando su huella…')));
  const titular = cert.titular.toLowerCase() === ZERO
    ? el('li', {}, icono('user', 'ico espera'), el('div', {}, 'Aún sin reclamar', el('small', {}, 'El estudiante lo pide desde «Reclamar constancia» y el organizador se lo asigna.')))
    : el('li', {}, icono('checkCircle', 'ico si'), el('div', {}, 'Reclamado', el('small', {}, `Titular ${corta(cert.titular)} · ${fechaLarga(cert.reclamadoEn)}`)));
  // Quién lo emitió: su usuario de la Polkadot App y si HOY sigue siendo emisor. Llega después; mientras, la dirección.
  const emisor = el('span', {}, `Emitido por ${corta(cert.emitidoPor)}`);
  if (cert.emitidoPor.toLowerCase() !== ZERO) {
    void Promise.all([usuarioDe(cert.emitidoPor).catch(() => null), esEmisor(cert.emitidoPor).catch(() => null)]).then(([usuario, vigente]) => {
      const quien = usuario ?? corta(cert.emitidoPor);
      emisor.textContent = vigente === true ? `Emitido por ${quien} · emisor autorizado`
        : vigente === false ? `Emitido por ${quien} (ya no tiene permiso de emisor)` : `Emitido por ${quien}`;
    });
  }
  const revocado = cert.revocado ? el('li', {}, icono('xCircle', 'ico no'), el('div', {}, 'Revocado por la institución', el('small', {}, '…'))) : null;
  const checks = el('ul', { class: 'checks' },
    revocado,
    el('li', {}, icono(cert.revocado ? 'xCircle' : 'checkCircle', cert.revocado ? 'ico no' : 'ico si'), el('div', {}, 'Registrado en la cadena',
      el('small', {}, `${cert.institucion}`, el('br'), emisor, el('br'), el('a', { href: EXPLORER_BLOCK(cert.bloque), target: '_blank', rel: 'noopener' }, `Asset Hub, bloque ${cert.bloque}`)))),
    checkPdf,
    titular,
  );
  if (revocado) void motivoRevocacion(id).then(m => { revocado.querySelector('small')!.textContent = m || 'Sin motivo registrado.'; }).catch(() => undefined);

  // Acciones
  const descargar = boton('Descargar PDF', {
    icono: 'download',
    clase: 'primario',
    onClick: async () => {
      if (!pdf) return;
      if (insideHost()) { await abrirFuera(pdf.url); return; }
      const url = URL.createObjectURL(new Blob([pdf.bytes as BlobPart], { type: 'application/pdf' }));
      const a = el('a', { href: url, download: `certificado-${cert.id}.pdf` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  }) as HTMLButtonElement;
  descargar.disabled = true;
  const manual = el('div', {});
  const copiar = boton('Copiar enlace', {
    icono: 'copy',
    onClick: async b => {
      const link = linkCompartir(cert.id);
      const ok = await navigator.clipboard?.writeText(link).then(() => true, () => false);
      if (ok) {
        b.querySelector('span:last-child')!.textContent = 'Copiado';
        setTimeout(() => { b.querySelector('span:last-child')!.textContent = 'Copiar enlace'; }, 1800);
        return;
      }
      // Sin permiso de portapapeles (p. ej. dentro del host): el link seleccionado para copiarlo a mano
      const campo = el('input', { type: 'text', readonly: '', value: link, 'aria-label': 'Enlace del certificado' }) as HTMLInputElement;
      manual.replaceChildren(campo);
      campo.focus();
      campo.select();
    },
  });
  const linkedin = cert.revocado ? null : boton('Agregar a LinkedIn', { icono: 'linkedin', onClick: () => abrirFuera(linkLinkedIn(cert)) });
  // QR del mismo enlace que «Copiar enlace»: para enseñarlo desde el celular y que otro lo escanee.
  const qrZona = el('div', { id: 'qr-cert' });
  const verQr = boton('Mostrar QR', {
    icono: 'qr',
    onClick: async b => {
      const abierto = qrZona.childElementCount > 0;
      if (abierto) qrZona.replaceChildren();
      else {
        try { qrZona.replaceChildren(await figuraQr(linkCompartir(cert.id), 'Escanéalo para abrir este certificado')); } catch (e) { qrZona.replaceChildren(aviso('mal', `No se pudo dibujar el QR: ${(e as Error).message}`)); }
      }
      b.setAttribute('aria-expanded', String(!abierto));
      b.querySelector('span:last-child')!.textContent = abierto ? 'Mostrar QR' : 'Ocultar QR';
    },
  });
  verQr.setAttribute('aria-expanded', 'false');
  verQr.setAttribute('aria-controls', 'qr-cert');

  marco(root, 'otra',
    migas(`Folio ${cert.id}`),
    el('div', { class: 'dos-columnas' },
      el('div', { class: 'pila-s' },
        el('div', { class: 'cert-titulo' },
          el('h1', {}, cert.nombre),
          el('p', { class: 'lead' }, cert.programa, el('br'), fechaLarga(cert.fecha)),
          cert.revocado
            ? el('span', { class: 'etiqueta mal' }, icono('xCircle'), 'Revocado')
            : el('span', { class: 'etiqueta ok' }, icono('sealCheck'), 'Registrado en Polkadot'),
        ),
        area,
      ),
      el('aside', { class: 'lateral' },
        seccionLateral('Verificación', checks),
        seccionLateral('Documento',
          el('div', { class: 'acciones columna' }, descargar),
          el('p', { class: 'huella' }, el('span', {}, 'Huella sha256 del PDF'), el('span', {}, cert.sha256Pdf)),
        ),
        seccionLateral('Compartir', el('div', { class: 'acciones columna' }, linkedin, copiar, verQr), manual, qrZona),
      ),
    ),
  );

  /** Cada vez que el visor baja (o no) el PDF: el renglón de verificación y el botón de descarga. */
  function actualizarPdf(p: PdfBajado | null): void {
    pdf = p;
    const [ic, txt] = !cert.cid
      ? [icono('warning', 'ico espera'), el('div', {}, 'PDF original', el('small', {}, 'Este certificado no tiene PDF en IPFS.'))]
      : p === null
        ? [icono('warning', 'ico no'), el('div', {}, 'PDF original', el('small', {}, 'Ningún gateway IPFS respondió. Inténtalo más tarde.'))]
        : p.integro
          ? [icono('checkCircle', 'ico si'), el('div', {}, 'PDF íntegro', el('small', {}, 'Su huella sha256 coincide con la registrada en la cadena.'))]
          : [icono('xCircle', 'ico no'), el('div', {}, 'El PDF no coincide', el('small', {}, 'El archivo que entregó IPFS no es el registrado. No lo uses como prueba.'))];
    checkPdf.replaceChildren(ic, txt);
    descargar.disabled = !p?.integro;
  }
}
