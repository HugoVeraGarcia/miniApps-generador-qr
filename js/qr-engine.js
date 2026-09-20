/* qr-engine.js — Orquestador de la aplicacion.
 *
 * Una sola funcion publica, QRApp.init(config), construye la herramienta
 * completa dentro de #qr-app. Cada landing la llama con una configuración
 * distinta: mismo motor, distinta puerta de entrada.
 */

import { encode } from './qr-core.js';
import { pintarCanvas, calcularLienzo, ESTILOS_MODULO, ESTILOS_OJO_MARCO, ESTILOS_OJO_CENTRO } from './qr-render.js';
import { TIPOS, valoresPorDefecto, camposFaltantes, serializar } from './tipos.js';
import { diagnosticoColor, diagnosticoEstructura, verificarEscaneo, verificarEstilo, distanciaLectura } from './validar.js';
import { descargarPNG, descargarJPG, descargarSVG, descargarBlob, nombreArchivo, canvasATamano, imprimirHojaA4, descargarHojaA4 } from './export2d.js';
import { crearNavegacion, registrarEvento, avisar, PASOS } from './pasos.js';
import { montarBloques } from './ads.js';
import { aplicarMarca } from './config.js';
import { ICONOS } from './iconos.js';
import * as historial from './historial.js';
import { codificarEstado, decodificarEstado } from './estado.js';
import { iniciarPistas } from './pistas.js';

const TAMANOS_PNG = [512, 1024, 2048, 4096];
const NIVELES = [
  ['L', 'L — aguanta poco dano. Solo para pantalla.'],
  ['M', 'M — equilibrio normal. Es el valor por defecto.'],
  ['Q', 'Q — para impresión en exteriores o superficies que se ensucian.'],
  ['H', 'H — obligatorio si pones logo o usas el modo pasante en 3D.'],
];
const EMOJIS = ['', '📍', '☕', '🍔', '📶', '🛒', '💈', '🎁', '🍷', '🏠'];

/* Una explicación por control. En lenguaje de quien no sabe qué es un módulo
   ni un nivel de corrección: eso es justo lo que la pista tiene que resolver. */
const PISTAS_ESTILO = {
  'clasico': 'Cuadrados pegados, como el QR de toda la vida. Es el que mejor lee en cualquier lector, hasta en los más simples.',
  'redondeado': 'Las esquinas de cada cuadrado suavizadas. Se ve más amable y sigue leyendo igual de bien.',
  'puntos': 'Círculos separados. Queda muy limpio, pero al separar los módulos algunos lectores antiguos tropiezan: imprímelo algo más grande.',
  'elegante': 'Los módulos se unen formando trazos continuos. El más vistoso para material impreso cuidado.',
  'barras-v': 'Los módulos se funden en columnas. Efecto de persiana vertical.',
  'barras-h': 'Lo mismo en horizontal. Elige uno u otro según cómo quede tu logo al centro.',
};
const PISTAS_OJO = {
  'cuadrado': 'La forma del estándar. La opción segura.',
  'redondeado': 'Esquinas suavizadas, a juego con el estilo redondeado de los módulos.',
  'circulo': 'Esquinas completamente redondas. Cambia mucho el carácter del código.',
  'hoja': 'Dos esquinas en punta y dos redondas, como una hoja.',
  'punto': 'El centro de la esquina como un círculo pequeño.',
};
const PISTAS_ECL = {
  'L': 'Aguanta poco daño. Sirve solo para pantalla, donde nada se ensucia ni se raya.',
  'M': 'El equilibrio normal y el valor por defecto. Bien para papel en interior.',
  'Q': 'Más resistente. Para impresión en exteriores o superficies que se manchan.',
  'H': 'La máxima. Obligatoria si pones logo, y la que usamos en 3D: el relieve impreso nunca sale tan limpio como la tinta.',
};
/* Un texto por símbolo: decir nueve veces lo mismo no ayuda a elegir. La
   coletilla sobre la corrección se repite porque en cada uno es igual de
   pertinente: explica por qué el nivel cambia solo al poner un símbolo. */
const PISTAS_EMOJI = {
  '': 'Sin símbolo al centro. El código queda limpio y lee con el máximo margen.',
  '📍': 'Un pin, para códigos que llevan a una ubicación o a un mapa. Sube la corrección a H.',
  '☕': 'Una taza, para cafeterías. Sube la corrección a H.',
  '🍔': 'Comida, para la carta de un restaurante o el pedido para llevar. Sube la corrección a H.',
  '📶': 'El icono de cobertura, para el código del WiFi del local. Sube la corrección a H.',
  '🛒': 'Un carrito, para una tienda o un catálogo. Sube la corrección a H.',
  '💈': 'El poste de barbería, para peluquerías y barberías. Sube la corrección a H.',
  '🎁': 'Un regalo, para promociones, sorteos y tarjetas obsequio. Sube la corrección a H.',
  '🍷': 'Una copa, para la carta de vinos o un bar. Sube la corrección a H.',
  '🏠': 'Una casa, para inmobiliarias o para la puerta de tu negocio. Sube la corrección a H.',
};

