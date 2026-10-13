/**
 * Permisos del contenedor.
 *
 * Un permiso que no pediste no da error: la llamada simplemente no hace nada
 * (un fetch sin `Remote` falla en silencio). El de red se pide al arrancar.
 */
import { navigateTo, requestPermission } from '@parity/product-sdk-host';
import { insideHost, waitForHost, withTimeout, TIMED_OUT, HOST_QUERY_MS, HOST_SUBMIT_MS } from './host';
import { ASSET_HUB_WS, IPFS_GATEWAYS, PEOPLE_WS, WEB_URL, PINATA_UPLOADS } from './red';

const hostname = (u: string) => new URL(u).hostname;

/** Dominios externos: RPC públicos de respaldo, gateways IPFS, la web (relayer y subidas) y Pinata. */
export const REMOTE_DOMAINS = [...new Set([...ASSET_HUB_WS, ...PEOPLE_WS, ...IPFS_GATEWAYS, WEB_URL, PINATA_UPLOADS].map(hostname))];

let asked: Promise<void> | null = null;

/** Al arrancar. Acotado a 4 s: el arranque no puede depender de un canal trabado. */
export function requestStartupPermissions(): Promise<void> {
  asked ??= (async () => {
    if (!insideHost() || !(await waitForHost())) return;
    await Promise.race([
      Promise.all([
        // Solo red. Portapapeles y abrir links NO se piden al arrancar: en dev-dot.li cada uno
        // abre un aviso y aceptarlo recarga la app, justo cuando alguien abre un certificado
        // compartido. "Copiar enlace" tiene respaldo sin permiso (vistas/certificado.ts).
        requestPermission({ tag: 'Remote', value: { domains: REMOTE_DOMAINS } }).catch(() => undefined),
      ]),
      new Promise(r => setTimeout(r, 4000)),
    ]);
  })().catch(() => undefined);
  return asked;
}

/**
 * Abre un enlace externo (LinkedIn, el PDF en el gateway). En el host, `navigateTo`
 * con una URL https que no termina en .dot abre el navegador del sistema.
 */
export async function abrirFuera(url: string): Promise<void> {
  if (insideHost() && (await waitForHost())) {
    const r = await withTimeout(navigateTo(url), HOST_QUERY_MS).catch(() => null);
    if (r && r !== TIMED_OUT && r.ok) return;
  }
  window.open(url, '_blank', 'noopener');
}

/** Sin `ChainSubmit`, una petición de firma de transacción se cuelga sin abrir el wallet. */
export async function askChainSubmit(): Promise<void> {
  const r = await withTimeout(requestPermission({ tag: 'ChainSubmit', value: undefined }), HOST_SUBMIT_MS);
  if (r === TIMED_OUT) throw new Error('El host no respondió al permiso para enviar transacciones.');
  if (!r.ok || !r.value) throw new Error('Permiso para enviar transacciones denegado.');
}
