/* qr3d.js — Conversion del código QR en geometría imprimible.
 *
 * No usa CSG. La base se define como una pila de capas, cada una con su
 * mascara 2D; la mascara se rasteriza sobre una rejilla fina, se agrupan las
 * celdas en rectangulos y cada rectangulo se extruye como una caja. Los
 * módulos del QR si son rectangulos exactos, sin rejilla.
 *
 * Con este esquema salen gratis los rebajes (iman), los avellanados (placa de
 * pared), el modo pasante y las caras del cubo, y la malla siempre es válida.
 */

/* ---------- catalogo de objetos ---------- */

export const OBJETOS = {
  'placa-mesa': {
    nombre: 'Placa de mesa',
    pista: 'Para el mostrador o la mesa de un restaurante. Aguanta lo que el papel plastificado no: el vaso, la luz directa y los años.',
    forma: 'rect', ancho: 80, alto: 80, grosor: 3, radio: 4,
    borde: 7, soporte: true,
  },
  'llavero': {
    nombre: 'Llavero',
    pista: 'Con anilla. El objeto que la gente se lleva y conserva, para eventos y ferias.',
    forma: 'rect', ancho: 50, alto: 50, grosor: 3, radio: 4,
    borde: 4, anilla: { diametro: 10, agujero: 4, esquina: 'superior-izquierda' },
  },
  'iman-nevera': {
    nombre: 'Imán de nevera',
    pista: 'Con el hueco del imán ya vaciado. Se queda años en la cocina del cliente, a la vista.',
    forma: 'rect', ancho: 60, alto: 60, grosor: 4, radio: 3,
    borde: 5, rebaje: { diametro: 8.4, profundidad: 3.2 },
  },
  'tarjeta-visita': {
    nombre: 'Tarjeta de visita',
    pista: 'Del tamaño estándar, 85 × 54 mm. Una tarjeta que se toca no se tira, que es el problema real de las de papel.',
    forma: 'rect', ancho: 85, alto: 54, grosor: 2, radio: 3,
    borde: 4,
  },
  'posavasos': {
    nombre: 'Posavasos',
    pista: 'Disco de 90 mm. El código va inscrito para que no se salga del borde redondo.',
    forma: 'circulo', ancho: 90, alto: 90, grosor: 5, borde: 10,
  },
  'placa-pared': {
    nombre: 'Placa de pared',
    pista: 'Con taladros para atornillar. Para exteriores: el color es plástico, no tinta, y no se descolora con el sol.',
    forma: 'rect', ancho: 100, alto: 100, grosor: 4, radio: 3,
    borde: 10,
    agujeros: { diametro: 4, avellanado: 8, margen: 6 },
  },
  'atril': {
    nombre: 'Atril de mesa',
    pista: 'Un panel inclinado con su propia peana, como los carteles de mostrador. Se ve de frente sin agacharse y se imprime sin soportes.',
    forma: 'atril',
    ancho: 80,          // anchura de la pieza
    alto: 92,           // longitud del panel, medida sobre su propia cara
    grosor: 4,          // espesor del panel
    borde: 9,
    radio: 3,
    inclinacion: 15,    // grados que el panel se echa hacia atras desde la vertical
    pieProfundidad: 46, // cuanto sobresale la peana por detras
    pieGrosor: 4,
  },
  'cubo': {
    nombre: 'Cubo',
    pista: 'El código en una cara de un cubo de 40 mm. Pieza de escritorio, más objeto que cartel.',
    forma: 'cubo', ancho: 40, alto: 40, grosor: 40, borde: 4,
  },
};

export const MODOS_RELIEVE = {
  positivo: { nombre: 'Relieve positivo', descripcion: 'los módulos sobresalen sobre la base' },
  negativo: { nombre: 'Relieve negativo', descripcion: 'los módulos se hunden en la base' },
  pasante: { nombre: 'Pasante', descripcion: 'los módulos atraviesan la pieza de lado a lado' },
};

export const OPCIONES_3D_POR_DEFECTO = {
  objeto: 'placa-mesa',
  modo: 'positivo',
  alturaRelieve: 0.8,
  boquilla: 0.4,
  alturaCapa: 0.2,
  escalaMalla: 0.15,          // mm por celda de rejilla en las partes curvas
  colorBase: '#F8FAFC',
  colorCodigo: '#181527',
  texto: '',                  // texto grabado en el reverso (opcional)
};

/* ---------- malla ---------- */

class Malla {
  constructor() {
    this.tri = [];            // [[x,y,z] x3]
  }
  caja(x0, y0, z0, x1, y1, z1, tr = null, invertir = false) {
    const p = (x, y, z) => (tr ? tr(x, y, z) : [x, y, z]);
    const v = {
      a: p(x0, y0, z0), b: p(x1, y0, z0), c: p(x1, y1, z0), d: p(x0, y1, z0),
      e: p(x0, y0, z1), f: p(x1, y0, z1), g: p(x1, y1, z1), h: p(x0, y1, z1),
    };
    const caras = [
      [v.a, v.c, v.b], [v.a, v.d, v.c],   // -Z
      [v.e, v.f, v.g], [v.e, v.g, v.h],   // +Z
      [v.a, v.b, v.f], [v.a, v.f, v.e],   // -Y
      [v.d, v.h, v.g], [v.d, v.g, v.c],   // +Y
      [v.a, v.e, v.h], [v.a, v.h, v.d],   // -X
      [v.b, v.c, v.g], [v.b, v.g, v.f],   // +X
    ];
    // Una transformacion con determinante negativo invierte las normales.
    for (const cara of caras) this.tri.push(invertir ? [cara[0], cara[2], cara[1]] : cara);
  }
  get numTriangulos() { return this.tri.length; }
}

/* ---------- rasterizado de mascaras ---------- */

/**
 * Convierte una mascara 2D en rectangulos: primero rachas por fila, luego
 * fusion vertical de rachas identicas. Reduce el número de cajas en un orden
 * de magnitud frente a una caja por celda.
 */
