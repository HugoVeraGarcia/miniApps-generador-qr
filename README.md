# Generador de QR 3D

Sitio estático de generación de códigos QR, con exportación a objeto 3D imprimible.
Sin backend, sin dependencias en tiempo de ejecución y sin build obligatorio: todo
el procesamiento ocurre en el navegador del visitante.

Monetización prevista: publicidad display (AdSense). Alojamiento: Netlify.

## Poner en marcha

En Windows, doble clic en **`ver-sitio.bat`**: arranca el servidor y abre el
navegador solo. Deja esa ventana abierta mientras uses el sitio.

Desde la terminal, lo mismo:

```bash
node servidor.mjs --abrir  # sirve el sitio y abre el navegador
node build/generar.mjs     # regenera HTML, sitemap, robots, sw.js y netlify.toml
```

Si el puerto 4173 está ocupado, el servidor prueba el siguiente y te dice cuál
ha usado.

**No abras `index.html` con doble clic.** Verás el texto sin estilos ni
funcionamiento, por dos motivos: las rutas son absolutas (`/css/app.css` apunta
a la raíz del disco, no a esta carpeta) y el navegador bloquea los módulos ES
sobre `file://`. En Netlify no ocurre, porque allí la raíz del sitio es esta
misma carpeta.

`servidor.mjs` no tiene dependencias: solo necesita Node. Para cambiar el
puerto, `PUERTO=8080 node servidor.mjs`.

## Los cuatro valores de producción

Todo lo que cambia al publicar está en `js/config.js`:

| Campo | Qué es | De dónde sale |
| --- | --- | --- |
| `dominio` | dominio comprado, sin barra final | el registrador |
| `marca` | nombre en cabecera, pie y textos | lo decides tú |
| `adsense.cliente` | `ca-pub-...` | AdSense → Cuenta |
| `adsense.bloques.*` | ID de cada bloque | AdSense → Anuncios → Por unidad de anuncio |
| `analitica.ga4` | `G-...` | Google Analytics 4 |

Mientras estén vacíos el sitio funciona igual: no carga AdSense, no carga GA4,
los huecos de anuncio se retiran solos del DOM y el build avisa de lo que falta.
Después de rellenarlos hay que volver a ejecutar `node build/generar.mjs`, porque
el dominio entra en los `canonical`, en `og:url` y en `robots.txt`.

## Desplegar en Netlify

1. Sube la carpeta a un repositorio de Git.
2. En Netlify: *Add new site → Import an existing project*.
3. Build command: `node build/generar.mjs` · Publish directory: `.`
4. Conecta el dominio en *Domain management* y deja que Netlify emita el certificado.

`netlify.toml` ya lleva las cabeceras de caché: revalidación en `/js` y `/css`,
un año inmutable en `/js/vendor` (librerías con versión fija).

AdSense no aprueba subdominios de hosting gratuito: hay que solicitar la revisión
con el dominio propio ya conectado y las páginas legales publicadas.

## Estructura

```
index.html            portada del generador      (generada)
qr-whatsapp/ qr-resenas-google/ qr-tarjeta-de-contacto/
qr-menu-restaurante/ qr-instagram/ qr-ubicacion/ qr-wifi/
qr-3d/llavero/ qr-3d/iman/ qr-3d/placa/ qr-3d/tarjeta/
                      doce landings en total     (generadas)
leer-qr/              lector de códigos          (generada)
qr-por-lotes/         generación por lotes       (generada)
mis-qr/               historial local, noindex   (generada)
legal/                aviso legal, privacidad, cookies (generadas)

data/landings.json    contenido y configuración de cada landing  ← se edita aquí
build/generar.mjs     expande el JSON a HTML + sitemap + sw.js

css/app.css           sistema visual completo (tokens en :root)

js/config.js          los cuatro valores de producción
js/qr-core.js         codificador QR (ISO/IEC 18004, sin dependencias)
js/qr-render.js       estilos de módulo, ojos, gradiente, logo, marco
js/tipos.js           tipos de contenido y sus formularios
js/validar.js         contraste WCAG y verificación de escaneo real
js/export2d.js        PNG, JPG, SVG y hoja A4
js/qr3d.js            geometría 3D, 3MF, STL, OpenSCAD y validador de impresión
js/preview3d.js       visor three.js (carga diferida)
js/panel3d.js         interfaz del objeto 3D
js/qr-engine.js       orquestador del generador: QRApp.init()
js/lector.js          herramienta de /leer-qr/
js/lotes.js           herramienta de /qr-por-lotes/
js/mis-qr.js          herramienta de /mis-qr/
js/interpretar.js     del texto decodificado al tipo, y avisos de seguridad
js/csv.js             lectura de CSV (coma, punto y coma o tabulador)
js/estado.js          estado del generador serializado en la URL
js/iconos.js          juego de iconos SVG propio
js/pasos.js           navegación de los tres pasos y eventos GA4
js/ads.js             carga diferida de los bloques de anuncio
js/historial.js       últimos códigos, solo en localStorage
js/vendor/            jsQR y three.js empaquetados (MIT, licencias incluidas)
```

