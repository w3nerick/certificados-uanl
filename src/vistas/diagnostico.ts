/**
 * #/diagnostico — prueba cada pieza de la plataforma EN EL DISPOSITIVO REAL
 * y deja un reporte para copiar. Es lo primero que hay que abrir cuando algo
 * "no hace nada": casi siempre es el códec, un permiso o un canal sin respuesta.
 *
 * Las pruebas automáticas no abren diálogos. Las que sí (cuenta, firma,
 * Bulletin, mensajes) van detrás de un botón, porque el host solo acepta
 * diálogos que nacen de un gesto del usuario.
 */
import { insideHost, waitForHost } from '../lib/host';
import { requestStartupPermissions } from '../lib/permisos';
import { assetHub, nextFinalizedBlock, freeBalance, pas } from '../lib/cadena';
import { almacen } from '../lib/almacen';
import { conectar } from '../lib/identidad';
import { total, certificado, registroListo } from '../lib/registro';
import { bajarPdf } from '../lib/ipfs';
import { APP_DOTNS, RELAYER_URL, IPFS_GATEWAYS } from '../lib/red';
import { marco } from './comun';
import { el } from '../ui';

type Estado = 'ok' | 'mal' | 'aviso' | 'pendiente';
interface Linea { nombre: string; estado: Estado; detalle: string; ms?: number }

const ICON: Record<Estado, string> = { ok: '✓', mal: '✗', aviso: '!', pendiente: '…' };

