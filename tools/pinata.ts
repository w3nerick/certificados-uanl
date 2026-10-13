/**
 * Pinata (API v3): subir cada PDF a la red PÚBLICA de IPFS dentro de un grupo.
 * Público es obligatorio: los archivos privados no los sirve ningún gateway.
 * La llave (PINATA_JWT) solo vive en .env, nunca en la app ni en git.
 */
const API = 'https://api.pinata.cloud/v3';
const UPLOAD = 'https://uploads.pinata.cloud/v3/files';

function jwt(): string {
  const t = process.env.PINATA_JWT?.trim();
  if (!t) throw new Error('Falta PINATA_JWT en .env (cp .env.example .env y pega tu JWT de Pinata).');
  return t;
}

async function pedir<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${jwt()}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(120_000) });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Pinata respondió ${r.status}: ${texto.slice(0, 300)}`);
  return JSON.parse(texto) as T;
}

/** Id del grupo con ese nombre; lo crea si no existe. */
export async function grupo(nombre: string): Promise<string> {
  const lista = await pedir<{ data: { groups: { id: string; name: string }[] } }>(`${API}/groups/public?name=${encodeURIComponent(nombre)}&limit=100`);
  const hay = lista.data.groups.find(g => g.name === nombre);
  if (hay) return hay.id;
  const nuevo = await pedir<{ data: { id: string } }>(`${API}/groups/public`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: nombre }),
  });
  return nuevo.data.id;
}

/** Sube un PDF y devuelve su CID. Si ya existía en la cuenta, Pinata devuelve el mismo CID. */
export async function subirPdf(bytes: Uint8Array, nombre: string, grupoId: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([bytes as BlobPart], { type: 'application/pdf' }), nombre);
  form.append('network', 'public');
  form.append('name', nombre);
  form.append('group_id', grupoId);
  const r = await pedir<{ data: { cid: string } }>(UPLOAD, { method: 'POST', body: form });
  if (!r.data?.cid) throw new Error(`Pinata no devolvió CID para ${nombre}`);
  return r.data.cid;
}

/** Comprueba que el gateway sirve el archivo (lo que verá el estudiante). */
export async function servido(gateway: string, cid: string): Promise<boolean> {
  try {
    const r = await fetch(`${gateway}/${cid}`, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
    return r.ok;
  } catch {
    return false;
  }
}
