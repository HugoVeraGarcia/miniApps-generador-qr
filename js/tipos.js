/* tipos.js — Tipos de contenido del QR.
 *
 * Cada tipo declara sus campos y la funcion que los convierte en la cadena
 * que se codifica. El formulario se construye solo a partir de está tabla.
 */

const escapeWifi = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');

/** Normaliza un teléfono a digitos con prefijo internacional. */
export function normalizarTelefono(valor, paisPorDefecto = '51') {
  let d = String(valor || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d.slice(1);
  if (d.startsWith('00')) return d.slice(2);
  if (d.length <= 9) return paisPorDefecto + d;
  return d;
}

export const TIPOS = {
  enlace: {
    nombre: 'Enlace o texto',
    pista: 'Para una página web, la carta de un restaurante, tu perfil de reseñas o cualquier texto suelto. Es el más usado.',
    ayuda: 'Vale cualquier cosa: la carta del restaurante, tu página de reseñas, tu Instagram o un texto suelto.',
    campos: [
      { id: 'valor', etiqueta: 'Enlace, texto o número de teléfono', tipo: 'text', placeholder: 'https://mirestaurante.com/carta', requerido: true },
    ],
    cta: 'ESCANÉAME',
    serializar: (v) => {
      const t = (v.valor || '').trim();
      if (/^(https?:\/\/|mailto:|tel:|geo:|WIFI:|BEGIN:)/i.test(t)) return t;
      if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t)) return 'mailto:' + t;
      if (/^[\d\s()+-]{7,}$/.test(t)) return 'tel:+' + normalizarTelefono(t);
      if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return 'https://' + t;
      return t;
    },
  },

  wifi: {
    nombre: 'WiFi',
    pista: 'Quien lo escanee se conecta a tu red sin teclear la contraseña. Ideal para la recepción de un local o para invitados en casa.',
    ayuda: 'Quien lo escanee se conecta a tu red sin escribir la contraseña. Funciona en Android y en iPhone.',
    campos: [
      { id: 'ssid', etiqueta: 'Nombre de la red (SSID)', tipo: 'text', placeholder: 'Café Extra Grande', requerido: true },
      { id: 'clave', etiqueta: 'Contraseña', tipo: 'text', placeholder: 'la-contraseña-del-wifi' },
      { id: 'cifrado', etiqueta: 'Seguridad', tipo: 'select', opciones: [['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'Red abierta, sin contraseña']], valor: 'WPA' },
      { id: 'oculta', etiqueta: 'La red está oculta', tipo: 'checkbox' },
    ],
    cta: 'WIFI GRATIS',
    serializar: (v) => {
      const cifrado = v.cifrado || 'WPA';
      const clave = cifrado === 'nopass' ? '' : escapeWifi(v.clave || '');
      return `WIFI:T:${cifrado};S:${escapeWifi(v.ssid || '')};P:${clave};H:${v.oculta ? 'true' : 'false'};;`;
    },
  },

  whatsapp: {
    nombre: 'WhatsApp',
    pista: 'Abre un chat contigo con el mensaje ya escrito: la persona solo pulsa enviar. El mensaje previo es lo que más cambia los resultados.',
    ayuda: 'Abre un chat contigo con el mensaje ya escrito. Solo tiene que darle a enviar.',
    campos: [
      { id: 'pais', etiqueta: 'Código de país', tipo: 'text', placeholder: '51', valor: '51', ancho: 'corto' },
      { id: 'numero', etiqueta: 'Número de WhatsApp', tipo: 'tel', placeholder: '987 654 321', requerido: true },
      { id: 'mensaje', etiqueta: 'Mensaje que aparece escrito', tipo: 'textarea', placeholder: 'Hola, vengo de tu QR y quiero información sobre...' },
    ],
    cta: 'ESCRÍBENOS',
    serializar: (v) => {
      const tel = normalizarTelefono(v.numero, (v.pais || '51').replace(/\D/g, ''));
      const texto = v.mensaje ? '?text=' + encodeURIComponent(v.mensaje) : '';
      return `https://wa.me/${tel}${texto}`;
    },
  },

  vcard: {
    nombre: 'Contacto',
    pista: 'Guarda tu ficha completa en la agenda del teléfono de un toque. Es el QR de una tarjeta de visita bien hecha.',
    ayuda: 'Al escanearlo se guarda tu ficha en la agenda del teléfono. Es el QR de las tarjetas de visita.',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', tipo: 'text', requerido: true },
      { id: 'apellidos', etiqueta: 'Apellidos', tipo: 'text' },
      { id: 'empresa', etiqueta: 'Empresa', tipo: 'text' },
      { id: 'cargo', etiqueta: 'Cargo', tipo: 'text' },
      { id: 'telefono', etiqueta: 'Teléfono', tipo: 'tel' },
      { id: 'email', etiqueta: 'Correo', tipo: 'email' },
      { id: 'web', etiqueta: 'Sitio web', tipo: 'text' },
      { id: 'direccion', etiqueta: 'Dirección', tipo: 'text' },
    ],
    cta: 'MI CONTACTO',
    serializar: (v) => [
      'BEGIN:VCARD', 'VERSION:3.0',
      `N:${v.apellidos || ''};${v.nombre || ''};;;`,
      `FN:${[v.nombre, v.apellidos].filter(Boolean).join(' ')}`,
      v.empresa ? `ORG:${v.empresa}` : null,
      v.cargo ? `TITLE:${v.cargo}` : null,
      v.telefono ? `TEL;TYPE=CELL:+${normalizarTelefono(v.telefono)}` : null,
      v.email ? `EMAIL:${v.email}` : null,
      v.web ? `URL:${/^https?:/.test(v.web) ? v.web : 'https://' + v.web}` : null,
      v.direccion ? `ADR:;;${v.direccion};;;;` : null,
      'END:VCARD',
    ].filter(Boolean).join('\n'),
  },

  resenas: {
    nombre: 'Reseñas de Google',
    pista: 'Lleva directo al formulario de reseña de tu negocio, con las estrellas ya listas. No a tu ficha: al formulario.',
    ayuda: 'Lleva directo al formulario de reseñas de tu ficha. Pega el Place ID de tu negocio.',
    campos: [
      { id: 'placeid', etiqueta: 'Place ID de Google', tipo: 'text', placeholder: 'ChIJ...', requerido: true },
    ],
    cta: 'DÉJANOS TU RESEÑA',
    serializar: (v) => `https://search.google.com/local/writereview?placeid=${encodeURIComponent((v.placeid || '').trim())}`,
  },



  email: {
    nombre: 'Correo',
    pista: 'Abre el correo del visitante con tu dirección, el asunto y el mensaje ya rellenados.',
    campos: [
      { id: 'para', etiqueta: 'Destinatario', tipo: 'email', requerido: true },
      { id: 'asunto', etiqueta: 'Asunto', tipo: 'text' },
      { id: 'cuerpo', etiqueta: 'Mensaje', tipo: 'textarea' },
    ],
    cta: 'ESCRÍBENOS',
    serializar: (v) => {
      const q = [];
      if (v.asunto) q.push('subject=' + encodeURIComponent(v.asunto));
      if (v.cuerpo) q.push('body=' + encodeURIComponent(v.cuerpo));
      return `mailto:${v.para || ''}${q.length ? '?' + q.join('&') : ''}`;
    },
  },

  sms: {
    nombre: 'SMS',
    pista: 'Abre un SMS con tu número y el texto redactado. Útil donde WhatsApp no es lo habitual.',
    campos: [
      { id: 'numero', etiqueta: 'Número', tipo: 'tel', requerido: true },
      { id: 'mensaje', etiqueta: 'Mensaje', tipo: 'textarea' },
    ],
    cta: 'ENVÍANOS UN SMS',
    serializar: (v) => `smsto:+${normalizarTelefono(v.numero)}:${v.mensaje || ''}`,
  },

  telefono: {
    nombre: 'Llamada',
    pista: 'Al escanearlo, el teléfono marca tu número. Un toque y te llaman.',
    campos: [{ id: 'numero', etiqueta: 'Número de teléfono', tipo: 'tel', requerido: true }],
    cta: 'LLÁMANOS',
    serializar: (v) => `tel:+${normalizarTelefono(v.numero)}`,
  },

  ubicacion: {
    nombre: 'Ubicación',
    pista: 'Abre el mapa en el punto exacto que indiques. Con coordenadas nunca se equivoca; con dirección, el mapa tiene que interpretarla.',
    ayuda: 'Abre el mapa en el punto exacto. Copia las coordenadas desde Google Maps.',
    campos: [
      { id: 'lat', etiqueta: 'Latitud', tipo: 'text', placeholder: '-12.046374', requerido: true, ancho: 'corto' },
      { id: 'lon', etiqueta: 'Longitud', tipo: 'text', placeholder: '-77.042793', requerido: true, ancho: 'corto' },
      { id: 'comoLlegar', etiqueta: 'Abrir con indicaciones para llegar', tipo: 'checkbox', valor: true },
    ],
    cta: 'CÓMO LLEGAR',
    serializar: (v) => (v.comoLlegar
      ? `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lon}`
      : `geo:${v.lat},${v.lon}`),
  },

  evento: {
    nombre: 'Evento',
    pista: 'Añade el evento al calendario del visitante, con lugar y horario. Para invitaciones y carteles.',
    campos: [
      { id: 'titulo', etiqueta: 'Título del evento', tipo: 'text', requerido: true },
      { id: 'lugar', etiqueta: 'Lugar', tipo: 'text' },
      { id: 'inicio', etiqueta: 'Empieza el', tipo: 'datetime-local', requerido: true },
      { id: 'fin', etiqueta: 'Termina el', tipo: 'datetime-local' },
    ],
    cta: 'GUARDA LA FECHA',
    serializar: (v) => {
      const fmt = (s) => (s ? s.replace(/[-:]/g, '').replace(/\.\d+/, '') + '00' : '');
      return [
        'BEGIN:VEVENT',
        `SUMMARY:${v.titulo || ''}`,
        v.lugar ? `LOCATION:${v.lugar}` : null,
        v.inicio ? `DTSTART:${fmt(v.inicio)}` : null,
        v.fin ? `DTEND:${fmt(v.fin)}` : null,
        'END:VEVENT',
      ].filter(Boolean).join('\n');
    },
  },

  red: {
    nombre: 'Red social',
    pista: 'Abre tu perfil en la aplicación si la tiene instalada, y en el navegador si no.',
    campos: [
      {
        id: 'plataforma', etiqueta: 'Plataforma', tipo: 'select', valor: 'instagram',
        opciones: [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'], ['x', 'X']],
      },
      { id: 'usuario', etiqueta: 'Usuario (sin la arroba)', tipo: 'text', placeholder: 'miquiosco', requerido: true },
    ],
    cta: 'SÍGUENOS',
    serializar: (v) => {
      const u = (v.usuario || '').replace(/^@/, '').trim();
      const base = {
        instagram: 'https://instagram.com/', tiktok: 'https://tiktok.com/@',
        facebook: 'https://facebook.com/', youtube: 'https://youtube.com/@',
        linkedin: 'https://linkedin.com/in/', x: 'https://x.com/',
      }[v.plataforma || 'instagram'];
      return base + u;
    },
  },
};

/** Valores iniciales de un tipo, mezclados con lo que traiga la URL. */
export function valoresPorDefecto(tipo) {
  const def = {};
  for (const campo of TIPOS[tipo].campos) {
    if (campo.valor !== undefined) def[campo.id] = campo.valor;
    else if (campo.tipo === 'checkbox') def[campo.id] = false;
    else def[campo.id] = '';
  }
  return def;
}

/** Comprueba los campos obligatorios y devuelve los que faltan. */
export function camposFaltantes(tipo, valores) {
  return TIPOS[tipo].campos
    .filter((c) => c.requerido && !String(valores[c.id] ?? '').trim())
    .map((c) => c.etiqueta);
}

export function serializar(tipo, valores) {
  return TIPOS[tipo].serializar(valores);
}
