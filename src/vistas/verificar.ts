/**
 * #/verificar: alguien (un empleador, la propia UANL) suelta un PDF y la app dice si
 * es exactamente el que se registró. El archivo no sale del dispositivo: solo se
 * calcula su huella sha256 y se busca en el contrato.
 */
import { marco } from './comun';
import { el, icono, aviso, esqueleto, boton } from '../ui';
import { porPdf, certificado, errorLegible } from '../lib/registro';
import { sha256Hex } from '../lib/ipfs';

export function vistaVerificar(root: HTMLElement): void {
  const resultado = el('div', { 'aria-live': 'polite' });
  const archivo = el('input', { type: 'file', accept: 'application/pdf,.pdf', id: 'pdf' }) as HTMLInputElement;
  const zona = el('label', { class: 'soltar', for: 'pdf' },
    icono('upload'),
    el('strong', {}, 'Elige o arrastra el PDF del certificado'),
    el('span', { class: 'ayuda' }, 'El archivo no se sube a ningún lado: se compara su huella con la registrada.'),
    archivo,
  );

  const revisar = async (f: File | undefined) => {
    if (!f) return;
    resultado.replaceChildren(esqueleto(2));
    try {
      const huella = await sha256Hex(new Uint8Array(await f.arrayBuffer()));
      const id = await porPdf(huella);
      if (id === 0n) {
        resultado.replaceChildren(aviso('mal', 'Este PDF no coincide con ningún certificado registrado. Si cambió aunque sea un byte (por ejemplo, al editarlo o reimprimirlo como PDF), su huella es otra.', el('p', { class: 'mono' }, huella)));
        return;
      }
      const c = await certificado(id);
      resultado.replaceChildren(c?.revocado
        ? aviso('mal', `Este PDF es el folio ${id}, pero la institución lo revocó.`, boton('Ver detalles', { href: `#/c/${id}` }))
        : aviso('ok', `Auténtico: es el certificado de ${c?.nombre ?? '?'} (folio ${id}), registrado en Polkadot.`, boton('Ver el certificado', { href: `#/c/${id}`, icono: 'arrowRight' })));
    } catch (e) {
      resultado.replaceChildren(aviso('mal', `No se pudo verificar: ${errorLegible(e)}`));
    }
  };

  archivo.onchange = () => void revisar(archivo.files?.[0]);
  zona.ondragover = e => { e.preventDefault(); zona.classList.add('encima'); };
  zona.ondragleave = () => zona.classList.remove('encima');
  zona.ondrop = e => { e.preventDefault(); zona.classList.remove('encima'); void revisar(e.dataTransfer?.files?.[0]); };

  const folio = el('input', { type: 'text', id: 'folio', inputmode: 'numeric', placeholder: '12' }) as HTMLInputElement;
  const ir = boton('Ver', { onClick: async () => { if (/^\d+$/.test(folio.value.trim())) location.hash = `#/c/${folio.value.trim()}`; } });

  marco(root, 'verificar',
    el('h1', {}, 'Verificar un certificado'),
    zona,
    resultado,
    el('div', { class: 'fila-form' }, el('label', { for: 'folio' }, 'O busca por folio', folio), ir),
  );
}
