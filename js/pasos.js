/* pasos.js — Navegacion de los tres pasos.
 *
 * Cada paso tiene su propia URL (?p=diseno, ?p=descarga), entra en el
 * historial del navegador y manda un page_view propio a GA4. El boton atrás
 * funciona y el estado completo viaja en la query string, así que cualquier
 * resultado se puede compartir y volver a editar.
 */

import { CONFIG, listoAnalitica } from './config.js';

export const PASOS = ['contenido', 'diseno', 'descarga'];
const PARAM = 'p';

let analiticaLista = false;

function iniciarAnalitica() {
  if (analiticaLista || !listoAnalitica()) return;
  analiticaLista = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${CONFIG.analitica.ga4}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', CONFIG.analitica.ga4, { send_page_view: false });
}

export function registrarVista(ruta, titulo) {
  if (!listoAnalitica()) return;
  iniciarAnalitica();
  window.gtag('event', 'page_view', {
    page_path: ruta,
    page_title: titulo || document.title,
    page_location: location.origin + ruta,
  });
}

export function registrarEvento(nombre, parametros = {}) {
  if (!listoAnalitica()) return;
  iniciarAnalitica();
  window.gtag('event', nombre, parametros);
}

export function pasoActual() {
  const p = new URLSearchParams(location.search).get(PARAM);
  return PASOS.includes(p) ? p : PASOS[0];
}

/**
 * Controlador de pasos.
 * @param {object} opciones
 * @param {(paso:string, anterior:string)=>void} opciones.alCambiar
 * @param {(paso:string)=>boolean|string} [opciones.validar] devuelve true o un mensaje de error
 */
export function crearNavegacion({ alCambiar, validar }) {
  let actual = pasoActual();

  function aplicar(paso, anterior) {
    for (const seccion of document.querySelectorAll('[data-paso]')) {
      seccion.hidden = seccion.dataset.paso !== paso;
    }
    for (const boton of document.querySelectorAll('[data-ir-a-paso]')) {
      const destino = boton.dataset.irAPaso;
      boton.classList.toggle('es-actual', destino === paso);
      boton.setAttribute('aria-current', destino === paso ? 'step' : 'false');
      const i = PASOS.indexOf(destino);
      boton.classList.toggle('es-hecho', i < PASOS.indexOf(paso));
    }
    document.querySelector('.indicador-pasos')?.setAttribute('data-paso-actual', paso);
    alCambiar(paso, anterior);
  }

  function ir(paso, empujar = true) {
    if (!PASOS.includes(paso) || paso === actual) return;
    if (PASOS.indexOf(paso) > PASOS.indexOf(actual) && validar) {
      const r = validar(actual);
      if (r !== true) {
        avisar(typeof r === 'string' ? r : 'Faltan datos en este paso.');
        return;
      }
    }
    const anterior = actual;
    actual = paso;

    const url = new URL(location.href);
    if (paso === PASOS[0]) url.searchParams.delete(PARAM);
    else url.searchParams.set(PARAM, paso);
    if (empujar) history.pushState({ paso }, '', url);

    aplicar(paso, anterior);
    registrarVista(url.pathname + url.search);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.addEventListener('popstate', () => {
    const paso = pasoActual();
    if (paso !== actual) {
      const anterior = actual;
      actual = paso;
      aplicar(paso, anterior);
    }
  });

  document.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-ir-a-paso]');
    if (!boton) return;
    e.preventDefault();
    ir(boton.dataset.irAPaso);
  });

  aplicar(actual, null);
  registrarVista(location.pathname + location.search);

  return { ir, get actual() { return actual; } };
}

/** Aviso breve y accesible, sin dependencias. */
export function avisar(mensaje, tono = 'error') {
  let caja = document.querySelector('.aviso-flotante');
  if (!caja) {
    caja = document.createElement('div');
    caja.className = 'aviso-flotante';
    caja.setAttribute('role', 'status');
    caja.setAttribute('aria-live', 'polite');
    document.body.appendChild(caja);
  }
  caja.textContent = mensaje;
  caja.dataset.tono = tono;
  caja.classList.add('visible');
  clearTimeout(caja._t);
  caja._t = setTimeout(() => caja.classList.remove('visible'), 4200);
}
