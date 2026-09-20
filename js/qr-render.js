/* qr-render.js — Dibujo del código QR.
 *
 * Genera rutas SVG en unidades de módulo a partir de la matriz y las pinta
 * sobre canvas (con Path2D) o las serializa como SVG. Un único juego de rutas
 * alimenta la vista previa, el PNG, el SVG y la geometría 3D.
 */

export const ESTILOS_MODULO = ['clasico', 'redondeado', 'puntos', 'elegante', 'barras-v', 'barras-h'];
export const ESTILOS_OJO_MARCO = ['cuadrado', 'redondeado', 'circulo', 'hoja'];
export const ESTILOS_OJO_CENTRO = ['cuadrado', 'redondeado', 'circulo', 'punto'];

export const OPCIONES_POR_DEFECTO = {
  colorCodigo: '#0F172A',
  colorFondo: '#FFFFFF',
  fondoTransparente: false,
  gradiente: null,              // { tipo:'lineal'|'radial', desde, hasta, angulo }
  estiloModulo: 'clasico',
  estiloOjoMarco: 'cuadrado',
  estiloOjoCentro: 'cuadrado',
  colorOjo: null,               // null = mismo color que el cuerpo
  margen: 4,                    // módulos de zona silenciosa
  logo: null,                   // { imagen: HTMLImageElement|ImageBitmap, escala: 0.22 }
  marco: null,                  // { estilo:'solido'|'redondeado'|'pestana', texto, color, colorTexto }
};

/* ---------- helpers de ruta ---------- */

const f = (n) => Number(n.toFixed(4));

