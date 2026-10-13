/** Inyectados por vite.config.ts al compilar. */
declare const __SDK__: { host: string; signer: string; truapi: string; codec: number };
declare const __APP_DOMAIN__: string;

declare module '*?raw' {
  const content: string;
  export default content;
}
declare module '*?url' {
  const url: string;
  export default url;
}