function mascaraARectangulos(mascara, x0, y0, ancho, alto, paso) {
  const cols = Math.ceil(ancho / paso);
  const filas = Math.ceil(alto / paso);
  const rachasPorFila = [];

  for (let j = 0; j < filas; j++) {
    const cy = y0 + (j + 0.5) * paso;
    const rachas = [];
    let inicio = -1;
    for (let i = 0; i < cols; i++) {
      const cx = x0 + (i + 0.5) * paso;
      const dentro = mascara(cx, cy);
      if (dentro && inicio === -1) inicio = i;
      if (!dentro && inicio !== -1) { rachas.push([inicio, i]); inicio = -1; }
    }
    if (inicio !== -1) rachas.push([inicio, cols]);
    rachasPorFila.push(rachas);
  }

  const rects = [];
  const abiertas = new Map();   // "i0:i1" -> fila de inicio
  for (let j = 0; j <= filas; j++) {
    const actuales = new Set((rachasPorFila[j] || []).map(([a, b]) => `${a}:${b}`));
    for (const [clave, jIni] of [...abiertas]) {
      if (!actuales.has(clave)) {
        const [a, b] = clave.split(':').map(Number);
        rects.push([x0 + a * paso, y0 + jIni * paso, x0 + b * paso, y0 + j * paso]);
        abiertas.delete(clave);
      }
    }
    for (const clave of actuales) if (!abiertas.has(clave)) abiertas.set(clave, j);
  }
  return rects;
}

/* ---------- mascaras de forma ---------- */

function mascaraRectRedondeado(ancho, alto, radio) {
  const r = Math.min(radio, ancho / 2, alto / 2);
  return (x, y) => {
    if (x < 0 || y < 0 || x > ancho || y > alto) return false;
    const dx = Math.min(x, ancho - x), dy = Math.min(y, alto - y);
    if (dx >= r || dy >= r) return true;
    return (r - dx) ** 2 + (r - dy) ** 2 <= r * r;
  };
}

function mascaraCirculo(cx, cy, r) {
  return (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

const y_ = (a, b) => (x, y) => a(x, y) && b(x, y);
const no_ = (a) => (x, y) => !a(x, y);
const o_ = (...ms) => (x, y) => ms.some((m) => m(x, y));

/* ---------- módulos del QR ---------- */

/** Rachas horizontales de módulos oscuros, ya fusionadas verticalmente. */
function rectangulosModulos(matriz, predicado) {
  const { size, modules } = matriz;
  const activo = (x, y) => predicado(modules[y][x], x, y);
  const rachas = [];
  for (let y = 0; y < size; y++) {
    let inicio = -1;
    for (let x = 0; x <= size; x++) {
      const on = x < size && activo(x, y);
      if (on && inicio === -1) inicio = x;
      if (!on && inicio !== -1) { rachas.push([inicio, y, x, y + 1]); inicio = -1; }
    }
  }
  // Fusion vertical de rachas con el mismo rango en X.
  const porClave = new Map();
  for (const [x0, y0, x1, y1] of rachas) {
    const k = `${x0}:${x1}`;
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k).push([y0, y1]);
  }
  const salida = [];
  for (const [k, lista] of porClave) {
    const [x0, x1] = k.split(':').map(Number);
    lista.sort((a, b) => a[0] - b[0]);
    let cur = lista[0].slice();
    for (let i = 1; i < lista.length; i++) {
      if (lista[i][0] === cur[1]) cur[1] = lista[i][1];
      else { salida.push([x0, cur[0], x1, cur[1]]); cur = lista[i].slice(); }
    }
    salida.push([x0, cur[0], x1, cur[1]]);
  }
  return salida;
}

/* ---------- puentes del modo pasante ---------- */

/**
 * En modo pasante los módulos oscuros son agujeros, así que un módulo claro
 * rodeado de oscuros se cae al despegar la pieza. Devuelve los puentes de
 * material necesarios, en unidades de módulo.
 */
export function calcularPuentes(matriz) {
  const { size, modules } = matriz;
  const claro = (x, y) => x >= 0 && y >= 0 && x < size && y < size && !modules[y][x];
  const puentes = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!claro(x, y)) continue;
      if (claro(x - 1, y) || claro(x + 1, y) || claro(x, y - 1) || claro(x, y + 1)) continue;
      // Islote: conectar en diagonal con el primer vecino claro disponible.
      const diagonales = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (const [dx, dy] of diagonales) {
        if (claro(x + dx, y + dy)) {
          puentes.push({ x, y, dx, dy });
          break;
        }
      }
    }
  }
  return puentes;
}

/* ---------- validador de imprimibilidad ---------- */

