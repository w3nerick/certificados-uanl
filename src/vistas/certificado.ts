/**
 * #/c/<id>: la página pública de un certificado (lo que se comparte, como la de la PBA).
 * Todo sale de la cadena; el PDF se baja de IPFS y se compara con su huella.
 */
import { marco, hoja, ceja } from './comun';
import { el, icono, boton, aviso, esqueleto, corta, fechaLarga } from '../ui';
import { certificado, motivoRevocacion, errorLegible, ZERO, type Certificado } from '../lib/registro';
import { bajarPdf, type PdfBajado } from '../lib/ipfs';
import { dibujarPdf } from '../lib/pdf';
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
  marco(root, 'otra', esqueleto(4));
  let c: Certificado | null;
  try {
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

  // Vista: hoja on-chain o el PDF original
  const area = el('div', {}, hoja(cert));
  const lienzo = el('canvas', { class: 'lienzo', role: 'img', 'aria-label': `PDF original del certificado de ${cert.nombre}` }) as HTMLCanvasElement;
  let pdf: PdfBajado | null | undefined; // undefined = bajando
  let dibujado = false;
  const tabHoja = el('button', { role: 'tab', 'aria-selected': 'true' }, 'Certificado');
  const tabPdf = el('button', { role: 'tab', 'aria-selected': 'false' }, 'PDF original');
  const mostrar = async (cual: 'hoja' | 'pdf') => {
    tabHoja.setAttribute('aria-selected', String(cual === 'hoja'));
    tabPdf.setAttribute('aria-selected', String(cual === 'pdf'));
    if (cual === 'hoja') { area.replaceChildren(hoja(cert)); return; }
    if (pdf === undefined) { area.replaceChildren(esqueleto(5)); return; }
    if (pdf === null) { area.replaceChildren(aviso('mal', 'No se pudo bajar el PDF de IPFS ahora. La hoja de arriba sale de la cadena y sigue siendo válida.')); return; }
    area.replaceChildren(lienzo);
    if (!dibujado) {
      try {
        await dibujarPdf(pdf.bytes, lienzo, area.clientWidth || 800);
        dibujado = true;
      } catch (e) {
        area.replaceChildren(aviso('mal', `No se pudo mostrar el PDF: ${(e as Error).message}`));
      }
    }
  };
  tabHoja.onclick = () => void mostrar('hoja');
  tabPdf.onclick = () => void mostrar('pdf');

  // Verificación
  const checkPdf = el('li', {}, icono('cube', 'ico espera'), el('div', {}, 'PDF original', el('small', {}, 'Bajando de IPFS y comparando su huella…')));
  const titular = cert.titular.toLowerCase() === ZERO
    ? el('li', {}, icono('user', 'ico espera'), el('div', {}, 'Aún sin reclamar', el('small', {}, 'El estudiante lo pide desde «Reclamar» y el organizador se lo asigna.')))
    : el('li', {}, icono('checkCircle', 'ico si'), el('div', {}, 'Reclamado', el('small', {}, `Titular ${corta(cert.titular)} · ${fechaLarga(cert.reclamadoEn)}`)));
  const revocado = cert.revocado ? el('li', {}, icono('xCircle', 'ico no'), el('div', {}, 'Revocado por la institución', el('small', {}, '…'))) : null;
  const checks = el('ul', { class: 'checks' },
    revocado,
    el('li', {}, icono(cert.revocado ? 'xCircle' : 'checkCircle', cert.revocado ? 'ico no' : 'ico si'), el('div', {}, 'Registrado en la cadena',
      el('small', {}, `${cert.institucion}`, el('br'), el('a', { href: EXPLORER_BLOCK(cert.bloque), target: '_blank', rel: 'noopener' }, `Asset Hub, bloque ${cert.bloque}`)))),
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

  marco(root, 'otra',
    el('div', { class: 'cert-layout' },
      el('div', { class: 'pila-s' },
        el('div', { class: 'pestanas', role: 'tablist', 'aria-label': 'Vista' }, tabHoja, tabPdf),
        area,
      ),
      el('aside', { class: 'cert-lado' },
        el('div', { class: 'cert-titulo' },
          ceja(`Folio ${cert.id}`),
          el('h2', {}, cert.nombre),
          el('p', { class: 'muted' }, cert.programa, el('br'), fechaLarga(cert.fecha)),
          cert.revocado
            ? el('span', { class: 'etiqueta mal' }, icono('xCircle'), 'Revocado')
            : el('span', { class: 'etiqueta ok' }, icono('sealCheck'), 'Registrado en Polkadot'),
        ),
        el('div', { class: 'panel' }, checks),
        el('div', { class: 'acciones columna' }, descargar, linkedin, copiar),
        manual,
        el('p', { class: 'huella' }, el('span', {}, 'Huella sha256 del PDF'), el('span', {}, cert.sha256Pdf)),
      ),
    ),
  );

  pdf = await bajarPdf(cert.cid, cert.sha256Pdf);
  const [ic, txt] = !cert.cid
    ? [icono('warning', 'ico espera'), el('div', {}, 'PDF original', el('small', {}, 'Este certificado no tiene PDF en IPFS.'))]
    : pdf === null
      ? [icono('warning', 'ico no'), el('div', {}, 'PDF original', el('small', {}, 'Ningún gateway IPFS respondió. Inténtalo más tarde.'))]
      : pdf.integro
        ? [icono('checkCircle', 'ico si'), el('div', {}, 'PDF íntegro', el('small', {}, 'Su huella sha256 coincide con la registrada en la cadena.'))]
        : [icono('xCircle', 'ico no'), el('div', {}, 'El PDF no coincide', el('small', {}, 'El archivo que entregó IPFS no es el registrado. No lo uses como prueba.'))];
  checkPdf.replaceChildren(ic, txt);
  if (pdf?.integro) descargar.disabled = false;
  if (tabPdf.getAttribute('aria-selected') === 'true') void mostrar('pdf');
}
