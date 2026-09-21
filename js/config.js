/* config.js — Los cuatro valores que cambian al poner el sitio en produccion.
 *
 * Todo lo demas del proyecto lee de aquí. No hay identificadores ni dominios
 * repartidos por el codigo: se rellenan estos campos una vez y ya.
 *
 *  1. dominio    — el dominio comprado, sin barra final.
 *  2. marca      — el nombre que aparece en la cabecera, el pie y los textos.
 *  3. adsense    — el ID de editor (ca-pub-...) y el ID de cada bloque.
 *  4. analitica  — el ID de medicion de GA4 (G-...).
 *
 * Mientras esten vacios el sitio funciona igual: no se carga AdSense, no se
 * carga GA4 y las URL absolutas se resuelven contra el dominio actual.
 */

export const CONFIG = {
  dominio: 'https://qr.microtools.lat',
  marca: 'microtools',
  correo: 'soporte.microtools.lat@gmail.com',

  adsense: {
    cliente: 'ca-pub-4794558545797945',
    bloques: {
      top: '',              // ID del bloque display horizontal
      mid: '',              // ID del bloque in-article
      bottom: '',           // ID del bloque display inferior
      descarga: '',         // ID del bloque 300x250 del paso 3
    },
  },

  analitica: {
    ga4: '',                // 'G-XXXXXXXXXX'
  },
};

export const listoAdSense = () => Boolean(CONFIG.adsense.cliente);
export const listoAnalitica = () => Boolean(CONFIG.analitica.ga4);

export function urlAbsoluta(ruta) {
  const base = CONFIG.dominio || (typeof location !== 'undefined' ? location.origin : '');
  return base.replace(/\/$/, '') + ruta;
}

/** Escribe la marca en todos los elementos marcados con data-marca. */
export function aplicarMarca(raiz = document) {
  for (const el of raiz.querySelectorAll('[data-marca]')) el.textContent = CONFIG.marca;
  for (const el of raiz.querySelectorAll('[data-correo]')) {
    if (!CONFIG.correo) { el.closest('[data-correo-bloque]')?.remove(); continue; }
    el.textContent = CONFIG.correo;
    if (el.tagName === 'A') el.href = 'mailto:' + CONFIG.correo;
  }
}
