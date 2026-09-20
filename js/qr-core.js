/* qr-core.js — Codificador de códigos QR sin dependencias.
 * Implementa ISO/IEC 18004: modos numérico, alfanumerico y byte (UTF-8),
 * versiones 1 a 40, corrección Reed-Solomon sobre GF(256) y las 8 mascaras
 * con su evaluacion de penalización.
 *
 * Salida: objeto { size, modules, versión, ecl, mask } donde modules es un
 * array de arrays de booleanos (true = módulo oscuro), indexado [y][x].
 */

export const ECL = { L: 0, M: 1, Q: 2, H: 3 };

// Bits de formato de cada nivel de corrección (no coinciden con el indice).
const ECL_FORMAT_BITS = [1, 0, 3, 2];

// Número de codewords de corrección por bloque, indexado [ecl][versión].
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28,
    28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
    26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26,
    30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26,
    28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// Número de bloques de corrección, indexado [ecl][versión].
const NUM_EC_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7,
    8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14,
    16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21,
    20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25,
    25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

/* ---------- utilidades de bits ---------- */

class BitBuffer {
  constructor() { this.bits = []; }
  push(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() { return this.bits.length; }
}

/* ---------- detección de modo ---------- */

function isNumeric(text) { return /^[0-9]*$/.test(text); }
function isAlnum(text) { return /^[0-9A-Z $%*+\-./:]*$/.test(text); }

function toUtf8Bytes(text) {
  const out = [];
  for (const byte of new TextEncoder().encode(text)) out.push(byte);
  return out;
}

/* ---------- capacidades ---------- */

function numRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(ver, ecl) {
  return Math.floor(numRawDataModules(ver) / 8)
    - ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_EC_BLOCKS[ecl][ver];
}

function charCountBits(mode, ver) {
  const table = {
    numeric: [10, 12, 14],
    alnum: [9, 11, 13],
    byte: [8, 16, 16],
  }[mode];
  if (ver <= 9) return table[0];
  if (ver <= 26) return table[1];
  return table[2];
}

const MODE_INDICATOR = { numeric: 1, alnum: 2, byte: 4 };

/* ---------- codificacion de datos ---------- */

function encodeSegment(text, mode, bb, ver) {
  bb.push(MODE_INDICATOR[mode], 4);
  if (mode === 'numeric') {
    bb.push(text.length, charCountBits(mode, ver));
    for (let i = 0; i < text.length;) {
      const n = Math.min(3, text.length - i);
      bb.push(parseInt(text.substr(i, n), 10), n * 3 + 1);
      i += n;
    }
  } else if (mode === 'alnum') {
    bb.push(text.length, charCountBits(mode, ver));
    for (let i = 0; i < text.length;) {
      if (i + 1 < text.length) {
        bb.push(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
        i += 2;
      } else {
        bb.push(ALNUM.indexOf(text[i]), 6);
        i += 1;
      }
    }
  } else {
    const bytes = toUtf8Bytes(text);
    bb.push(bytes.length, charCountBits(mode, ver));
    for (const b of bytes) bb.push(b, 8);
  }
}

function segmentBitLength(text, mode, ver) {
  const bb = new BitBuffer();
  encodeSegment(text, mode, bb, ver);
  return bb.length;
}

/* ---------- Reed-Solomon sobre GF(256) ---------- */

function gfMultiply(a, b) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = ((z << 1) ^ ((z >>> 7) * 0x11d)) & 0xff;
    z ^= ((b >>> i) & 1) * a;
  }
  return z;
}

function rsDivisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < result.length; i++) result[i] ^= gfMultiply(divisor[i], factor);
  }
  return result;
}

/* ---------- entrelazado de bloques ---------- */

