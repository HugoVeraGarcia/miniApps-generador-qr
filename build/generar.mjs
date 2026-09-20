/* generar.mjs — Expande data/landings.json a las páginas HTML del sitio.
 *
 *   node build/generar.mjs
 *
 * Una landing nueva es una entrada más en el JSON: su keyword, la
 * configuración del motor, el bloque de blog y las preguntas frecuentes.
 * El HTML, el sitemap y los datos estructurados salen de aquí.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const datos = JSON.parse(readFileSync(join(RAIZ, 'data', 'landings.json'), 'utf8'));

/* El dominio y la marca viven en js/config.js: se leen de ahí para no
   duplicarlos, porque son lo único que cambia al pasar a producción. */
const configJs = readFileSync(join(RAIZ, 'js', 'config.js'), 'utf8');
const leerConfig = (clave) => (configJs.match(new RegExp(`${clave}:\\s*'([^']*)'`)) || [])[1] || '';
const DOMINIO = leerConfig('dominio').replace(/\/$/, '');
const MARCA = leerConfig('marca') || datos.sitio.autor;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = (ruta) => (DOMINIO ? DOMINIO + ruta : ruta);

const avisos = [];

/* El build falla si una landing pide un tipo que js/tipos.js no implementa.
   Sin esto, una landing con un tipo inexistente se publica con el formulario
   vacio y nadie se entera hasta que un visitante lo intenta. */
