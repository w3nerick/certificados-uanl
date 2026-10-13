/**
 * Emite un lote de certificados: PDF a Pinata (IPFS), registro en Asset Hub y links de reclamo.
 *
 *   npm run emitir -- lotes/uanl-2026/lista.csv --simulacion   Sin subir ni firmar: valida y mide el costo
 *   npm run emitir -- lotes/uanl-2026/lista.csv                Sube, simula, pide EMITIR y firma
 *
 * lista.csv (con encabezado):  nombre,correo,programa,archivo[,fecha][,titular]
 *   archivo  ruta del PDF relativa al CSV
 *   fecha    AAAA-MM-DD (o --fecha para todo el lote)
 *   titular  opcional: dirección 0x… o SS58 para emitir directo, sin link
 *
 * Salida en salida/<lote>/ (fuera de git):
 *   estado.json   códigos de reclamo y CIDs. Se escribe ANTES de cada paso externo:
 *                 si algo se corta, volver a correr el comando retoma donde quedó.
 *   enlaces.csv   nombre, correo, folio, link de reclamo y link público, para combinar correspondencia.
 *
 * Los códigos son secretos: quien tenga el link puede reclamar ese certificado.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { AccountId } from 'polkadot-api';
import type { Hex } from 'viem';
import { createHash } from 'node:crypto';
import { nuevoCodigo, llaveDeCodigo, linkReclamo } from '../src/lib/reclamo';
import { conectar, leer, simular, enviar, saldoLibre, cuentaDeSemilla, h160De, pas } from './cadena';
import { grupo, subirPdf, servido } from './pinata';
import { preguntar, secreto } from './terminal';

const WEB_URL = 'https://certificados-uanl.vercel.app';
const INSTITUCION = 'Universidad Autónoma de Nuevo León';
const MAX_POR_TX = 20;

// ---------- argumentos ----------
const argv = process.argv.slice(2);
const opcion = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const SIMULACION = argv.includes('--simulacion');
const csvPath = argv.find(a => a.endsWith('.csv'));
if (!csvPath) salir('Uso: npm run emitir -- lotes/<lote>/lista.csv [--simulacion] [--fecha AAAA-MM-DD] [--institucion "…"]');
if (existsSync('.env')) process.loadEnvFile('.env');

function salir(msg: string, code = 1): never {
  console.error(msg);
  process.exit(code);
}

// ---------- CSV ----------
function parseCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ',') { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some(c => c.trim())) filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  fila.push(campo);
  if (fila.some(c => c.trim())) filas.push(fila);
  return filas;
}
const csvCampo = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Mediodía en Monterrey (UTC−6) para que la fecha no cambie de día en ninguna zona de México. */
function fechaUnix(s: string): bigint {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`fecha inválida «${s}» (usa AAAA-MM-DD)`);
  return BigInt(Date.UTC(+m[1], +m[2] - 1, +m[3], 18) / 1000);
}

interface Fila {
  n: number;
  nombre: string;
  correo: string;
  programa: string;
  archivo: string;
  fecha: bigint;
  titular: Hex | null;
  bytes: Uint8Array;
  sha: Hex;
}

interface Estado {
  contrato: Hex;
  grupo?: string;
  filas: Record<Hex, { nombre: string; correo: string; codigo: string | null; cid?: string; id?: string }>;
}

const bytesUtf8 = (s: string) => Buffer.byteLength(s, 'utf8');

