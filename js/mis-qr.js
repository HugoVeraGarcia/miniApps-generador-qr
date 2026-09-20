/* mis-qr.js — Herramienta de /mis-qr/.
 *
 * Lista los últimos códigos generados en este navegador. No hay cuenta ni
 * servidor: si el usuario limpia los datos del sitio o cambia de dispositivo,
 * la lista se vacía, y eso se dice claramente en la página.
 */

import * as historial from './historial.js';
import { interpretar } from './interpretar.js';
import { enlaceGenerador } from './estado.js';
import { registrarEvento, avisar } from './pasos.js';
import { ICONOS } from './iconos.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class MisQR {
  constructor(raiz) {
    this.raiz = raiz;
  }

  montar() {
    this.raiz.innerHTML = '<div class="herramienta js-lista"></div>';
    this.lista = this.raiz.querySelector('.js-lista');
    this.pintar();
  }

  pintar() {
    if (!historial.disponible()) {
      this.lista.innerHTML = `
        <div class="tarjeta">
          <p class="aviso aviso--aviso">${ICONOS.alerta}<span>Tu navegador tiene bloqueado el almacenamiento
          local, o estás en una ventana privada. El generador funciona igual, pero aquí no se puede
          guardar nada.</span></p>
        </div>`;
      return;
    }

    const entradas = historial.listar();
    registrarEvento('ver_historial', { guardados: entradas.length });

    if (!entradas.length) {
      this.lista.innerHTML = `
        <div class="tarjeta vacio-grande">
          ${ICONOS.codigoGrande}
          <h2>Todavía no has guardado ningún código</h2>
          <p>Cada vez que descargues un código desde el generador, aparecerá aquí para que puedas
            volver a editarlo sin empezar de cero.</p>
          <a class="btn btn--principal" href="/">Crear mi primer código</a>
        </div>`;
      return;
    }

    this.lista.innerHTML = `
      <div class="cabecera-lista">
        <p class="nota">${entradas.length} ${entradas.length === 1 ? 'código guardado' : 'códigos guardados'}
          en este navegador. Nada de esto sale de tu dispositivo.</p>
        <button type="button" class="btn btn--fino js-vaciar">Borrar todo</button>
      </div>
      <ul class="rejilla-codigos">
        ${entradas.map((e) => this.tarjeta(e)).join('')}
      </ul>`;

    this.lista.querySelector('.js-vaciar').addEventListener('click', () => {
      if (!confirm('Se borrarán todos los códigos guardados en este navegador. Los archivos que ya descargaste no se tocan. ¿Seguimos?')) return;
      historial.vaciar();
      this.pintar();
    });

    this.lista.querySelectorAll('.js-borrar').forEach((b) => {
      b.addEventListener('click', () => {
        historial.borrar(b.dataset.contenido);
        this.pintar();
        avisar('Código borrado del historial.', 'ok');
      });
    });
  }

  tarjeta(e) {
    const info = interpretar(e.contenido);
    const destino = enlaceGenerador({ t: e.tipo || info.tipo, v: e.valores || info.valores, o: e.opciones });
    return `
      <li class="codigo-guardado">
        <img class="codigo-guardado__mini" src="${esc(e.miniatura || '')}" alt="" width="72" height="72">
        <div class="codigo-guardado__datos">
          <span class="etiqueta-tipo">${esc(info.nombre)}</span>
          <p class="codigo-guardado__texto">${esc(e.contenido.slice(0, 90))}${e.contenido.length > 90 ? '…' : ''}</p>
          <p class="nota">${esc(historial.fechaLegible(e.fecha))}</p>
        </div>
        <div class="codigo-guardado__acciones">
          <a class="btn btn--fino" href="${esc(destino)}">Editar</a>
          <button type="button" class="btn btn--fino js-borrar" data-contenido="${esc(e.contenido)}">Borrar</button>
        </div>
      </li>`;
  }
}

export function init(selector = '#herramienta') {
  const raiz = document.querySelector(selector);
  if (!raiz) return null;
  const app = new MisQR(raiz);
  app.montar();
  return app;
}

export default { init };
