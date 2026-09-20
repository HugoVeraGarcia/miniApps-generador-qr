/* historial.js — Los últimos códigos generados, guardados solo en el
 * navegador del usuario. Ni el contenido ni las miniaturas salen del
 * dispositivo. Toda lectura y escritura va envuelta: en ventana privada o con
 * el almacenamiento bloqueado, la aplicacion sigue funcionando sin historial.
 */

const CLAVE = 'qr3d.historial.v1';
const MAXIMO = 20;

function leerCrudo() {
  try {
    const raw = localStorage.getItem(CLAVE);
    const datos = raw ? JSON.parse(raw) : [];
    return Array.isArray(datos) ? datos : [];
  } catch { return []; }
}

function escribirCrudo(lista) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, MAXIMO)));
    return true;
  } catch { return false; }
}

export function disponible() {
  try {
    const k = '__qr3d_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch { return false; }
}

export function listar() { return leerCrudo(); }

/**
 * Guarda una entrada. Si ya existe una con el mismo contenido, la sube arriba
 * en vez de duplicarla.
 * @param {{tipo:string, valores:object, contenido:string, opciones:object, miniatura:string}} entrada
 */
export function guardar(entrada) {
  const lista = leerCrudo().filter((e) => e.contenido !== entrada.contenido);
  lista.unshift({ ...entrada, fecha: Date.now() });
  return escribirCrudo(lista);
}

export function borrar(contenido) {
  return escribirCrudo(leerCrudo().filter((e) => e.contenido !== contenido));
}

export function vaciar() {
  try { localStorage.removeItem(CLAVE); return true; } catch { return false; }
}

export function fechaLegible(ms) {
  const d = new Date(ms);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return mismoDia
    ? `Hoy, ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}