function rutaRect(x, y, w, h) {
  return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`;
}

function rutaRectRedondo(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  return `M${f(x + rr)} ${f(y)}`
    + `h${f(w - 2 * rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(rr)}`
    + `v${f(h - 2 * rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(-rr)} ${f(rr)}`
    + `h${f(-(w - 2 * rr))}a${f(rr)} ${f(rr)} 0 0 1 ${f(-rr)} ${f(-rr)}`
    + `v${f(-(h - 2 * rr))}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(-rr)}z`;
}

function rutaCirculo(cx, cy, r) {
  return `M${f(cx - r)} ${f(cy)}`
    + `a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0`
    + `a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`;
}

/** Cuadrado con dos esquinas opuestas redondeadas. */
function rutaHoja(x, y, w, r, invertida = false) {
  const rr = Math.min(r, w / 2);
  if (!invertida) {
    return `M${f(x + rr)} ${f(y)}h${f(w - rr)}v${f(w - rr)}`
      + `a${f(rr)} ${f(rr)} 0 0 1 ${f(-rr)} ${f(rr)}h${f(-(w - rr))}v${f(-(w - rr))}`
      + `a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(-rr)}z`;
  }
  return `M${f(x)} ${f(y)}h${f(w - rr)}a${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} ${f(rr)}`
    + `v${f(w - rr)}h${f(-(w - rr))}a${f(rr)} ${f(rr)} 0 0 1 ${f(-rr)} ${f(-rr)}z`;
}

/* ---------- zonas especiales ---------- */

function esOjo(x, y, size) {
  return (x < 7 && y < 7)
    || (x >= size - 7 && y < 7)
    || (x < 7 && y >= size - 7);
}

/** Módulos que el logo tapa, como rectangulo [x0,y0,x1,y1] en unidades de módulo. */
export function zonaLogo(size, escala) {
  if (!escala) return null;
  let n = Math.ceil(size * escala);
  if ((size - n) % 2 !== 0) n += 1;           // centrado exacto
  const inicio = (size - n) / 2;
  return [inicio, inicio, inicio + n, inicio + n];
}

/* ---------- construccion de rutas ---------- */

/**
 * Devuelve rutas SVG en unidades de módulo (origen 0,0 en la esquina del QR,
 * sin contar el margen).
 * @returns {{cuerpo:string, ojoMarco:string, ojoCentro:string, size:number}}
 */
export function construirRutas(matriz, opciones = {}) {
  const o = { ...OPCIONES_POR_DEFECTO, ...opciones };
  const { size, modules } = matriz;
  const hueco = o.logo ? zonaLogo(size, o.logo.escala ?? 0.22) : null;

  const activo = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return false;
    if (esOjo(x, y, size)) return false;
    if (hueco && x >= hueco[0] && x < hueco[2] && y >= hueco[1] && y < hueco[3]) return false;
    return modules[y][x];
  };

  const partes = [];
  const estilo = o.estiloModulo;

  if (estilo === 'barras-v' || estilo === 'barras-h') {
    const vertical = estilo === 'barras-v';
    const vistos = new Set();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!activo(x, y) || vistos.has(y * size + x)) continue;
        let largo = 1;
        while (activo(vertical ? x : x + largo, vertical ? y + largo : y)) {
          vistos.add(vertical ? (y + largo) * size + x : y * size + (x + largo));
          largo++;
        }
        vistos.add(y * size + x);
        const w = vertical ? 0.82 : largo - 0.18;
        const h = vertical ? largo - 0.18 : 0.82;
        partes.push(rutaRectRedondo(x + (vertical ? 0.09 : 0.09), y + 0.09, w, h, 0.41));
      }
    }
  } else {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!activo(x, y)) continue;
        if (estilo === 'puntos') {
          partes.push(rutaCirculo(x + 0.5, y + 0.5, 0.44));
        } else if (estilo === 'elegante') {
          partes.push(rutaHoja(x + 0.04, y + 0.04, 0.92, 0.42, (x + y) % 2 === 0));
        } else if (estilo === 'redondeado') {
          partes.push(rutaModuloRedondeado(x, y, activo));
        } else {
          partes.push(rutaRect(x, y, 1, 1));
        }
      }
    }
  }

  // Ojos: tres marcos de 7x7 y tres centros de 3x3.
  const centros = [[0, 0], [size - 7, 0], [0, size - 7]];
  const marcos = [], nucleos = [];
  for (const [ox, oy] of centros) {
    marcos.push(rutaOjoMarco(ox, oy, o.estiloOjoMarco));
    nucleos.push(rutaOjoCentro(ox + 2, oy + 2, o.estiloOjoCentro));
  }

  return {
    cuerpo: partes.join(''),
    ojoMarco: marcos.join(''),
    ojoCentro: nucleos.join(''),
    size,
  };
}

/** Módulo cuadrado con las esquinas redondeadas solo donde no hay vecino. */
function rutaModuloRedondeado(x, y, activo) {
  const r = 0.5;
  const arriba = activo(x, y - 1), abajo = activo(x, y + 1);
  const izq = activo(x - 1, y), der = activo(x + 1, y);
  const tl = !arriba && !izq ? r : 0;
  const tr = !arriba && !der ? r : 0;
  const br = !abajo && !der ? r : 0;
  const bl = !abajo && !izq ? r : 0;
  return `M${f(x + tl)} ${f(y)}`
    + `h${f(1 - tl - tr)}${tr ? `a${f(tr)} ${f(tr)} 0 0 1 ${f(tr)} ${f(tr)}` : ''}`
    + `v${f(1 - tr - br)}${br ? `a${f(br)} ${f(br)} 0 0 1 ${f(-br)} ${f(br)}` : ''}`
    + `h${f(-(1 - br - bl))}${bl ? `a${f(bl)} ${f(bl)} 0 0 1 ${f(-bl)} ${f(-bl)}` : ''}`
    + `v${f(-(1 - bl - tl))}${tl ? `a${f(tl)} ${f(tl)} 0 0 1 ${f(tl)} ${f(-tl)}` : ''}z`;
}

/** Anillo exterior del ojo: 7x7 con un hueco de 5x5 (regla par-impar). */
function rutaOjoMarco(x, y, estilo) {
  if (estilo === 'circulo') {
    return rutaCirculo(x + 3.5, y + 3.5, 3.5) + rutaCirculo(x + 3.5, y + 3.5, 2.5);
  }
  if (estilo === 'redondeado') {
    return rutaRectRedondo(x, y, 7, 7, 2) + rutaRectRedondo(x + 1, y + 1, 5, 5, 1.4);
  }
  if (estilo === 'hoja') {
    return rutaHoja(x, y, 7, 3) + rutaHoja(x + 1, y + 1, 5, 2.2);
  }
  return rutaRect(x, y, 7, 7) + rutaRect(x + 1, y + 1, 5, 5);
}

function rutaOjoCentro(x, y, estilo) {
  if (estilo === 'circulo' || estilo === 'punto') {
    return rutaCirculo(x + 1.5, y + 1.5, estilo === 'punto' ? 1.2 : 1.5);
  }
  if (estilo === 'redondeado') return rutaRectRedondo(x, y, 3, 3, 0.9);
  return rutaRect(x, y, 3, 3);
}

/* ---------- disposicion ---------- */

/**
 * Calcula el lienzo completo en unidades de módulo, incluyendo margen y marco.
 * @returns {{ancho:number, alto:number, offsetX:number, offsetY:number, banda:number}}
 */
export function calcularLienzo(size, opciones = {}) {
  const o = { ...OPCIONES_POR_DEFECTO, ...opciones };
  const m = o.margen;
  const grosorMarco = o.marco ? 1 : 0;
  const banda = o.marco && o.marco.texto ? 3.2 : 0;
  return {
    ancho: size + m * 2 + grosorMarco * 2,
    alto: size + m * 2 + grosorMarco * 2 + banda,
    offsetX: m + grosorMarco,
    offsetY: m + grosorMarco,
    banda,
    grosorMarco,
  };
}

/* ---------- pintura ---------- */

function aplicarPintura(ctx, o, lienzo, escala) {
  if (!o.gradiente) return o.colorCodigo;
  const { tipo, desde, hasta, angulo = 45 } = o.gradiente;
  const w = lienzo.ancho * escala, h = lienzo.alto * escala;
  let g;
  if (tipo === 'radial') {
    g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
  } else {
    const rad = (angulo * Math.PI) / 180;
    const dx = Math.cos(rad) * w / 2, dy = Math.sin(rad) * h / 2;
    g = ctx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy);
  }
  g.addColorStop(0, desde);
  g.addColorStop(1, hasta);
  return g;
}

/**
 * Pinta el QR en un canvas. Devuelve el lienzo calculado.
 * @param {HTMLCanvasElement} canvas
 * @param {object} matriz  salida de encode()
 * @param {object} opciones
 * @param {number} escala  pixeles por módulo
 */
export function pintarCanvas(canvas, matriz, opciones = {}, escala = 8) {
  const o = { ...OPCIONES_POR_DEFECTO, ...opciones };
  const rutas = construirRutas(matriz, o);
  const lienzo = calcularLienzo(matriz.size, o);

  canvas.width = Math.round(lienzo.ancho * escala);
  canvas.height = Math.round(lienzo.alto * escala);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!o.fondoTransparente) {
    ctx.fillStyle = o.colorFondo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (o.marco) pintarMarco(ctx, o, lienzo, escala);

  ctx.save();
  ctx.translate(lienzo.offsetX * escala, lienzo.offsetY * escala);
  ctx.scale(escala, escala);

  const pintura = aplicarPintura(ctx, o, lienzo, escala);
  ctx.fillStyle = pintura;
  ctx.fill(new Path2D(rutas.cuerpo));

  ctx.fillStyle = o.colorOjo || pintura;
  ctx.fill(new Path2D(rutas.ojoMarco), 'evenodd');
  ctx.fill(new Path2D(rutas.ojoCentro));
  ctx.restore();

  if (o.logo && o.logo.imagen) pintarLogo(ctx, o, matriz.size, lienzo, escala);

  return lienzo;
}

function pintarLogo(ctx, o, size, lienzo, escala) {
  const hueco = zonaLogo(size, o.logo.escala ?? 0.22);
  const lado = (hueco[2] - hueco[0]) * escala;
  const x = (lienzo.offsetX + hueco[0]) * escala;
  const y = (lienzo.offsetY + hueco[1]) * escala;
  const padding = lado * 0.1;

  if (!o.fondoTransparente) {
    ctx.fillStyle = o.colorFondo;
    ctx.fillRect(x, y, lado, lado);
  } else {
    ctx.clearRect(x, y, lado, lado);
  }
  ctx.drawImage(o.logo.imagen, x + padding, y + padding, lado - padding * 2, lado - padding * 2);
}

function pintarMarco(ctx, o, lienzo, escala) {
  const { estilo = 'solido', texto = '', color, colorTexto = '#FFFFFF' } = o.marco;
  const c = color || o.colorCodigo;
  const w = lienzo.ancho * escala;
  const alturaCaja = (lienzo.alto - lienzo.banda) * escala;
  const radio = estilo === 'redondeado' ? 2 * escala : 0;

  ctx.fillStyle = c;
  ctx.beginPath();
  if (radio) {
    ctx.roundRect(0, 0, w, lienzo.alto * escala, radio);
  } else {
    ctx.rect(0, 0, w, lienzo.alto * escala);
  }
  ctx.fill();

  ctx.fillStyle = o.fondoTransparente ? '#FFFFFF' : o.colorFondo;
  const g = lienzo.grosorMarco * escala;
  ctx.beginPath();
  if (radio) {
    ctx.roundRect(g, g, w - g * 2, alturaCaja - g * 2, Math.max(0, radio - g));
  } else {
    ctx.rect(g, g, w - g * 2, alturaCaja - g * 2);
  }
  ctx.fill();

  if (texto) {
    const alturaTexto = lienzo.banda * escala;
    ctx.fillStyle = colorTexto;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let px = alturaTexto * 0.5;
    ctx.font = `700 ${px}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    // Reduce el cuerpo hasta que el texto entre en el ancho disponible.
    while (ctx.measureText(texto).width > w * 0.86 && px > 6) {
      px -= 1;
      ctx.font = `700 ${px}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    }
    ctx.fillText(texto, w / 2, alturaCaja + alturaTexto / 2);
  }
}

/* ---------- SVG ---------- */

/**
 * Serializa el QR como SVG vectorial autocontenido.
 * @param {object} matriz   salida de encode()
 * @param {object} opciones
 * @param {number} [unidad=10]  unidades de usuario por módulo
 */
export function pintarSVG(matriz, opciones = {}, unidad = 10, logoDataURL = null) {
  const o = { ...OPCIONES_POR_DEFECTO, ...opciones };
  const rutas = construirRutas(matriz, o);
  const l = calcularLienzo(matriz.size, o);
  const W = l.ancho * unidad, H = l.alto * unidad;

  const defs = [];
  let relleno = o.colorCodigo;
  if (o.gradiente) {
    const { tipo, desde, hasta, angulo = 45 } = o.gradiente;
    const id = 'g1';
    if (tipo === 'radial') {
      defs.push(`<radialGradient id="${id}"><stop offset="0" stop-color="${desde}"/><stop offset="1" stop-color="${hasta}"/></radialGradient>`);
    } else {
      const rad = (angulo * Math.PI) / 180;
      const x1 = 50 - Math.cos(rad) * 50, y1 = 50 - Math.sin(rad) * 50;
      const x2 = 50 + Math.cos(rad) * 50, y2 = 50 + Math.sin(rad) * 50;
      defs.push(`<linearGradient id="${id}" x1="${f(x1)}%" y1="${f(y1)}%" x2="${f(x2)}%" y2="${f(y2)}%"><stop offset="0" stop-color="${desde}"/><stop offset="1" stop-color="${hasta}"/></linearGradient>`);
    }
    relleno = `url(#${id})`;
  }

  const capas = [];
  if (!o.fondoTransparente) {
    capas.push(`<rect width="${f(W)}" height="${f(H)}" fill="${o.colorFondo}"${o.marco && o.marco.estilo === 'redondeado' ? ` rx="${f(2 * unidad)}"` : ''}/>`);
  }

  if (o.marco) {
    const c = o.marco.color || o.colorCodigo;
    const alturaCaja = (l.alto - l.banda) * unidad;
    const g = l.grosorMarco * unidad;
    const rx = o.marco.estilo === 'redondeado' ? 2 * unidad : 0;
    capas.push(`<rect width="${f(W)}" height="${f(H)}" fill="${c}" rx="${f(rx)}"/>`);
    capas.push(`<rect x="${f(g)}" y="${f(g)}" width="${f(W - g * 2)}" height="${f(alturaCaja - g * 2)}" fill="${o.fondoTransparente ? '#FFFFFF' : o.colorFondo}" rx="${f(Math.max(0, rx - g))}"/>`);
    if (o.marco.texto) {
      const cuerpo = l.banda * unidad * 0.5;
      capas.push(`<text x="${f(W / 2)}" y="${f(alturaCaja + l.banda * unidad / 2)}" fill="${o.marco.colorTexto || '#FFFFFF'}" font-family="-apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-weight="700" font-size="${f(cuerpo)}" text-anchor="middle" dominant-baseline="central">${escaparXML(o.marco.texto)}</text>`);
    }
  }

  const t = `translate(${f(l.offsetX * unidad)} ${f(l.offsetY * unidad)}) scale(${f(unidad)})`;
  capas.push(`<g transform="${t}">`);
  capas.push(`<path d="${rutas.cuerpo}" fill="${relleno}"/>`);
  capas.push(`<path d="${rutas.ojoMarco}" fill="${o.colorOjo || relleno}" fill-rule="evenodd"/>`);
  capas.push(`<path d="${rutas.ojoCentro}" fill="${o.colorOjo || relleno}"/>`);
  capas.push('</g>');

  if (logoDataURL && o.logo) {
    const hueco = zonaLogo(matriz.size, o.logo.escala ?? 0.22);
    const lado = (hueco[2] - hueco[0]) * unidad;
    const x = (l.offsetX + hueco[0]) * unidad, y = (l.offsetY + hueco[1]) * unidad;
    const p = lado * 0.1;
    if (!o.fondoTransparente) {
      capas.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(lado)}" height="${f(lado)}" fill="${o.colorFondo}"/>`);
    }
    capas.push(`<image x="${f(x + p)}" y="${f(y + p)}" width="${f(lado - p * 2)}" height="${f(lado - p * 2)}" href="${logoDataURL}" preserveAspectRatio="xMidYMid meet"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}" height="${f(H)}" viewBox="0 0 ${f(W)} ${f(H)}" shape-rendering="crispEdges">`
    + (defs.length ? `<defs>${defs.join('')}</defs>` : '')
    + capas.join('')
    + '</svg>';
}

function escaparXML(s) {
  return String(s).replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}
