# Generador de QR 3D — qué hace y cómo está montado

Documento de referencia del proyecto que vive en `qr.microtools.lat`.
Escrito leyendo el código, no de memoria: cada cifra de aquí sale de un archivo
concreto, y se indica cuál.

---

## En una frase

Un generador de códigos QR que además exporta el código como **pieza 3D
imprimible**, con todo el procesamiento dentro del navegador del visitante.

## Las tres decisiones que explican todo lo demás

**1. No hay servidor.** Ni backend, ni base de datos, ni cuentas. El
contenido que el visitante escribe —la contraseña de su WiFi, su número de
teléfono, el logo que sube— nunca sale de su equipo. Esto no es una promesa de
marketing: es comprobable desconectando internet después de cargar la página.

La consecuencia incómoda, que el sitio dice en voz alta: si el visitante cierra
la pestaña sin descargar, se perdió.

**2. Los códigos son estáticos.** Un QR generado aquí lleva dentro el enlace
final, no pasa por ningún redireccionador nuestro. Por eso **no caduca nunca**,
ni siquiera si el proyecto desaparece. Es justo lo contrario de los generadores
que regalan QR «dinámicos» y luego te cobran por mantenerlos vivos.

**3. Un motor, muchas páginas.** El mismo generador se sirve en 13 URL
distintas, cada una con su formulario preconfigurado y su contenido editorial.
Esto es lo que hace viable el modelo de ingresos por publicidad: son 13 puertas
de entrada desde el buscador, no una.

---

## El generador, en tres pasos

La navegación está en `js/pasos.js`: `contenido` → `diseno` → `descarga`.

### Paso 1 — Contenido

Once tipos, definidos en `js/tipos.js`. Cada uno pinta su propio formulario y
sabe convertir esos campos en la cadena exacta que el estándar espera.

| Tipo | Campos | Qué hace al escanear |
| --- | --- | --- |
| **Enlace o texto** | enlace, texto o teléfono | abre lo que sea |
| **WiFi** | SSID, contraseña, seguridad, red oculta | conecta sin escribir la clave |
| **WhatsApp** | código de país, número, mensaje previo | abre el chat con el texto ya puesto |
| **Contacto** | nombre, apellidos, empresa, cargo, teléfono, correo, web, dirección | guarda la ficha en la agenda (vCard) |
| **Reseñas de Google** | Place ID | abre el formulario de reseña |
| **Correo** | destinatario, asunto, mensaje | abre el cliente de correo |
| **SMS** | número, mensaje | abre el SMS redactado |
| **Llamada** | número | marca |
| **Ubicación** | latitud, longitud, con indicaciones | abre el mapa en el punto |
| **Evento** | título, lugar, inicio, fin | añade al calendario |
| **Red social** | plataforma, usuario | abre el perfil |

Las redes admitidas son Instagram, TikTok, Facebook, X, YouTube y LinkedIn.

Ninguno de estos tipos inventa direcciones: todos construyen formatos
documentados por su dueño (`wa.me`, `search.google.com/local/writereview`,
`WIFI:`, `geo:`, `mailto:`). El build **falla** si una landing pide un tipo que
no existe, para que nunca se publique un formulario vacío.

### Paso 2 — Diseño

Todo en `js/qr-render.js`.

- **Seis estilos de módulo:** clásico, redondeado, puntos, elegante, barras
  verticales, barras horizontales.
- **Los ojos por separado:** el marco (cuadrado, redondeado, círculo, hoja) y el
  centro (cuadrado, redondeado, círculo, punto), con color propio si se quiere.
- **Color y gradiente:** color plano, o gradiente lineal o radial con ángulo.
  Fondo sólido o transparente.
- **Logo al centro**, con escala ajustable.
- **Marco con texto** («ESCRÍBENOS», «NUESTRA CARTA»…), en tres estilos: sólido,
  redondeado y pestaña.
- **Margen** (zona silenciosa), 4 módulos por defecto.
- **Corrección de errores** en los cuatro niveles del estándar: L, M, Q, H.

### Paso 3 — Descarga

**En 2D** (`js/export2d.js`): PNG y JPG a cualquier tamaño, SVG vectorial, y una
**hoja A4** con varios códigos por página, con etiquetas, para descargar o
imprimir directamente.

**En 3D**: la sección siguiente.

---

## La exportación 3D

Es el diferenciador del proyecto. Vive en `js/qr3d.js`, con la interfaz en
`js/panel3d.js` y un visor con three.js en `js/preview3d.js` que se carga solo
cuando hace falta.

### Ocho objetos

