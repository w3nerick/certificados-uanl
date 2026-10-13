# Certificados en Cadena

Constancias de la UANL registradas en Polkadot. El organizador las emite desde la Polkadot App,
cada estudiante pide la suya por su nombre y cualquiera puede verificarla, también años después.

- **App:** `certificados-uanl.dot` (Polkadot App y Polkadot Desktop) · https://certificados-uanl.dev-dot.li
- **Web permanente y relayer:** https://certificados-uanl.vercel.app
- **Contrato:** `RegistroCertificados` en Asset Hub del Products Devnet (`0x5e122d6822e57b943ae964d0d345bd924ac44607`)

## Cómo funciona

| Quién | Dónde | Qué hace |
|---|---|---|
| Organizador | `#/organizar` en Polkadot Desktop | Elige los PDF de la UANL (el nombre sale del archivo), los sube a IPFS y los emite. Revisa y aprueba solicitudes. |
| Estudiante | `#/constancia` en la Polkadot App | Conecta su cuenta, escribe su nombre completo y toca «Es mía». No necesita saldo. |
| Cualquiera | `#/c/<folio>` y `#/verificar` | Ve la constancia, el PDF original y comprueba que su huella coincide con la registrada. |

```
PDF de la UANL ─► Pinata (IPFS, red pública)          ← el archivo
             └─► sha256 + CID + datos ─► contrato     ← la prueba, no caduca

Estudiante: «Es mía» ─► /api/solicitar (relayer paga) ─► solicitar(id, cuenta, usuario)
Organizador: revisa usuario verificado ─► asignar(ids, cuentas)  (una firma por lote)
```

**Por qué así**

- **Bulletin borra a los 14 días** y solo el host lo lee: sirve para publicar la app, no para guardar constancias.
  Los datos van inline en el contrato y el PDF en Pinata.
- **Pedir no asigna.** El nombre de cada constancia es público; si bastara con escribirlo, cualquiera se quedaría
  con la de otro. El organizador aprueba viendo el usuario de la Polkadot App verificado en People chain.
- **La llave de Pinata nunca llega a la app.** El organizador firma una vez una sesión con su cuenta;
  `/api/subida` comprueba la firma sr25519 y que la cuenta sea emisora, y entrega un link de subida firmado
  (5 min, un PDF, máx. 15 MB).
- **El relayer no tiene permisos en el contrato.** Solo paga comisiones; simula antes de gastar.
- **Soulbound:** no existe ninguna función de transferencia. Un emisor puede reasignar (para corregir) o revocar.
- **Respaldo por link:** el contrato también acepta reclamos con un código secreto (`npm run emitir` genera los
  links para correo). La firma de la llave del código fija el titular, así que copiarla de la mempool no sirve.

## Estructura

```
contract/         RegistroCertificados.sol, pruebas en EVM, deploy y prueba en PolkaVM
src/              la app (TypeScript + Vite, sin framework)
  lib/            host, cadena, contrato, organizador, IPFS, sesión, reclamo
  vistas/         inicio, constancia, organizar, certificado, mis, verificar, diagnóstico
api/              funciones de Vercel: reclamar, solicitar, subida
tools/            CLI: emitir por lote, admin (emisores), relayer
scripts/          deploy a Bulletin con pad, ficha de la app (manifest + ícono), revisión
```

## Comandos

```bash
npm install && (cd contract && npm install)

npm run dev                # app + /api local en http://127.0.0.1:5175 (usa .env y .env.relayer)
npm test                   # pruebas de la app
(cd contract && npm test)  # 30 pruebas del contrato en EVM
(cd contract && npm run probar-pvm)   # dry-run en PolkaVM: instancia y ecrecover

npm run deploy             # build + pad + ficha (Terminal.app: pad pide Y y el celular firma)
npm run manifest           # solo la ficha (nombre, descripción, ícono)
npm run admin -- emisor <usuario|SS58|0x…> [--quitar]
npm run relayer -- estado
npm run emitir -- lotes/<lote>/lista.csv [--simulacion]   # respaldo: emisión por CLI con links por correo
```

**Web en Vercel:** cada push a `main` publica en producción (https://certificados-uanl.vercel.app). Las otras ramas
generan un preview sin secretos: el relayer y las subidas solo funcionan en producción.

Secretos (nunca en git ni en la app): `.env` (`PINATA_JWT`, `PINATA_GROUP_ID`, `PINATA_GATEWAY`) y
`.env.relayer` (frase del relayer). En Vercel: `RELAYER_SEED`, `REGISTRO_ADDRESS`, `PINATA_JWT`, `PINATA_GROUP_ID`.
`.vercelignore` es una lista blanca. `lotes/` y `salida/` (correos y códigos de reclamo) están fuera de git.

## Antes del evento

- **La app en Bulletin caduca a los 14 días:** volver a publicar (`npm run deploy`) unos días antes y revisar que
  la cuenta de pad tenga autorización (`npm run autorizacion` en la guía).
- Ensayo con dos teléfonos: un estudiante pide, el organizador aprueba.
- En «Programa» va el nombre completo del evento: queda tal cual en la cadena.

## Licencia

MIT