const TIPOS = [...readFileSync(join(RAIZ, 'js', 'tipos.js'), 'utf8')
  .matchAll(/^  ([a-z]+): \{$/gm)].map((m) => m[1]);

for (const l of [...datos.landings, ...datos.herramientas]) {
  const t = l.config?.tipo;
  if (t && !TIPOS.includes(t)) {
    console.error(`\nERROR: ${l.ruta} usa el tipo "${t}", que no existe en js/tipos.js.`);
    console.error(`Tipos disponibles: ${TIPOS.join(', ')}\n`);
    process.exit(1);
  }
}

/* El mismo icono del juego de js/iconos.js, en línea para que el HTML
   estático no dependa de JavaScript para pintarlo. */
const ICONO_CANDADO = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"'
  + ' stroke="currentColor" stroke-width="1.6" stroke-linecap="round"'
  + ' stroke-linejoin="round" aria-hidden="true" focusable="false">'
  + '<rect x="3" y="7" width="10" height="6.6" rx="1.4"/>'
  + '<path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/></svg>';

/* ---------- piezas comunes ---------- */

/* Con trece landings ya no caben todas en la cabecera: aqui van las de mas
   busqueda y el indice completo se pinta en la portada (indiceLandings).
   El tercer elemento es la ayuda que sale al pasar por encima: en una barra
   donde "3D" o "Por lotes" no dicen gran cosa, esa linea es la diferencia
   entre entrar y no entrar. */
const NAV = [
  ['/', 'Generador',
   'El generador completo: once tipos de contenido, estilos, logo y marco, y la descarga en 3D.'],
  ['/qr-whatsapp/', 'WhatsApp',
   'Un código que abre un chat contigo con el mensaje ya escrito. La persona solo pulsa enviar.'],
  ['/qr-wifi/', 'WiFi',
   'El código de tu red: quien lo escanea se conecta sin teclear la contraseña.'],
  ['/qr-3d/llavero/', '3D',
   'Tu código como pieza imprimible en 3D: llavero, imán, placa o tarjeta, en 3MF a dos colores.'],
  // El cuarto valor marca el acceso destacado. Solo puede haber uno: si se
  // rellenan dos, dejan de destacar los dos.
  ['/leer-qr/', 'Leer un QR',
   'Descifra un código con la cámara o desde una imagen, y te avisa si el enlace tiene pinta de fraude.',
   true],
  ['/qr-por-lotes/', 'Por lotes',
   'Un CSV entra y un ZIP sale, hasta 500 códigos de una vez. Para numerar mesas o locales.'],
];

function cabecera(rutaActual) {
  return `<header class="cabecera"><div class="contenedor cabecera__fila">
  <a class="logo" href="/" data-pista="Volver al generador. Todas estas herramientas son parte de microtools, un conjunto de utilidades que funcionan sin registro."><span data-marca>${esc(MARCA)}</span><span class="logo__sep" aria-hidden="true">/</span><span class="logo__app">QR</span></a>
  <nav class="nav" aria-label="Principal">
    ${NAV.map(([r, t, ayuda]) => `<a href="${r}"${r === rutaActual ? ' aria-current="page"' : ''} data-pista="${esc(ayuda)}">${esc(t)}</a>`).join('\n    ')}
  </nav>
</div></header>`;
}

/* Los mismos destinos de la cabecera, tambien como botones dentro de la
   pagina. La cabecera se queda: son dos publicos distintos. El enlace de
   arriba lo usa quien ya conoce el sitio; la fila de botones la ve quien
   acaba de llegar desde una busqueda y no ha mirado la cabecera en su vida.
   En movil, ademas, un boton de 44px se acierta y un enlace de 14px no. */
const ICONOS_ACCESO = {
  '/': '<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z"/>',
  '/qr-whatsapp/': '<path d="M12 3a9 9 0 0 0-7.7 13.7L3 21l4.4-1.3A9 9 0 1 0 12 3Z"/><path d="M8.6 9.2c.3 2.6 2.6 4.9 5.2 5.2.6.1 1.2-.3 1.4-.9l.1-.5-1.8-.9-.8.8a6.3 6.3 0 0 1-2.6-2.6l.8-.8-.9-1.8-.5.1c-.6.2-1 .8-.9 1.4Z"/>',
  '/qr-wifi/': '<path d="M2.5 8.5a15 15 0 0 1 19 0M5.5 12a10.5 10.5 0 0 1 13 0M8.5 15.5a6 6 0 0 1 7 0"/><path d="M12 19.5h0"/>',
  '/qr-3d/llavero/': '<path d="M12 2.8 20.5 7v10L12 21.2 3.5 17V7Z"/><path d="M3.5 7 12 11.6 20.5 7M12 11.6v9.6"/>',
  '/leer-qr/': '<path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16"/><path d="M3.5 12h17"/>',
  '/qr-por-lotes/': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/>',
};

function accesos(rutaActual) {
  const icono = (r) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"`
    + ` stroke="currentColor" stroke-width="1.7" stroke-linecap="round"`
    + ` stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONOS_ACCESO[r] || ''}</svg>`;

  return `    <nav class="accesos" aria-label="Herramientas">
      ${NAV.map(([r, t, ayuda, destacado]) => {
        const aqui = r === rutaActual;
        // Estando ya en esa pagina el destacado sobra: manda el "estas aqui",
        // que dice algo mas util que "mirame".
        const resaltar = Boolean(destacado) && !aqui;
        return `<a class="acceso${aqui ? ' acceso--aqui' : ''}`
          + `${resaltar ? ' acceso--destacado' : ''}" href="${r}"`
          + `${aqui ? ' aria-current="page"' : ''} data-pista="${esc(ayuda)}"`
          + `${resaltar ? ' data-pista-tono="acento"' : ''}>`
          + `${icono(r)}<span>${esc(t)}</span></a>`;
      }).join('\n      ')}
    </nav>`;
}

function pie() {
  return `<footer class="pie"><div class="contenedor">
  <div class="pie__enlaces">
    <a href="https://microtools.lat/" rel="noopener">Más herramientas</a>
    <a href="/mis-qr/">Mis códigos</a>
    ${datos.legales.map((l) => `<a href="${l.ruta}">${esc(l.titulo)}</a>`).join('\n    ')}
  </div>
  <p>Todos los códigos se generan en tu navegador. Nada de lo que escribes se envía a ningún servidor.</p>
  <p>&copy; ${new Date().getFullYear()} <span data-marca>${esc(MARCA)}</span></p>