export function validarImprimibilidad(matriz, o) {
  const obj = OBJETOS[o.objeto];
  const ladoQR = ladoCodigoMm(obj);
  const anchoModulo = ladoQR / matriz.size;
  const boquilla = o.boquilla ?? 0.4;
  const minModulo = boquilla * 2;
  const capa = o.alturaCapa ?? 0.2;

  const comprobaciones = [];

  comprobaciones.push({
    nombre: 'Ancho de módulo',
    valor: `${anchoModulo.toFixed(2)} mm`,
    umbral: `${minModulo.toFixed(1)} mm`,
    ok: anchoModulo >= minModulo,
    mensaje: anchoModulo >= minModulo
      ? 'Cada módulo cabe en dos pasadas de boquilla.'
      : `Con este contenido la pieza más pequena que imprime bien mide ${Math.ceil(minModulo * matriz.size + obj.borde * 2)} mm. Acorta el enlace o aumenta el tamaño de la pieza.`,
  });

  const relieve = o.alturaRelieve ?? 0.8;
  const minRelieve = capa * 3;
  comprobaciones.push({
    nombre: 'Altura de relieve',
    valor: `${relieve.toFixed(2)} mm`,
    umbral: `${minRelieve.toFixed(1)} mm`,
    ok: relieve >= minRelieve,
    mensaje: relieve >= minRelieve
      ? `Son ${Math.round(relieve / capa)} capas de ${capa} mm.`
      : `Menos de tres capas no cubre el color de abajo. Sube el relieve a ${minRelieve.toFixed(1)} mm.`,
  });

  const grosor = obj.grosor;
  comprobaciones.push({
    nombre: 'Grosor de base',
    valor: `${grosor.toFixed(1)} mm`,
    umbral: '1.2 mm',
    ok: grosor >= 1.2,
    mensaje: grosor >= 1.2 ? 'Rigidez suficiente.' : 'Base demasiado fina: riesgo de alabeo.',
  });

  if (o.modo === 'pasante') {
    const puentes = calcularPuentes(matriz);
    comprobaciones.push({
      nombre: 'Módulos sueltos',
      valor: `${puentes.length} islotes`,
      umbral: '0 sin puente',
      ok: true,
      mensaje: puentes.length
        ? `Se añaden ${puentes.length} puentes de ${boquilla} mm para que nada se caiga.`
        : 'No hay módulos sueltos.',
    });
    if (matriz.ecl !== 'H') {
      comprobaciones.push({
        nombre: 'Corrección de errores',
        valor: matriz.ecl,
        umbral: 'H',
        ok: false,
        mensaje: 'El modo pasante pierde contraste y los puentes rompen módulos. Sube la corrección a H.',
      });
    }
  }

  const fallos = comprobaciones.filter((c) => !c.ok);
  return {
    ok: fallos.length === 0,
    anchoModulo,
    ladoQR,
    ladoMinimoPieza: Math.ceil(minModulo * matriz.size + obj.borde * 2),
    comprobaciones,
  };
}

/** Altura exacta a la que insertar la pausa de cambio de filamento. */
export function cambioFilamento(o) {
  const obj = OBJETOS[o.objeto];
  const capa = o.alturaCapa ?? 0.2;

  if (o.modo === 'pasante') {
    return {
      z: null, capa: null, aplica: false,
      titulo: 'Un solo color',
      instruccion: '',
      nota: 'En modo pasante la pieza se imprime de una sola tirada: el código se lee por los huecos, a contraluz o contra una pared clara.',
    };
  }

  // El atril es el unico objeto cuyo codigo NO vive en un plano horizontal:
  // sus modulos empiezan y acaban a alturas distintas. Una pausa M600 cambia
  // el color a partir de una Z, de modo que cortaria el codigo por la mitad.
  // Con una sola boquilla no hay forma de hacerlo, y se dice, en vez de dar
  // una altura que estropearia la impresion.
  if (obj.forma === 'atril') {
    const rad = (obj.inclinacion * Math.PI) / 180;
    const recorrido = Math.round(obj.alto * Math.cos(rad));
    return {
      z: null, capa: null, aplica: false,
      titulo: 'Dos colores: aquí no vale la pausa M600',
      instruccion: '',
      nota: `El código está sobre la cara inclinada, así que sus módulos se reparten a lo largo de unos ${recorrido} mm de altura en vez de estar todos a la misma. Una pausa de cambio de filamento corta por una Z concreta y partiría el código en dos colores. Con una sola boquilla, imprime la pieza entera de un color: el relieve se lee igual por la sombra. Con doble extrusor o AMS, el 3MF ya trae panel y código como dos piezas con su color asignado.`,
    };
  }

  const z = o.modo === 'negativo'
    ? obj.grosor - (o.alturaRelieve ?? 0.8)
    : obj.grosor;
  const zAjustada = Math.round(z / capa) * capa;
  return {
    z: zAjustada,
    capa: Math.round(zAjustada / capa),
    titulo: 'Cambio de filamento',
    instruccion: `Inserta una pausa de cambio de filamento (M600) en Z = ${zAjustada.toFixed(2)} mm, al inicio de la capa ${Math.round(zAjustada / capa) + 1}.`,
    nota: '',
    aplica: true,
  };
}

export function parametrosImpresion(o) {
  const capa = o.alturaCapa ?? 0.2;
  return [
    ['Altura de capa', `${capa} mm`],
    ['Primera capa', `${(capa * 1.2).toFixed(2)} mm`],
    ['Relleno', '15 %'],
    ['Soportes', 'No hacen falta'],
    ['Perimetros', '3'],
    ['Boquilla', `${o.boquilla ?? 0.4} mm`],
  ];
}

/**
 * Marco de referencia del panel del atril.
 *
 * (u,v,w): u a lo ancho, v hacia arriba por la propia cara, w hacia el lector.
 * La base es ortonormal y de determinante +1, asi que la inversa es la
 * traspuesta y las normales no se invierten. `solape` es lo que el panel baja
 * por debajo de v = 0 para meterse dentro de la peana; `desfaseY` retrasa el
 * panel justo lo necesario para que ese trozo hundido no sobresalga por
 * delante de la peana y quede volando.
 */
function marcoAtril(obj) {
  const rad = ((obj.inclinacion ?? 0) * Math.PI) / 180;
  const sen = Math.sin(rad);
  const cos = Math.cos(rad);
  const pie = obj.pieGrosor ?? 0;
  const solape = (pie * 0.6) / cos;
  const desfaseY = solape * sen;
  return {
    sen, cos, pie, solape, desfaseY,
    aCara: (u, v, w) => [u, desfaseY + v * sen - w * cos, pie + v * cos + w * sen],
    v: (p) => (p[1] - desfaseY) * sen + (p[2] - pie) * cos,
    w: (p) => -(p[1] - desfaseY) * cos + (p[2] - pie) * sen,
  };
}

/** Caja envolvente real del atril: el panel inclinado no ocupa lo que mide. */
function medidasAtril(obj) {
  const rad = (obj.inclinacion * Math.PI) / 180;
  return {
    fondo: Math.round(Math.max(obj.pieProfundidad, obj.alto * Math.sin(rad) + obj.grosor * Math.cos(rad))),
    altura: Math.round(obj.pieGrosor + obj.alto * Math.cos(rad)),
  };
}

