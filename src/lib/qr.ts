/**
 * Códigos QR en SVG, dibujados en el dispositivo (sin servicios externos: la app también
 * vive en Bulletin). uqr se baja solo cuando alguien pide un QR.
 */
export async function qrSvg(texto: string): Promise<SVGSVGElement> {
  const { renderSVG } = await import('uqr');
  const t = document.createElement('template');
  // Corrección M: aguanta una mancha o un reflejo en el cartel sin crecer demasiado.
  t.innerHTML = renderSVG(texto, { ecc: 'M', border: 2, blackColor: '#111', whiteColor: '#fff' });
  const svg = t.content.firstElementChild as SVGSVGElement;
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Código QR: ${texto}`);
  return svg;
}
