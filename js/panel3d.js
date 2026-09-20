/* panel3d.js — Interfaz del objeto 3D: elección de pieza, validador,
 * visor y descargas. Se carga solo cuando el usuario pulsa el boton.
 */

import {
  OBJETOS, MODOS_RELIEVE, generarGeometria, construir3MF, construirSTLCombinado,
  construirSTL, construirOpenSCAD, validarImprimibilidad, cambioFilamento,
  parametrosImpresion, vistaCenital,
} from './qr3d.js';
import { Visor3D, hayWebGL } from './preview3d.js';
import { descargarBlob, nombreArchivo } from './export2d.js';
import { decodificarCanvas } from './validar.js';
import { registrarEvento, avisar } from './pasos.js';
import { ICONOS } from './iconos.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Siluetas de cada pieza. Un nombre en una lista no dice si el llavero es
   cuadrado o si el posavasos es redondo; la silueta si. Dibujadas a mano y no
   con un glifo, para que hereden el color del tema y se vean igual en todas
   las plataformas. */
const svg = (c) => `<svg width="38" height="30" viewBox="0 0 38 30" fill="none"`
  + ` stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"`
  + ` stroke-linecap="round" aria-hidden="true" focusable="false">${c}</svg>`;

const DIBUJOS = {
  'placa-mesa': svg('<rect x="10" y="4" width="18" height="18" rx="1.5"/><path d="M13 22v3.5M25 22v3.5M9 25.5h20"/>'),
  'llavero': svg('<rect x="11" y="6" width="18" height="18" rx="2"/><circle cx="7.5" cy="9.5" r="2.6"/><path d="M10 9.5h1"/>'),
  'iman-nevera': svg('<rect x="10" y="5" width="18" height="18" rx="1.5"/><circle cx="19" cy="14" r="3.4" stroke-dasharray="2 2"/>'),
  'tarjeta-visita': svg('<rect x="4" y="8" width="30" height="14" rx="1.6"/><rect x="7" y="11" width="8" height="8" rx="1"/>'),
  'posavasos': svg('<circle cx="19" cy="15" r="11"/><rect x="13" y="9" width="12" height="12" rx="1"/>'),
  'placa-pared': svg('<rect x="9" y="4" width="20" height="22" rx="1.5"/><circle cx="12.5" cy="7.5" r="1"/><circle cx="25.5" cy="7.5" r="1"/><circle cx="12.5" cy="22.5" r="1"/><circle cx="25.5" cy="22.5" r="1"/>'),
  'atril': svg('<path d="M12 24h16l2-17H14Z"/><rect x="16" y="10.5" width="8" height="8" rx="0.8"/><path d="M9 26.5h20M28 24l4 2.5"/>'),
  'cubo': svg('<path d="M19 3 31 9v12l-12 6-12-6V9Z"/><path d="M7 9l12 6 12-6M19 15v12"/>'),
};

export class Panel3D {
  constructor(contenedor, app) {
    this.el = contenedor;
    this.app = app;
    this.o = app.opciones3d;
    this.geo = null;
    this.visor = null;
  }

  async montar() {
    this.el.innerHTML = this.plantilla();
    this.enlazar();
    await this.regenerar();
  }