function ladoCodigoMm(obj) {
  if (obj.forma === 'cubo') return obj.ancho - obj.borde * 2;
  // En el atril el limite lo pone la anchura o la longitud del panel, lo que
  // sea menor: el codigo vive sobre la cara inclinada, no sobre la planta.
  if (obj.forma === 'atril') return Math.min(obj.ancho, obj.alto) - obj.borde * 2;
  // En una pieza redonda el código debe caber en el cuadrado inscrito: si no,
  // las esquinas del QR sobresalen del disco y quedan sin base debajo.
  if (obj.forma === 'circulo') return (obj.ancho - obj.borde * 2) / Math.SQRT2;
  return Math.min(obj.ancho, obj.alto) - obj.borde * 2;
}

/* ---------- construccion de la geometría ---------- */

/**
 * Genera la geometría completa.
 * @returns {{base:Malla, codigo:Malla, info:object}}
 */
export function generarGeometria(matriz, opciones = {}) {
  const o = { ...OPCIONES_3D_POR_DEFECTO, ...opciones };
  const obj = OBJETOS[o.objeto];
  if (!obj) throw new RangeError('Objeto 3D desconocido: ' + o.objeto);

  const base = new Malla();
  const codigo = new Malla();
  const paso = o.escalaMalla;
  const eps = 0.001;

  const ladoQR = ladoCodigoMm(obj);
  const anchoModulo = ladoQR / matriz.size;
  const relieve = o.alturaRelieve;

  if (obj.forma === 'cubo') {
    construirCubo(base, codigo, matriz, obj, o, anchoModulo, relieve);
    return { base, codigo, info: infoGeometria(matriz, o, obj, anchoModulo) };
  }

  if (obj.forma === 'atril') {
    construirAtril(base, codigo, matriz, obj, o, anchoModulo, relieve);
    return { base, codigo, info: infoGeometria(matriz, o, obj, anchoModulo) };
  }

  // Mascara del contorno de la pieza.
  const contorno = obj.forma === 'circulo'
    ? mascaraCirculo(obj.ancho / 2, obj.alto / 2, obj.ancho / 2)
    : mascaraRectRedondeado(obj.ancho, obj.alto, obj.radio ?? 0);

  const origenQR = [(obj.ancho - ladoQR) / 2, (obj.alto - ladoQR) / 2];

  // Mascara de los agujeros del QR en modo pasante.
  let huecoQR = () => false;
  if (o.modo === 'pasante') {
    const rects = rectangulosModulos(matriz, (v) => v);
    const puentes = calcularPuentes(matriz);
    const enHueco = (x, y) => {
      const mx = (x - origenQR[0]) / anchoModulo;
      const my = (y - origenQR[1]) / anchoModulo;
      if (mx < 0 || my < 0 || mx >= matriz.size || my >= matriz.size) return false;
      for (const [a, b, c, d] of rects) {
        if (mx >= a && mx < c && my >= b && my < d) return true;
      }
      return false;
    };
    const anchoPuente = o.boquilla;
    const enPuente = (x, y) => {
      for (const p of puentes) {
        const cx = origenQR[0] + (p.x + 0.5 + p.dx * 0.5) * anchoModulo;
        const cy = origenQR[1] + (p.y + 0.5 + p.dy * 0.5) * anchoModulo;
        if (Math.abs(x - cx) <= anchoPuente && Math.abs(y - cy) <= anchoPuente) return true;
      }
      return false;
    };
    huecoQR = (x, y) => enHueco(x, y) && !enPuente(x, y);
  }

  // Capas de la base.
  const capas = [];
  if (obj.rebaje) {
    const rec = mascaraCirculo(obj.ancho / 2, obj.alto / 2, obj.rebaje.diametro / 2);
    capas.push({ z0: 0, z1: obj.rebaje.profundidad, mascara: y_(contorno, no_(rec)) });
    capas.push({ z0: obj.rebaje.profundidad, z1: obj.grosor, mascara: contorno });
  } else if (obj.agujeros) {
    const { diametro, avellanado, margen } = obj.agujeros;
    const puntos = [
      [margen + avellanado / 2, obj.alto / 2],
      [obj.ancho - margen - avellanado / 2, obj.alto / 2],
    ];
    const corte = (r) => o_(...puntos.map(([cx, cy]) => mascaraCirculo(cx, cy, r)));
    const zAvellanado = obj.grosor - 1.2;
    capas.push({ z0: 0, z1: zAvellanado, mascara: y_(contorno, no_(corte(diametro / 2))) });
    capas.push({ z0: zAvellanado, z1: obj.grosor, mascara: y_(contorno, no_(corte(avellanado / 2))) });
  } else {
    capas.push({ z0: 0, z1: obj.grosor, mascara: contorno });
  }

  // Anilla del llavero: pestana que sobresale del borde, con su agujero.
  if (obj.anilla) {
    const { diametro, agujero } = obj.anilla;
    const cx = -diametro * 0.30;                    // solapa 2 mm con la placa
    const cy = obj.alto - diametro / 2 - 2;
    const pestana = mascaraCirculo(cx, cy, diametro / 2);
    const taladro = mascaraCirculo(cx, cy, agujero / 2);
    for (const capa of capas) {
      capa.mascara = y_(o_(capa.mascara, pestana), no_(taladro));
    }
  }

  // El modo pasante vacía los módulos en todas las capas.
  if (o.modo === 'pasante') {
    for (const capa of capas) capa.mascara = y_(capa.mascara, no_(huecoQR));
  }

  // El modo negativo hunde los módulos en la capa superior de la base.
  if (o.modo === 'negativo') {
    const rects = rectangulosModulos(matriz, (v) => v);
    const enModulo = (x, y) => {
      const mx = (x - origenQR[0]) / anchoModulo;
      const my = (y - origenQR[1]) / anchoModulo;
      for (const [a, b, c, d] of rects) {
        if (mx >= a && mx < c && my >= b && my < d) return true;
      }
      return false;
    };
    const ultima = capas[capas.length - 1];
    const zCorte = obj.grosor - relieve;
    ultima.z1 = zCorte;
    capas.push({ z0: zCorte, z1: obj.grosor, mascara: y_(contorno, no_(enModulo)) });
  }

  const margenRast = obj.anilla ? obj.anilla.diametro : 0;
  for (const capa of capas) {
    const rects = mascaraARectangulos(
      capa.mascara, -margenRast, 0, obj.ancho + margenRast, obj.alto, paso
    );
    for (const [x0, y0, x1, y1] of rects) {
      base.caja(x0 - eps, y0 - eps, capa.z0, x1 + eps, y1 + eps, capa.z1);
    }
  }

  // Módulos del código (relieve positivo y negativo usan el mismo volumen).
  if (o.modo !== 'pasante') {
    const z0 = o.modo === 'negativo' ? obj.grosor - relieve : obj.grosor;
    const z1 = o.modo === 'negativo' ? obj.grosor : obj.grosor + relieve;
    for (const [a, b, c, d] of rectangulosModulos(matriz, (v) => v)) {
      codigo.caja(
        origenQR[0] + a * anchoModulo - eps,
        origenQR[1] + b * anchoModulo - eps,
        z0 - eps,
        origenQR[0] + c * anchoModulo + eps,
        origenQR[1] + d * anchoModulo + eps,
        z1
      );
    }
  }

  // Soporte trasero inclinado de la placa de mesa.
  if (obj.soporte && o.soporte !== false) construirSoporte(base, obj);

  return { base, codigo, info: infoGeometria(matriz, o, obj, anchoModulo) };
}

