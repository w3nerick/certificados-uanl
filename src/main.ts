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
import { vistaDiagnostico } from './vistas/diagnostico';
import { vistaMuestra } from './vistas/muestra';
import { vistaConstancia } from './vistas/constancia';
import { vistaOrganizar } from './vistas/organizar';

const root = document.getElementById('app')!;

function render() {
  const h = location.hash || '#/';
  const reclamo = leerRutaReclamo(h);
  if (reclamo) return void vistaReclamar(root, reclamo.id, reclamo.codigo);
  const cert = /^#\/c\/(\d{1,9})$/.exec(h);
  if (cert) return void vistaCertificado(root, BigInt(cert[1]));
  if (h === '#/constancia') return vistaConstancia(root);
  if (h === '#/organizar') return vistaOrganizar(root);
  if (h === '#/mis') return void vistaMis(root);
  if (h === '#/verificar') return void vistaVerificar(root);
  if (h === '#/diagnostico') return vistaDiagnostico(root);
  if (h === '#/muestra') return vistaMuestra(root);
  vistaInicio(root);
}

window.addEventListener('hashchange', render);
render();
// En segundo plano: el primer render no espera al host.
void requestStartupPermissions();
