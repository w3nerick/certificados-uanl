import { pathToFileURL } from 'node:url';
// Reglas de nombres de DotNS. Las usa scripts/check.mjs; puedes probar un nombre con:
//   node scripts/nombre.mjs mi-nombre-de-app
/** Reglas de DotNS (protocolo v2, tal como las comprueba pad 0.16.7). */
export function checkLabel(label) {
  if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(label)) return { ok: false, why: 'solo minúsculas, números y guiones (no al principio ni al final), de 3 a 63 caracteres' };
  const digits = /\d*$/.exec(label)[0].length;
  if (digits !== 0 && digits !== 2) return { ok: false, why: `termina en ${digits} dígito${digits === 1 ? '' : 's'}: deben ser 0 o 2 (si no, está reservado)` };
  const base = label.length - digits;
  if (base <= 5) return { ok: false, why: `base de ${base} caracteres: reservado para gobernanza` };
  if (base <= 8) return { ok: false, why: `base de ${base} caracteres: pide proof of personhood (${digits ? 'Lite' : 'Full'}). Usa 9 o más` };
  return { ok: true, why: `base de ${base} caracteres: registro abierto` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const l of process.argv.slice(2)) {
    const r = checkLabel(l.replace(/\.dot$/, ''));
    console.log(`${r.ok ? '✓' : '✗'} ${l}: ${r.why}`);
  }
}
