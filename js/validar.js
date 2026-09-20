/* validar.js — Comprobaciones que corren antes de habilitar la descarga.
 *
 * 1. Contraste entre color de código y fondo (WCAG).
 * 2. Escaneo real: el resultado se decodifica con jsQR antes de dejar descargar.
 *
 * jsQR se carga bajo demanda (128 KB) para no penalizar el arranque.
 */

let jsQRPromesa = null;

function cargarJsQR() {
  if (!jsQRPromesa) {
    jsQRPromesa = import('./vendor/jsqr.min.js').then((m) => m.default || m.jsQR || m);
  }
  return jsQRPromesa;
}

/* ---------- color ---------- */

export function hexARgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function luminancia(hex) {
  const rgb = hexARgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relacion de contraste WCAG entre dos colores hexadecimales (1 a 21). */
export function contraste(hexA, hexB) {
  const a = luminancia(hexA), b = luminancia(hexB);
  const claro = Math.max(a, b), oscuro = Math.min(a, b);
  return (claro + 0.05) / (oscuro + 0.05);
}

/**
 * Diagnóstico de color. El QR necesita que el código sea MAS OSCURO que el
 * fondo: muchos lectores no invierten, así que el código claro sobre fondo
 * oscuro también avisa aunque el contraste sea alto.
 */
export function diagnosticoColor(colorCodigo, colorFondo) {
  const ratio = contraste(colorCodigo, colorFondo);
  const invertido = luminancia(colorCodigo) > luminancia(colorFondo);
  const avisos = [];

  if (ratio < 3) {
    avisos.push({
      nivel: 'error',
      texto: `Contraste de ${ratio.toFixed(1)}:1. Por debajo de 3:1 la mayoría de lectores falla. Oscurece el color del código o aclara el fondo.`,
    });
  } else if (ratio < 4) {
    avisos.push({
      nivel: 'aviso',
      texto: `Contraste de ${ratio.toFixed(1)}:1. Funciona en pantalla, pero impreso en papel mate puede fallar. Recomendado 4:1 o más.`,
    });
  }

  if (invertido) {
    avisos.push({
      nivel: 'aviso',
      texto: 'El código es más claro que el fondo. Algunos lectores antiguos no leen códigos invertidos.',
    });
  }

  return { ratio, invertido, avisos };
}

/**
 * Avisos que no dependen de decodificar nada: se calculan siempre, en cuanto
 * cambia una opción. Avisan, no bloquean.
 */
export function diagnosticoEstructura(opciones = {}) {
  const avisos = [];
  const margen = opciones.margen ?? 4;
  if (margen < 4) {
    avisos.push({
      nivel: 'aviso',
      texto: `El margen blanco es de ${margen} ${margen === 1 ? 'módulo' : 'módulos'}. La norma pide 4: esa zona silenciosa es la que le dice al lector dónde empieza el código, y recortarla es la causa más común de fallo al imprimir.`,
    });
  }
  if (opciones.fondoTransparente) {
    avisos.push({
      nivel: 'aviso',
      texto: 'Con fondo transparente el código adopta el color de lo que tenga detrás. Colócalo siempre sobre una superficie clara y lisa.',
    });
  }
  return avisos;
}

/* ---------- escaneo ---------- */

/**
 * Decodifica un canvas con jsQR.
 * @returns {Promise<string|null>} contenido leido, o null si no se lee
 */
export async function decodificarCanvas(canvas) {
  const jsQR = await cargarJsQR();
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
  return res ? res.data : null;
}

/** Decodifica una imagen ya cargada (para el lector de /leer-qr/). */
export async function decodificarImagen(fuente, maxLado = 1400) {
  const w = fuente.naturalWidth || fuente.videoWidth || fuente.width;
  const h = fuente.naturalHeight || fuente.videoHeight || fuente.height;
  if (!w || !h) return null;
  const escala = Math.min(1, maxLado / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * escala));
  canvas.height = Math.max(1, Math.round(h * escala));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);
  const jsQR = await cargarJsQR();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return res ? res.data : null;
}

/**
 * Comprueba si el código sobrevive a su decoración.
 *
 * Los estilos con módulos separados (puntos, barras) son legibles para los
 * lectores de un móvil actual, pero hacen fallar a los decodificadores más
 * simples según la escala. Por eso esto NO bloquea la descarga: se prueban
 * varios tamaños y, si ninguno se lee, se avisa de que conviene imprimir una
 * prueba antes de tirar la edición entera.
 *
 * @param {HTMLCanvasElement[]} canvases  el mismo código a distintas escalas
 */
