// Ficha de la app: es la ÚNICA fuente del nombre. La leen vite.config.ts (para el código),
// scripts/deploy.mjs (para `pad`) y scripts/manifest.mjs (para la ficha en la Polkadot App).
//
// El nombre NO se cambia después del primer deploy: con manifest la app vive como
// app.<nombre> y cambiarlo la vuelve otra app (otro almacenamiento, otro lugar en el
// Statement Store del teléfono).
export default {
  domain: 'certificados-uanl.dot',
  displayName: 'Certificados en Cadena',
  description: 'Constancias de la UANL verificables en Polkadot: búscala con tu nombre, pídela para tu cuenta y compártela.',
  icon: { path: './icon.png', format: 'png' },
  executables: [{ kind: 'app', path: './dist', appVersion: [0, 1, 0] }],
};
