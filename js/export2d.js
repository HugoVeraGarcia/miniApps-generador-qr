/* export2d.js — Descargas en 2D: PNG, SVG y hoja A4 lista para imprimir. */

import { pintarCanvas, pintarSVG, calcularLienzo } from './qr-render.js';

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Nombre de archivo seguro derivado del contenido. */
export function nombreArchivo(contenido, extension, prefijo = 'qr') {
  const base = String(contenido)
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .toLowerCase() || 'codigo';
  return `${prefijo}-${base}.${extension}`;
}

/**
 * Renderiza el QR a un canvas del tamaño pedido en pixeles.
 * @param {number} ladoPx  lado del PNG resultante
 */
export function canvasATamano(matriz, opciones, ladoPx) {
  const lienzo = calcularLienzo(matriz.size, opciones);
  const escala = ladoPx / lienzo.ancho;
  const canvas = document.createElement('canvas');
  pintarCanvas(canvas, matriz, opciones, escala);
  return canvas;
}

export async function descargarPNG(matriz, opciones, contenido, ladoPx = 1024) {
  const canvas = canvasATamano(matriz, opciones, ladoPx);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  descargarBlob(blob, nombreArchivo(contenido, 'png'));
}

export async function descargarJPG(matriz, opciones, contenido, ladoPx = 1024, calidad = 0.92) {
  const opts = { ...opciones, fondoTransparente: false };
  const canvas = canvasATamano(matriz, opts, ladoPx);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', calidad));
  descargarBlob(blob, nombreArchivo(contenido, 'jpg'));
}

export function descargarSVG(matriz, opciones, contenido, logoDataURL = null) {
  const svg = pintarSVG(matriz, opciones, 10, logoDataURL);
  descargarBlob(new Blob([svg], { type: 'image/svg+xml' }), nombreArchivo(contenido, 'svg'));
}

/* ---------- hoja A4 ---------- */

const A4 = { ancho: 210, alto: 297 };          // mm
const MARGEN_SEGURIDAD = 10;                    // mm

const DISPOSICIONES = {
  1: { cols: 1, filas: 1 },
  2: { cols: 1, filas: 2 },
  4: { cols: 2, filas: 2 },
  6: { cols: 2, filas: 3 },
  12: { cols: 3, filas: 4 },
  24: { cols: 4, filas: 6 },
};

/**
 * Hoja A4 en SVG con unidades reales en milímetros y marcas de corte.
 * Acepta una lista de codigos: uno repetido, o distintos si vienen de un lote.
 *
 * @param {Array<{matriz:object, opciones:object, etiqueta?:string}>} códigos
 * @param {number} porHoja  1, 2, 4, 6, 12 o 24
 */
export function hojaA4SVG(codigos, porHoja = 6, conEtiquetas = true) {
  const d = DISPOSICIONES[porHoja] || DISPOSICIONES[6];
  const util = {
    ancho: A4.ancho - MARGEN_SEGURIDAD * 2,
    alto: A4.alto - MARGEN_SEGURIDAD * 2,
  };
  const celda = { ancho: util.ancho / d.cols, alto: util.alto / d.filas };
  const alturaEtiqueta = conEtiquetas ? Math.min(6, celda.alto * 0.12) : 0;
  const ladoQR = Math.min(celda.ancho, celda.alto - alturaEtiqueta) * 0.86;

  const piezas = [];
  const marcas = [];

  for (let i = 0; i < porHoja; i++) {
    const col = i % d.cols, fila = Math.floor(i / d.cols);
    const cx = MARGEN_SEGURIDAD + col * celda.ancho;
    const cy = MARGEN_SEGURIDAD + fila * celda.alto;
    const item = codigos[i % codigos.length];
    if (!item) continue;

    const svgQR = pintarSVG(item.matriz, item.opciones, 10);
    const interior = svgQR.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    const vb = svgQR.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    const vw = vb ? parseFloat(vb[1]) : 100;
    const vh = vb ? parseFloat(vb[2]) : 100;
    const escala = ladoQR / Math.max(vw, vh);

    const x = cx + (celda.ancho - vw * escala) / 2;
    const y = cy + (celda.alto - alturaEtiqueta - vh * escala) / 2;

    piezas.push(`<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${escala.toFixed(5)})">${interior}</g>`);

    if (conEtiquetas && item.etiqueta) {
      piezas.push(`<text x="${(cx + celda.ancho / 2).toFixed(2)}" y="${(cy + celda.alto - alturaEtiqueta / 2).toFixed(2)}" font-family="-apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="${(alturaEtiqueta * 0.62).toFixed(2)}" fill="#0F172A" text-anchor="middle" dominant-baseline="central">${item.etiqueta.replace(/[<>&]/g, '')}</text>`);
    }

    // Marcas de corte en las esquinas de cada celda.
    for (const [mx, my] of [[cx, cy], [cx + celda.ancho, cy], [cx, cy + celda.alto], [cx + celda.ancho, cy + celda.alto]]) {
      marcas.push(`<path d="M${(mx - 2).toFixed(2)} ${my.toFixed(2)}h4M${mx.toFixed(2)} ${(my - 2).toFixed(2)}v4" stroke="#94A3B8" stroke-width="0.2"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${A4.ancho}mm" height="${A4.alto}mm" viewBox="0 0 ${A4.ancho} ${A4.alto}">`
    + `<rect width="${A4.ancho}" height="${A4.alto}" fill="#FFFFFF"/>`
    + marcas.join('')
    + piezas.join('')
    + '</svg>';
}

export function descargarHojaA4(codigos, porHoja, contenido, conEtiquetas = true) {
  const svg = hojaA4SVG(codigos, porHoja, conEtiquetas);
  descargarBlob(new Blob([svg], { type: 'image/svg+xml' }), nombreArchivo(contenido, 'svg', 'hoja-a4'));
}

/** Abre la hoja en una ventana de impresion: es la via a PDF sin dependencias. */
export function imprimirHojaA4(codigos, porHoja, conEtiquetas = true) {
  const svg = hojaA4SVG(codigos, porHoja, conEtiquetas);
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>Hoja A4 de códigos QR</title>'
    + '<style>@page{size:A4;margin:0}html,body{margin:0;padding:0}svg{display:block}</style>'
    + '</head><body>' + svg + '<script>window.onload=function(){window.print()}<\/script></body></html>'
  );
  win.document.close();
  return true;
}
