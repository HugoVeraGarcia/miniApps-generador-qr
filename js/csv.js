/* csv.js — Lectura de CSV pegado o subido.
 *
 * Detecta el separador (coma, punto y coma o tabulador: Excel en español
 * exporta con punto y coma), respeta las comillas y los saltos de línea
 * dentro de un campo, y quita el BOM que Excel pone al principio.
 */

/** Cuenta ocurrencias fuera de comillas para adivinar el separador. */
function detectarSeparador(texto) {
  const primera = texto.split(/\r?\n/).find((l) => l.trim()) || '';
  const cuenta = (c) => {
    let n = 0, dentro = false;
    for (const ch of primera) {
      if (ch === '"') dentro = !dentro;
      else if (ch === c && !dentro) n++;
    }
    return n;
  };
  const candidatos = [[',', cuenta(',')], [';', cuenta(';')], ['\t', cuenta('\t')]];
  candidatos.sort((a, b) => b[1] - a[1]);
  return candidatos[0][1] > 0 ? candidatos[0][0] : ',';
}

/**
 * @returns {{cabeceras:string[], filas:string[][], separador:string}}
 */
export function analizar(texto) {
  const limpio = String(texto).replace(/^﻿/, '');
  const sep = detectarSeparador(limpio);

  const filas = [];
  let fila = [], campo = '', dentro = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (dentro) {
      if (c === '"') {
        if (limpio[i + 1] === '"') { campo += '"'; i++; }
        else dentro = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { dentro = true; continue; }
    if (c === sep) { fila.push(campo); campo = ''; continue; }
    if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }

  const utiles = filas.filter((f) => f.some((v) => v.trim() !== ''));
  if (!utiles.length) return { cabeceras: [], filas: [], separador: sep };

  const cabeceras = utiles[0].map((h) => h.trim().toLowerCase());
  return { cabeceras, filas: utiles.slice(1), separador: sep };
}

/**
 * Convierte el CSV en registros con las columnas que entiende el generador.
 * Si no hay cabecera reconocible, se toma la primera columna como contenido.
 *
 * @returns {{registros:Array<object>, avisos:string[]}}
 */
export function aRegistros(texto, maximo = 500) {
  const { cabeceras, filas } = analizar(texto);
  const avisos = [];
  if (!cabeceras.length) return { registros: [], avisos: ['El archivo está vacío.'] };

  const alias = {
    contenido: ['contenido', 'texto', 'url', 'enlace', 'link', 'valor', 'dato'],
    etiqueta: ['etiqueta', 'nombre', 'titulo', 'título', 'label', 'mesa', 'descripcion', 'descripción'],
    color: ['color', 'color del codigo', 'color del código'],
    estilo: ['estilo'],
  };
  const indice = {};
  for (const [clave, nombres] of Object.entries(alias)) {
    indice[clave] = cabeceras.findIndex((h) => nombres.includes(h));
  }

  let inicio = 0;
  if (indice.contenido === -1) {
    // Sin cabecera reconocible: la primera columna es el contenido y la
    // primera fila también es un dato, no un título.
    indice.contenido = 0;
    indice.etiqueta = cabeceras.length > 1 ? 1 : -1;
    filas.unshift(cabeceras);
    avisos.push('No se ha encontrado una cabecera con la columna "contenido": se usa la primera columna.');
    inicio = 0;
  }

  const registros = [];
  for (const fila of filas.slice(inicio)) {
    const contenido = (fila[indice.contenido] || '').trim();
    if (!contenido) continue;
    registros.push({
      contenido,
      etiqueta: indice.etiqueta >= 0 ? (fila[indice.etiqueta] || '').trim() : '',
      color: indice.color >= 0 ? (fila[indice.color] || '').trim() : '',
      estilo: indice.estilo >= 0 ? (fila[indice.estilo] || '').trim() : '',
    });
  }

  if (registros.length > maximo) {
    avisos.push(`El archivo trae ${registros.length} filas y el máximo son ${maximo}. Se generarán las primeras ${maximo}.`);
    registros.length = maximo;
  }
  if (!registros.length) avisos.push('No se ha encontrado ninguna fila con contenido.');

  return { registros, avisos };
}

export const PLANTILLA_CSV = `contenido,etiqueta
https://mirestaurante.pe/carta,Mesa 1
https://mirestaurante.pe/carta,Mesa 2
https://mirestaurante.pe/carta,Mesa 3
`;

export const EJEMPLOS = {
  mesas: {
    nombre: 'Mesas de un restaurante',
    csv: 'contenido,etiqueta\n'
      + Array.from({ length: 12 }, (_, i) =>
        `https://mirestaurante.pe/carta?mesa=${i + 1},Mesa ${i + 1}`).join('\n') + '\n',
  },
  inventario: {
    nombre: 'Inventario de activos',
    csv: 'contenido,etiqueta\n'
      + ['EQ-0001,Laptop dirección', 'EQ-0002,Proyector sala A', 'EQ-0003,Impresora 3D',
         'EQ-0004,Taladro percutor', 'EQ-0005,Escalera 4 m', 'EQ-0006,Carretilla']
        .join('\n') + '\n',
  },
  evento: {
    nombre: 'Credenciales de un evento',
    csv: 'contenido,etiqueta\n'
      + ['https://mievento.pe/acreditacion/A101,Ana Quispe',
         'https://mievento.pe/acreditacion/A102,Luis Ramos',
         'https://mievento.pe/acreditacion/A103,Marta Chávez',
         'https://mievento.pe/acreditacion/A104,Jorge Salas',
         'https://mievento.pe/acreditacion/A105,Rosa Medina'].join('\n') + '\n',
  },
};