// ---------- leer y validar el lote ----------
const dirLote = dirname(resolve(csvPath));
const nombreLote = basename(dirLote);
const filasCsv = parseCsv(readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
const encabezado = filasCsv.shift()!.map(h => h.trim().toLowerCase());
for (const col of ['nombre', 'correo', 'programa', 'archivo']) if (!encabezado.includes(col)) salir(`Falta la columna «${col}» en el encabezado de ${csvPath}`);
const col = (f: string[], c: string) => (f[encabezado.indexOf(c)] ?? '').trim();
const fechaLote = opcion('--fecha');
const institucion = opcion('--institucion') ?? INSTITUCION;

const client = conectar();

const errores: string[] = [];
const filas: Fila[] = [];
for (const [i, f] of filasCsv.entries()) {
  const n = i + 2;
  const nombre = col(f, 'nombre'), correo = col(f, 'correo'), programa = col(f, 'programa'), archivo = col(f, 'archivo');
  const fechaTxt = col(f, 'fecha') || fechaLote || '';
  const titularTxt = encabezado.includes('titular') ? col(f, 'titular') : '';
  if (!nombre || !programa || !archivo) { errores.push(`fila ${n}: nombre, programa y archivo son obligatorios`); continue; }
  if (!titularTxt && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) { errores.push(`fila ${n}: correo inválido «${correo}»`); continue; }
  for (const [k, v] of [['nombre', nombre], ['programa', programa], ['institución', institucion]] as const) if (bytesUtf8(v) > 256) errores.push(`fila ${n}: ${k} pasa de 256 bytes`);
  if (!fechaTxt) { errores.push(`fila ${n}: sin fecha (columna fecha o --fecha AAAA-MM-DD)`); continue; }
  let fecha: bigint;
  try { fecha = fechaUnix(fechaTxt); } catch (e) { errores.push(`fila ${n}: ${(e as Error).message}`); continue; }
  const ruta = resolve(dirLote, archivo);
  if (!existsSync(ruta)) { errores.push(`fila ${n}: no existe ${archivo}`); continue; }
  const bytes = new Uint8Array(readFileSync(ruta));
  if (Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') { errores.push(`fila ${n}: ${archivo} no es un PDF`); continue; }
  if (bytes.length > 15 * 1024 * 1024) { errores.push(`fila ${n}: ${archivo} pasa de 15 MB`); continue; }
  let titular: Hex | null = null;
  if (titularTxt) {
    if (/^0x[0-9a-fA-F]{40}$/.test(titularTxt)) titular = titularTxt.toLowerCase() as Hex;
    else {
      try { AccountId().enc(titularTxt); titular = await h160De(client, titularTxt); }
      catch { errores.push(`fila ${n}: titular inválido «${titularTxt}»`); continue; }
    }
  }
  const sha = ('0x' + createHash('sha256').update(bytes).digest('hex')) as Hex;
  filas.push({ n, nombre, correo, programa, archivo, fecha, titular, bytes, sha });
}
const repetidos = filas.filter((f, i) => filas.findIndex(g => g.sha === f.sha) !== i);
for (const r of repetidos) errores.push(`fila ${r.n}: ${r.archivo} es idéntico a otro PDF del lote`);
if (errores.length) salir(`\nEl lote tiene errores, no se hizo nada:\n  ${errores.join('\n  ')}`);
console.log(`Lote «${nombreLote}»: ${filas.length} certificados válidos.`);

// ---------- contrato y estado ----------
const deployments = resolve('contract/deployments.json');
const contratoDir = (opcion('--contrato') ?? (existsSync(deployments) ? JSON.parse(readFileSync(deployments, 'utf8')).devnet?.address : null)) as Hex | null;
if (!contratoDir) salir('No hay contrato: despliégalo (cd contract && npm run deploy) o pasa --contrato 0x…');
const contrato = contratoDir;

const dirSalida = resolve('salida', nombreLote);
mkdirSync(dirSalida, { recursive: true });
const rutaEstado = join(dirSalida, 'estado.json');
const estado: Estado = existsSync(rutaEstado) ? JSON.parse(readFileSync(rutaEstado, 'utf8')) : { contrato, filas: {} };
if (estado.contrato.toLowerCase() !== contrato.toLowerCase()) salir(`${rutaEstado} es de otro contrato (${estado.contrato}). Usa otro nombre de lote.`);
const guardar = () => writeFileSync(rutaEstado, JSON.stringify(estado, null, 2) + '\n', { mode: 0o600 });
for (const f of filas) {
  const e = (estado.filas[f.sha] ??= { nombre: f.nombre, correo: f.correo, codigo: f.titular ? null : nuevoCodigo() });
  if (!f.titular && !e.codigo) e.codigo = nuevoCodigo();
}
if (!SIMULACION) guardar();

// Ya emitidos (otra corrida que se cortó, o el mismo PDF en otro lote)
const pendientes: Fila[] = [];
for (const f of filas) {
  const id = await leer<bigint>(client, contrato, 'porPdf', [f.sha]);
  if (id === 0n) { pendientes.push(f); continue; }
  const c = await leer<{ llaveReclamo: Hex; titular: Hex }>(client, contrato, 'certificado', [id]);
  const e = estado.filas[f.sha];
  const mio = f.titular ? c.titular.toLowerCase() === f.titular : e.codigo && c.llaveReclamo.toLowerCase() === llaveDeCodigo(e.codigo).address.toLowerCase();
  if (!mio) salir(`fila ${f.n}: ${f.archivo} ya está registrado como folio ${id} por otra emisión. Quítalo del lote.`);
  e.id = id.toString();
}
if (!SIMULACION) guardar();
console.log(`${filas.length - pendientes.length} ya estaban en la cadena; faltan ${pendientes.length}.`);

// ---------- emisor ----------
const emisorTxt = opcion('--desde') ?? (existsSync(deployments) ? JSON.parse(readFileSync(deployments, 'utf8')).devnet?.deployer : null);
if (!emisorTxt) salir('Pasa --desde <dirección SS58 del emisor>.');
const emisor = emisorTxt;
if (!(await leer<boolean>(client, contrato, 'emisores', [await h160De(client, emisor)]))) salir(`${emisor} no es emisor en el contrato.`);

// ---------- subir PDFs ----------
const CID_FALSO = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
if (!SIMULACION && pendientes.some(f => !estado.filas[f.sha].cid)) {
  estado.grupo ??= await grupo(process.env.PINATA_GROUP?.trim() || 'certificados-uanl-2026');
  guardar();
  for (const f of pendientes) {
    const e = estado.filas[f.sha];
    if (e.cid) continue;
    process.stdout.write(`Subiendo ${f.archivo}… `);
    e.cid = await subirPdf(f.bytes, `${nombreLote}-${basename(f.archivo)}`, estado.grupo);
    guardar();
    console.log(e.cid);
  }
  const gw = process.env.PINATA_GATEWAY?.trim();
  if (gw) {
    const muestra = estado.filas[pendientes[0].sha].cid!;
    console.log(`Gateway ${gw}: ${(await servido(`https://${gw}/ipfs`, muestra)) ? 'sirve los PDF ✓' : 'NO respondió (revisa que el gateway sea público)'}`);
  }
}

// ---------- armar lotes y simular ----------
const nuevo = (f: Fila) => ({
  nombre: f.nombre,
  programa: f.programa,
  institucion,
  cid: SIMULACION ? (estado.filas[f.sha].cid ?? CID_FALSO) : estado.filas[f.sha].cid!,
  sha256Pdf: f.sha,
  fecha: f.fecha,
  llaveReclamo: f.titular ? '0x0000000000000000000000000000000000000000' : llaveDeCodigo(estado.filas[f.sha].codigo!).address,
  titular: f.titular ?? '0x0000000000000000000000000000000000000000',
});

type Lote = { filas: Fila[]; sim: Extract<Awaited<ReturnType<typeof simular>>, { ok: true }> };
async function partir(grupoFilas: Fila[], origen: string): Promise<Lote[]> {
  const sim = await simular(client, origen, contrato, 'emitir', [grupoFilas.map(nuevo)]);
  if (sim.ok && !sim.pesada) return [{ filas: grupoFilas, sim }];
  if (grupoFilas.length === 1) salir(`fila ${grupoFilas[0].n}: la simulación falló (${sim.ok ? 'demasiado pesada' : sim.why})`);
  const mitad = Math.ceil(grupoFilas.length / 2);
  return [...(await partir(grupoFilas.slice(0, mitad), origen)), ...(await partir(grupoFilas.slice(mitad), origen))];
}
async function planear(origen: string): Promise<Lote[]> {
  const lotes: Lote[] = [];
  for (let i = 0; i < pendientes.length; i += MAX_POR_TX) lotes.push(...(await partir(pendientes.slice(i, i + MAX_POR_TX), origen)));
  return lotes;
}

let lotes: Lote[] = pendientes.length ? await planear(emisor) : [];
const deposito = lotes.reduce((s, l) => s + l.sim.deposit, 0n);
console.log(`\n${lotes.length} transacción(es) · depósito total ${pas(deposito)} · ≈${pas(deposito / BigInt(Math.max(1, pendientes.length)))} por certificado`);
for (const [i, l] of lotes.entries()) console.log(`  tx ${i + 1}: ${l.filas.length} certificados · proof_size ${(Number(l.sim.weight.proof_size) / 1e6).toFixed(2)} MB · ${pas(l.sim.deposit)}`);

if (SIMULACION) {
  console.log('\nSimulación: no se subió ni se firmó nada.');
  client.destroy();
  process.exit(0);
}

// ---------- firmar ----------
if (lotes.length) {
  const saldo = await saldoLibre(client, emisor);
  console.log(`Emisor ${emisor} · saldo ${pas(saldo)}`);
  if (saldo < deposito + 10n ** 10n) salir(`Saldo insuficiente: hace falta al menos ${pas(deposito + 10n ** 10n)}.`);
  if ((await preguntar('\nEscribe EMITIR para firmar y enviar: ')) !== 'EMITIR') salir('Cancelado. No se firmó nada.', 0);
  const cuenta = cuentaDeSemilla(await secreto('Frase semilla del emisor (no se muestra): '));
  if (cuenta.address !== emisor) salir(`Esa frase es de ${cuenta.address}, no del emisor ${emisor}.`);
  lotes = await planear(cuenta.address); // re-simular justo antes de enviar
  for (const [i, l] of lotes.entries()) {
    process.stdout.write(`Enviando tx ${i + 1}/${lotes.length}… `);
    const r = await enviar(client, cuenta.signer, contrato, l.sim, { hasta: 'final' });
    for (const f of l.filas) estado.filas[f.sha].id = (await leer<bigint>(client, contrato, 'porPdf', [f.sha])).toString();
    guardar();
    console.log(`bloque ${r.bloque} ✓`);
  }
}

// ---------- enlaces ----------
const salida = [['nombre', 'correo', 'folio', 'link_reclamo', 'link_publico']];
for (const f of filas) {
  const e = estado.filas[f.sha];
  if (!e.id) continue;
  salida.push([f.nombre, f.correo, e.id, e.codigo ? linkReclamo(WEB_URL, e.id, e.codigo) : '(emitido directo)', `${WEB_URL}/#/c/${e.id}`]);
}
const rutaEnlaces = join(dirSalida, 'enlaces.csv');
writeFileSync(rutaEnlaces, '﻿' + salida.map(r => r.map(csvCampo).join(',')).join('\n') + '\n', { mode: 0o600 });
console.log(`\nListo: ${salida.length - 1} certificados en la cadena.\nLinks para el correo: ${rutaEnlaces}\nGuárdalo en privado: cada link permite reclamar un certificado.`);
client.destroy();
process.exit(0);
