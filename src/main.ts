/**
 * Arranque y rutas.
 *
 * Rutas con `#`: no hay servidor que devuelva index.html para /ruta (Bulletin), y lo
 * que va después del `#` nunca viaja a un servidor: ahí va el código del link de reclamo.
 */
import './style.css';
import { requestStartupPermissions } from './lib/permisos';
import { leerRutaReclamo } from './lib/reclamo';
import { vistaInicio } from './vistas/inicio';
import { vistaCertificado } from './vistas/certificado';
import { vistaReclamar } from './vistas/reclamar';
import { vistaMis } from './vistas/mis';
import { vistaVerificar } from './vistas/verificar';
import { vistaMuestra } from './vistas/muestra';
import { vistaConstancia } from './vistas/constancia';
import { marco } from './vistas/comun';
import { aviso, boton } from './ui';

const root = document.getElementById('app')!;

/**
 * Vistas del organizador y de soporte: se bajan solo al abrirlas, así la app de los
 * estudiantes arranca más ligera. Si mientras baja ya se fueron a otra ruta, no se pinta.
 */
function perezosa(h: string, cargar: () => Promise<(root: HTMLElement) => unknown>): void {
  cargar().then(
    vista => { if ((location.hash || '#/') === h) void vista(root); },
    e => marco(root, 'otra', aviso('mal', `No se pudo abrir esta sección: ${(e as Error).message}`, boton('Reintentar', { onClick: async () => render() }))),
  );
}

function render() {
  const h = location.hash || '#/';
  const reclamo = leerRutaReclamo(h);
  if (reclamo) return void vistaReclamar(root, reclamo.id, reclamo.codigo);
  const cert = /^#\/c\/(\d{1,9})$/.exec(h);
  if (cert) return void vistaCertificado(root, BigInt(cert[1]));
  if (h === '#/constancia') return vistaConstancia(root);
  if (h === '#/organizar') return perezosa(h, () => import('./vistas/organizar').then(m => m.vistaOrganizar));
  if (h === '#/mis') return void vistaMis(root);
  if (h === '#/verificar') return void vistaVerificar(root);
  if (h === '#/diagnostico') return perezosa(h, () => import('./vistas/diagnostico').then(m => m.vistaDiagnostico));
  if (h === '#/cartel') return perezosa(h, () => import('./vistas/cartel').then(m => m.vistaCartel));
  if (h === '#/muestra') return vistaMuestra(root);
  vistaInicio(root);
}

window.addEventListener('hashchange', render);
render();
// En segundo plano: el primer render no espera al host.
void requestStartupPermissions();