</div></footer>`;
}

function huecoAnuncio(clave, extra = '') {
  return `<div class="ad-slot ad-slot--${clave}${extra}" data-slot="${clave}"></div>`;
}

function datosEstructurados(l) {
  const bloques = [];

  bloques.push({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: l.metaTitulo,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Cualquiera con navegador web',
    description: l.metaDescripcion,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'PEN' },
    ...(DOMINIO ? { url: abs(l.ruta) } : {}),
  });

  if (l.faq && l.faq.length) {
    bloques.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: l.faq.map(([p, r]) => ({
        '@type': 'Question',
        name: p,
        acceptedAnswer: { '@type': 'Answer', text: r },
      })),
    });
  }

  if (l.ruta !== '/') {
    const partes = l.ruta.split('/').filter(Boolean);
    bloques.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: abs('/') },
        ...partes.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 2,
          name: p.replace(/-/g, ' '),
          item: abs('/' + partes.slice(0, i + 1).join('/') + '/'),
        })),
      ],
    });
  }

  return bloques
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join('\n');
}

/* ---------- cuerpo editorial (comun a landings y herramientas) ---------- */

function cuerpoEditorial(l) {
  const bloques = [];
  if (l.blog && l.blog.length) {
    bloques.push(`    <article class="articulo">
      <h2>${esc(l.h2Blog)}</h2>
      ${l.blog.map((p) => `<p>${esc(p)}</p>`).join('\n      ')}
    </article>`);
  }
  if (l.faq && l.faq.length) {
    bloques.push(`    <section class="faq">
      <h2>Preguntas frecuentes</h2>
      ${l.faq.map(([p, r]) => `<details><summary>${esc(p)}</summary><p>${esc(r)}</p></details>`).join('\n      ')}
    </section>`);
  }
  if (l.relacionados && l.relacionados.length) {
    bloques.push(`    <nav class="relacionados" aria-label="Herramientas relacionadas">
      <h2>También te puede servir</h2>
      <ul>
        ${l.relacionados.map(([r, t]) => `<li><a href="${r}">${esc(t)}</a></li>`).join('\n        ')}
      </ul>
    </nav>`);
  }
  return bloques.join('\n\n');
}

/* ---------- herramienta (lector, lotes, historial) ---------- */

function paginaHerramienta(h) {
  const indexable = h.indexar !== false;
  return `<!doctype html>