function construirSoporte(base, obj) {
  // Cuna escalonada a 15 grados, impresa junto a la placa y encajada a mano.
  const ancho = obj.ancho * 0.55;
  const largo = obj.grosor * 6;
  const alto = Math.tan((15 * Math.PI) / 180) * largo;
  const pasos = 24;
  const x0 = obj.ancho + 8;
  for (let i = 0; i < pasos; i++) {
    const t0 = (i / pasos) * largo, t1 = ((i + 1) / pasos) * largo;
    const h = alto * (1 - i / pasos);
    base.caja(x0 + t0, (obj.alto - ancho) / 2, 0, x0 + t1 + 0.01, (obj.alto + ancho) / 2, Math.max(h, 1.2));
  }
  // Ranura: dos topes que sujetan la placa.
  base.caja(x0 - 0.01, (obj.alto - ancho) / 2, 0, x0 + largo, (obj.alto + ancho) / 2, 1.2);
}

/**
 * Atril de mesa: una peana plana y un panel echado hacia atras que nace de
 * ella. El codigo va sobre la cara del panel, no sobre la planta.
 *
 * Todo se construye en coordenadas del propio panel (u a lo ancho, v hacia
 * arriba por la cara, w hacia el lector) y se lleva a la pieza con una unica
 * transformacion. Asi los tres modos de relieve salen igual que en una placa
 * plana, sin repetir la logica.
 */
function construirAtril(base, codigo, matriz, obj, o, anchoModulo, relieve) {
  const paso = o.escalaMalla;
  const eps = 0.001;
  const grosor = obj.grosor;
  const { pie, solape, aCara } = marcoAtril(obj);

  // Peana: sobresale hacia atras, que es donde se va el peso al inclinarse.
  base.caja(0, 0, 0, obj.ancho, obj.pieProfundidad, pie);

  // El panel baja por debajo de v = 0 para meterse dentro de la peana; asi las
  // dos piezas comparten volumen y el laminador las funde en un solo cuerpo.
  const redondeado = mascaraRectRedondeado(obj.ancho, obj.alto + solape, obj.radio ?? 0);
  const contorno = (u, v) => redondeado(u, v + solape);

  const ladoQR = anchoModulo * matriz.size;
  const uQR = (obj.ancho - ladoQR) / 2;
  const vQR = (obj.alto - ladoQR) / 2;

  // La matriz del QR se lee de arriba abajo y v crece hacia arriba: la fila se
  // invierte al pasar de una a otra.
  const rects = rectangulosModulos(matriz, (v) => v);
  const enModulo = (u, v) => {
    const mu = (u - uQR) / anchoModulo;
    const mv = matriz.size - (v - vQR) / anchoModulo;
    if (mu < 0 || mv < 0 || mu >= matriz.size || mv >= matriz.size) return false;
    for (const [a, b, c, d] of rects) {
      if (mu >= a && mu < c && mv >= b && mv < d) return true;
    }
    return false;
  };

  const capas = [];
  if (o.modo === 'pasante') {
    const puentes = calcularPuentes(matriz);
    const anchoPuente = o.boquilla;
    const enPuente = (u, v) => {
      for (const p of puentes) {
        const cu = uQR + (p.x + 0.5 + p.dx * 0.5) * anchoModulo;
        const cv = vQR + (matriz.size - (p.y + 0.5 + p.dy * 0.5)) * anchoModulo;
        if (Math.abs(u - cu) <= anchoPuente && Math.abs(v - cv) <= anchoPuente) return true;
      }
      return false;
    };
    const hueco = (u, v) => enModulo(u, v) && !enPuente(u, v);
    capas.push({ w0: -grosor, w1: 0, mascara: y_(contorno, no_(hueco)) });
  } else if (o.modo === 'negativo') {
    capas.push({ w0: -grosor, w1: -relieve, mascara: contorno });
    capas.push({ w0: -relieve, w1: 0, mascara: y_(contorno, no_(enModulo)) });
  } else {
    capas.push({ w0: -grosor, w1: 0, mascara: contorno });
  }

  for (const capa of capas) {
    const trozos = mascaraARectangulos(
      capa.mascara, 0, -solape, obj.ancho, obj.alto + solape, paso
    );
    for (const [u0, v0, u1, v1] of trozos) {
      base.caja(u0 - eps, v0 - eps, capa.w0, u1 + eps, v1 + eps, capa.w1, aCara);
    }
  }

  if (o.modo !== 'pasante') {
    const w0 = o.modo === 'negativo' ? -relieve : 0;
    const w1 = o.modo === 'negativo' ? 0 : relieve;
    for (const [a, b, c, d] of rects) {
      codigo.caja(
        uQR + a * anchoModulo - eps,
        vQR + (matriz.size - d) * anchoModulo - eps,
        w0 - eps,
        uQR + c * anchoModulo + eps,
        vQR + (matriz.size - b) * anchoModulo + eps,
        w1,
        aCara
      );
    }
  }
}