  plantilla() {
    return `
<fieldset class="piezas">
  <legend>Elige la pieza</legend>
  <div class="piezas__rejilla js-piezas">
    ${Object.entries(OBJETOS).map(([k, v]) => `
    <button type="button" class="pieza${k === this.o.objeto ? ' pieza--activa' : ''}"
      data-objeto="${k}" aria-pressed="${k === this.o.objeto}"
      data-pista="${esc(v.pista || '')}">
      <span class="pieza__dibujo" aria-hidden="true">${DIBUJOS[k] || ''}</span>
      <span class="pieza__nombre">${esc(v.nombre)}</span>
      <span class="pieza__medida">${esc(v.forma === 'circulo' ? `${v.ancho} mm ⌀` : `${v.ancho} × ${v.alto} mm`)}</span>
    </button>`).join('')}
  </div>
</fieldset>

<div class="rejilla-2">
  <label class="campo" data-pista="Si los módulos sobresalen, se hunden o atraviesan la pieza. El positivo es el que mejor lee: la sombra del relieve refuerza el contraste."><span>Relieve</span>
    <select class="js-modo">
      ${Object.entries(MODOS_RELIEVE).map(([k, v]) =>
        `<option value="${k}"${k === this.o.modo ? ' selected' : ''}>${esc(v.nombre)}</option>`).join('')}
    </select>
  </label>
</div>
<p class="ayuda js-modo-ayuda">${esc(MODOS_RELIEVE[this.o.modo].descripcion)}</p>

<div class="rejilla-2">
  <label class="campo"><span>Altura del relieve: <b class="js-relieve-valor">${this.o.alturaRelieve}</b> mm</span>
    <input type="range" class="js-relieve" min="0.4" max="2" step="0.2" value="${this.o.alturaRelieve}" data-pista="Cuánto sobresalen los módulos. Hacen falta al menos tres capas: con menos, la sombra es tan leve que la cámara no los distingue.">
  </label>
  <label class="campo" data-pista="El diámetro de la boquilla de tu impresora, normalmente 0,4 mm. Con este dato comprobamos que ningún módulo salga más fino de lo que tu máquina puede imprimir."><span>Boquilla</span>
    <select class="js-boquilla">
      ${[0.2, 0.4, 0.6, 0.8].map((b) => `<option value="${b}"${b === this.o.boquilla ? ' selected' : ''}>${b} mm</option>`).join('')}
    </select>
  </label>
</div>

<div class="rejilla-2">
  <label class="campo" data-pista="El filamento del cuerpo de la pieza. El claro va abajo y el oscuro en los módulos: es el orden que permite imprimir a dos colores con una sola boquilla."><span>Color de la base</span>
    <input type="color" class="js-color-base" value="${this.o.colorBase}">
  </label>
  <label class="campo" data-pista="El filamento de los módulos. Comprobamos el contraste entre los dos colores antes de dejarte exportar: un código impreso con poco contraste no escanea."><span>Color del código</span>
    <input type="color" class="js-color-codigo3d" value="${this.o.colorCodigo}">
  </label>
</div>

<div class="visor3d js-visor" aria-label="Vista previa del objeto 3D"></div>
<div class="botonera botonera--fina">
  <button type="button" class="btn btn--fino js-vista-superior">Vista cenital</button>
  <button type="button" class="btn btn--fino js-verificar">Comprobar que escanea</button>
</div>

<div class="js-validador"></div>
<div class="js-ayuda-impresion"></div>

<h3 class="sub">Descargar el modelo</h3>
<div class="botonera">
  <button type="button" class="btn btn--principal js-3mf">${ICONOS.descarga}3MF a dos colores</button>
  <button type="button" class="btn btn--fino js-stl">${ICONOS.descarga}STL</button>
  <button type="button" class="btn btn--fino js-stl2">${ICONOS.descarga}STL por colores</button>
  <button type="button" class="btn btn--fino js-scad">${ICONOS.descarga}OpenSCAD</button>
</div>
<p class="ayuda">El 3MF llega al laminador con los dos colores ya asignados. El OpenSCAD trae las medidas como variables por si quieres tocarlas.</p>`;
  }

  enlazar() {
    const q = (s) => this.el.querySelector(s);
    q('.js-piezas').addEventListener('click', (e) => {
      const b = e.target.closest('.pieza');
      if (!b || b.dataset.objeto === this.o.objeto) return;
      this.o.objeto = b.dataset.objeto;
      for (const otro of this.el.querySelectorAll('.pieza')) {
        const activa = otro === b;
        otro.classList.toggle('pieza--activa', activa);
        otro.setAttribute('aria-pressed', String(activa));
      }
      this.regenerar();
    });
    q('.js-modo').addEventListener('change', (e) => {
      this.o.modo = e.target.value;
      q('.js-modo-ayuda').textContent = MODOS_RELIEVE[this.o.modo].descripcion;
      this.regenerar();
    });
    q('.js-boquilla').addEventListener('change', (e) => { this.o.boquilla = Number(e.target.value); this.regenerar(); });
    const rel = q('.js-relieve');
    rel.addEventListener('input', () => {
      this.o.alturaRelieve = Number(rel.value);
      q('.js-relieve-valor').textContent = rel.value;
    });
    rel.addEventListener('change', () => this.regenerar());
    q('.js-color-base').addEventListener('input', (e) => { this.o.colorBase = e.target.value; this.repintar(); });
    q('.js-color-codigo3d').addEventListener('input', (e) => { this.o.colorCodigo = e.target.value; this.repintar(); });

    q('.js-vista-superior').addEventListener('click', () => this.visor?.vistaSuperior());
    q('.js-verificar').addEventListener('click', () => this.verificarMalla());

    q('.js-3mf').addEventListener('click', () => this.descargar('3mf'));
    q('.js-stl').addEventListener('click', () => this.descargar('stl'));
    q('.js-stl2').addEventListener('click', () => this.descargar('stl-colores'));
    q('.js-scad').addEventListener('click', () => this.descargar('scad'));
  }

  async regenerar() {
    const matriz = this.app.matriz;
    if (!matriz) return;
    const t0 = performance.now();
    this.geo = generarGeometria(matriz, this.o);
    const ms = Math.round(performance.now() - t0);

    this.pintarValidador();
    this.pintarAyudaImpresion(ms);
    await this.repintar();
  }

