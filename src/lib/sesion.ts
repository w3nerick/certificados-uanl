/**
 * Sesión del organizador para subir PDFs: firma UNA vez un texto con su cuenta de la
 * Polkadot App y el servidor (api/subida.ts) le da links de subida a Pinata mientras
 * dure la sesión, solo si esa cuenta es emisora en el contrato. Sin dependencias del host.
 */
export const SESION_HORAS = 8;

export function textoSesion(contrato: string, ss58: string, expira: number): string {
  return `certificados-uanl/sesion/v1|${contrato.toLowerCase()}|${ss58}|${expira}`;
}

/** El host puede firmar los bytes tal cual o envueltos en <Bytes>…</Bytes>: se aceptan las dos. */
export function variantesFirmadas(texto: string): Uint8Array[] {
  const e = new TextEncoder();
  return [e.encode(texto), e.encode(`<Bytes>${texto}</Bytes>`)];
}