function construirCubo(base, codigo, matriz, obj, o, anchoModulo, relieve) {
  const L = obj.ancho;
  base.caja(0, 0, 0, L, L, L);

  const rects = rectangulosModulos(matriz, (v) => v);
  const ladoQR = L - obj.borde * 2;
  const off = obj.borde;

  // Una transformacion por cara: (u,v,w) local -> (x,y,z) del cubo.
  // invertir = la transformacion tiene determinante negativo (espeja normales).
  const caras = [
    { tr: (u, v, w) => [u, v, L + w], invertir: false },   // superior
    { tr: (u, v, w) => [u, v, -w], invertir: true },       // inferior
    { tr: (u, v, w) => [u, -w, v], invertir: false },      // frontal
    { tr: (u, v, w) => [u, L + w, v], invertir: true },    // trasera
    { tr: (u, v, w) => [-w, u, v], invertir: true },       // izquierda
    { tr: (u, v, w) => [L + w, u, v], invertir: false },   // derecha
  ];
  const activas = Math.min(Math.max(o.carasCubo ?? 1, 1), 6);

  for (let c = 0; c < activas; c++) {
    const { tr, invertir } = caras[c];
    for (const [a, b, cc, d] of rects) {
      codigo.caja(
        off + a * anchoModulo, off + b * anchoModulo, 0,
        off + cc * anchoModulo, off + d * anchoModulo, relieve,
        tr, invertir
      );
    }
  }
}

function infoGeometria(matriz, o, obj, anchoModulo) {
  return {
    objeto: obj.nombre,
    dimensiones: obj.forma === 'circulo'
      ? `Diámetro ${obj.ancho} mm x ${obj.grosor} mm`
      : obj.forma === 'atril'
        ? `${obj.ancho} x ${medidasAtril(obj).fondo} x ${medidasAtril(obj).altura} mm`
          + ` (panel de ${obj.alto} mm inclinado ${obj.inclinacion}°)`
        : `${obj.ancho} x ${obj.alto} x ${obj.grosor} mm`,
    anchoModulo,
    modo: o.modo,
    version: matriz.version,
    correccion: matriz.ecl,
  };
}

/* ---------- exportacion ---------- */

function indexar(malla) {
  const mapa = new Map();
  const vertices = [];
  const indices = [];
  for (const t of malla.tri) {
    for (const v of t) {
      const k = `${v[0].toFixed(4)},${v[1].toFixed(4)},${v[2].toFixed(4)}`;
      let i = mapa.get(k);
      if (i === undefined) {
        i = vertices.length;
        vertices.push(v);
        mapa.set(k, i);
      }
      indices.push(i);
    }
  }
  return { vertices, indices };
}

function mallaAXML(malla) {
  const { vertices, indices } = indexar(malla);
  const vs = vertices
    .map((v) => `<vertex x="${v[0].toFixed(4)}" y="${v[1].toFixed(4)}" z="${v[2].toFixed(4)}"/>`)
    .join('');
  let ts = '';
  for (let i = 0; i < indices.length; i += 3) {
    ts += `<triangle v1="${indices[i]}" v2="${indices[i + 1]}" v3="${indices[i + 2]}"/>`;
  }
  return `<mesh><vertices>${vs}</vertices><triangles>${ts}</triangles></mesh>`;
}

function hexA3MF(hex) {
  const h = String(hex).replace('#', '').toUpperCase();
  return `#${h.length === 6 ? h + 'FF' : h}`;
}

/** Documento 3MF con dos objetos y sus colores asignados. */
export function construir3MFXML(geo, o) {
  const objetos = [];
  const items = [];
  let id = 2;

  const partes = [
    { malla: geo.base, color: o.colorBase, nombre: 'Base' },
    { malla: geo.codigo, color: o.colorCodigo, nombre: 'Código' },
  ].filter((p) => p.malla.numTriangulos > 0);

  const materiales = partes
    .map((p) => `<base name="${p.nombre}" displaycolor="${hexA3MF(p.color)}"/>`)
    .join('');

  partes.forEach((p, i) => {
    objetos.push(`<object id="${id}" name="${p.nombre}" type="model" pid="1" pindex="${i}">${mallaAXML(p.malla)}</object>`);
    items.push(`<item objectid="${id}"/>`);
    id++;
  });

  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<model unit="millimeter" xml:lang="en-US"'
    + ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
    + '<metadata name="Application">Generador de QR 3D</metadata>'
    + `<metadata name="Description">${geo.info.objeto} - QR versión ${geo.info.version}, corrección ${geo.info.correccion}</metadata>`
    + '<resources>'
    + `<basematerials id="1">${materiales}</basematerials>`
    + objetos.join('')
    + '</resources>'
    + `<build>${items.join('')}</build>`
    + '</model>';
}

