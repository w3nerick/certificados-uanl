import { readFileSync, existsSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import config from './polkadot-app-deploy.config.mjs';

const read = (rel: string) => readFileSync(new URL(`./node_modules/${rel}`, import.meta.url), 'utf8');
const version = (pkg: string) => JSON.parse(read(`${pkg}/package.json`)).version as string;

/**
 * Versiones del SDK y códec del protocolo app ↔ host, visibles en #/diagnostico.
 * Si el códec de la app no es el mismo que el del host, el SDK dice `connected`
 * y ninguna petición recibe respuesta.
 */
const sdk = {
  host: version('@parity/product-sdk-host'),
  signer: version('@parity/product-sdk-signer'),
  truapi: version('@parity/truapi'),
  codec: Number(/TRUAPI_CODEC_VERSION = (\d+)/.exec(read('@parity/truapi/dist/generated/client.js'))?.[1] ?? 0),
};

/**
 * Solo en `npm run dev`: sirve /api/* con el MISMO código de las funciones de Vercel,
 * firmando con la cuenta del relayer de .env.relayer. Así se prueba el reclamo completo
 * en local antes de publicar.
 */
function relayerLocal(): Plugin {
  return {
    name: 'relayer-local',
    apply: 'serve',
    configureServer(server) {
      if (existsSync('.env')) process.loadEnvFile('.env');
      if (existsSync('.env.relayer')) process.env.RELAYER_SEED ??= readFileSync('.env.relayer', 'utf8').trim();
      if (existsSync('contract/deployments.json')) process.env.REGISTRO_ADDRESS ??= JSON.parse(readFileSync('contract/deployments.json', 'utf8')).devnet?.address;
      server.middlewares.use('/api', async (req, res, next) => {
        const nombre = /^\/(\w+)/.exec(req.url ?? '')?.[1];
        if (!nombre || !existsSync(`api/${nombre}.ts`)) return next();
        const mod = await server.ssrLoadModule(`/api/${nombre}.ts`);
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const request = new Request(`http://localhost/api${req.url ?? ''}`, {
          method: req.method,
          headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
          body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
        });
        const handler = mod[req.method ?? 'GET'] as ((r: Request) => Promise<Response>) | undefined;
        let response: Response;
        try {
          response = handler ? await handler(request) : new Response('método no permitido', { status: 405 });
        } catch (e) {
          // Igual que Vercel: una excepción sin atrapar es un 500, no tumba el servidor
          console.error(e);
          response = new Response('Internal Server Error', { status: 500 });
        }
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

/**
 * El pdf.worker (1.2 MB) no cambia entre versiones de la app, y `pad` no vuelve a subir las partes que ya
 * venían en el deploy anterior: heredan la caducidad de su primera subida a Bulletin (unos 14 días), aunque
 * el deploy sea nuevo. Un comentario al principio cambia todos sus bloques y obliga a subirlo otra vez.
 * Cambia la fecha cuando las partes del worker vayan a caducar antes de un evento (simula el deploy antes).
 */
const SUBIDA_WORKER = '2026-10-19';
function workerFresco(): Plugin {
  return {
    name: 'worker-fresco',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const f of Object.values(bundle)) {
        if (f.type !== 'asset' || !/pdf\.worker/.test(f.fileName)) continue;
        const codigo = typeof f.source === 'string' ? f.source : new TextDecoder().decode(f.source);
        f.source = `/* certificados-uanl: pdf.worker subido el ${SUBIDA_WORKER} */\n${codigo}`;
      }
    },
  };
}

// base relativo: la app se sirve desde el hash de su contenido en Bulletin, no desde /.
// El mismo dist/ se publica en Vercel (web de verificación y reclamo).
export default defineConfig({
  base: './',
  plugins: [relayerLocal(), workerFresco()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  define: {
    __SDK__: JSON.stringify(sdk),
    __APP_DOMAIN__: JSON.stringify(config.domain),
  },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
});
