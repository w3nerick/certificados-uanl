/**
 * Dibuja la primera página de un PDF en un <canvas> con pdf.js.
 * No se usa <iframe>: el WebView de Android no muestra PDFs y el de iOS no deja
 * controlarlos. pdf.js se carga solo cuando hace falta (es lo más pesado de la app).
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export async function dibujarPdf(bytes: Uint8Array, canvas: HTMLCanvasElement, anchoCss: number): Promise<void> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // pdf.js se queda con el buffer: se le pasa una copia para poder descargar el original después.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale: (anchoCss / base.width) * dpr });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.aspectRatio = `${vp.width} / ${vp.height}`;
    await page.render({ canvas, viewport: vp }).promise;
  } finally {
    void doc.destroy();
  }
}