function addEcAndInterleave(data, ver, ecl) {
  const numBlocks = NUM_EC_BLOCKS[ecl][ver];
  const blockEcLen = ECC_CODEWORDS_PER_BLOCK[ecl][ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - rawCodewords % numBlocks;
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks = [];
  const divisor = rsDivisor(blockEcLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dataLen = shortBlockLen - blockEcLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.slice(k, k + dataLen);
    k += dataLen;
    const ecc = rsRemainder(dat, divisor);
    const block = Array.from(dat);
    if (i < numShortBlocks) block.push(0); // hueco para alinear el entrelazado
    for (const b of ecc) block.push(b);
    blocks.push({ block, dataLen });
  }

  const result = [];
  const maxLen = shortBlockLen + 1;
  for (let i = 0; i < maxLen; i++) {
    for (let j = 0; j < blocks.length; j++) {
      const isPadColumn = i === shortBlockLen - blockEcLen && j < numShortBlocks;
      if (isPadColumn) continue;
      if (i < blocks[j].block.length) result.push(blocks[j].block[i]);
    }
  }
  return result;
}

/* ---------- construccion de la matriz ---------- */

function alignmentPositions(ver) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = (ver === 32) ? 26
    : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

class Matrix {
  constructor(size) {
    this.size = size;
    this.modules = Array.from({ length: size }, () => new Array(size).fill(false));
    this.reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  }
  set(x, y, dark, reserve) {
    this.modules[y][x] = dark;
    if (reserve) this.reserved[y][x] = true;
  }
}

function drawFunctionPatterns(m, ver, ecl) {
  const size = m.size;

  for (let i = 0; i < size; i++) {
    m.set(6, i, i % 2 === 0, true);
    m.set(i, 6, i % 2 === 0, true);
  }

  const drawFinder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) {
          m.set(x, y, dist !== 2 && dist !== 4, true);
        }
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  const align = alignmentPositions(ver);
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      const skipCorner = (i === 0 && j === 0)
        || (i === 0 && j === align.length - 1)
        || (i === align.length - 1 && j === 0);
      if (skipCorner) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          m.set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, true);
        }
      }
    }
  }

  drawFormatBits(m, ecl, 0);
  drawVersionBits(m, ver);
}

function drawFormatBits(m, ecl, mask) {
  const size = m.size;
  const data = ECL_FORMAT_BITS[ecl] << 3 | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  const bit = (i) => ((bits >>> i) & 1) !== 0;

  for (let i = 0; i <= 5; i++) m.set(8, i, bit(i), true);
  m.set(8, 7, bit(6), true);
  m.set(8, 8, bit(7), true);
  m.set(7, 8, bit(8), true);
  for (let i = 9; i < 15; i++) m.set(14 - i, 8, bit(i), true);

  for (let i = 0; i < 8; i++) m.set(size - 1 - i, 8, bit(i), true);
  for (let i = 8; i < 15; i++) m.set(8, size - 15 + i, bit(i), true);
  m.set(8, size - 8, true, true); // módulo oscuro
}

function drawVersionBits(m, ver) {
  if (ver < 7) return;
  const size = m.size;
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (ver << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + i % 3, b = Math.floor(i / 3);
    m.set(a, b, dark, true);
    m.set(b, a, dark, true);
  }
}

function drawCodewords(m, codewords) {
  const size = m.size;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!m.reserved[y][x] && i < codewords.length * 8) {
          m.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
}

function applyMask(m, mask) {
  const size = m.size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (m.reserved[y][x]) continue;
      let invert;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = x * y % 2 + x * y % 3 === 0; break;
        case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
        case 7: invert = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
      }
      if (invert) m.modules[y][x] = !m.modules[y][x];
    }
  }
}

function penaltyScore(m) {
  const size = m.size;
  const mods = m.modules;
  let result = 0;

  // Reglas 1 y 3: rachas horizontales y patrones tipo buscador.
  for (let y = 0; y < size; y++) {
    let runColor = false, runLen = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let x = 0; x < size; x++) {
      if (mods[y][x] === runColor) {
        runLen++;
        if (runLen === 5) result += PENALTY_N1;
        else if (runLen > 5) result++;
      } else {
        finderPenaltyAddHistory(runLen, history, size);
        if (!runColor) result += finderPenaltyCountPatterns(history) * PENALTY_N3;
        runColor = mods[y][x];
        runLen = 1;
      }
    }
    result += finderPenaltyTerminate(runColor, runLen, history, size) * PENALTY_N3;
  }
  for (let x = 0; x < size; x++) {
    let runColor = false, runLen = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let y = 0; y < size; y++) {
      if (mods[y][x] === runColor) {
        runLen++;
        if (runLen === 5) result += PENALTY_N1;
        else if (runLen > 5) result++;
      } else {
        finderPenaltyAddHistory(runLen, history, size);
        if (!runColor) result += finderPenaltyCountPatterns(history) * PENALTY_N3;
        runColor = mods[y][x];
        runLen = 1;
      }
    }
    result += finderPenaltyTerminate(runColor, runLen, history, size) * PENALTY_N3;
  }

  // Regla 2: bloques de 2x2 del mismo color.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = mods[y][x];
      if (c === mods[y][x + 1] && c === mods[y + 1][x] && c === mods[y + 1][x + 1]) {
        result += PENALTY_N2;
      }
    }
  }

  // Regla 4: proporcion de módulos oscuros.
  let dark = 0;
  for (const row of mods) for (const cell of row) if (cell) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * PENALTY_N4;

  return result;
}

function finderPenaltyAddHistory(currentRunLength, history, size) {
  if (history[0] === 0) currentRunLength += size; // margen blanco virtual
  history.pop();
  history.unshift(currentRunLength);
}

