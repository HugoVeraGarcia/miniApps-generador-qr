/* iconos.js — Juego de iconos propio.
 *
 * Trazo de 1.6, esquinas y extremos redondeados, rejilla de 16 (24 para el
 * icono grande del estado vacío). Todos heredan el color del texto, así que el
 * color lo decide el contexto y nunca hay un color suelto dentro del SVG.
 */

const svg = (cuerpo, tam = 16, ancho = 1.6) =>
  `<svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" fill="none"`
  + ` stroke="currentColor" stroke-width="${ancho}" stroke-linecap="round"`
  + ` stroke-linejoin="round" aria-hidden="true" focusable="false">${cuerpo}</svg>`;

export const ICONOS = {
  ok: svg('<path d="M13.5 4.5 6.5 11.5 3 8"/>'),

  alerta: svg(
    '<path d="M8 2.6 1.9 13.1a.9.9 0 0 0 .8 1.4h10.6a.9.9 0 0 0 .8-1.4L8 2.6Z"/>'
    + '<path d="M8 6.6v3.2"/><path d="M8 12.1h.01"/>'
  ),

  error: svg(
    '<circle cx="8" cy="8" r="6.2"/><path d="M8 5.1v3.5"/><path d="M8 11h.01"/>'
  ),

  descarga: svg(
    '<path d="M8 2.6v7.6"/><path d="M4.8 7.4 8 10.6l3.2-3.2"/>'
    + '<path d="M2.6 11.6v.9a1.4 1.4 0 0 0 1.4 1.4h8a1.4 1.4 0 0 0 1.4-1.4v-.9"/>'
  ),

  candado: svg(
    '<rect x="3" y="7" width="10" height="6.6" rx="1.4"/>'
    + '<path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/>'
  ),

  cubo: svg(
    '<path d="M8 1.8 13.6 5v6L8 14.2 2.4 11V5L8 1.8Z"/>'
    + '<path d="M2.4 5 8 8.2 13.6 5"/><path d="M8 8.2v6"/>'
  ),

  /* Marca de código: tres localizadores y unos cuantos módulos sueltos.
     Es el icono grande del estado vacío, dibujado en relleno y no en trazo. */
  codigoGrande: `<svg width="56" height="56" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="6.5" height="6.5" rx="1.2"/>
    <rect x="14.5" y="3" width="6.5" height="6.5" rx="1.2"/>
    <rect x="3" y="14.5" width="6.5" height="6.5" rx="1.2"/>
    <path d="M14.5 14.5h2.4M21 14.5h-1.2M14.5 18.2v2.8M18.4 21h2.6M18.4 17.2h2.6"/>
  </svg>`,
};

export const icono = (nombre) => ICONOS[nombre] || '';
