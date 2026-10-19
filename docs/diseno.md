# Sistema de diseño

La app sigue el lenguaje de los sitios de facultades de la UANL, tomando como referencia el de la
Facultad de Contaduría Pública y Administración ([facpya.uanl.mx](https://facpya.uanl.mx/)): banda azul
a la izquierda, barra gris con la universidad en versales, cabecera blanca con la marca, menú en barra
roja, secciones en gris y en rojo, botones rectos en mayúsculas y pie con franja roja. Se toma el
lenguaje (colores, tipografía, composición), no los logotipos ni las fotos de la facultad.

Todo vive en `src/style.css`. El marco de página y las piezas compartidas (cabecera, menú, lámina
interior, migas, pasos, nota, columna lateral, ficha de cuenta y la hoja) están en `src/vistas/comun.ts`.

## Colores

| Token | Valor | Uso |
| --- | --- | --- |
| `--rojo` / `--rojo-osc` | `#aa2c2b` / `#8f2322` | Rojo FACPYA: menú, botones, enlaces, reglas, franja del pie |
| `--azul` | `#004a8f` | Azul UANL: banda izquierda, foco del teclado, avisos informativos |
| `--marino` / `--oro` | `#002144` / `#fbc43d` | Portada, banner interior, sello, banda de la hoja; el oro marca la pestaña activa del menú |
| `--gris` / `--gris-2` | `#f4f2ed` / `#e8e6e1` | Barra superior, franjas, lámina interior / campos deshabilitados |
| `--linea` / `--borde-campo` | `#d5d5d5` / `#8f8f8f` | Filetes y divisores / bordes de campos (contraste 3:1) |
| `--texto` / `--texto-2` / `--texto-3` | `#333` / `#545454` / `#666` | Títulos / texto corrido / secundario (AA sobre blanco y gris) |
| `--ok` / `--mal` | `#1f7a4d` / `#9b1c1c` | Estados: verificado y error o revocado |

El rojo de los errores (`--mal`) es más oscuro que el de la marca y siempre va con ícono y fondo rosado,
para que un error no se confunda con un botón.

## Tipografía

Benton Sans y Sanchez, las fuentes de los sitios de la UANL, son de pago. Se usan equivalentes libres
(OFL) empaquetados con la app, solo el subconjunto latino (cubre acentos y ñ), declarados a mano en
`style.css` para no subir a Bulletin los demás alfabetos:

| Familia | En lugar de | Rol |
| --- | --- | --- |
| **Archivo** (variable) | Benton Sans | Todo el texto: títulos (600), menú, botones (700, mayúsculas), formularios |
| **Bitter** (800) | Sanchez Black | El título de la portada y el del cartel |
| **EB Garamond** | Versales del escudo | «Universidad Autónoma de Nuevo León», la marca y la hoja del certificado |

Folios y huellas sha256 van en la monoespaciada del sistema. Nada se pide a Google Fonts.

## Estructura de página

- **Banda azul UANL** de 35 px fija a la izquierda (solo desde 1024 px).
- **Barra gris** con «Universidad Autónoma de Nuevo León» en versales y, a la derecha, «Constancias
  registradas en Polkadot».
- **Cabecera blanca**: sello marino con el ícono dorado, filete y «Certificados en Cadena / UANL ×
  Polkadot» en versales. A la derecha, el buscador de folio (lleva a `#/c/<folio>`) y los accesos de
  organizadores (Organizadores, Cartel con QR, Diagnóstico), separados por filetes como «Alumnos |
  Aspirantes | Docentes».
- **Menú rojo**: Inicio, Reclamar constancia, Mis certificados, Verificar. La vista actual va en rojo
  oscuro con una línea dorada abajo.
- **Inicio** a todo lo ancho: portada marino con el título en Bitter y la hoja de ejemplo, regla roja
  debajo; «Cómo funciona» en franja gris con el bloque de fecha de «Próximos eventos» (número grande y
  el verbo en una franja roja); «¿Te enviaron un certificado?» en franja roja, como «Repositorio
  institucional».
- **Vistas interiores**: banner marino y encima una lámina gris con el botón **Regresar** en su borde,
  migas de pan entre filetes (Inicio ▸ sección), título y contenido. Las que tienen ayuda o acciones
  usan dos columnas con un filete vertical; las secciones de la columna lateral se separan con doble
  filete.
- **Pie**: franja gris con borde rojo (marca y enlaces) y una barra roja final.

«Regresar» vuelve a la vista anterior si se llegó desde la app; si se entró directo (QR, link del
correo) lleva al inicio en vez de salir de la app (`numerarVista()` numera cada vista en el historial).

Los banners aceptan foto: `--foto-portada` en `.portada` y `--foto-interior` en `.portada-int`. Sin foto
quedan en marino.

## Componentes

- **Botón** (`.btn`): recto, en mayúsculas, 44 px de alto. `.primario` rojo sólido; el normal, contorno
  rojo que se rellena con el mouse; `.claro`, contorno blanco sobre fondo oscuro o rojo; `.fantasma`,
  enlace subrayado; `.chico`. Mientras corre su acción lleva `aria-busy` y una barra dorada recorre su
  borde de abajo. Deshabilitado se vuelve gris.
- **Etiqueta** (`.ceja`, `.etiqueta`): fondo sólido y texto blanco, como las categorías de las noticias
  («Folio 12», «Registrado en Polkadot» en verde, «Revocado» en rojo oscuro).
- **Pasos** (`paso()`): caja blanca con el número en un cuadro rojo; hecho en verde; bloqueado con borde
  punteado y número gris. Así se ve todo el flujo desde el principio.
- **Nota** (`nota()`): columna de ayuda con título, íconos rojos y doble filete; en pantallas chicas baja
  al final.
- **Columna lateral** (`seccionLateral()`): Verificación, Documento y Compartir en la página del
  certificado.
- **Aviso**: franja de color a la izquierda (azul info, verde ok, rojo oscuro con fondo rosado error).
- **Carga** (`cargando()` en `src/ui.ts`): una línea que dice en qué va («Conectando con Polkadot…»,
  «Leyendo el folio 3…»), una barra roja que va y viene y el esqueleto. A los 6 s explica que la primera
  conexión tarda. En la Polkadot App la primera lectura tarda de 8 a 12 s.
- **Hoja**: papel blanco con banda marino y oro, textos en EB Garamond y sombra suave. Todo en `cqi`.
- **Lista de certificados**: la hoja como imagen de la tarjeta y el programa como título rojo, igual que
  las tarjetas de noticias.
- **QR** (`figuraQr()`): papel blanco con filete y el enlace escrito debajo por si la cámara no lo lee.
- **Cartel** (`#/cartel`): A4 vertical con la misma estructura de página (barra gris, marca, franja
  roja). Todo en `cqi`, así que la vista previa y la impresión son idénticas.

Esquinas rectas en todo, salvo el sello.

## Layout

- Ancho máximo 1080 px. Columna lateral de 300 px a la derecha con filete.
- **≤ 960 px**: la columna lateral baja debajo del contenido.
- **≤ 767 px**: sin banda azul; la barra gris centra la universidad; la cabecera deja solo la marca; el
  menú rojo queda en tres pestañas iguales (Reclamar, Mis certificados, Verificar); la lámina ocupa todo
  el ancho y «Regresar» queda dentro de ella.
- **≤ 520 px**: botones de formularios y de la portada a todo el ancho.

Prueba siempre a 1280 px y a 390 px.

## Accesibilidad

- Enlace «Saltar al contenido» al principio (mueve el foco al título; un `#contenido` cambiaría de ruta).
- Al cambiar de vista, el foco va al título nuevo (`tabindex="-1"`, sin marco visible) y el título de la
  pestaña cambia. Si el foco sigue en un campo o botón vivo, no se mueve.
- Foco del teclado: contorno azul UANL de 2 px en todo.
- Los enlaces dentro del texto van subrayados; los de menús, listas y tarjetas no.
- Las pestañas Certificado / PDF original siguen el patrón de pestañas: flechas, Inicio y Fin.
- Los mensajes de carga y los resultados van en regiones `role="status"` / `aria-live`.