export function vistaDiagnostico(root: HTMLElement): void {
  const lineas: Linea[] = [];
  const lista = el('ol', { class: 'diag' });
  const reporte = el('textarea', { class: 'reporte', readonly: '', rows: '8' }) as HTMLTextAreaElement;

  const pintar = () => {
    lista.replaceChildren(...lineas.map(l =>
      el('li', { class: `l-${l.estado}` },
        el('span', { class: 'icono' }, ICON[l.estado]),
        el('strong', {}, l.nombre),
        el('span', { class: 'detalle' }, l.detalle + (l.ms != null ? ` · ${l.ms} ms` : '')),
      )));
    reporte.value = [
      `Diagnóstico de ${APP_DOTNS} · ${new Date().toISOString()}`,
      `UA: ${navigator.userAgent}`,
      ...lineas.map(l => `${ICON[l.estado]} ${l.nombre}: ${l.detalle}${l.ms != null ? ` (${l.ms} ms)` : ''}`),
    ].join('\n');
  };

  /** Corre una prueba y la anota. Nunca lanza: el diagnóstico sigue aunque una falle. */
  const prueba = async (nombre: string, fn: () => Promise<string | { estado: Estado; detalle: string }>) => {
    const l: Linea = { nombre, estado: 'pendiente', detalle: '' };
    lineas.push(l);
    pintar();
    const t0 = performance.now();
    try {
      const r = await fn();
      if (typeof r === 'string') { l.estado = 'ok'; l.detalle = r; } else { l.estado = r.estado; l.detalle = r.detalle; }
    } catch (e) {
      l.estado = 'mal';
      l.detalle = (e as Error)?.message ?? String(e);
    }
    l.ms = Math.round(performance.now() - t0);
    pintar();
    return l.estado === 'ok';
  };

  const automaticas = async () => {
    await prueba('Versiones', async () => ({
      estado: __SDK__.codec === 1 ? 'ok' : 'aviso',
      detalle: `host ${__SDK__.host} · signer ${__SDK__.signer} · truapi ${__SDK__.truapi} · códec ${__SDK__.codec}`
        + (__SDK__.codec === 1 ? '' : ' (Desktop 0.1.3 y la Polkadot App de sep 2026 hablan el códec 1)'),
    }));
    const dentro = insideHost();
    await prueba('Contenedor', async () => ({ estado: dentro ? 'ok' : 'aviso', detalle: dentro ? 'dentro de un host' : 'navegador normal: las pruebas del host no aplican' }));
    if (!dentro) return comunes();
    if (!(await prueba('Canal con el host', async () => { if (!(await waitForHost())) throw new Error('sin `connected` en 12 s'); return 'connected'; }))) return;
    await prueba('Permisos de arranque', async () => { await requestStartupPermissions(); return 'Remote, Clipboard, OpenUrl pedidos'; });
    await prueba('Almacenamiento', async () => {
      const a = await almacen();
      const v = Date.now();
      await a.set('diagnostico', v);
      const back = await a.get<number>('diagnostico');
      if (back !== v) throw new Error(`${a.kind}: escribí ${v}, leí ${back}`);
      return { estado: a.kind === 'host' ? 'ok' : 'aviso', detalle: a.kind === 'host' ? 'host (sobrevive a cada versión)' : `${a.kind} (se pierde al publicar otra versión)` };
    });
    await prueba('Asset Hub', async () => {
      const c = await assetHub();
      const b = await nextFinalizedBlock(c);
      return { estado: c.source === 'host' ? 'ok' : 'aviso', detalle: `bloque #${b.number} por ${c.source}${c.hostProblem ? ` (host: ${c.hostProblem})` : ''}` };
    });
    await comunes();
  };

  /** Lo que importa igual en la app y en la web: contrato, PDF en IPFS y relayer. */
  const comunes = async () => {
    let n = 0n;
    await prueba('Contrato', async () => {
      if (!registroListo()) return { estado: 'aviso', detalle: 'sin desplegar (REGISTRO_ADDRESS en red.ts)' };
      n = await total();
      return `${n} certificados emitidos`;
    });
    await prueba('PDF desde IPFS', async () => {
      if (n === 0n) return { estado: 'aviso', detalle: 'sin certificados para probar' };
      const c = await certificado(n);
      if (!c?.cid) return { estado: 'aviso', detalle: 'el último certificado no tiene CID' };
      const p = await bajarPdf(c.cid, c.sha256Pdf);
      if (!p) throw new Error(`ningún gateway respondió (${IPFS_GATEWAYS.map(g => new URL(g).hostname).join(', ')})`);
      return { estado: p.integro ? 'ok' : 'mal', detalle: `${(p.bytes.length / 1024).toFixed(0)} KB de ${new URL(p.url).hostname} · huella ${p.integro ? 'coincide' : 'NO coincide'}` };
    });
    await prueba('Relayer', async () => {
      const r = await fetch(RELAYER_URL, { signal: AbortSignal.timeout(10_000) });
      const j = (await r.json().catch(() => ({}))) as { cuenta?: string; saldo?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      return `cuenta ${j.cuenta?.slice(0, 8) ?? '?'}… · ${j.saldo ?? '?'}`;
    });
  };

  const btn = (texto: string, fn: () => Promise<unknown>) => {
    const b = el('button', {}, texto) as HTMLButtonElement;
    b.onclick = async () => { b.disabled = true; try { await fn(); } finally { b.disabled = false; } };
    return b;
  };

  const acciones = el('div', { class: 'acciones' },
    btn('Cuenta', () => prueba('Cuenta', async () => {
      const s = await conectar();
      const c = await assetHub();
      const saldo = await freeBalance(c, s.app.address).catch(() => null);
      return {
        estado: s.identidad ? 'ok' : 'aviso',
        detalle: `app ${s.app.address.slice(0, 8)}…${saldo != null ? ` (${pas(saldo)})` : ''} · username ${s.username ?? '—'} · identidad ${s.identidad ? 'sí' : `no: ${s.sinIdentidad}`}`,
      };
    })),
    btn('Copiar reporte', async () => { await navigator.clipboard?.writeText(reporte.value).catch(() => reporte.select()); }),
  );

  marco(root, 'otra',
    el('h1', {}, 'Diagnóstico'),
    el('p', { class: 'muted' }, 'Las pruebas corren solas. «Cuenta» abre un diálogo del wallet: apruébalo en el celular.'),
    lista,
    acciones,
    reporte,
  );
  void automaticas();
}