Se eligen en una **rejilla de botones con la silueta de cada pieza**, a la vista
desde que se abre el panel. Antes era un desplegable y la mitad de las piezas no
se descubrían nunca.

| Objeto | Medidas por defecto |
| --- | --- |
| Placa de mesa | 80 × 80 × 3 mm |
| Llavero | 50 × 50 × 3 mm, anilla de 10 mm |
| Imán de nevera | 60 × 60 × 4 mm, hueco para imán de 8,4 mm |
| Tarjeta de visita | 85 × 54 × 2 mm |
| Posavasos | 90 × 90 × 5 mm |
| Placa de pared | 100 × 100 × 4 mm, taladros de 4 mm |
| Atril de mesa | panel de 80 × 92 mm inclinado 15°, peana de 46 mm |
| Cubo | 40 mm de lado |

#### El atril, la única pieza que no es plana

Es el cartel de mostrador: un panel echado hacia atrás sobre su propia peana. Se
ve de frente sin agacharse, y a 15° desde la vertical se imprime **sin soportes**.

Se construye en el marco de referencia del propio panel —ancho, altura sobre la
cara e ida hacia el lector— y se lleva a la pieza con una sola transformación de
determinante +1, así que no hay normales invertidas. El panel se hunde dentro de
la peana para que el laminador funda las dos partes en un solo cuerpo, y va
retrasado lo justo para que ese trozo hundido no asome por delante y quede
volando.

Dos consecuencias que el panel dice en voz alta:

- **La comprobación de escaneo mira de frente al panel**, no desde arriba: desde
  arriba se vería de canto y no habría nada que leer.
- **Aquí no sirve la pausa M600.** Los módulos se reparten a lo largo de unos
  89 mm de altura en vez de estar todos a la misma, así que una pausa por Z
  partiría el código en dos colores. Con una sola boquilla, la pieza sale de un
  color y el relieve se lee por la sombra; con doble extrusor o AMS, el 3MF ya
  trae panel y código como dos piezas con su color asignado.

### Tres modos de relieve

- **Positivo:** los módulos sobresalen sobre la base. Es el que mejor lee: la
  sombra del relieve refuerza el contraste de color.
- **Negativo:** los módulos se hunden.
- **Pasante:** atraviesan la pieza de lado a lado, para leer por transparencia.
  El generador **añade puentes automáticos** para que ningún trozo suelto caiga.

### Por qué la geometría no usa CSG

La pieza no se construye restando sólidos, sino como una **pila de capas**, cada
una con su máscara 2D, que se rasteriza y se extruye. De ahí salen gratis los
rebajes, los avellanados y el modo pasante, y la malla siempre queda válida —
sin caras invertidas ni agujeros, que es donde fallan los generadores que
improvisan con CSG.

### Validación de impresión, antes de gastar filamento

`validarImprimibilidad()` comprueba contra tu boquilla real:

- **Ancho de módulo ≥ 2 × diámetro de boquilla.** Por debajo, la impresora no
  forma una pared limpia y el relieve sale irregular.
- **Relieve ≥ 3 capas.** Con menos, la sombra es tan leve que la cámara no
  distingue los módulos.
- **Base ≥ 1,2 mm**, por rigidez y opacidad.
- **Puentes** en modo pasante.

Y `cambioFilamento()` calcula **la altura Z exacta a la que pausar** para
cambiar de color. Con eso, una impresora de un solo extrusor saca piezas a dos
colores — salvo en el atril y en el modo pasante, donde no es posible y el panel
lo dice en lugar de dar una altura que estropearía la impresión.

### La comprobación que evita media hora perdida

El botón *Comprobar que escanea* **renderiza la pieza vista desde arriba** —como
la verá la cámara— y la decodifica. Si devuelve tu contenido, la geometría es
correcta. Es la diferencia entre media hora de impresión bien invertida y media
hora tirada.

### Formatos

- **3MF** con los dos colores ya asignados como materiales (Bambu Studio,
  PrusaSlicer, Orca lo entienden sin configurar nada). El ZIP y el XML se
  escriben a mano, sin librerías.
- **STL**, suelto o separado por colores.
- **OpenSCAD** paramétrico, para cambiar medidas.

---

## Cómo se comprueba que un código funciona

Hay **dos comprobaciones deliberadamente separadas** (`js/validar.js`):

**Bloqueante.** El código se decodifica *sin decoración*. Aquí se detecta lo que
de verdad rompe un QR: contenido demasiado largo, logo que tapa de más,
contraste insuficiente. **Si falla, la descarga se deshabilita.**

