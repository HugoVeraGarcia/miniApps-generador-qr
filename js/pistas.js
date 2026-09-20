/* pistas.js — Explicaciones flotantes sobre cada control.
 *
 * El problema de un tooltip clasico: solo existe al pasar el raton. En movil
 * no hay raton, asi que la mitad de los visitantes no lo ven nunca, y con
 * teclado tampoco aparece. Aqui se muestra en los tres casos:
 *
 *   - raton      → al entrar en el control (solo en dispositivos con hover)
 *   - teclado    → al recibir el foco
 *   - tactil     → al pulsar una opcion, DESPUES de seleccionarla, y se va
 *                  sola a los pocos segundos. Asi no estorba al toque.
 *
 * Accesibilidad: la burbuja es role="tooltip" y se enlaza con aria-describedby
 * mientras esta visible, para que un lector de pantalla la anuncie. Escape la
 * cierra, que es lo que exige el criterio 1.4.13 de las WCAG para contenido que
 * aparece al pasar por encima o al enfocar.
 *
 * Un solo elemento reutilizado para todas: no se crea un nodo por control.
 */

const RETARDO_ENTRADA = 260;   // ms antes de aparecer: evita el parpadeo al pasar de largo
const DURACION_TACTIL = 4200;  // ms que dura en pantalla tras un toque
const MARGEN_BORDE = 8;        // px minimos hasta el borde de la ventana

let burbuja = null;
let objetivoActual = null;
let temporizadorEntrada = null;
let temporizadorSalida = null;
let contador = 0;

const hayHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function crearBurbuja() {
  if (burbuja) return burbuja;
  burbuja = document.createElement('div');
  burbuja.className = 'pista';
  burbuja.setAttribute('role', 'tooltip');
  burbuja.hidden = true;
  document.body.appendChild(burbuja);
  return burbuja;
}

function colocar(el) {
  const b = crearBurbuja();
  const r = el.getBoundingClientRect();
  const rb = b.getBoundingClientRect();

  /* Encima del control salvo que no quepa: entonces debajo. */
  const cabeArriba = r.top - rb.height - 10 >= MARGEN_BORDE;
  const y = cabeArriba ? r.top - rb.height - 10 : r.bottom + 10;
  b.classList.toggle('pista--abajo', !cabeArriba);

  /* Centrada sobre el control, pero sin salirse por los lados. */
  let x = r.left + r.width / 2 - rb.width / 2;
  x = Math.max(MARGEN_BORDE, Math.min(x, window.innerWidth - rb.width - MARGEN_BORDE));

  b.style.left = `${Math.round(x)}px`;
  b.style.top = `${Math.round(y)}px`;

  /* La flecha apunta al centro del control aunque la burbuja se haya desplazado. */
  const centro = r.left + r.width / 2 - x;
  b.style.setProperty('--flecha', `${Math.round(Math.max(14, Math.min(centro, rb.width - 14)))}px`);
}

function mostrar(el, texto, autoCerrar = 0) {
  if (!texto) return;
  clearTimeout(temporizadorSalida);

  const b = crearBurbuja();
  b.textContent = texto;
  b.hidden = false;
  if (!b.id) b.id = 'pista-viva';

  /* La burbuja es una sola y se reutiliza: el tono se pone y se quita en cada
     apertura, o se quedaria pegado del control anterior. */
  b.classList.toggle('pista--acento', el.dataset.pistaTono === 'acento');

  /* Se coloca en dos pasos: primero visible para poder medirla, luego situada. */
  b.classList.remove('pista--visible');
  colocar(el);
  requestAnimationFrame(() => b.classList.add('pista--visible'));

  objetivoActual = el;
  el.setAttribute('aria-describedby', b.id);

  if (autoCerrar) temporizadorSalida = setTimeout(ocultar, autoCerrar);
}

function ocultar() {
  clearTimeout(temporizadorEntrada);
  clearTimeout(temporizadorSalida);
  if (objetivoActual) {
    objetivoActual.removeAttribute('aria-describedby');
    objetivoActual = null;
  }
  if (burbuja) {
    burbuja.classList.remove('pista--visible');
    burbuja.hidden = true;
  }
}

/** Asigna un id estable a la burbuja la primera vez que se usa. */
function idBurbuja() {
  const b = crearBurbuja();
  if (!b.id) b.id = `pista-${++contador}`;
  return b.id;
}

const textoDe = (el) => el.closest('[data-pista]')?.dataset.pista || '';
const controlDe = (el) => el.closest('[data-pista]');

export function iniciarPistas(raiz = document) {
  if (raiz.__pistas) return;            // una sola vez por raíz
  raiz.__pistas = true;
  idBurbuja();

  if (hayHover()) {
    raiz.addEventListener('mouseover', (e) => {
      const el = controlDe(e.target);
      if (!el || el === objetivoActual) return;
      clearTimeout(temporizadorEntrada);
      temporizadorEntrada = setTimeout(() => mostrar(el, textoDe(el)), RETARDO_ENTRADA);
    });

    raiz.addEventListener('mouseout', (e) => {
      const el = controlDe(e.target);
      if (!el) return;
      clearTimeout(temporizadorEntrada);
      ocultar();
    });
  }

  /* Teclado: al enfocar. Vale para cualquier dispositivo. */
  raiz.addEventListener('focusin', (e) => {
    const el = controlDe(e.target);
    if (el) mostrar(el, textoDe(el));
  });
  raiz.addEventListener('focusout', () => ocultar());

  /* Táctil: después del toque, para no competir con la selección. */
  if (!hayHover()) {
    raiz.addEventListener('click', (e) => {
      const el = controlDe(e.target);
      if (el) mostrar(el, textoDe(el), DURACION_TACTIL);
    });
  }

  /* Escape la cierra: WCAG 1.4.13. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ocultar();
  });

  /* Si la página se mueve bajo la burbuja, deja de apuntar a nada. */
  window.addEventListener('scroll', ocultar, { passive: true });
  window.addEventListener('resize', ocultar, { passive: true });
}