  async repintar() {
    if (!this.geo) return;
    const caja = this.el.querySelector('.js-visor');
    if (!hayWebGL()) {
      caja.innerHTML = '<p class="nota">Tu navegador no tiene WebGL, así que no se puede mostrar la vista 3D. La descarga del modelo funciona igual.</p>';
      return;
    }
    if (!this.visor) this.visor = new Visor3D(caja);
    await this.visor.mostrar(this.geo, this.o.colorBase, this.o.colorCodigo);
  }

  pintarValidador() {
    const v = validarImprimibilidad(this.app.matriz, this.o);
    this.validacion = v;
    const filas = v.comprobaciones.map((c) => `
      <li class="chequeo chequeo--${c.ok ? 'ok' : 'error'}">
        ${c.ok ? ICONOS.ok : ICONOS.error}
        <b>${esc(c.nombre)}</b>
        <span class="chequeo__valor">${esc(c.valor)} <i>(mín. ${esc(c.umbral)})</i></span>
        <span class="chequeo__msg">${esc(c.mensaje)}</span>
      </li>`).join('');
    this.el.querySelector('.js-validador').innerHTML = `
      <h3 class="sub">Comprobación de imprimibilidad</h3>
      <p class="ayuda">Se calcula con tu contenido y tu boquilla, no con valores genéricos.</p>
      <ul class="chequeos">${filas}</ul>`;

    for (const b of this.el.querySelectorAll('.js-3mf, .js-stl, .js-stl2')) b.disabled = !v.ok;
  }

  pintarAyudaImpresion(ms) {
    const cambio = cambioFilamento(this.o);
    const params = parametrosImpresion(this.o);
    const nTri = this.geo.base.numTriangulos + this.geo.codigo.numTriangulos;
    this.el.querySelector('.js-ayuda-impresion').innerHTML = `
      <div class="caja-destacada">
        <b>${esc(cambio.titulo)}</b>
        <p>${esc(cambio.aplica ? cambio.instruccion : cambio.nota)}</p>
        ${cambio.aplica
          ? '<button type="button" class="btn btn--fino js-copiar-m600">Copiar la instrucción</button>'
          : ''}
      </div>
      <h3 class="sub">Parámetros sugeridos</h3>
      <table class="tabla-params">
        ${params.map(([k, val]) => `<tr><th>${esc(k)}</th><td>${esc(val)}</td></tr>`).join('')}
      </table>
      <p class="nota">Malla generada en ${ms} ms · ${nTri.toLocaleString('es')} triángulos.</p>`;

    this.el.querySelector('.js-copiar-m600')?.addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(cambio.instruccion);
        e.target.textContent = 'Copiado';
        setTimeout(() => { e.target.textContent = 'Copiar la instrucción'; }, 1800);
      } catch { avisar('Tu navegador no deja copiar automáticamente. Selecciona el texto a mano.'); }
    });
  }

  /** Lee el código directamente sobre la geometría generada, no sobre el PNG. */
  async verificarMalla() {
    if (!this.geo) return;
    const boton = this.el.querySelector('.js-verificar');
    boton.disabled = true;
    boton.textContent = 'Comprobando…';
    try {
      const canvas = vistaCenital(this.geo, this.o, 700);
      const leido = await decodificarCanvas(canvas);
      const ok = leido === this.app.contenido;
      registrarEvento('verificar_3d', { resultado: ok ? 'ok' : 'fallo', objeto: this.o.objeto });
      avisar(
        ok
          ? 'Correcto: la pieza generada se lee y devuelve tu contenido.'
          : 'La pieza no se lee en la vista cenital. Sube la corrección a H, agranda el objeto o cambia a relieve positivo.',
        ok ? 'ok' : 'error'
      );
    } finally {
      boton.disabled = false;
      boton.textContent = 'Comprobar que escanea';
    }
  }

  async descargar(formato) {
    if (!this.geo) return;
    const contenido = this.app.contenido;
    registrarEvento('descarga_3d', { formato, objeto: this.o.objeto, modo: this.o.modo });
    this.app.anotarHistorial();

    if (formato === '3mf') {
      const blob = await construir3MF(this.geo, this.o);
      descargarBlob(blob, nombreArchivo(contenido, '3mf', this.o.objeto));
    } else if (formato === 'stl') {
      descargarBlob(construirSTLCombinado(this.geo), nombreArchivo(contenido, 'stl', this.o.objeto));
    } else if (formato === 'stl-colores') {
      descargarBlob(construirSTL(this.geo.base, 'base'), nombreArchivo(contenido, 'stl', this.o.objeto + '-base'));
      setTimeout(() => {
        descargarBlob(construirSTL(this.geo.codigo, 'codigo'), nombreArchivo(contenido, 'stl', this.o.objeto + '-codigo'));
      }, 400);
    } else {
      const texto = construirOpenSCAD(this.app.matriz, this.o);
      descargarBlob(new Blob([texto], { type: 'text/plain' }), nombreArchivo(contenido, 'scad', this.o.objeto));
    }
  }

  refrescar() { this.visor?.redimensionar(); }
}