**Solo aviso.** El código tal como se ve. Los estilos de módulos separados
—puntos, barras— son legibles para un móvil actual pero hacen tropezar a
lectores simples. Se avisa sin bloquear, porque bloquear aquí sería tratar al
usuario como si no supiera lo que quiere.

Además:

- **Contraste WCAG** entre código y fondo, con aviso si el código es más claro
  que el fondo (algunos lectores antiguos no leen códigos invertidos).
- **Margen** menor de 4 módulos.
- **Logo + corrección de errores**: con logo hace falta nivel H, y avisa si no
  lo está.
- **Distancia de lectura**: calcula desde qué distancia se leerá un código de X
  milímetros, y al revés, qué tamaño necesitas para leerlo desde Y metros.

---

## Las otras tres herramientas

### Lector de QR — `/leer-qr/`

Decodifica desde **cámara, archivo, arrastrar y soltar, o pegar** desde el
portapapeles (`js/lector.js`).

Lo interesante no es decodificar, sino lo que hace después (`js/interpretar.js`):
reconoce el tipo de contenido y **avisa de cinco patrones de fraude**:

1. Enlace acortado — no se ve el destino real hasta abrirlo.
2. Dominio con caracteres no latinos codificados (`xn--`) — la técnica habitual
   para imitar el nombre de un sitio conocido.
3. **Usuario y contraseña incrustados antes del dominio** — la forma clásica de
   disfrazar a qué sitio te lleva. Este se marca como error, no como aviso.
4. Conexión sin cifrar (http).
5. Enlace a una IP en vez de a un dominio.

Es la función antifraude del proyecto, y tiene sentido publicitario además de
ético: «escanea antes de confiar» es una razón para volver.

### Generación por lotes — `/qr-por-lotes/`

Un CSV entra, un ZIP sale. Hasta **500 filas** (`js/lotes.js`). Columnas
`contenido,etiqueta`. El lector de CSV (`js/csv.js`) acepta coma, punto y coma o
tabulador, así que funciona con un Excel español sin convertir nada.

El caso de uso: cuarenta mesas de restaurante numeradas, o un código por local
de una cadena, o uno por persona de un equipo.

### Mis códigos — `/mis-qr/`

Los últimos **20** códigos generados, guardados solo en el `localStorage` del
propio navegador (clave `qr3d.historial.v1`, en `js/historial.js`). No sale del
dispositivo, no lo recibimos.

Esta página va **`noindex` y sin publicidad**, a propósito: es una utilidad
personal, no contenido para buscar.

---

## El estado viaja en la URL

`js/estado.js` serializa la configuración completa del generador en la URL. Dos
consecuencias:

- **Cualquier resultado es compartible.** Mandas el enlace y la otra persona ve
  tu código con tu diseño, listo para descargar.
- **El lector conecta con el generador.** Decodificas un QR ajeno y pasas su
  contenido al generador con un clic, para rehacerlo a tu manera.

---

## Las doce landings

Una entrada en `data/landings.json` y `node build/generar.mjs`. Cada una tiene
su palabra clave, su meta, su formulario preconfigurado, entre 600 y 725
palabras de contenido editorial, cinco preguntas frecuentes y enlaces cruzados.

| Ruta | Tipo | Objeto 3D |
| --- | --- | --- |
| `/` | enlace | placa de mesa |
| `/qr-whatsapp/` | whatsapp | placa de mesa |
| `/qr-resenas-google/` | resenas | placa de mesa |
| `/qr-tarjeta-de-contacto/` | vcard | tarjeta |
| `/qr-menu-restaurante/` | enlace | placa de mesa |
| `/qr-instagram/` | red | placa de mesa |
| `/qr-ubicacion/` | ubicacion | placa de mesa |
| `/qr-wifi/` | wifi | placa de mesa |
| `/qr-3d/llavero/` | enlace | llavero |
| `/qr-3d/iman/` | whatsapp | imán |
| `/qr-3d/placa/` | enlace | placa de mesa |
| `/qr-3d/tarjeta/` | vcard | tarjeta |

Más tres herramientas (lector, lotes, historial) y tres páginas legales.

**El índice de la portada se genera del propio JSON.** Cuando añadas la landing
trece, queda enlazada desde las once anteriores sin tocar una línea de HTML.
Ese enlazado es lo que hace que Google llegue a una página nueva sin esperar a
que alguien la enlace desde fuera.

---

## Publicidad y SEO

- **Tres huecos** por página: `top`, `mid`, `bottom`, más uno de 300×250 junto a
  la descarga. Cada uno **reserva su altura por CSS** antes de que llegue el
  anuncio, así el contenido no se desplaza mientras lees.