function finderPenaltyCountPatterns(history) {
  const n = history[1];
  const core = n > 0 && history[2] === n && history[3] === n * 3
    && history[4] === n && history[5] === n;
  return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0)
    + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
}

function finderPenaltyTerminate(currentRunColor, currentRunLength, history, size) {
  if (currentRunColor) {
    finderPenaltyAddHistory(currentRunLength, history, size);
    currentRunLength = 0;
  }
  currentRunLength += size;
  finderPenaltyAddHistory(currentRunLength, history, size);
  return finderPenaltyCountPatterns(history);
}

/* ---------- API publica ---------- */

/**
 * Codifica un texto en una matriz QR.
 * @param {string} text          contenido a codificar
 * @param {object} [options]
 * @param {'L'|'M'|'Q'|'H'} [options.ecl='M']  nivel de corrección mínimo
 * @param {number} [options.mask=-1]           mascara fija, -1 para automatica
 * @param {boolean} [options.boost=true]       sube el nivel de corrección si cabe
 * @param {number} [options.minVersion=1]
 * @param {number} [options.maxVersion=40]
 */
export function encode(text, options = {}) {
  const {
    ecl: eclName = 'M', mask: forcedMask = -1, boost = true,
    minVersion = 1, maxVersion = 40,
  } = options;

  if (typeof text !== 'string') throw new TypeError('El contenido debe ser texto');
  if (text.length === 0) throw new RangeError('El contenido está vacio');

  let ecl = ECL[eclName];
  if (ecl === undefined) throw new RangeError('Nivel de corrección no valido: ' + eclName);

  const mode = isNumeric(text) ? 'numeric' : (isAlnum(text) ? 'alnum' : 'byte');

  // Versión mínima que admite el contenido con el nivel pedido.
  let version = -1, dataCapacityBits = 0;
  for (let v = minVersion; v <= maxVersion; v++) {
    const capacity = numDataCodewords(v, ecl) * 8;
    if (segmentBitLength(text, mode, v) <= capacity) {
      version = v;
      dataCapacityBits = capacity;
      break;
    }
  }
  if (version === -1) {
    throw new RangeError('El contenido no cabe en un código QR con este nivel de correccion');
  }

  // Sube el nivel de corrección mientras el contenido siga cabiendo.
  if (boost) {
    for (const candidate of [ECL.M, ECL.Q, ECL.H]) {
      if (candidate > ecl && segmentBitLength(text, mode, version) <= numDataCodewords(version, candidate) * 8) {
        ecl = candidate;
        dataCapacityBits = numDataCodewords(version, ecl) * 8;
      }
    }
  }

  // Cadena de bits: segmento + terminador + relleno.
  const bb = new BitBuffer();
  encodeSegment(text, mode, bb, version);
  bb.push(0, Math.min(4, dataCapacityBits - bb.length));
  bb.push(0, (8 - bb.length % 8) % 8);
  for (let padByte = 0xec; bb.length < dataCapacityBits; padByte ^= 0xec ^ 0x11) {
    bb.push(padByte, 8);
  }

  const dataCodewords = new Uint8Array(bb.length / 8);
  bb.bits.forEach((bit, i) => { dataCodewords[i >>> 3] |= bit << (7 - (i & 7)); });

  const allCodewords = addEcAndInterleave(dataCodewords, version, ecl);

  // Matriz: patrones fijos, datos y elección de mascara.
  const size = version * 4 + 17;
  const m = new Matrix(size);
  drawFunctionPatterns(m, version, ecl);
  drawCodewords(m, allCodewords);

  let mask = forcedMask;
  if (mask === -1) {
    let minPenalty = Infinity;
    for (let i = 0; i < 8; i++) {
      applyMask(m, i);
      drawFormatBits(m, ecl, i);
      const penalty = penaltyScore(m);
      if (penalty < minPenalty) { mask = i; minPenalty = penalty; }
      applyMask(m, i); // deshace
    }
  }
  applyMask(m, mask);
  drawFormatBits(m, ecl, mask);

  const eclName2 = ['L', 'M', 'Q', 'H'][ecl];
  return { size, modules: m.modules, version, ecl: eclName2, mask, mode };
}

/** Capacidad máxima en caracteres para un modo y nivel dados (referencia de UI). */
export function maxCapacity(eclName = 'M', mode = 'byte') {
  const ecl = ECL[eclName];
  const bits = numDataCodewords(40, ecl) * 8 - 4 - charCountBits(mode, 40);
  if (mode === 'byte') return Math.floor(bits / 8);
  if (mode === 'alnum') return Math.floor(bits / 11) * 2;
  return Math.floor(bits / 10) * 3;
}
