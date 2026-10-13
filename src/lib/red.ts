/**
 * Products Devnet: cadenas, contrato y servicios. Genesis medidos por RPC en septiembre de 2026.
 * Si el devnet se reinicia, cambian: compruébalos con `chain_getBlockHash(0)`.
 */

/** Nombre de la app. Sale de polkadot-app-deploy.config.mjs; no lo escribas aquí. */
export const APP_DOTNS = __APP_DOMAIN__;
export const APP_LABEL = APP_DOTNS.replace(/\.dot$/, '');

/** Dentro de la Polkadot App, un enlace `https://<nombre>.dot` abre la app sin salir del contenedor. */
export const IN_APP_LINK = `https://${APP_DOTNS}`;

/**
 * La web pública (Vercel): verificación, página de cada certificado y reclamo para
 * quien no tiene la Polkadot App. Los links de los correos apuntan aquí, porque un
 * `.dot` no abre en un navegador normal. También aloja el relayer (/api/reclamar).
 */
export const WEB_URL = 'https://certificados-uanl.vercel.app';

/**
 * La app .dot en el gateway web del devnet: se ve como app de Polkadot desde cualquier
 * navegador. Es el link para compartir en el evento; caduca si la app no se vuelve a
 * publicar en Bulletin (14 días). Para LinkedIn se usa WEB_URL, que no caduca.
 */
export const DOTLI_URL = `https://${APP_LABEL}.dev-dot.li`;

/**
 * En la web (Vercel, previews o `npm run dev`) el relayer es del mismo origen. Dentro de
 * la Polkadot App la página se sirve desde Bulletin, así que va la URL completa.
 */
const API = /^https?:$/.test(location.protocol) && /(^localhost$|^127\.0\.0\.1$|\.vercel\.app$)/.test(location.hostname) ? '/api' : `${WEB_URL}/api`;
export const RELAYER_URL = `${API}/reclamar`;
export const SOLICITAR_URL = `${API}/solicitar`;
export const SUBIDA_URL = `${API}/subida`;
/** Destino de los links firmados de subida (lo pide el permiso Remote). */
export const PINATA_UPLOADS = 'https://uploads.pinata.cloud';

/** Asset Hub (para 1000): PAS y contratos (pallet-revive). Es el Asset Hub de Paseo. */
export const ASSET_HUB_GENESIS = '0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2' as const;
export const ASSET_HUB_WS = ['wss://asset-hub-paseo-rpc.n.dwellir.com', 'wss://sys.turboflakes.io/asset-hub-paseo'];

/** People (para 1004): usernames (ana.01 → cuenta). */
export const PEOPLE_GENESIS = '0xe6c30d6e148f250b887105237bcaa5cb9f16dd203bf7b5b9d4f1da7387cb86ec' as const;
export const PEOPLE_WS = [
  'wss://people-paseo.gatotech.network',
  'wss://rpc.interweb-it.com/people-paseo',
  'wss://people-paseo.rotko.net',
];

/**
 * RegistroCertificados en pallet-revive, v2 con solicitudes, desplegado el 13 oct 2026 (bloque 14,399,794,
 * ver contract/deployments.json). Admin y emisor: la cuenta organizadora 5ELdxEtr….
 */
export const REGISTRO_ADDRESS: `0x${string}` | null = '0x5e122d6822e57b943ae964d0d345bd924ac44607';

/**
 * Gateways IPFS para los PDF, en orden. El primero debe ser el gateway dedicado de
 * Pinata (https://<subdominio>.mypinata.cloud); los demás son respaldos públicos.
 * Cada dominio va también en el permiso Remote (permisos.ts) y en la CSP (vercel.json).
 */
export const IPFS_GATEWAYS = ['https://salmon-single-asp-773.mypinata.cloud/ipfs', 'https://gateway.pinata.cloud/ipfs', 'https://ipfs.io/ipfs'];

/** Explorador de bloques para el enlace "ver en la cadena". */
export const EXPLORER_BLOCK = (n: number | bigint) => `https://assethub-paseo.subscan.io/block/${n}`;