/* ---------- ZIP mínimo (3MF es un ZIP) ---------- */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function desinflar(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Crea un ZIP a partir de {nombre: Uint8Array}. Usa deflate si el navegador lo trae. */
export async function crearZip(archivos) {
  const enc = new TextEncoder();
  const locales = [];
  const centrales = [];
  let offset = 0;

  for (const [nombre, datos] of Object.entries(archivos)) {
    const nombreBytes = enc.encode(nombre);
    const crc = crc32(datos);
    const comprimido = await desinflar(datos);
    const usaDeflate = comprimido && comprimido.length < datos.length;
    const cuerpo = usaDeflate ? comprimido : datos;
    const metodo = usaDeflate ? 8 : 0;

    const cab = new DataView(new ArrayBuffer(30));
    cab.setUint32(0, 0x04034b50, true);
    cab.setUint16(4, 20, true);
    cab.setUint16(6, 0, true);
    cab.setUint16(8, metodo, true);
    cab.setUint16(10, 0, true);
    cab.setUint16(12, 0x2821, true);       // fecha fija: salida reproducible
    cab.setUint32(14, crc, true);
    cab.setUint32(18, cuerpo.length, true);
    cab.setUint32(22, datos.length, true);
    cab.setUint16(26, nombreBytes.length, true);
    cab.setUint16(28, 0, true);
    locales.push(new Uint8Array(cab.buffer), nombreBytes, cuerpo);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0, true);
    cen.setUint16(10, metodo, true);
    cen.setUint16(12, 0, true);
    cen.setUint16(14, 0x2821, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, cuerpo.length, true);
    cen.setUint32(24, datos.length, true);
    cen.setUint16(28, nombreBytes.length, true);
    cen.setUint32(42, offset, true);
    centrales.push(new Uint8Array(cen.buffer), nombreBytes);

    offset += 30 + nombreBytes.length + cuerpo.length;
  }

  const tamCentral = centrales.reduce((s, b) => s + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, Object.keys(archivos).length, true);
  fin.setUint16(10, Object.keys(archivos).length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);

  return new Blob([...locales, ...centrales, new Uint8Array(fin.buffer)],
    { type: 'model/3mf' });
}

export async function construir3MF(geo, o) {
  const enc = new TextEncoder();
  const contentTypes = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
    + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rel0" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
    + '</Relationships>';

  return crearZip({
    '[Content_Types].xml': enc.encode(contentTypes),
    '_rels/.rels': enc.encode(rels),
    '3D/3dmodel.model': enc.encode(construir3MFXML(geo, o)),
  });
}

/** STL binario de una malla. */
export function construirSTL(malla, nombre = 'qr') {
  const n = malla.numTriangulos;
  const buffer = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buffer);
  const cabecera = new TextEncoder().encode(`Generador de QR 3D - ${nombre}`.slice(0, 79));
  new Uint8Array(buffer, 0, 80).set(cabecera);
  dv.setUint32(80, n, true);

  let off = 84;
  for (const t of malla.tri) {
    const [a, b, c] = t;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = u[1] * v[2] - u[2] * v[1];
    const ny = u[2] * v[0] - u[0] * v[2];
    const nz = u[0] * v[1] - u[1] * v[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(off, nx / len, true);
    dv.setFloat32(off + 4, ny / len, true);
    dv.setFloat32(off + 8, nz / len, true);
    off += 12;
    for (const p of t) {
      dv.setFloat32(off, p[0], true);
      dv.setFloat32(off + 4, p[1], true);
      dv.setFloat32(off + 8, p[2], true);
      off += 12;
    }
    dv.setUint16(off, 0, true);
    off += 2;
  }
  return new Blob([buffer], { type: 'model/stl' });
}

export function construirSTLCombinado(geo) {
  const todo = new Malla();
  todo.tri = geo.base.tri.concat(geo.codigo.tri);
  return construirSTL(todo, geo.info.objeto);
}

/* ---------- OpenSCAD paramétrico ---------- */

export function construirOpenSCAD(matriz, o) {
  const obj = OBJETOS[o.objeto];
  if (obj.forma === 'atril') return openSCADAtril(matriz, o, obj);
  const filas = [];
  for (let y = 0; y < matriz.size; y++) {
    filas.push('[' + matriz.modules[y].map((v) => (v ? 1 : 0)).join(',') + ']');
  }
  const esCirculo = obj.forma === 'circulo';

  return `// Código QR generado con el Generador de QR 3D
// Objeto: ${obj.nombre} — QR versión ${matriz.version}, corrección ${matriz.ecl}
// Todas las medidas están en milímetros. Cambia los parámetros y recompila.

ancho_pieza   = ${obj.ancho};
alto_pieza    = ${esCirculo ? obj.ancho : obj.alto};
grosor_pieza  = ${obj.grosor};
radio_esquina = ${obj.radio ?? 0};
borde         = ${obj.borde};
altura_codigo = ${o.alturaRelieve};
modo          = "${o.modo}";   // "positivo", "negativo" o "pasante"

módulos = ${matriz.size};
lado_qr = min(ancho_pieza, alto_pieza) - borde * 2;
m = lado_qr / módulos;

matriz = [
${filas.join(',\n')}
];

module cuerpo() {
${esCirculo
  ? '  cylinder(h = grosor_pieza, d = ancho_pieza, $fn = 128);'
  : `  hull() for (x = [radio_esquina, ancho_pieza - radio_esquina])
    for (y = [radio_esquina, alto_pieza - radio_esquina])
      translate([x, y, 0]) cylinder(h = grosor_pieza, r = max(radio_esquina, 0.01), $fn = 48);`}
}

module codigo(altura, z) {
  translate([(ancho_pieza - lado_qr) / 2, (alto_pieza - lado_qr) / 2, z])
    for (fila = [0 : módulos - 1])
      for (col = [0 : módulos - 1])
        if (matriz[fila][col] == 1)
          translate([col * m, (módulos - 1 - fila) * m, 0])
            cube([m, m, altura]);
}

if (modo == "positivo") {
  cuerpo();
  color("black") codigo(altura_codigo, grosor_pieza);
} else if (modo == "negativo") {
  difference() {
    cuerpo();
    codigo(altura_codigo + 0.01, grosor_pieza - altura_codigo);
  }
} else {
  difference() {
    cuerpo();
    codigo(grosor_pieza + 0.2, -0.1);
  }
}
`;
}