- El script de AdSense se inyecta **en el evento load**, nunca bloqueando. Cada
  bloque se rellena una sola vez, sin refresco por temporizador.
- **Sin ID de editor configurado, los huecos se retiran solos del DOM.** Por eso
  hoy el sitio no hace ni una petición a Google.
- `ads.txt` **no está aquí**: Google lo busca en el dominio raíz, y como todos
  los subdominios venden con el mismo ID, el de `microtools.lat` cubre este.
- Datos estructurados JSON-LD en cada página: `SoftwareApplication`, `FAQPage` y
  migas de pan.
- **Service worker**: el sitio funciona sin conexión. La versión de la caché
  sale de un **hash del contenido**, no de la fecha, para que dos publicaciones
  del mismo día no compartan caché.

---

## Mapa de archivos

```
data/landings.json      contenido y configuración de cada landing  ← se edita aquí
build/generar.mjs       expande el JSON a HTML + sitemap + sw.js
js/config.js            los cuatro valores de producción

js/qr-core.js     (519) codificador QR desde cero, ISO/IEC 18004
js/qr-render.js   (404) estilos, ojos, gradiente, logo, marco
js/qr-engine.js   (734) orquestador del generador
js/qr3d.js        (873) geometría 3D, 3MF, STL, OpenSCAD, validador
js/tipos.js       (220) los once tipos y sus formularios
js/validar.js     (247) contraste, estructura y verificación de escaneo
js/export2d.js    (144) PNG, JPG, SVG, hoja A4
js/panel3d.js     (234) interfaz del objeto 3D
js/preview3d.js   (160) visor three.js, carga diferida
js/lector.js      (290) herramienta de /leer-qr/
js/lotes.js       (317) herramienta de /qr-por-lotes/
js/interpretar.js (294) del texto decodificado al tipo, y avisos de seguridad
js/csv.js         (141) lectura de CSV con cualquier separador
js/mis-qr.js      (105) historial local
js/pasos.js       (133) navegación de los tres pasos y eventos GA4
js/estado.js       (34) estado serializado en la URL
js/historial.js    (62) últimos códigos, solo en localStorage
js/ads.js          (79) carga diferida de los bloques de anuncio
js/iconos.js       (52) juego de iconos SVG propio
js/vendor/              jsQR y three.js (MIT, licencias incluidas)
```

**El codificador QR está escrito desde cero**: Reed-Solomon sobre GF(256), las
ocho máscaras con su puntuación de penalización, versiones 1 a 40, intercalado
de bloques. Se verificó byte a byte contra una librería de referencia en las 40
versiones a capacidad máxima.

---

## Lo que no hace

Conviene tenerlo escrito, porque es lo que separa una herramienta honesta de una
que aparenta más de lo que es:

- **No genera códigos de cobro de billeteras digitales.** Esos códigos llevan
  dentro un identificador en la red de pagos y solo los emite la aplicación de
  cada billetera. Ningún generador externo puede, y el que lo prometa miente.
- **No hay QR dinámicos.** Es una decisión, no una carencia: un QR dinámico
  obliga a que un servidor nuestro siga existiendo para siempre.
- **No hay estadísticas de escaneo.** Requerirían el redireccionador que
  acabamos de descartar.
- **No hay cuentas ni sincronización.** El historial vive en un solo navegador.

---

## Cómo verlo funcionando

En Windows, doble clic en **`ver-sitio.bat`**. Desde la terminal:

```bash
node servidor.mjs --abrir   # sirve el sitio en :4173 y abre el navegador
node build/generar.mjs      # regenera HTML, sitemap, robots, sw.js
```

**No abras `index.html` con doble clic**: las rutas son absolutas y el navegador
bloquea los módulos ES sobre `file://`.

## Cómo está verificado

Tres suites en Playwright, sobre un navegador real:

| Suite | Qué cubre |
| --- | --- |
| `e2e.mjs` | 35 comprobaciones: codificación, 3D, exportaciones, decodificación de la malla |
| `e2e-fase5.mjs` | 30 del lector, los lotes y el historial |
| `e2e-landings.mjs` | las 12 landings: contenido, JSON-LD, enlazado, sitemap, contraste AA |

Entre ellas: las 40 versiones de QR a capacidad máxima, 19 casos de geometría 3D
con volumen positivo y decodificación desde arriba, un 3MF abierto como ZIP con
su XML válido y dos materiales, y un PNG extraído de un ZIP generado que vuelve
a decodificar a su fila del CSV.
