/* lotes.js — Herramienta de /qr-por-lotes/.
 *
 * Un CSV entra, un ZIP sale. Cuarenta mesas de restaurante numeradas en un
 * minuto, en vez de repetir el generador cuarenta veces.
 *
 * La generación va por tandas en el hilo principal, cediendo el control entre
 * cada tanda para que la barra de progreso avance de verdad y la pestaña no se
 * quede congelada. Un Web Worker exigiría OffscreenCanvas, que deja fuera a
 * navegadores que este público sí usa.
 */

import { encode } from './qr-core.js';
import { pintarCanvas, pintarSVG, calcularLienzo } from './qr-render.js';
import { crearZip } from './qr3d.js';
import { descargarBlob, hojaA4SVG } from './export2d.js';
import { aRegistros, PLANTILLA_CSV, EJEMPLOS } from './csv.js';
import { registrarEvento, avisar } from './pasos.js';
import { ICONOS } from './iconos.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAXIMO = 500;
const ceder = () => new Promise((r) => setTimeout(r, 0));

/** Nombre de archivo seguro y ordenable dentro del ZIP. */
function nombreEntrada(registro, i, total, extension) {
  const ancho = String(total).length;
  const num = String(i + 1).padStart(ancho, '0');
  const base = (registro.etiqueta || registro.contenido)
    .replace(/^https?:\/\//, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .toLowerCase() || 'codigo';
  return `${num}-${base}.${extension}`;
}

class Lotes {
  constructor(raiz) {
    this.raiz = raiz;
    this.registros = [];
    this.generando = false;
  }

  montar() {
    this.raiz.innerHTML = `
<div class="herramienta">
  <div class="tarjeta">
    <h2 class="tarjeta__titulo">1. Tus datos</h2>
    <p class="ayuda">Una fila por código. La columna <code>contenido</code> es lo que abrirá cada QR;
      <code>etiqueta</code> es opcional y se usa para nombrar el archivo y para el texto de la hoja A4.</p>

    <div class="botonera botonera--fina">
      <label class="btn btn--secundario">Subir un CSV
        <input type="file" class="js-archivo" accept=".csv,text/csv,text/plain" hidden>
      </label>
      <button type="button" class="btn btn--fino js-plantilla">Descargar plantilla</button>
      ${Object.entries(EJEMPLOS).map(([k, v]) =>
        `<button type="button" class="btn btn--fino js-ejemplo" data-ejemplo="${k}">${esc(v.nombre)}</button>`).join('')}
    </div>

    <label class="campo">
      <span>O pega aquí las filas</span>
      <textarea class="js-csv" rows="8" spellcheck="false"
        placeholder="contenido,etiqueta&#10;https://mirestaurante.pe/carta,Mesa 1&#10;https://mirestaurante.pe/carta,Mesa 2"></textarea>
    </label>

    <div class="js-avisos avisos-lector" role="status" aria-live="polite"></div>
    <div class="js-vista-previa"></div>
  </div>

  <div class="tarjeta">
    <h2 class="tarjeta__titulo">2. Qué generar</h2>
    <fieldset class="grupo" style="border-top:0;margin-top:0;padding-top:0">
      <legend>Formatos</legend>
      <label class="interruptor"><input type="checkbox" class="js-png" checked><span>PNG (1024 px)</span></label>
      <label class="interruptor"><input type="checkbox" class="js-svg"><span>SVG vectorial</span></label>
      <label class="interruptor"><input type="checkbox" class="js-a4" checked><span>Hojas A4 con marcas de corte</span></label>
    </fieldset>

    <div class="rejilla-2">
      <label class="campo"><span>Códigos por hoja A4</span>
        <select class="js-por-hoja">
          ${[1, 2, 4, 6, 12, 24].map((n) => `<option value="${n}"${n === 6 ? ' selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <label class="campo"><span>Corrección de errores</span>
        <select class="js-ecl">
          ${[['M', 'M — normal'], ['Q', 'Q — para impresión'], ['H', 'H — máxima']].map(([v, t]) =>
            `<option value="${v}"${v === 'Q' ? ' selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
      </label>
    </div>

    <div class="rejilla-2">
      <label class="campo"><span>Color del código</span>
        <span class="campo-color"><input type="color" class="js-color" value="#181527"><input type="text" class="js-color-hex" value="#181527" maxlength="7"></span>
      </label>
      <label class="campo"><span>Estilo</span>
        <select class="js-estilo">
          ${[['clasico', 'Clásico'], ['redondeado', 'Redondeado'], ['puntos', 'Puntos']].map(([v, t]) =>
            `<option value="${v}">${esc(t)}</option>`).join('')}
        </select>
      </label>
    </div>
  </div>

  <div class="tarjeta">
    <h2 class="tarjeta__titulo">3. Generar</h2>
    <button type="button" class="btn btn--principal js-generar" disabled>${ICONOS.descarga}Generar el ZIP</button>
    <div class="progreso js-progreso" hidden>
      <div class="progreso__barra"><div class="progreso__relleno js-relleno"></div></div>
      <p class="nota js-progreso-texto"></p>
    </div>
    <p class="ayuda">Todo se genera en tu navegador. Con 500 filas el ZIP puede tardar medio minuto:
      no cierres la pestaña mientras avanza la barra.</p>
  </div>
</div>`;

    this.n = {
      archivo: this.raiz.querySelector('.js-archivo'),
      csv: this.raiz.querySelector('.js-csv'),
      avisos: this.raiz.querySelector('.js-avisos'),
      vista: this.raiz.querySelector('.js-vista-previa'),
      generar: this.raiz.querySelector('.js-generar'),
      progreso: this.raiz.querySelector('.js-progreso'),
      relleno: this.raiz.querySelector('.js-relleno'),
      progresoTexto: this.raiz.querySelector('.js-progreso-texto'),
    };

    this.n.csv.addEventListener('input', () => this.releer());
    this.n.archivo.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      this.n.csv.value = await f.text();
      this.releer();
    });
    this.raiz.querySelector('.js-plantilla').addEventListener('click', () => {
      descargarBlob(new Blob(['﻿' + PLANTILLA_CSV], { type: 'text/csv' }), 'plantilla-qr.csv');
    });
    this.raiz.querySelectorAll('.js-ejemplo').forEach((b) => {
      b.addEventListener('click', () => {
        this.n.csv.value = EJEMPLOS[b.dataset.ejemplo].csv;
        this.releer();
      });
    });

    const color = this.raiz.querySelector('.js-color');
    const hex = this.raiz.querySelector('.js-color-hex');
    color.addEventListener('input', () => { hex.value = color.value; });
    hex.addEventListener('input', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) color.value = hex.value;
    });

    this.n.generar.addEventListener('click', () => this.generarTodo());
  }

  /* ----- lectura ----- */

  releer() {
    const { registros, avisos } = aRegistros(this.n.csv.value, MAXIMO);
    this.registros = registros;

    this.n.avisos.innerHTML = avisos.map((a) =>
      `<p class="aviso aviso--aviso">${ICONOS.alerta}<span>${esc(a)}</span></p>`).join('');

    if (!registros.length) {
      this.n.vista.innerHTML = '';
      this.n.generar.disabled = true;
      return;
    }

    const muestra = registros.slice(0, 5);
    this.n.vista.innerHTML = `
      <h3 class="sub">${registros.length} ${registros.length === 1 ? 'código' : 'códigos'} detectados</h3>
      <table class="tabla-leida tabla-lote">
        <tr><th>#</th><th>Contenido</th><th>Etiqueta</th></tr>
        ${muestra.map((r, i) => `<tr>
          <td>${i + 1}</td>
          <td>${esc(r.contenido.slice(0, 60))}${r.contenido.length > 60 ? '…' : ''}</td>
          <td>${esc(r.etiqueta)}</td></tr>`).join('')}
      </table>
      ${registros.length > muestra.length
        ? `<p class="nota">y ${registros.length - muestra.length} más.</p>` : ''}`;
    this.n.generar.disabled = false;
  }

  opciones() {
    return {
      png: this.raiz.querySelector('.js-png').checked,
      svg: this.raiz.querySelector('.js-svg').checked,
      a4: this.raiz.querySelector('.js-a4').checked,
      porHoja: Number(this.raiz.querySelector('.js-por-hoja').value),
      ecl: this.raiz.querySelector('.js-ecl').value,
      color: this.raiz.querySelector('.js-color').value,
      estilo: this.raiz.querySelector('.js-estilo').value,
    };
  }

  /* ----- generación ----- */

  async generarTodo() {
    if (this.generando || !this.registros.length) return;
    const o = this.opciones();
    if (!o.png && !o.svg && !o.a4) {
      avisar('Elige al menos un formato.');
      return;
    }

    this.generando = true;
    this.n.generar.disabled = true;
    this.n.progreso.hidden = false;
    const t0 = performance.now();
    registrarEvento('lote', { filas: this.registros.length, formatos: [o.png && 'png', o.svg && 'svg', o.a4 && 'a4'].filter(Boolean).join('+') });

    const archivos = {};
    const paraHojas = [];
    const fallidos = [];
    const enc = new TextEncoder();

    const opcionesPintado = {
      colorCodigo: o.color, colorFondo: '#FFFFFF',
      estiloModulo: o.estilo, margen: 4,
    };

    const total = this.registros.length;
    for (let i = 0; i < total; i++) {
      const r = this.registros[i];
      this.avanzar(i, total, `Generando ${i + 1} de ${total}…`);

      let matriz;
      try {
        matriz = encode(r.contenido, { ecl: o.ecl });
      } catch {
        fallidos.push({ fila: i + 1, contenido: r.contenido, motivo: 'contenido demasiado largo' });
        continue;
      }

      const opts = { ...opcionesPintado, colorCodigo: r.color || o.color, estiloModulo: r.estilo || o.estilo };

      if (o.png) {
        const lienzo = calcularLienzo(matriz.size, opts);
        const canvas = document.createElement('canvas');
        pintarCanvas(canvas, matriz, opts, 1024 / lienzo.ancho);
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
        archivos['png/' + nombreEntrada(r, i, total, 'png')] = new Uint8Array(await blob.arrayBuffer());
      }

      if (o.svg) {
        archivos['svg/' + nombreEntrada(r, i, total, 'svg')] = enc.encode(pintarSVG(matriz, opts, 10));
      }

      if (o.a4) paraHojas.push({ matriz, opciones: opts, etiqueta: r.etiqueta });

      if (i % 8 === 7) await ceder();
    }

    // Hojas A4: tantas como hagan falta para repartir todos los códigos.
    if (o.a4 && paraHojas.length) {
      const hojas = Math.ceil(paraHojas.length / o.porHoja);
      const ancho = String(hojas).length;
      for (let h = 0; h < hojas; h++) {
        this.avanzar(total, total, `Componiendo la hoja ${h + 1} de ${hojas}…`);
        const trozo = paraHojas.slice(h * o.porHoja, (h + 1) * o.porHoja);
        archivos[`hojas-a4/hoja-${String(h + 1).padStart(ancho, '0')}.svg`] =
          enc.encode(hojaA4SVG(trozo, o.porHoja, true));
        await ceder();
      }
    }

    if (fallidos.length) {
      archivos['filas-con-error.txt'] = enc.encode(
        'Estas filas no se han podido generar:\n\n'
        + fallidos.map((f) => `Fila ${f.fila}: ${f.motivo}\n  ${f.contenido}`).join('\n\n') + '\n'
      );
    }

    archivos['leeme.txt'] = enc.encode(
      `Códigos QR generados por lotes\n`
      + `${total - fallidos.length} códigos${fallidos.length ? `, ${fallidos.length} con error` : ''}\n`
      + `Corrección de errores: ${o.ecl}\n`
      + (o.a4 ? `Hojas A4: ${o.porHoja} códigos por hoja, con marcas de corte\n` : '')
      + `\nLos SVG son vectoriales: se amplían a cualquier tamaño sin perder nitidez.\n`
      + `Las hojas A4 llevan medidas reales en milímetros; imprímelas al 100%, sin ajustar a la página.\n`
    );

    this.avanzar(total, total, 'Comprimiendo…');
    await ceder();
    const zip = await crearZip(archivos);
    const generados = total - fallidos.length;
    descargarBlob(zip, `codigos-qr-${generados}.zip`);

    const segundos = ((performance.now() - t0) / 1000).toFixed(1);
    this.avanzar(total, total, `Listo: ${generados} ${generados === 1 ? 'código' : 'códigos'} en ${segundos} s.`);
    if (fallidos.length) {
      avisar(`${fallidos.length} ${fallidos.length === 1 ? 'fila no se ha podido generar' : 'filas no se han podido generar'}. Están detalladas en filas-con-error.txt dentro del ZIP.`);
    }

    this.generando = false;
    this.n.generar.disabled = false;
  }

  avanzar(hechos, total, texto) {
    const pct = Math.round((hechos / Math.max(total, 1)) * 100);
    this.n.relleno.style.width = pct + '%';
    this.n.progresoTexto.textContent = texto;
  }
}

export function init(selector = '#herramienta') {
  const raiz = document.querySelector(selector);
  if (!raiz) return null;
  const lotes = new Lotes(raiz);
  lotes.montar();
  return lotes;
}

export default { init };