<html lang="${datos.sitio.idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(h.metaTitulo)}</title>
<meta name="description" content="${esc(h.metaDescripcion)}">
${indexable ? '' : '<meta name="robots" content="noindex, follow">'}
${DOMINIO && indexable ? `<link rel="canonical" href="${abs(h.ruta)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(h.metaTitulo)}">
<meta property="og:description" content="${esc(h.metaDescripcion)}">
${DOMINIO && indexable ? `<meta property="og:url" content="${abs(h.ruta)}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#FFFFFF">
<link rel="stylesheet" href="/css/app.css">
${indexable ? datosEstructurados(h) : ''}
</head>
<body>
${cabecera(h.ruta)}

<main>
  <div class="contenedor">
    <div class="entrada">
      <h1>${esc(h.h1)}</h1>
      ${h.entrada.map((p) => `<p>${esc(p)}</p>`).join('\n      ')}
    </div>

${accesos(h.ruta)}

    ${indexable ? huecoAnuncio('top') : ''}

    <div id="herramienta"></div>

    <p class="privacidad-nota">${ICONO_CANDADO}<span>Todo ocurre en tu navegador: nada de lo que subas o escribas sale de tu dispositivo.</span></p>

    ${indexable ? huecoAnuncio('mid') : ''}

${cuerpoEditorial(h)}

    ${indexable ? huecoAnuncio('bottom') : ''}
  </div>
</main>

${pie()}

<script type="module">
  import { init } from '${h.modulo}';
  import { iniciarPublicidad } from '/js/ads.js';
  import { aplicarMarca } from '/js/config.js';
  import { iniciarPistas } from '/js/pistas.js';

  aplicarMarca();
  iniciarPistas();
  init();
  iniciarPublicidad();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
</script>
</body>
</html>
`;
}

/* Indice de todas las landings, para la portada. Se genera del JSON: una
   landing nueva aparece aqui sola, sin tocar el HTML. Ademas es el enlazado
   interno que hace que Google llegue a todas desde la pagina de mas autoridad. */
function indiceLandings(rutaActual) {
  const otras = datos.landings.filter((l) => l.ruta !== rutaActual);
  if (!otras.length) return '';

  const plano = otras.filter((l) => !l.ruta.startsWith('/qr-3d/'));
  const tres = otras.filter((l) => l.ruta.startsWith('/qr-3d/'));

  const lista = (ls) => `<ul class="indice__lista">
      ${ls.map((l) => `<li><a href="${l.ruta}">${esc(l.keyword)}</a></li>`).join('\n      ')}
    </ul>`;

  return `    <section class="indice" aria-labelledby="todos-los-tipos">
      <h2 id="todos-los-tipos">Todos los tipos de c&oacute;digo</h2>
      <p>El mismo generador, con el formulario y los valores ya puestos para cada caso.</p>
      ${lista(plano)}
      ${tres.length ? `<h3>Para imprimir en 3D</h3>\n      ${lista(tres)}` : ''}
    </section>`;
}

/* Las cuatro promesas del sitio, destacadas en la portada. Son las razones
   por las que alguien elegiria esto frente al primer generador que salga en
   Google, y conviene que se lean antes de empezar, no en el pie.

   La nota final no es letra pequena defensiva: si prometemos que no guardamos
   nada, hay que decir en la misma caja que los anuncios de Google si ponen
   cookies. Prometer de mas en un sitio que presume de privacidad es la forma
   mas rapida de perder la credibilidad que justifica el bloque entero. */
const GARANTIAS = [
  ['candado', 'Todo ocurre en tu navegador',
   'El enlace, la contraseña del WiFi o el logo que subas no salen de tu dispositivo.'],
  ['servidor', 'Sin base de datos y sin cuentas',
   'No hay dónde guardar tus datos, porque no hay servidor que los reciba.'],
  ['ojo', 'No queda registro de lo que creas',
   'Cierras la pestaña y no queda nada. Ni siquiera nosotros podemos recuperarlo.'],
  ['gratis', 'Gratis, y sin trampa',
   'Sin marca de agua, sin límite de descargas y sin versión de pago. Puedes usarlo comercialmente.'],
];

const ICONOS_GARANTIA = {
  candado: '<rect x="3" y="9" width="14" height="9" rx="2"/><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9"/>',
  servidor: '<rect x="2.5" y="4" width="15" height="5" rx="1.5"/><rect x="2.5" y="11" width="15" height="5" rx="1.5"/><path d="M5.5 6.5h0M5.5 13.5h0"/>',
  ojo: '<path d="M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5Z"/><circle cx="10" cy="10" r="2"/><path d="M3.5 3.5l13 13"/>',
  gratis: '<circle cx="10" cy="10" r="7.5"/><path d="M12.5 7.5c-.6-.9-1.6-1.4-2.7-1.3-1.3 0-2.3.8-2.3 1.9 0 2.6 5 1.4 5 4 0 1.1-1 2-2.4 2-1.1.1-2.2-.5-2.8-1.4M10 4.7v10.6"/>',
};

function garantias() {
  const icono = (k) => `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"`
    + ` stroke="currentColor" stroke-width="1.5" stroke-linecap="round"`
    + ` stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONOS_GARANTIA[k]}</svg>`;

  return `    <section class="garantias" aria-labelledby="garantias-titulo">
      <h2 class="garantias__titulo" id="garantias-titulo">Por qu&eacute; este y no otro</h2>
      <ul class="garantias__lista">
${GARANTIAS.map(([k, t, d]) => `        <li>${icono(k)}<span><b>${esc(t)}</b>${esc(d)}</span></li>`).join('\n')}
      </ul>
      <p class="garantias__nota">Compru&eacute;balo: carga la p&aacute;gina, desconecta internet y sigue funcionando.
      La publicidad de Google, que es lo que paga el sitio, s&iacute; usa cookies propias &mdash; lo cuenta la
      <a href="/legal/cookies/">pol&iacute;tica de cookies</a>.</p>
    </section>`;
}

/* ---------- landing ---------- */