/**
 * El atril no es una placa: se emite aparte, con la inclinacion y la peana
 * como variables, que es justo lo que alguien querra tocar al recompilar.
 */
function openSCADAtril(matriz, o, obj) {
  const filas = [];
  for (let y = 0; y < matriz.size; y++) {
    filas.push('[' + matriz.modules[y].map((v) => (v ? 1 : 0)).join(',') + ']');
  }
  return `// Atril de mesa con código QR — Generador de QR 3D
// QR versión ${matriz.version}, corrección ${matriz.ecl}. Medidas en milímetros.
// El panel se levanta girando sobre su borde inferior y se hunde dentro de la
// peana, para que la union sea un solido y no dos piezas que se tocan.

ancho         = ${obj.ancho};
largo_panel   = ${obj.alto};
grosor_panel  = ${obj.grosor};
radio_esquina = ${obj.radio ?? 0};
borde         = ${obj.borde};
inclinacion   = ${obj.inclinacion};   // grados desde la vertical
peana_fondo   = ${obj.pieProfundidad};
peana_grosor  = ${obj.pieGrosor};
altura_codigo = ${o.alturaRelieve};
modo          = "${o.modo}";   // "positivo", "negativo" o "pasante"

módulos = ${matriz.size};
lado_qr = min(ancho, largo_panel) - borde * 2;
m = lado_qr / módulos;
solape = peana_grosor * 0.6 / cos(inclinacion);

matriz = [
${filas.join(',\n')}
];

// Panel tumbado: z va de -grosor_panel a 0, con la cara del código en z = 0.
module panel_plano() {
  translate([0, -solape, -grosor_panel])
    hull() for (x = [radio_esquina, ancho - radio_esquina])
      for (y = [radio_esquina, largo_panel + solape - radio_esquina])
        translate([x, y, 0]) cylinder(h = grosor_panel, r = max(radio_esquina, 0.01), $fn = 48);
}

module codigo_plano(altura, z0) {
  translate([(ancho - lado_qr) / 2, (largo_panel - lado_qr) / 2, z0])
    for (fila = [0 : módulos - 1])
      for (col = [0 : módulos - 1])
        if (matriz[fila][col] == 1)
          translate([col * m, (módulos - 1 - fila) * m, 0])
            cube([m, m, altura]);
}

module panel() {
  if (modo == "positivo") {
    panel_plano();
    color("black") codigo_plano(altura_codigo, 0);
  } else if (modo == "negativo") {
    difference() {
      panel_plano();
      codigo_plano(altura_codigo + 0.01, -altura_codigo);
    }
  } else {
    difference() {
      panel_plano();
      codigo_plano(grosor_panel + 0.2, -grosor_panel - 0.1);
    }
  }
}

// Peana.
cube([ancho, peana_fondo, peana_grosor]);

// Panel levantado sobre ella, retrasado lo justo para que el trozo hundido
// no asome por delante de la peana.
translate([0, solape * sin(inclinacion), peana_grosor])
  rotate([90 - inclinacion, 0, 0])
    panel();
`;
}

/* ---------- verificación sobre la malla ---------- */

/**
 * Rasteriza la vista cenital de la geometría generada para comprobar que el
 * código sigue leyendose DESPUES de fusionar módulos y añadir puentes.
 */
export function vistaCenital(geo, o, ladoPx = 600) {
  const obj = OBJETOS[o.objeto];

  // En las piezas planas el codigo se mira desde arriba. En el atril vive en
  // una cara inclinada: desde arriba se veria de canto y no habria nada que
  // leer, asi que se proyecta segun la normal de esa cara. La transformacion
  // del panel es ortonormal, de modo que su inversa es la traspuesta.
  const esAtril = obj.forma === 'atril';
  const marco = esAtril ? marcoAtril(obj) : null;
  const proy = esAtril
    ? (p) => [p[0], obj.alto - marco.v(p)]
    : (p) => [p[0], p[1]];
  const prof = esAtril ? (p) => marco.w(p) : (p) => p[2];

  const canvas = document.createElement('canvas');
  const escala = ladoPx / Math.max(obj.ancho, obj.alto);
  canvas.width = Math.round(obj.ancho * escala) + 80;
  canvas.height = Math.round(obj.alto * escala) + 80;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(40, 40);

  // Todas las caras van en UN solo trazado y se rellenan de una vez: si se
  // pintan triangulo a triangulo, el suavizado deja costuras blancas en las
  // diagonales y el lector deja de reconocer los módulos.
  const trazarCaras = (triangulos, filtro) => {
    ctx.beginPath();
    for (const t of triangulos) {
      if (!filtro(t)) continue;
      const a = proy(t[0]); const b = proy(t[1]); const c = proy(t[2]);
      ctx.moveTo(a[0] * escala, a[1] * escala);
      ctx.lineTo(b[0] * escala, b[1] * escala);
      ctx.lineTo(c[0] * escala, c[1] * escala);
      ctx.closePath();
    }
    ctx.fill();
  };

  if (o.modo === 'pasante') {
    // La pieza es el material; los agujeros quedan en blanco.
    ctx.fillStyle = '#0F172A';
    trazarCaras(geo.base.tri, (t) =>
      Math.abs(prof(t[0]) - prof(t[1])) <= 1e-6 && Math.abs(prof(t[0]) - prof(t[2])) <= 1e-6);
    // Invertido: en la pieza real se lee a contraluz.
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 255 - img.data[i];
      img.data[i + 1] = 255 - img.data[i + 1];
      img.data[i + 2] = 255 - img.data[i + 2];
    }
    ctx.putImageData(img, 0, 0);
  } else {
    ctx.fillStyle = '#0F172A';
    let zMax = -Infinity;
    for (const t of geo.codigo.tri) for (const v of t) if (prof(v) > zMax) zMax = prof(v);
    trazarCaras(geo.codigo.tri, (t) => Math.abs(prof(t[0]) - zMax) <= 1e-6);
  }
  ctx.restore();
  return canvas;
}

export { Malla };
