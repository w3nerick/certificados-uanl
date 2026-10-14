# Sistema de diseño

La base es la del sitio de Polkadot México: editorial en crema, tinta negra y líneas
finas, con detalles de pixel art (sombras sólidas, movimientos en pasos, bandas de
trama). Encima va la identidad de la UANL: el azul para la acción principal y el par
marino + oro para la franja institucional y el sello. Nada más lleva color.

Todo vive en `src/style.css`. Las piezas compartidas (barra, pie, encabezado, pasos,
ficha de cuenta, recuadro de ayuda, la hoja) están en `src/vistas/comun.ts`.

## Colores

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg` | `#f5f2eb` | Fondo crema de toda la app |
| `--bg-alt` | `#edeae2` | Hover de tarjetas, campos y botones deshabilitados |
| `--papel` | `#fffdf8` | Paneles, pasos, avisos |
| `--tinta` | `#111` | Texto, bordes fuertes, sombras, pie |
| `--mid` | `#66635c` | Texto secundario (contraste AA sobre crema) |
| `--borde` | `#ccc9c0` | Divisores y bordes suaves |
| `--azul` | `#004a8f` | UANL: botón principal, foco, viñetas |
| `--marino` / `--oro` | `#002144` / `#fbc43d` | UANL: franja superior, sello, banda de la hoja |
| `--ok` / `--mal` | `#1f7a4d` / `#b42318` | Estados (verificado, error, revocado) |

## Tipografía

| Familia | Rol |
| --- | --- |
| **DM Serif Display** | Títulos, nombre en la hoja; la itálica marca la palabra clave del título |
| **DM Sans** | Texto corrido, etiquetas de formulario |
| **Space Mono** | Barra, botones, etiquetas (`.ceja`), folios, huellas sha256 |

Las etiquetas en Space Mono van en mayúsculas, 10–12 px, con `letter-spacing` de
.08em a .22em. Las fuentes se empaquetan con `@fontsource` (solo latino): nada se
pide a Google Fonts, porque la app también vive en Bulletin.

## Componentes

- **Botón** (`.btn`, `.primario`, `.fantasma`, `.chico`): borde de 2 px y sombra sólida
  de 4 px. Con el mouse baja 2 px; al presionar se hunde del todo y se invierte. 90 ms en
  `steps(4, end)`. Mientras corre su acción lleva `aria-busy` y un cursor cuadrado que
  parpadea; deshabilitado se vuelve gris.
- **Encabezado** (`cabecera()`): etiqueta con cuadro azul, título grande y entrada.
- **Pasos** (`paso()`): bloque numerado 01, 02, 03 con tres estados: activo (borde de
  tinta), hecho (número en verde) y bloqueado (borde punteado, campos deshabilitados).
  Así se ve todo el flujo desde el principio.
- **Ficha de cuenta** (`fichaCuenta()`): usuario + dirección corta, sombra azul, con
  botón «Cambiar».
- **Nota** (`nota()`): recuadro de ayuda al lado del formulario; en pantallas chicas
  baja al final.
- **Aviso**: franja de color a la izquierda (azul info, verde ok, rojo error).
- **Hoja**: papel blanco con marco de tinta y sombra sólida de 8 px. Es el único
  elemento que mezcla los tres colores de la UANL.
- **Carga** (`cargando()` en `src/ui.ts`): esqueleto con una línea en Space Mono que dice
  en qué va («Conectando con Polkadot…», «Leyendo el folio 3…») y el mismo cursor cuadrado
  de los botones ocupados. A los 6 s explica que la primera conexión tarda. Nunca un
  esqueleto mudo: en la Polkadot App la primera lectura tarda de 8 a 12 s.
- **QR** (`figuraQr()`): papel blanco con marco de tinta y sombra azul, el enlace escrito
  debajo por si la cámara no lo lee. Se dibuja en el dispositivo (uqr, sin servicios externos).
- **Cartel** (`#/cartel`): A4 vertical para imprimir o proyectar. Como la hoja, todo va en
  `cqi`, así que la vista previa y la impresión son idénticas. Al imprimir solo queda el cartel.

## Layout

- Ancho máximo 1080 px; formularios a 720 px con la nota a la derecha.
- **≤ 720 px**: la barra se parte en dos filas (marca arriba, tres pestañas iguales
  abajo); nunca hay scroll horizontal.
- **≤ 520 px**: botones del hero y de resultados a todo el ancho.

Prueba siempre a 1280 px y a 390 px.

## Accesibilidad

- Al cambiar de vista, el foco va al título nuevo (`tabindex="-1"`, sin marco visible) y el
  título de la pestaña cambia. Si el foco sigue en un campo o botón vivo, no se mueve.
- Las pestañas Certificado / PDF original siguen el patrón de pestañas: flechas, Inicio y Fin.
- Los mensajes de carga y los resultados van en regiones `role="status"` / `aria-live`.