function paginaLanding(l) {
  if (l.blog.length > 20) {
    avisos.push(`${l.ruta}: el bloque de blog tiene ${l.blog.length} líneas, el máximo son 20.`);
  }
  const palabras = l.blog.join(' ').split(/\s+/).length;
  if (palabras < 180) {
    avisos.push(`${l.ruta}: el bloque de blog tiene ${palabras} palabras; el mínimo recomendado son 180.`);
  }

  return `<!doctype html>
<html lang="${datos.sitio.idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(l.metaTitulo)}</title>
<meta name="description" content="${esc(l.metaDescripcion)}">
${DOMINIO ? `<link rel="canonical" href="${abs(l.ruta)}">` : '<!-- canonical: se añade al fijar el dominio en js/config.js -->'}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(l.metaTitulo)}">
<meta property="og:description" content="${esc(l.metaDescripcion)}">
${DOMINIO ? `<meta property="og:url" content="${abs(l.ruta)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#FFFFFF">
<link rel="stylesheet" href="/css/app.css">
${datosEstructurados(l)}
</head>
<body>
${cabecera(l.ruta)}

<main>
  <div class="contenedor">
    <div class="entrada">
      <h1>${esc(l.h1)}</h1>
      ${l.entrada.map((p) => `<p>${esc(p)}</p>`).join('\n      ')}
    </div>

${accesos(l.ruta)}

${l.ruta === '/' ? garantias() + '\n' : ''}
    ${huecoAnuncio('top')}

    <div id="qr-app"></div>

    <p class="privacidad-nota">${ICONO_CANDADO}<span>Todo ocurre en tu navegador: ni el contenido ni el logo que subas salen de tu dispositivo.</span></p>

    ${huecoAnuncio('mid')}

${l.ruta === '/' ? indiceLandings(l.ruta) + '\n' : ''}
${cuerpoEditorial(l)}

${l.ruta !== '/' ? indiceLandings(l.ruta) + '\n' : ''}
    ${huecoAnuncio('bottom')}
  </div>
</main>

${pie()}

<script type="module">
  import { QRApp } from '/js/qr-engine.js';
  import { iniciarPublicidad } from '/js/ads.js';
  import { aplicarMarca } from '/js/config.js';
  import { iniciarPistas } from '/js/pistas.js';

  aplicarMarca();
  iniciarPistas();
  QRApp.init(${JSON.stringify(l.config)});
  iniciarPublicidad();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
</script>
</body>
</html>
`;
}

/* ---------- páginas legales ---------- */

const TEXTOS_LEGALES = {
  'Aviso legal': `
<h2>Titular del sitio</h2>
<p>El titular de este sitio web es <span data-marca></span>, persona natural domiciliada en Lima, Perú.</p>
<p data-correo-bloque>Para cualquier comunicación: <a data-correo href="#"></a>.</p>
<h2>Objeto</h2>
<p>Este sitio ofrece una herramienta gratuita para generar códigos QR y modelos tridimensionales derivados de ellos. El uso de la herramienta no requiere registro ni el envío de datos a ningún servidor: todo el procesamiento ocurre en el navegador del usuario.</p>
<h2>Uso de los códigos generados</h2>
<p>Los códigos QR, imágenes y modelos 3D que se generan con esta herramienta pertenecen a quien los crea y pueden usarse con fines personales o comerciales, sin atribución y sin límite de cantidad.</p>
<h2>Exención de responsabilidad</h2>
<p>La herramienta se ofrece tal cual. El titular no se responsabiliza del contenido que los usuarios codifiquen en sus códigos QR, ni de los resultados de impresión obtenidos a partir de los modelos descargados. Se recomienda comprobar siempre el código impreso antes de producirlo en cantidad.</p>
<h2>Propiedad intelectual</h2>
<p>El código fuente del sitio, sus textos y su diseño pertenecen al titular. El formato de código QR es un estándar abierto (ISO/IEC 18004) de libre uso.</p>
<h2>Legislación aplicable</h2>
<p>Este sitio se rige por la legislación de la República del Perú. Cualquier controversia derivada de su uso se someterá a los jueces y tribunales de Lima, Perú.</p>`,

  'Política de privacidad': `
<h2>Qué datos tratamos</h2>
<p>Este sitio no tiene servidor propio ni base de datos. El contenido que escribes en el generador —enlaces, contraseñas de WiFi, datos de contacto— y las imágenes que subas se procesan íntegramente en tu navegador y no se transmiten a ningún servidor nuestro ni de terceros.</p>
<p>Puedes comprobarlo: desconecta internet después de cargar la página y el generador seguirá funcionando.</p>
<h2>Almacenamiento en tu navegador</h2>
<p>Si usas la función de historial, los últimos códigos generados se guardan en el almacenamiento local de tu navegador (localStorage). Esa información no sale de tu dispositivo, no la recibimos y puedes borrarla desde la propia página o limpiando los datos del sitio en tu navegador.</p>
<h2>Publicidad</h2>
<p>Este sitio se financia con publicidad servida por Google AdSense. Google y sus proveedores pueden usar cookies e identificadores para mostrar anuncios basados en tus visitas anteriores a este u otros sitios web.</p>
<p>Puedes configurar o desactivar la publicidad personalizada en los <a href="https://myadcenter.google.com/" rel="nofollow noopener" target="_blank">ajustes de anuncios de Google</a> y consultar cómo Google trata los datos en su <a href="https://policies.google.com/technologies/partner-sites" rel="nofollow noopener" target="_blank">página de sitios asociados</a>. Si te encuentras en un país cuya normativa lo exige, Google mostrará su propio aviso de consentimiento antes de personalizar los anuncios.</p>
<h2>Analítica</h2>
<p>Usamos Google Analytics 4 para conocer qué páginas se visitan y en qué proporción, de forma agregada. No cruzamos esos datos con el contenido que generas, porque ese contenido nunca llega a nosotros.</p>
<h2>Tus derechos</h2>
<p>La Ley N.° 29733 de Protección de Datos Personales del Perú te reconoce los derechos de información, acceso, actualización, inclusión, rectificación, supresión y oposición sobre tus datos personales. Como este sitio no recoge datos identificativos, en la práctica el control se ejerce desde los ajustes de tu navegador y desde los ajustes de anuncios de Google.</p>
<p data-correo-bloque>Si crees que alguna función del sitio trata datos tuyos y quieres ejercer algún derecho, escribe a <a data-correo href="#"></a>.</p>
<h2>Alojamiento</h2>
<p>El sitio está alojado en Netlify, que como cualquier servidor web registra las peticiones que recibe —dirección IP, fecha, página solicitada y navegador— con fines de seguridad y funcionamiento. Esos registros son de Netlify; nosotros no los explotamos.</p>`,

  'Política de cookies': `
<h2>Qué es una cookie</h2>
<p>Una cookie es un pequeño archivo que un sitio web guarda en tu navegador para recordar información entre visitas.</p>
<h2>Cookies que usa este sitio</h2>
<p><b>Técnicas y de preferencias.</b> Guardamos en el almacenamiento local de tu navegador tu historial de códigos y tus últimas opciones de diseño. No es seguimiento: no sale de tu dispositivo y no lo recibimos.</p>
<p><b>Publicitarias.</b> Google AdSense instala cookies para mostrar anuncios y medir su rendimiento. Si no has dado tu consentimiento —en los países donde Google lo solicita mediante su propio aviso—, los anuncios que verás serán no personalizados.</p>
<p><b>Analíticas.</b> Google Analytics 4 instala cookies para medir el tráfico de forma agregada.</p>
<h2>Cómo gestionarlas</h2>
<p>Puedes revisar y cambiar tu configuración de anuncios personalizados en los <a href="https://myadcenter.google.com/" rel="nofollow noopener" target="_blank">ajustes de anuncios de Google</a>, y bloquear o borrar cookies desde los ajustes de tu navegador. Bloquear las cookies publicitarias no afecta al funcionamiento del generador, que no las necesita.</p>`,
};

function paginaLegal(l) {
  return `<!doctype html>
<html lang="${datos.sitio.idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(l.titulo)} — ${esc(MARCA)}</title>
<meta name="description" content="${esc(l.titulo)} de ${esc(MARCA)}.">
<meta name="robots" content="noindex, follow">
${DOMINIO ? `<link rel="canonical" href="${abs(l.ruta)}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/app.css">
</head>
<body>
${cabecera(l.ruta)}
<main><div class="contenedor estrecho">
  <div class="entrada"><h1>${esc(l.titulo)}</h1></div>
  <div class="articulo">${TEXTOS_LEGALES[l.titulo]}</div>
</div></main>
${pie()}
<script type="module">
  import { aplicarMarca } from '/js/config.js';
  import { iniciarPistas } from '/js/pistas.js';
  aplicarMarca();
  iniciarPistas();
</script>
</body>
</html>
`;
}

/* ---------- sitemap, robots, manifest, service worker ---------- */

function sitemap() {
  const hoy = new Date().toISOString().slice(0, 10);
  const paginas = [...datos.landings, ...datos.herramientas.filter((h) => h.indexar !== false)];
  const urls = paginas.map((l) => `  <url>
    <loc>${abs(l.ruta)}</loc>
    <lastmod>${hoy}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${l.ruta === '/' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">
${urls}
</urlset>
`.replace('www.sitemap.org', 'www.sitemaps.org');
}

function robots() {
  return `User-agent: *
Allow: /

${DOMINIO ? `Sitemap: ${abs('/sitemap.xml')}` : '# Sitemap: se añade al fijar el dominio en js/config.js'}
`;
}

function manifest() {
  return JSON.stringify({
    name: MARCA,
    short_name: MARCA,
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#FFFFFF',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }, null, 2);
}

function serviceWorker() {
  const precache = [
    '/', '/css/app.css',
    '/js/qr-core.js', '/js/qr-render.js', '/js/qr-engine.js', '/js/tipos.js',
    '/js/validar.js', '/js/export2d.js', '/js/pasos.js', '/js/ads.js',
    '/js/config.js', '/js/historial.js', '/js/iconos.js',
    '/js/estado.js', '/js/interpretar.js',
    ...datos.landings.map((l) => l.ruta),
    ...datos.herramientas.map((h) => h.ruta),
    ...datos.herramientas.map((h) => h.modulo),
  ];
  /* La version sale del contenido de lo que se precachea, no de la fecha.
     Con la fecha, dos publicaciones del mismo dia compartian nombre de cache y
     el visitante que ya habia entrado seguia viendo el JavaScript viejo hasta
     el dia siguiente. */
  const huella = createHash('sha256');
  for (const ruta of [...new Set(precache)].sort()) {
    const archivo = ruta.endsWith('/') ? join(ruta, 'index.html') : ruta;
    try { huella.update(readFileSync(join(RAIZ, archivo.replace(/^\//, '')))); }
    catch { huella.update(archivo); }   // aun no generado en esta pasada
  }
  const version = huella.digest('hex').slice(0, 10);

  return `/* sw.js — generado por build/generar.mjs. La herramienta funciona sin
   conexión; los anuncios, no. */
const CACHE = 'qr3d-${version}';
const PRECACHE = ${JSON.stringify([...new Set(precache)], null, 2)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copia = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
      return res;
    }).catch(() => caches.match('/')))
  );
});
`;
}

function favicon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="6" fill="#FFFFFF"/>
<g fill="#0F172A">
<path d="M5 5h9v9H5V5zm2 2v5h5V7H7z"/>
<path d="M18 5h9v9h-9V5zm2 2v5h5V7h-5z"/>
<path d="M5 18h9v9H5v-9zm2 2v5h5v-5H7z"/>
<rect x="8.5" y="8.5" width="2" height="2"/><rect x="21.5" y="8.5" width="2" height="2"/>
<rect x="8.5" y="21.5" width="2" height="2"/>
</g>
<g fill="#C2410C">
<rect x="17" y="17" width="3" height="3"/><rect x="22" y="17" width="3" height="3"/>
<rect x="17" y="22" width="3" height="3"/><rect x="24" y="22" width="3" height="3"/>
<rect x="22" y="24" width="2" height="3"/>
</g>
</svg>
`;
}

function netlifyToml() {
  return `# netlify.toml — sitio estático, sin build step.
[build]
  publish = "."
  command = "node build/generar.mjs"

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    X-Frame-Options = "SAMEORIGIN"

# El motor cambia con cada despliegue: revalidación obligatoria.
[[headers]]
  for = "/js/*"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

[[headers]]
  for = "/css/*"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

# Las librerías vendidas llevan versión fija en el nombre del directorio.
[[headers]]
  for = "/js/vendor/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"
`;
}

/* ---------- escritura ---------- */

function escribir(ruta, contenido) {
  const destino = join(RAIZ, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, contenido);
  return ruta;
}

const escritos = [];
for (const l of datos.landings) escritos.push(escribir(l.archivo, paginaLanding(l)));
for (const h of datos.herramientas) escritos.push(escribir(h.archivo, paginaHerramienta(h)));
for (const l of datos.legales) escritos.push(escribir(l.archivo, paginaLegal(l)));
escritos.push(escribir('sitemap.xml', sitemap()));
escritos.push(escribir('robots.txt', robots()));
escritos.push(escribir('manifest.webmanifest', manifest()));
escritos.push(escribir('sw.js', serviceWorker()));
escritos.push(escribir('favicon.svg', favicon()));
escritos.push(escribir('netlify.toml', netlifyToml()));

console.log(`Generadas ${escritos.length} rutas:`);
for (const r of escritos) console.log('  ' + r);

if (!DOMINIO) {
  avisos.push('No hay dominio en js/config.js: se omiten canonical, og:url y Sitemap en robots.txt.');
}
if (!/cliente:\s*'ca-pub-/.test(configJs)) {
  avisos.push('No hay ID de editor de AdSense en js/config.js: los huecos de anuncio se retiran solos y no se carga el script.');
}
if (avisos.length) {
  console.log('\nPendiente antes de publicar:');
  for (const a of avisos) console.log('  - ' + a);
}
