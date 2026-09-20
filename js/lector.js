/* lector.js — Herramienta de /leer-qr/.
 *
 * Decodifica un código ya existente: desde la cámara, desde un archivo, desde
 * el portapapeles o arrastrándolo. Todo ocurre en el navegador, igual que el
 * generador: la imagen no se sube a ningún sitio.
 */

import { decodificarImagen } from './validar.js';
import { interpretar, avisosSeguridad } from './interpretar.js';
import { enlaceGenerador } from './estado.js';
import { registrarEvento, avisar } from './pasos.js';
import { ICONOS } from './iconos.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class Lector {
  constructor(raiz) {
    this.raiz = raiz;
    this.flujo = null;      // MediaStream de la cámara
    this.bucle = null;
  }

  montar() {
    this.raiz.innerHTML = `
<div class="herramienta">
  <div class="tarjeta">
    <div class="zona-suelta js-zona" tabindex="0" role="button"
         aria-label="Subir o soltar una imagen con un código QR">
      ${ICONOS.codigoGrande}
      <p class="zona-suelta__titulo">Suelta aquí una imagen con el código</p>
      <p class="zona-suelta__ayuda">También puedes pegarla con Ctrl+V, o subirla desde tu equipo.</p>
      <div class="botonera">
        <label class="btn btn--principal">Subir una imagen
          <input type="file" class="js-archivo" accept="image/*" hidden>
        </label>
        <button type="button" class="btn btn--secundario js-camara">Usar la cámara</button>
      </div>
    </div>

    <div class="camara js-camara-caja" hidden>
      <video class="js-video" playsinline muted aria-label="Vista de la cámara"></video>
      <p class="nota js-estado-camara">Apunta al código. Se lee solo en cuanto entre en el encuadre.</p>
      <button type="button" class="btn btn--secundario js-parar">Parar la cámara</button>
    </div>

    <div class="js-avisos avisos-lector" role="status" aria-live="polite"></div>
    <div class="js-resultado"></div>
  </div>
</div>`;

    this.n = {
      zona: this.raiz.querySelector('.js-zona'),
      archivo: this.raiz.querySelector('.js-archivo'),
      camara: this.raiz.querySelector('.js-camara'),
      cajaCamara: this.raiz.querySelector('.js-camara-caja'),
      video: this.raiz.querySelector('.js-video'),
      estadoCamara: this.raiz.querySelector('.js-estado-camara'),
      parar: this.raiz.querySelector('.js-parar'),
      avisos: this.raiz.querySelector('.js-avisos'),
      resultado: this.raiz.querySelector('.js-resultado'),
    };

    this.n.archivo.addEventListener('change', (e) => {
      if (e.target.files[0]) this.leerArchivo(e.target.files[0]);
    });
    this.n.camara.addEventListener('click', () => this.abrirCamara());
    this.n.parar.addEventListener('click', () => this.cerrarCamara());

    for (const ev of ['dragenter', 'dragover']) {
      this.n.zona.addEventListener(ev, (e) => {
        e.preventDefault();
        this.n.zona.classList.add('es-activa');
      });
    }
    for (const ev of ['dragleave', 'drop']) {
      this.n.zona.addEventListener(ev, () => this.n.zona.classList.remove('es-activa'));
    }
    this.n.zona.addEventListener('drop', (e) => {
      e.preventDefault();
      const archivo = [...(e.dataTransfer.files || [])].find((f) => f.type.startsWith('image/'));
      if (archivo) this.leerArchivo(archivo);
      else this.mostrarAviso('error', 'Eso no era una imagen. Suelta un PNG, JPG o WebP con el código dentro.');
    });
    this.n.zona.addEventListener('click', (e) => {
      if (!e.target.closest('button, label')) this.n.archivo.click();
    });
    this.n.zona.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.n.archivo.click(); }
    });

    document.addEventListener('paste', (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) this.leerArchivo(item.getAsFile());
    });

    window.addEventListener('pagehide', () => this.cerrarCamara());
  }

  /* ----- entrada por archivo ----- */

  async leerArchivo(archivo) {
    if (!archivo) return;
    this.cerrarCamara();
    this.limpiar();
    if (archivo.size > 12 * 1024 * 1024) {
      this.mostrarAviso('error', 'La imagen pesa más de 12 MB. Haz una captura más pequeña o recórtala.');
      return;
    }

    const url = URL.createObjectURL(archivo);
    try {
      const img = await this.cargarImagen(url);
      const leido = await decodificarImagen(img);
      registrarEvento('leer_qr', { origen: 'archivo', resultado: leido ? 'ok' : 'fallo' });
      if (leido) this.mostrarResultado(leido, img);
      else this.mostrarAviso('error',
        'No se encuentra ningún código en esa imagen. Prueba con una foto más nítida, más de frente y con el código entero dentro del encuadre.');
    } catch {
      this.mostrarAviso('error', 'No se ha podido abrir esa imagen.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  cargarImagen(url) {
    return new Promise((resolver, rechazar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = rechazar;
      img.src = url;
    });
  }

  /* ----- entrada por cámara ----- */

  async abrirCamara() {
    this.limpiar();
    if (!navigator.mediaDevices?.getUserMedia) {
      this.mostrarAviso('error', 'Este navegador no da acceso a la cámara. Sube una foto del código.');
      return;
    }
    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      });
    } catch (e) {
      const motivo = e.name === 'NotAllowedError'
        ? 'Has denegado el permiso de cámara. Puedes activarlo desde el icono de la barra de direcciones, o subir una foto.'
        : e.name === 'NotFoundError'
          ? 'No se ha encontrado ninguna cámara en este equipo. Sube una foto del código.'
          : 'No se ha podido abrir la cámara. Sube una foto del código.';
      this.mostrarAviso('error', motivo);
      return;
    }

    this.n.zona.hidden = true;
    this.n.cajaCamara.hidden = false;
    this.n.video.srcObject = this.flujo;
    await this.n.video.play().catch(() => {});
    registrarEvento('leer_qr', { origen: 'camara', resultado: 'abierta' });

    const buscar = async () => {
      if (!this.flujo) return;
      if (this.n.video.readyState >= 2) {
        const leido = await decodificarImagen(this.n.video, 900).catch(() => null);
        if (leido) {
          registrarEvento('leer_qr', { origen: 'camara', resultado: 'ok' });
          const instantanea = this.capturar();
          this.cerrarCamara();
          this.mostrarResultado(leido, instantanea);
          return;
        }
      }
      this.bucle = setTimeout(buscar, 180);
    };
    buscar();
  }

  capturar() {
    const c = document.createElement('canvas');
    c.width = this.n.video.videoWidth || 320;
    c.height = this.n.video.videoHeight || 240;
    c.getContext('2d').drawImage(this.n.video, 0, 0);
    return c;
  }

  cerrarCamara() {
    clearTimeout(this.bucle);
    this.bucle = null;
    if (this.flujo) {
      for (const pista of this.flujo.getTracks()) pista.stop();
      this.flujo = null;
    }
    this.n.video.srcObject = null;
    this.n.cajaCamara.hidden = true;
    this.n.zona.hidden = false;
  }

  /* ----- salida ----- */

  limpiar() {
    this.n.avisos.innerHTML = '';
    this.n.resultado.innerHTML = '';
  }

  mostrarAviso(nivel, texto) {
    this.n.avisos.innerHTML =
      `<p class="aviso aviso--${nivel}">${nivel === 'error' ? ICONOS.error : ICONOS.alerta}<span>${esc(texto)}</span></p>`;
  }

  mostrarResultado(contenido, fuente) {
    const info = interpretar(contenido);
    const avisos = avisosSeguridad(contenido);

    this.n.avisos.innerHTML = avisos.map((a) =>
      `<p class="aviso aviso--${a.nivel}">${a.nivel === 'error' ? ICONOS.error : ICONOS.alerta}<span>${esc(a.texto)}</span></p>`
    ).join('');

    const filas = info.campos.map(([k, v]) =>
      `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');

    this.n.resultado.innerHTML = `
<div class="resultado">
  <div class="resultado__cabecera">
    <span class="etiqueta-tipo">${esc(info.nombre)}</span>
    <button type="button" class="btn btn--fino js-otra">Leer otro</button>
  </div>

  <table class="tabla-leida">${filas}</table>

  <details class="crudo">
    <summary>Ver el contenido exacto</summary>
    <pre class="js-crudo"></pre>
  </details>

  <div class="botonera">
    ${info.abrir ? `<a class="btn btn--principal js-abrir" href="${esc(info.abrir)}" target="_blank" rel="noopener nofollow">Abrir el enlace</a>` : ''}
    <button type="button" class="btn btn--secundario js-copiar">Copiar el contenido</button>
    <a class="btn btn--secundario" href="${esc(enlaceGenerador({ t: info.tipo, v: info.valores }))}">Editar este código</a>
  </div>
  <p class="ayuda">Al editarlo se abre el generador con estos datos ya puestos: cambia lo que quieras y descarga el código nuevo.</p>
</div>`;

    // El contenido crudo se inserta como texto, nunca como HTML.
    this.n.resultado.querySelector('.js-crudo').textContent = contenido;

    if (fuente) {
      const caja = document.createElement('div');
      caja.className = 'resultado__imagen';
      const lienzo = fuente instanceof HTMLCanvasElement ? fuente : this.aCanvas(fuente);
      lienzo.setAttribute('aria-label', 'Imagen leída');
      caja.appendChild(lienzo);
      this.n.resultado.querySelector('.resultado').prepend(caja);
    }

    this.n.resultado.querySelector('.js-otra').addEventListener('click', () => {
      this.limpiar();
      this.n.zona.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    this.n.resultado.querySelector('.js-copiar').addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(contenido);
        e.target.textContent = 'Copiado';
        setTimeout(() => { e.target.textContent = 'Copiar el contenido'; }, 1800);
      } catch {
        avisar('Tu navegador no deja copiar automáticamente. Selecciona el texto a mano.');
      }
    });
  }

  aCanvas(img) {
    const c = document.createElement('canvas');
    const lado = 260;
    const escala = Math.min(lado / img.naturalWidth, lado / img.naturalHeight, 1);
    c.width = Math.round(img.naturalWidth * escala);
    c.height = Math.round(img.naturalHeight * escala);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
}

export function init(selector = '#herramienta') {
  const raiz = document.querySelector(selector);
  if (!raiz) return null;
  const lector = new Lector(raiz);
  lector.montar();
  return lector;
}

export default { init };