## Añadir una herramienta

Las páginas que no son el generador (lector, lotes, historial) van en el array
`herramientas` de `data/landings.json`. Cada una apunta a su módulo con
`"modulo": "/js/loquesea.js"`, que debe exportar `init()`. Con
`"indexar": false` la página se marca `noindex`, se queda fuera del sitemap y
no lleva anuncios — es lo que hace `/mis-qr/`.

## Añadir una landing

Una entrada más en `data/landings.json` y `node build/generar.mjs`:

```json
{
  "ruta": "/qr-whatsapp/",
  "archivo": "qr-whatsapp/index.html",
  "keyword": "crear QR de WhatsApp",
  "metaTitulo": "...",
  "metaDescripcion": "...",
  "h1": "...",
  "entrada": ["...", "..."],
  "config": { "tipo": "whatsapp", "marco": true, "cta": "ESCRÍBENOS" },
  "h2Blog": "...",
  "blog": ["línea 1", "..."],
  "faq": [["pregunta", "respuesta"]],
  "relacionados": [["/", "Generador de QR"]]
}
```

`config` se pasa tal cual a `QRApp.init()`. El campo `blog` admite como máximo
20 líneas y el build avisa si se pasa o si baja de 180 palabras: por debajo de
ahí AdSense considera la página un widget sin contenido.

No hay que tocar nada más. La cabecera se queda con las landings de más
búsqueda, y el índice completo de la portada —`indiceLandings()`— se genera del
propio JSON, así que la landing nueva aparece enlazada desde todas las demás
sola. Ese enlazado es lo que hace que Google llegue a una landing nueva sin
esperar a que alguien la enlace desde fuera.

Los tipos disponibles están en `js/tipos.js`: `enlace`, `wifi`, `whatsapp`,
`vcard`, `resenas`, `email`, `sms`, `telefono`, `ubicacion`, `evento`, `red`.
Si una landing pide un tipo que no existe, el build falla en lugar de publicar
una página con el formulario vacío.

Cada tipo solo construye direcciones cuyo formato está documentado por su
dueño: `wa.me` para WhatsApp, `search.google.com/local/writereview` para las
reseñas, los dominios de cada red social. **Ningún tipo inventa un endpoint.**
Un código que apunta a una URL fabricada se imprime igual de bien y no lleva a
ninguna parte, y eso no se descubre hasta que hay doscientos adhesivos pegados.

## Cómo se comprueba que un código funciona

Hay dos comprobaciones distintas y deliberadamente separadas:

- **Bloqueante.** El código se vuelve a decodificar *sin decoración*. Aquí se
  detecta lo que de verdad rompe un QR: contenido demasiado largo, logo que tapa
  de más o contraste insuficiente. Si falla, la descarga se deshabilita.
- **Solo aviso.** El código tal como se ve. Los estilos con módulos separados
  (puntos, barras) son legibles para un móvil actual pero hacen tropezar a
  lectores simples, así que se avisa sin bloquear.

En 3D, el botón *Comprobar que escanea* renderiza la pieza desde arriba —como la
verá la cámara— y la decodifica. Es la comprobación que evita imprimir media hora
para descubrir que la geometría rompió el patrón.

## Objetos 3D

Placa de mesa, llavero, imán de nevera, tarjeta de visita, posavasos, placa de
pared y cubo. Tres modos de relieve: positivo, negativo y pasante (los módulos
atraviesan la pieza; se añaden puentes automáticos para que ningún trozo suelto
se caiga).

La geometría no usa CSG: la base se define como una pila de capas con su máscara
2D, que se rasteriza y se extruye. De ahí salen gratis los rebajes, los
avellanados y el modo pasante, y la malla siempre queda válida.

Salida: 3MF con los dos colores asignados (Bambu Studio, PrusaSlicer, Orca),
STL —suelto o separado por colores— y OpenSCAD paramétrico.

## Licencias de terceros

`js/vendor/` incluye [jsQR](https://github.com/cozmo/jsQR) y
[three.js](https://threejs.org), ambos con licencia MIT. Sus licencias están
junto a los archivos.
