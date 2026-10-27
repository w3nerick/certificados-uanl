// Ficha de la app: es la ÚNICA fuente del nombre. La leen vite.config.ts (para el código) y
// scripts/deploy.mjs (para `pad` 0.22.1, que también publica la ficha en la Polkadot App).
//
// El nombre NO se cambia a la ligera: con manifest la app vive como app.<nombre> y cambiarlo la
// vuelve otra app (otro almacenamiento, otro lugar en el Statement Store del teléfono). Se cambió
// una vez, el 27 oct 2026, de certificados-uanl.dot a constancias-uanl.dot: el nombre viejo es de la cuenta
// de `pad login` de pad 0.16.x, que ya no puede firmar con la Polkadot App de TrUAPI 0.25.
export default {
  domain: 'constancias-uanl.dot',
  displayName: 'Certificados en Cadena',
  description: 'Constancias de la UANL verificables en Polkadot: búscala con tu nombre, pídela para tu cuenta y compártela.',
  icon: { path: './icon.png', format: 'png' },
  executables: [{ kind: 'app', path: './dist', appVersion: [0, 1, 0] }],
};