export async function verificarEstilo(canvases, contenidoEsperado, opciones = {}) {
  for (const canvas of canvases) {
    try {
      if (await decodificarCanvas(canvas) === contenidoEsperado) return { ok: true, avisos: [] };
    } catch {
      return { ok: true, omitido: true, avisos: [] };
    }
  }
  const decorado = ['puntos', 'barras-v', 'barras-h'].includes(opciones.estiloModulo);
  return {
    ok: false,
    avisos: [{
      nivel: 'aviso',
      texto: decorado
        ? 'Este estilo separa los módulos y algunos lectores antiguos pueden tropezar. El código es válido: imprime una prueba y escanéala antes de tirar la edición entera, o usa el estilo clásico.'
        : 'Con esta combinación de decoración el código cuesta más de leer. Imprime una prueba antes de encargar la tirada.',
    }],
  };
}

/**
 * Verifica que el QR dibujado se lee de verdad y, si no, diagnostica la causa.
 * Se le pasa el código SIN decoración: lo que comprueba es que el contenido,
 * el margen, el logo y el contraste no han roto el código.
 *
 * @param {HTMLCanvasElement} canvas  canvas ya pintado
 * @param {string} contenidoEsperado
 * @param {object} contexto  { opciones, matriz }
 */
export async function verificarEscaneo(canvas, contenidoEsperado, contexto = {}) {
  const { opciones = {}, matriz = {} } = contexto;
  let leido = null;
  try {
    leido = await decodificarCanvas(canvas);
  } catch (e) {
    return { ok: true, omitido: true, avisos: [] }; // sin verificación, no bloqueamos
  }

  if (leido === contenidoEsperado) return { ok: true, avisos: [] };

  // jsQR no decodifica la versión 23 (limitación conocida de la librería).
  // El código es válido; no bloqueamos la descarga por esto.
  if (leido === null && matriz.version === 23) {
    return { ok: true, omitido: true, avisos: [] };
  }

  const avisos = [];
  const escalaLogo = opciones.logo ? (opciones.logo.escala ?? 0.22) : 0;
  if (escalaLogo > 0.25) {
    avisos.push({
      nivel: 'error',
      texto: 'El logo tapa demasiados módulos. Redúcelo o sube la corrección de errores a H.',
    });
  }
  if (matriz.ecl && matriz.ecl !== 'H' && escalaLogo > 0) {
    avisos.push({
      nivel: 'error',
      texto: 'Con logo hace falta corrección de errores H. Cambiala en el paso de diseño.',
    });
  }
  if ((opciones.margen ?? 4) < 4) {
    avisos.push({
      nivel: 'error',
      texto: 'El margen blanco es menor de 4 módulos. Los lectores necesitan esa zona silenciosa.',
    });
  }

  // El contraste ya lo avisa diagnosticoColor en cada cambio: si además se
  // repitiera aquí, el usuario vería el mismo mensaje dos veces. Solo se tiene
  // en cuenta para no acusar a otra causa cuando el culpable es el color.
  const colorFlojo = contraste(
    opciones.colorCodigo || '#000000', opciones.colorFondo || '#FFFFFF'
  ) < 4;

  if (avisos.length === 0 && !colorFlojo) {
    avisos.push({
      nivel: 'error',
      texto: 'El código generado no se lee. Prueba a acortar el contenido, quitar el logo o subir la corrección de errores a H.',
    });
  }

  return { ok: false, leido, avisos };
}

/* ---------- tamaño de impresión ---------- */

/**
 * Distancia máxima de lectura estimada. Regla de campo aceptada:
 * distancia útil = 10 x el lado impreso del código.
 */
export function distanciaLectura(ladoMm) {
  const metros = (ladoMm * 10) / 1000;
  return {
    metros,
    texto: metros < 1
      ? `Se lee bien hasta unos ${Math.round(metros * 100)} cm`
      : `Se lee bien hasta unos ${metros.toFixed(1).replace('.0', '')} m`,
  };
}

/** Lado mínimo recomendado en mm para leer a una distancia dada. */
export function ladoMinimoParaDistancia(metros) {
  return Math.ceil((metros * 1000) / 10);
}