const ETIQUETAS_ESTILO = {
  'clasico': 'Clásico', 'redondeado': 'Redondeado', 'puntos': 'Puntos',
  'elegante': 'Elegante', 'barras-v': 'Barras', 'barras-h': 'Líneas',
};
const ETIQUETAS_OJO = {
  'cuadrado': 'Cuadrado', 'redondeado': 'Redondeado',
  'circulo': 'Círculo', 'hoja': 'Hoja', 'punto': 'Punto',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- aplicación ---------- */

class Aplicacion {
  constructor(raiz, config) {
    this.raiz = raiz;
    this.config = config;
    this.tipo = config.tipo || 'enlace';
    this.valores = { ...valoresPorDefecto(this.tipo), ...(config.valores || {}) };
    this.opciones = {
      colorCodigo: '#181527',
      colorFondo: '#FFFFFF',
      fondoTransparente: false,
      gradiente: null,
      estiloModulo: 'clasico',
      estiloOjoMarco: 'cuadrado',
      estiloOjoCentro: 'cuadrado',
      colorOjo: null,
      margen: 4,
      logo: null,
      marco: null,
      ...(config.plantilla || {}),
    };
    this.ecl = config.ecl || 'M';
    this.emoji = config.emoji || '';
    this.ctaTexto = config.cta || TIPOS[this.tipo].cta || 'ESCANEAME';
    this.conMarco = Boolean(config.marco);
    this.opciones3d = {
      objeto: config.objeto3d || 'placa-mesa',
      modo: 'positivo',
      alturaRelieve: 0.8,
      boquilla: 0.4,
      alturaCapa: 0.2,
      colorBase: '#F8FAFC',
      colorCodigo: '#181527',
    };
    this.mod3d = null;
    this.visor = null;
    this.geo = null;
    this.matriz = null;
    this.contenido = '';
    this._t = null;
  }

  /* ----- arranque ----- */

  montar() {
    this.restaurarDeURL();
    this.raiz.innerHTML = this.plantilla();
    this.cachearNodos();
    this.enlazarEventos();
    aplicarMarca(this.raiz);
    /* A nivel de documento, no de la raíz del generador: así la cabecera y
       todo lo que se pinte después —el formulario de cada tipo, el panel 3D—
       quedan cubiertos por el mismo delegado. La función se protege sola
       contra una segunda llamada. */
    iniciarPistas();

    this.nav = crearNavegacion({
      alCambiar: (paso) => this.alCambiarPaso(paso),
      validar: (paso) => this.validarPaso(paso),
    });

    this.actualizar();
  }

  restaurarDeURL() {
    const d = new URLSearchParams(location.search).get('d');
    if (!d) return;
    const estado = decodificarEstado(d);
    if (!estado) return;
    if (estado.t && TIPOS[estado.t]) this.tipo = estado.t;
    if (estado.v) this.valores = { ...valoresPorDefecto(this.tipo), ...estado.v };
    if (estado.o) this.opciones = { ...this.opciones, ...estado.o, logo: null };
    if (estado.e) this.ecl = estado.e;
    if (estado.m) { this.conMarco = true; this.ctaTexto = estado.m; }
    if (estado.o3) this.opciones3d = { ...this.opciones3d, ...estado.o3 };
  }

  guardarEnURL() {
    const estado = {
      t: this.tipo,
      v: this.valores,
      o: { ...this.opciones, logo: undefined, marco: undefined },
      e: this.ecl,
      m: this.conMarco ? this.ctaTexto : undefined,
      o3: this.opciones3d,
    };
    const url = new URL(location.href);
    url.searchParams.set('d', codificarEstado(estado));
    history.replaceState(history.state, '', url);
  }

  /* ----- plantilla ----- */

  plantilla() {
    return `
<div class="app">
  <div class="app__panel">
    <ol class="indicador-pasos" aria-label="Pasos">
      ${PASOS.map((p, i) => `
        <li><button type="button" class="paso-chip" data-ir-a-paso="${p}">
          <span class="paso-chip__num">${i + 1}</span>
          <span>${['Contenido', 'Diseño', 'Descarga'][i]}</span>
        </button></li>`).join('')}
    </ol>

    <section data-paso="contenido" class="tarjeta">
      <h2 class="tarjeta__titulo">¿Qué quieres que abra el QR?</h2>
      <div class="js-selector-tipo"></div>
      <div class="js-campos campos"></div>
      <p class="ayuda js-ayuda"></p>
      <div class="acciones">
        <button type="button" class="btn btn--principal" data-ir-a-paso="diseno">Siguiente: diseño</button>
      </div>
    </section>

    <section data-paso="diseno" class="tarjeta" hidden>
      <h2 class="tarjeta__titulo">Diseño del código</h2>
      ${this.plantillaDiseno()}
      <div class="acciones">
        <button type="button" class="btn btn--secundario" data-ir-a-paso="contenido">Atrás</button>
        <button type="button" class="btn btn--principal" data-ir-a-paso="descarga">Siguiente: descarga</button>
      </div>
    </section>

    <section data-paso="descarga" class="tarjeta" hidden>
      <h2 class="tarjeta__titulo">Descarga</h2>
      ${this.plantillaDescarga()}
      <div class="acciones">
        <button type="button" class="btn btn--secundario" data-ir-a-paso="diseno">Atrás</button>
      </div>
    </section>
  </div>

  <aside class="app__vista">
    <div class="vista__pegajosa">
      <div class="vista__caja es-vacia js-caja">
        <div class="vista__vacio js-vacio">
          ${ICONOS.codigoGrande}
          <span><b>Aquí verás tu código</b>Se genera solo, según escribes, y sin salir de tu navegador.</span>
        </div>
        <canvas class="js-canvas" role="img" aria-label="Vista previa del código QR" hidden></canvas>
      </div>
      <div class="vista__avisos js-avisos" role="status" aria-live="polite"></div>
      <p class="vista__meta js-meta"></p>
      <div class="vista__rapido">
        <button type="button" class="btn btn--fino js-png-rapido" disabled>${ICONOS.descarga}PNG</button>
        <button type="button" class="btn btn--fino js-svg-rapido" disabled>${ICONOS.descarga}SVG</button>
      </div>
    </div>
  </aside>
</div>`;
  }

  plantillaDiseno() {
    return `
<div class="rejilla-2">
  <label class="campo" data-pista="El color de los módulos. Tiene que ser claramente más oscuro que el fondo: la cámara distingue por contraste, no por color."><span>Color del código</span>
    <span class="campo-color"><input type="color" class="js-color-codigo"><input type="text" class="js-color-codigo-hex" maxlength="7" inputmode="text"></span>
  </label>
  <label class="campo" data-pista="El fondo del código. El blanco es el que más margen de lectura da; cualquier otro reduce el contraste."><span>Color del fondo</span>
    <span class="campo-color"><input type="color" class="js-color-fondo"><input type="text" class="js-color-fondo-hex" maxlength="7"></span>
  </label>
</div>

<label class="interruptor" data-pista="El PNG sale sin fondo, para montarlo sobre un diseño propio. Ojo: el código adoptará el color de lo que tenga detrás, así que colócalo siempre sobre algo claro."><input type="checkbox" class="js-transparente"><span>Fondo transparente en el PNG</span></label>

<fieldset class="grupo">
  <legend>Estilo del código</legend>
  <div class="opciones js-estilos">
    ${ESTILOS_MODULO.map((e) => `<button type="button" class="opcion" data-estilo="${e}" data-pista="${esc(PISTAS_ESTILO[e] || '')}">${esc(ETIQUETAS_ESTILO[e])}</button>`).join('')}
  </div>
</fieldset>

<fieldset class="grupo">
  <legend>Esquinas (ojos)</legend>
  <div class="rejilla-2">
    <label class="campo"><span>Marco</span>
      <select class="js-ojo-marco" data-pista="Las tres esquinas grandes son lo que el lector busca primero para orientarse. Cambiar su forma es seguro; cambiar su posición, no.">${ESTILOS_OJO_MARCO.map((e) => `<option value="${e}">${esc(ETIQUETAS_OJO[e])}</option>`).join('')}</select>
    </label>
    <label class="campo"><span>Centro</span>
      <select class="js-ojo-centro" data-pista="El cuadrado interior de cada esquina. Se puede redondear sin afectar a la lectura.">${ESTILOS_OJO_CENTRO.map((e) => `<option value="${e}">${esc(ETIQUETAS_OJO[e])}</option>`).join('')}</select>
    </label>
  </div>
  <label class="interruptor" data-pista="Pinta las tres esquinas grandes de otro color. Un recurso de marca que no afecta a la lectura si mantienes el contraste."><input type="checkbox" class="js-ojo-color-on"><span>Color distinto en las esquinas</span></label>
  <input type="color" class="js-ojo-color" hidden>
</fieldset>

<fieldset class="grupo">
  <legend>Logo o emoji en el centro</legend>
  <div class="opciones js-emojis">
    ${EMOJIS.map((e) => `<button type="button" class="opcion opcion--emoji" data-emoji="${e}" data-pista="${esc(PISTAS_EMOJI[e] || '')}">${e || 'Ninguno'}</button>`).join('')}
  </div>
  <label class="btn btn--fino btn--archivo" data-pista="Tu logo al centro. No sale de tu navegador. Tapa módulos, así que el nivel de corrección pasa a H y comprobamos que siga leyendo.">Subir mi logo
    <input type="file" class="js-logo" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden>
  </label>
  <p class="ayuda">El logo se procesa en tu navegador: no se sube a ningun servidor. Al poner logo se fuerza la corrección de errores H.</p>
</fieldset>

<fieldset class="grupo">
  <legend>Marco con llamada a la acción</legend>
  <label class="interruptor" data-pista="Un borde con una llamada debajo, tipo ESCRÍBENOS. La gente desconfía de un cuadrado sin explicación: el marco dice a dónde lleva y sube mucho los escaneos."><input type="checkbox" class="js-marco-on"><span>Añadir marco con texto</span></label>
  <input type="text" class="js-marco-texto" maxlength="26" placeholder="ESCANEAME">
  <p class="ayuda">Un marco con instrucción sube mucho el número de escaneos reales. Máximo 26 caracteres.</p>
</fieldset>

<fieldset class="grupo">
  <legend>Corrección de errores</legend>
  <div class="opciones js-ecl">
    ${NIVELES.map(([n]) => `<button type="button" class="opcion" data-ecl="${n}" data-pista="${esc(PISTAS_ECL[n] || '')}">${n}</button>`).join('')}
  </div>
  <p class="ayuda js-ecl-ayuda"></p>
</fieldset>

<label class="campo"><span>Margen blanco: <b class="js-margen-valor">4</b> módulos</span>
  <input type="range" class="js-margen" min="1" max="8" step="1" value="4" data-pista="La zona en blanco alrededor del código. El estándar pide 4 módulos y recortarla es la causa más común de que un QR impreso no escanee.">
</label>`;
  }

  plantillaDescarga() {
    return `
<h3 class="sub">Imagen</h3>
<div class="botonera">
  ${TAMANOS_PNG.map((t) => `<button type="button" class="btn btn--fino js-png" data-px="${t}">${ICONOS.descarga}PNG ${t}px</button>`).join('')}
  <button type="button" class="btn btn--fino js-svg">${ICONOS.descarga}SVG vectorial</button>
  <button type="button" class="btn btn--fino js-jpg">${ICONOS.descarga}JPG</button>
</div>
<p class="ayuda">El SVG es vectorial: se amplia a cualquier tamaño sin perder nitidez. Es el formato que pide una imprenta.</p>

<h3 class="sub">Hoja A4 para imprimir</h3>
<div class="fila">
  <label class="campo campo--corto"><span>Copias por hoja</span>
    <select class="js-a4-copias">
      ${[1, 2, 4, 6, 12, 24].map((n) => `<option value="${n}"${n === 6 ? ' selected' : ''}>${n}</option>`).join('')}
    </select>
  </label>
  <button type="button" class="btn btn--fino js-a4-imprimir">Imprimir</button>
  <button type="button" class="btn btn--fino js-a4-svg">Descargar SVG</button>
</div>

<h3 class="sub">Tamaño de impresión</h3>
<div class="fila">
  <label class="campo campo--corto"><span>Lado impreso (mm)</span>
    <input type="number" class="js-lado-mm" min="10" max="600" step="5" value="40">
  </label>
  <p class="nota js-distancia"></p>
</div>

<div class="ad-slot ad-slot--descarga" data-slot="descarga"></div>

<h3 class="sub">Objeto para imprimir en 3D</h3>
<div class="js-panel3d panel3d">
  <button type="button" class="btn btn--principal js-abrir3d">${ICONOS.cubo}Preparar el objeto 3D</button>
  <p class="ayuda">Genera un archivo 3MF a dos colores, o un STL y un OpenSCAD paramétrico. Se carga solo al pulsar porque pesa.</p>
</div>`;
  }

  /* ----- nodos y eventos ----- */

  cachearNodos() {
    const q = (s) => this.raiz.querySelector(s);
    this.n = {
      canvas: q('.js-canvas'),
      caja: q('.js-caja'),
      vacio: q('.js-vacio'),
      avisos: q('.js-avisos'),
      meta: q('.js-meta'),
      campos: q('.js-campos'),
      ayuda: q('.js-ayuda'),
      selectorTipo: q('.js-selector-tipo'),
      panel3d: q('.js-panel3d'),
      distancia: q('.js-distancia'),
    };
  }

  enlazarEventos() {
    const r = this.raiz;
    const on = (sel, ev, fn) => r.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));

    this.pintarSelectorTipo();
    this.pintarCampos();

    // Paso 2
    const cc = r.querySelector('.js-color-codigo'), cch = r.querySelector('.js-color-codigo-hex');
    const cf = r.querySelector('.js-color-fondo'), cfh = r.querySelector('.js-color-fondo-hex');
    cc.value = this.opciones.colorCodigo; cch.value = this.opciones.colorCodigo;
    cf.value = this.opciones.colorFondo; cfh.value = this.opciones.colorFondo;
    const sincronizar = (color, hex, clave) => {
      color.addEventListener('input', () => { this.opciones[clave] = color.value; hex.value = color.value; this.actualizar(); });
      hex.addEventListener('input', () => {
        const v = hex.value.trim();
        if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
          this.opciones[clave] = v.startsWith('#') ? v : '#' + v;
          color.value = this.opciones[clave];
          this.actualizar();
        }
      });
    };
    sincronizar(cc, cch, 'colorCodigo');
    sincronizar(cf, cfh, 'colorFondo');

    r.querySelector('.js-transparente').addEventListener('change', (e) => {
      this.opciones.fondoTransparente = e.target.checked;
      this.actualizar();
    });

    on('.js-estilos .opcion', 'click', (e) => {
      this.opciones.estiloModulo = e.currentTarget.dataset.estilo;
      this.marcarActivo('.js-estilos .opcion', 'estilo', this.opciones.estiloModulo);
      this.actualizar();
    });
    this.marcarActivo('.js-estilos .opcion', 'estilo', this.opciones.estiloModulo);

    r.querySelector('.js-ojo-marco').value = this.opciones.estiloOjoMarco;
    r.querySelector('.js-ojo-centro').value = this.opciones.estiloOjoCentro;
    r.querySelector('.js-ojo-marco').addEventListener('change', (e) => { this.opciones.estiloOjoMarco = e.target.value; this.actualizar(); });
    r.querySelector('.js-ojo-centro').addEventListener('change', (e) => { this.opciones.estiloOjoCentro = e.target.value; this.actualizar(); });

    const ojoColor = r.querySelector('.js-ojo-color');
    ojoColor.value = this.opciones.colorOjo || this.opciones.colorCodigo;
    r.querySelector('.js-ojo-color-on').addEventListener('change', (e) => {
      ojoColor.hidden = !e.target.checked;
      this.opciones.colorOjo = e.target.checked ? ojoColor.value : null;
      this.actualizar();
    });
    ojoColor.addEventListener('input', () => { this.opciones.colorOjo = ojoColor.value; this.actualizar(); });

    on('.js-emojis .opcion', 'click', (e) => {
      this.emoji = e.currentTarget.dataset.emoji;
      this.marcarActivo('.js-emojis .opcion', 'emoji', this.emoji);
      this.aplicarEmoji();
    });
    this.marcarActivo('.js-emojis .opcion', 'emoji', this.emoji);

    r.querySelector('.js-logo').addEventListener('change', (e) => this.cargarLogo(e.target.files[0]));

    const marcoOn = r.querySelector('.js-marco-on'), marcoTexto = r.querySelector('.js-marco-texto');
    marcoOn.checked = this.conMarco;
    marcoTexto.value = this.ctaTexto;
    marcoTexto.hidden = !this.conMarco;
    marcoOn.addEventListener('change', (e) => {
      this.conMarco = e.target.checked;
      marcoTexto.hidden = !this.conMarco;
      this.actualizar();
    });
    marcoTexto.addEventListener('input', () => { this.ctaTexto = marcoTexto.value; this.actualizar(); });

    on('.js-ecl .opcion', 'click', (e) => {
      this.ecl = e.currentTarget.dataset.ecl;
      this.marcarActivo('.js-ecl .opcion', 'ecl', this.ecl);
      this.actualizar();
    });
    this.marcarActivo('.js-ecl .opcion', 'ecl', this.ecl);

    const margen = r.querySelector('.js-margen');
    margen.value = this.opciones.margen;
    r.querySelector('.js-margen-valor').textContent = this.opciones.margen;
    margen.addEventListener('input', () => {
      this.opciones.margen = Number(margen.value);
      r.querySelector('.js-margen-valor').textContent = margen.value;
      this.actualizar();
    });

    // Paso 3
    on('.js-png', 'click', (e) => this.descargar('png', Number(e.currentTarget.dataset.px)));
    r.querySelector('.js-svg').addEventListener('click', () => this.descargar('svg'));
    r.querySelector('.js-jpg').addEventListener('click', () => this.descargar('jpg'));
    r.querySelector('.js-png-rapido').addEventListener('click', () => this.descargar('png', 1024));
    r.querySelector('.js-svg-rapido').addEventListener('click', () => this.descargar('svg'));

    r.querySelector('.js-a4-imprimir').addEventListener('click', () => {
      const n = Number(r.querySelector('.js-a4-copias').value);
      registrarEvento('descarga', { formato: 'a4-imprimir', copias: n });
      if (!imprimirHojaA4([{ matriz: this.matriz, opciones: this.opcionesPintado() }], n, false)) {
        avisar('Tu navegador ha bloqueado la ventana de impresión. Descarga el SVG.');
      }
    });
    r.querySelector('.js-a4-svg').addEventListener('click', () => {
      const n = Number(r.querySelector('.js-a4-copias').value);
      registrarEvento('descarga', { formato: 'a4-svg', copias: n });
      descargarHojaA4([{ matriz: this.matriz, opciones: this.opcionesPintado() }], n, this.contenido, false);
    });

    const ladoMm = r.querySelector('.js-lado-mm');
    const refrescarDistancia = () => {
      const d = distanciaLectura(Number(ladoMm.value) || 40);
      this.n.distancia.textContent = `${d.texto}. Regla: la distancia útil es unas diez veces el lado impreso.`;
    };
    ladoMm.addEventListener('input', refrescarDistancia);
    refrescarDistancia();

    r.querySelector('.js-abrir3d').addEventListener('click', () => this.abrir3D());
  }

  marcarActivo(selector, clave, valor) {
    this.raiz.querySelectorAll(selector).forEach((el) => {
      el.classList.toggle('es-activo', el.dataset[clave] === valor);
    });
  }

  /* ----- paso 1 ----- */

  pintarSelectorTipo() {
    if (this.config.tipoFijo) { this.n.selectorTipo.remove(); return; }
    const claves = this.config.tiposVisibles || Object.keys(TIPOS);
    this.n.selectorTipo.className = 'opciones opciones--tipos js-tipos';
    this.n.selectorTipo.innerHTML = claves
      .map((k) => `<button type="button" class="opcion" data-tipo="${k}" data-pista="${esc(TIPOS[k].pista || '')}">${esc(TIPOS[k].nombre)}</button>`).join('');
    this.n.selectorTipo.addEventListener('click', (e) => {
      const b = e.target.closest('.opcion');
      if (!b) return;
      this.tipo = b.dataset.tipo;
      this.valores = valoresPorDefecto(this.tipo);
      this.ctaTexto = TIPOS[this.tipo].cta || 'ESCANEAME';
      this.raiz.querySelector('.js-marco-texto').value = this.ctaTexto;
      this.marcarActivo('.js-tipos .opcion', 'tipo', this.tipo);
      this.pintarCampos();
      this.actualizar();
    });
    this.marcarActivo('.js-tipos .opcion', 'tipo', this.tipo);
  }

  pintarCampos() {
    const def = TIPOS[this.tipo];
    this.n.campos.innerHTML = def.campos.map((c) => this.plantillaCampo(c)).join('');
    this.n.ayuda.textContent = def.ayuda || '';
    this.n.campos.querySelectorAll('[data-campo]').forEach((el) => {
      const id = el.dataset.campo;
      const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        this.valores[id] = el.type === 'checkbox' ? el.checked : el.value;
        this.actualizar();
      });
    });
  }

  plantillaCampo(c) {
    const v = this.valores[c.id] ?? '';
    const base = `data-campo="${c.id}"`;
    if (c.tipo === 'checkbox') {
      return `<label class="interruptor"><input type="checkbox" ${base}${v ? ' checked' : ''}><span>${esc(c.etiqueta)}</span></label>`;
    }
    let control;
    if (c.tipo === 'select') {
      control = `<select ${base}>${c.opciones.map(([val, txt]) => `<option value="${esc(val)}"${val === v ? ' selected' : ''}>${esc(txt)}</option>`).join('')}</select>`;
    } else if (c.tipo === 'textarea') {
      control = `<textarea ${base} rows="3" placeholder="${esc(c.placeholder || '')}">${esc(v)}</textarea>`;
    } else {
      control = `<input type="${c.tipo}" ${base} value="${esc(v)}" placeholder="${esc(c.placeholder || '')}"${c.requerido ? ' required' : ''}>`;
    }
    return `<label class="campo${c.ancho === 'corto' ? ' campo--corto' : ''}"><span>${esc(c.etiqueta)}</span>${control}</label>`;
  }

  validarPaso(paso) {
    if (paso !== 'contenido') return true;
    const faltan = camposFaltantes(this.tipo, this.valores);
    if (faltan.length) return `Completa: ${faltan.join(', ')}.`;
    return true;
  }

  /* ----- logo ----- */

  aplicarEmoji() {
    if (!this.emoji) { this.opciones.logo = null; this.ecl = this.config.ecl || 'M'; this.actualizar(); return; }
    const lado = 256;
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const ctx = c.getContext('2d');
    ctx.font = `${Math.round(lado * 0.78)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, lado / 2, lado / 2 + lado * 0.04);
    this.ponerLogo(c);
  }

  async cargarLogo(archivo) {
    if (!archivo) return;
    if (archivo.size > 2 * 1024 * 1024) { avisar('El logo pesa más de 2 MB. Usa una imagen más ligera.'); return; }
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      this.emoji = '';
      this.marcarActivo('.js-emojis .opcion', 'emoji', '');
      this.ponerLogo(img);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { avisar('No se ha podido leer esa imagen.'); URL.revokeObjectURL(url); };
    img.src = url;
  }

  ponerLogo(imagen) {
    this.opciones.logo = { imagen, escala: 0.22 };
    this.ecl = 'H';                       // con logo, corrección alta obligatoria
    this.marcarActivo('.js-ecl .opcion', 'ecl', this.ecl);
    this.actualizar();
  }

  /* ----- ciclo de actualizacion ----- */

  opcionesPintado() {
    return {
      ...this.opciones,
      marco: this.conMarco ? { estilo: 'redondeado', texto: this.ctaTexto, color: this.opciones.colorCodigo, colorTexto: '#FFFFFF' } : null,
    };
  }

  actualizar() {
    const faltan = camposFaltantes(this.tipo, this.valores);
    const contenido = faltan.length ? '' : serializar(this.tipo, this.valores);

    if (!contenido) {
      this.contenido = '';
      this.mostrarVacio(faltan.length
        ? `Falta ${faltan.map((f) => f.toLowerCase()).join(' y ')}.`
        : '');
      return;
    }

    this.contenido = contenido;
    try {
      this.matriz = encode(contenido, { ecl: this.ecl, boost: !this.opciones.logo });
    } catch (e) {
      this.mostrarVacio('El contenido es demasiado largo para un código QR. Acórtalo.');
      return;
    }

    const opts = this.opcionesPintado();
    const lienzo = calcularLienzo(this.matriz.size, opts);
    const escala = Math.min(12, Math.max(4, Math.round(560 / lienzo.ancho)));
    pintarCanvas(this.n.canvas, this.matriz, opts, escala);
    this.mostrarCodigo();

    this.n.meta.textContent =
      `Versión ${this.matriz.version} · ${this.matriz.size}x${this.matriz.size} módulos · corrección ${this.matriz.ecl} · ${contenido.length} caracteres`;

    this.pintarAvisosColor();
    this.guardarEnURL();

    clearTimeout(this._t);
    this._t = setTimeout(() => this.verificar(), 320);
  }

  pintarAvisosColor() {
    const d = diagnosticoColor(this.opciones.colorCodigo, this.opciones.colorFondo);
    this.avisosColor = [...d.avisos, ...diagnosticoEstructura(this.opciones)];
    this.pintarAvisos(this.avisosColor);
    const ayuda = this.raiz.querySelector('.js-ecl-ayuda');
    if (ayuda) ayuda.textContent = (NIVELES.find(([n]) => n === this.matriz.ecl) || NIVELES[1])[1];
  }

  pintarAvisos(lista) {
    this.n.avisos.innerHTML = lista.map((a) =>
      `<p class="aviso aviso--${a.nivel}">${a.nivel === 'error' ? ICONOS.error : ICONOS.alerta}<span>${esc(a.texto)}</span></p>`).join('');
    const bloquea = lista.some((a) => a.nivel === 'error');
    this.habilitarDescargas(!bloquea);
  }

  habilitarDescargas(activas) {
    this.raiz.querySelectorAll('.js-png, .js-svg, .js-jpg, .js-png-rapido, .js-svg-rapido, .js-a4-imprimir, .js-a4-svg, .js-abrir3d')
      .forEach((b) => { b.disabled = !activas; });
  }

  /** Estado vacío: el sitio dice qué falta en vez de mostrar una caja en blanco. */
  mostrarVacio(motivo) {
    this.matriz = null;
    this.n.caja.classList.add('es-vacia');
    this.n.vacio.hidden = false;
    this.n.canvas.hidden = true;
    this.n.meta.textContent = motivo;
    this.n.avisos.innerHTML = '';
    this.habilitarDescargas(false);
  }

  mostrarCodigo() {
    this.n.caja.classList.remove('es-vacia');
    this.n.vacio.hidden = true;
    this.n.canvas.hidden = false;
  }

  /**
   * Dos comprobaciones distintas, con consecuencias distintas:
   *
   *  1. El código SIN decoración. Aquí se mide lo que de verdad rompe un QR:
   *     contenido demasiado largo, logo que tapa de más, margen recortado o
   *     contraste insuficiente. Si esto falla, se bloquea la descarga.
   *  2. El código TAL COMO se ve. Los estilos con módulos separados son
   *     legibles para un móvil actual pero hacen tropezar a los lectores más
   *     simples, así que esto solo avisa.
   */
  async verificar() {
    if (!this.contenido || !this.matriz) return;
    const opts = this.opcionesPintado();

    const sinDecorar = {
      ...opts,
      estiloModulo: 'clasico',
      estiloOjoMarco: 'cuadrado',
      estiloOjoCentro: 'cuadrado',
      colorOjo: null,
      gradiente: null,
      marco: null,
    };
    const base = await verificarEscaneo(canvasATamano(this.matriz, sinDecorar, 480), this.contenido, {
      opciones: opts, matriz: this.matriz,
    });

    let avisosEstilo = [];
    if (base.ok) {
      const estilado = [360, 520, 760].map((px) => canvasATamano(this.matriz, opts, px));
      const r = await verificarEstilo(estilado, this.contenido, opts);
      avisosEstilo = r.avisos;
      this.estiloOk = r.ok;
    }

    this.pintarAvisos([...(this.avisosColor || []), ...base.avisos, ...avisosEstilo]);
    this.escaneoOk = base.ok;
  }

  /* ----- descargas ----- */

  async descargar(formato, px = 1024) {
    if (!this.contenido) { avisar('Primero completa el contenido.'); return; }
    const opts = this.opcionesPintado();
    registrarEvento('descarga', { formato, tamano: px, tipo: this.tipo });
    this.anotarHistorial();
    if (formato === 'png') await descargarPNG(this.matriz, opts, this.contenido, px);
    else if (formato === 'jpg') await descargarJPG(this.matriz, opts, this.contenido, px);
    else descargarSVG(this.matriz, opts, this.contenido, await this.logoDataURL());
  }

  async logoDataURL() {
    if (!this.opciones.logo) return null;
    const img = this.opciones.logo.imagen;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    c.getContext('2d').drawImage(img, 0, 0, 256, 256);
    return c.toDataURL('image/png');
  }

  anotarHistorial() {
    if (!historial.disponible()) return;
    try {
      const mini = canvasATamano(this.matriz, this.opcionesPintado(), 96).toDataURL('image/png');
      historial.guardar({
        tipo: this.tipo, valores: this.valores, contenido: this.contenido,
        opciones: { ...this.opciones, logo: undefined }, miniatura: mini,
      });
    } catch { /* historial es opcional */ }
  }

  /* ----- paso 3: objeto 3D ----- */

  async abrir3D() {
    if (!this.contenido) { avisar('Primero completa el contenido.'); return; }
    const panel = this.n.panel3d;
    panel.innerHTML = `<p class="cargando">${ICONOS.cubo}Cargando el módulo 3D…</p>`;
    registrarEvento('abrir_3d', { objeto: this.opciones3d.objeto });
    try {
      this.mod3d = await import('./qr3d.js');
      const { Panel3D } = await import('./panel3d.js');
      this.panel3d = new Panel3D(panel, this);
      await this.panel3d.montar();
    } catch (e) {
      panel.innerHTML = `<p class="aviso aviso--error">No se ha podido cargar el módulo 3D. Recarga la página e intentalo otra vez.</p>`;
    }
  }

  alCambiarPaso(paso) {
    if (paso === 'descarga') montarBloques(this.raiz);
    if (paso === 'descarga' && this.panel3d) this.panel3d.refrescar();
  }
}

/* ---------- API publica ---------- */

export const QRApp = {
  /**
   * @param {object} config
   * @param {string} [config.tipo='enlace']       tipo preseleccionado
   * @param {boolean} [config.tipoFijo=false]     oculta el selector de tipo
   * @param {string[]} [config.tiposVisibles]     limita el selector
   * @param {object} [config.valores]             valores iniciales del formulario
   * @param {object} [config.plantilla]           colores y estilo por defecto
   * @param {string} [config.cta]                 texto del marco
   * @param {boolean} [config.marco=false]        marco activado de inicio
   * @param {string} [config.ecl='M']             corrección de errores
   * @param {string} [config.objeto3d]            objeto 3D preseleccionado
   * @param {string} [config.raiz='#qr-app']
   */
  init(config = {}) {
    const raiz = document.querySelector(config.raiz || '#qr-app');
    if (!raiz) return null;
    const app = new Aplicacion(raiz, config);
    app.montar();
    window.__qrApp = app;
    return app;
  },
};

export default QRApp;
