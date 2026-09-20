/* estado.js — Serialización del estado del generador en la URL.
 *
 * Lo usan el generador (para que cualquier resultado sea compartible) y el
 * lector (para pasar al generador un código que se acaba de decodificar).
 */

export function codificarEstado(estado) {
  try {
    const json = JSON.stringify(estado);
    const bytes = new TextEncoder().encode(json);
    let binario = '';
    for (const b of bytes) binario += String.fromCharCode(b);
    return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

export function decodificarEstado(texto) {
  try {
    const b = texto.replace(/-/g, '+').replace(/_/g, '/');
    const binario = atob(b);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Enlace al generador con un estado ya cargado. */
export function enlaceGenerador(estado, ruta = '/') {
  const d = codificarEstado(estado);
  return d ? `${ruta}?d=${d}` : ruta;
}
