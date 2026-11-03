/**
 * El PDF original del certificado, tal como lo diseñó la institución: su primera página dibujada
 * con pdf.js dentro de un marco con la proporción del documento. Mientras baja de IPFS se ve un
 * esqueleto; si ningún gateway responde, un aviso con «Reintentar».
 *
 * Cada PDF se baja una sola vez por sesión (`pdfDe`): la página del certificado lo usa también
 * para la verificación y la descarga.
 */
import { el, icono, boton } from '../ui';
import { bajarPdf, type PdfBajado } from '../lib/ipfs';
import { dibujarPdf } from '../lib/pdf';
import type { Certificado } from '../lib/registro';

const bajados = new Map<string, Promise<PdfBajado | null>>();

/** El PDF de un certificado comprobado contra su huella. null si no tiene PDF o ningún gateway respondió. */
export function pdfDe(c: Pick<Certificado, 'cid' | 'sha256Pdf'>): Promise<PdfBajado | null> {
  if (!c.cid) return Promise.resolve(null);
  let p = bajados.get(c.cid);
  if (!p) {
    p = bajarPdf(c.cid, c.sha256Pdf).then(r => {
      if (!r) bajados.delete(c.cid); // un fallo no se guarda: «Reintentar» vuelve a probar
      return r;
    });
    bajados.set(c.cid, p);
  }
  return p;
}

/**
 * Marco con el PDF. `ancho` es el ancho aproximado en pantalla (px CSS) para dibujarlo nítido;
 * `compacto` quita el texto largo de los estados (miniaturas de las listas); `alCargar` recibe el
 * resultado de cada intento (también los de «Reintentar»).
 */
export function visorPdf(c: Certificado, { ancho = 820, compacto = false, alCargar }: { ancho?: number; compacto?: boolean; alCargar?: (pdf: PdfBajado | null) => void } = {}): HTMLElement {
  const visor = el('div', { class: `visor${c.revocado ? ' revocado' : ''}${compacto ? ' compacto' : ''}`, 'aria-busy': 'true' });
  const estado = (clase: string, ...hijos: (Node | string | null)[]) =>
    visor.replaceChildren(el('div', { class: `visor-estado ${clase}` }, ...hijos));

  const cargar = async () => {
    visor.classList.add('bajando');
    visor.setAttribute('aria-busy', 'true');
    estado('', compacto ? null : el('span', {}, 'Cargando el PDF original…'));
    const pdf = await pdfDe(c);
    visor.classList.remove('bajando');
    visor.setAttribute('aria-busy', 'false');
    alCargar?.(pdf);
    if (!pdf) {
      estado('falla', icono(c.cid ? 'warning' : 'filePdf'),
        el('span', {}, !c.cid ? 'Este certificado no tiene PDF.' : compacto ? 'PDF no disponible' : 'No se pudo bajar el PDF de IPFS en este momento.'),
        c.cid && !compacto ? boton('Reintentar', { clase: 'chico', onClick: () => cargar() }) : null);
      return;
    }
    const lienzo = el('canvas', { role: 'img', 'aria-label': `Constancia de ${c.nombre}, PDF original${c.revocado ? ' (revocada)' : ''}` }) as HTMLCanvasElement;
    try {
      await dibujarPdf(pdf.bytes, lienzo, ancho);
      visor.style.aspectRatio = lienzo.style.aspectRatio;
      visor.replaceChildren(lienzo);
    } catch (e) {
      estado('falla', icono('warning'), el('span', {}, compacto ? 'No se pudo mostrar' : `No se pudo mostrar el PDF: ${(e as Error).message}`));
    }
  };
  void cargar();
  return visor;
}
