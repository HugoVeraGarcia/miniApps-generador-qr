/* interpretar.js — Del texto decodificado al tipo de contenido.
 *
 * Es el camino inverso de tipos.js: recibe lo que había dentro de un código y
 * deduce qué era, para mostrarlo con sus campos y poder reabrirlo en el
 * generador sin que el usuario vuelva a teclear nada.
 */

/** Deshace los escapes del formato WIFI: (\\ \; \, \: \") */
function desescaparWifi(s) {
  return String(s).replace(/\\([\\;,:"])/g, '$1');
}

/** Parte "WIFI:T:WPA;S:Mi red;P:clave;H:false;;" respetando los escapes. */
function partesWifi(texto) {
  const cuerpo = texto.slice(5);
  const campos = {};
  let clave = '', valor = '', enValor = false, escapando = false;
  for (const c of cuerpo) {
    if (escapando) { valor += '\\' + c; escapando = false; continue; }
    if (c === '\\') { escapando = true; continue; }
    if (c === ':' && !enValor) { enValor = true; continue; }
    if (c === ';') {
      if (clave) campos[clave.toUpperCase()] = desescaparWifi(valor);
      clave = ''; valor = ''; enValor = false;
      continue;
    }
    if (enValor) valor += c; else clave += c;
  }
  return campos;
}

function partesVcard(texto) {
  const campos = {};
  for (const linea of texto.split(/\r?\n/)) {
    const i = linea.indexOf(':');
    if (i < 0) continue;
    const clave = linea.slice(0, i).split(';')[0].toUpperCase();
    campos[clave] = linea.slice(i + 1);
  }
  return campos;
}

function partesVevento(texto) {
  const campos = {};
  for (const linea of texto.split(/\r?\n/)) {
    const i = linea.indexOf(':');
    if (i < 0) continue;
    campos[linea.slice(0, i).split(';')[0].toUpperCase()] = linea.slice(i + 1);
  }
  return campos;
}

/** "20260919T143000" → "2026-09-19T14:30" (lo que espera datetime-local) */
function fechaIso(s) {
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] || '00'}:${m[5] || '00'}`;
}

const REDES = [
  [/^https?:\/\/(?:www\.)?instagram\.com\/([^/?#]+)/i, 'instagram'],
  [/^https?:\/\/(?:www\.)?tiktok\.com\/@([^/?#]+)/i, 'tiktok'],
  [/^https?:\/\/(?:www\.)?facebook\.com\/([^/?#]+)/i, 'facebook'],
  [/^https?:\/\/(?:www\.)?youtube\.com\/@([^/?#]+)/i, 'youtube'],
  [/^https?:\/\/(?:www\.)?linkedin\.com\/in\/([^/?#]+)/i, 'linkedin'],
  [/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)/i, 'x'],
];

/**
 * @returns {{tipo:string, nombre:string, campos:Array<[string,string]>,
 *            valores:object, abrir:string|null}}
 */
export function interpretar(contenido) {
  const t = String(contenido || '').trim();

  if (/^WIFI:/i.test(t)) {
    const c = partesWifi(t);
    const cifrado = (c.T || 'WPA').toLowerCase() === 'nopass' ? 'nopass' : (c.T || 'WPA').toUpperCase();
    return {
      tipo: 'wifi',
      nombre: 'Red WiFi',
      campos: [
        ['Red (SSID)', c.S || ''],
        ['Contraseña', cifrado === 'nopass' ? '(red abierta)' : (c.P || '')],
        ['Seguridad', cifrado === 'nopass' ? 'Abierta' : cifrado],
        ...(String(c.H).toLowerCase() === 'true' ? [['Red oculta', 'Sí']] : []),
      ],
      valores: { ssid: c.S || '', clave: c.P || '', cifrado, oculta: String(c.H).toLowerCase() === 'true' },
      abrir: null,
    };
  }

  if (/^BEGIN:VCARD/i.test(t)) {
    const c = partesVcard(t);
    const [apellidos = '', nombre = ''] = (c.N || '').split(';');
    return {
      tipo: 'vcard',
      nombre: 'Ficha de contacto',
      campos: [
        ['Nombre', c.FN || `${nombre} ${apellidos}`.trim()],
        ['Empresa', c.ORG || ''], ['Cargo', c.TITLE || ''],
        ['Teléfono', c.TEL || ''], ['Correo', c.EMAIL || ''],
        ['Web', c.URL || ''], ['Dirección', (c.ADR || '').replace(/^;+|;+$/g, '').replace(/;/g, ', ')],
      ].filter(([, v]) => v),
      valores: {
        nombre, apellidos, empresa: c.ORG || '', cargo: c.TITLE || '',
        telefono: c.TEL || '', email: c.EMAIL || '', web: c.URL || '',
        direccion: (c.ADR || '').replace(/^;+|;+$/g, '').replace(/;/g, ' '),
      },
      abrir: null,
    };
  }

  if (/^BEGIN:VEVENT/i.test(t)) {
    const c = partesVevento(t);
    return {
      tipo: 'evento',
      nombre: 'Evento de calendario',
      campos: [
        ['Título', c.SUMMARY || ''], ['Lugar', c.LOCATION || ''],
        ['Empieza', fechaIso(c.DTSTART).replace('T', ' ')],
        ['Termina', fechaIso(c.DTEND).replace('T', ' ')],
      ].filter(([, v]) => v),
      valores: {
        titulo: c.SUMMARY || '', lugar: c.LOCATION || '',
        inicio: fechaIso(c.DTSTART), fin: fechaIso(c.DTEND),
      },
      abrir: null,
    };
  }

  const wa = t.match(/^https?:\/\/(?:api\.whatsapp\.com\/send\?phone=|wa\.me\/)(\d+)(?:[?&]text=([^&]*))?/i);
  if (wa) {
    const mensaje = wa[2] ? decodeURIComponent(wa[2].replace(/\+/g, ' ')) : '';
    return {
      tipo: 'whatsapp',
      nombre: 'Chat de WhatsApp',
      campos: [['Número', '+' + wa[1]], ...(mensaje ? [['Mensaje', mensaje]] : [])],
      valores: { pais: '', numero: '+' + wa[1], mensaje },
      abrir: t,
    };
  }

  const resena = t.match(/writereview\?placeid=([^&]+)/i);
  if (resena) {
    return {
      tipo: 'resenas',
      nombre: 'Reseña de Google',
      campos: [['Place ID', decodeURIComponent(resena[1])]],
      valores: { placeid: decodeURIComponent(resena[1]) },
      abrir: t,
    };
  }

  if (/^mailto:/i.test(t)) {
    const u = new URL(t);
    return {
      tipo: 'email',
      nombre: 'Correo electrónico',
      campos: [
        ['Para', decodeURIComponent(u.pathname)],
        ['Asunto', u.searchParams.get('subject') || ''],
        ['Mensaje', u.searchParams.get('body') || ''],
      ].filter(([, v]) => v),
      valores: {
        para: decodeURIComponent(u.pathname),
        asunto: u.searchParams.get('subject') || '',
        cuerpo: u.searchParams.get('body') || '',
      },
      abrir: t,
    };
  }

  const sms = t.match(/^smsto:([^:]*):?([\s\S]*)$/i);
  if (sms) {
    return {
      tipo: 'sms',
      nombre: 'Mensaje SMS',
      campos: [['Número', sms[1]], ...(sms[2] ? [['Mensaje', sms[2]]] : [])],
      valores: { numero: sms[1], mensaje: sms[2] || '' },
      abrir: t,
    };
  }

  if (/^tel:/i.test(t)) {
    return {
      tipo: 'telefono', nombre: 'Llamada telefónica',
      campos: [['Número', t.slice(4)]],
      valores: { numero: t.slice(4) },
      abrir: t,
    };
  }

  const geo = t.match(/^geo:(-?[\d.]+),(-?[\d.]+)/i)
    || t.match(/[?&]destination=(-?[\d.]+),(-?[\d.]+)/i)
    || t.match(/[?&]q=(-?[\d.]+),(-?[\d.]+)/i);
  if (geo) {
    return {
      tipo: 'ubicacion', nombre: 'Ubicación',
      campos: [['Latitud', geo[1]], ['Longitud', geo[2]]],
      valores: { lat: geo[1], lon: geo[2], comoLlegar: /destination=/i.test(t) },
      abrir: `https://www.google.com/maps?q=${geo[1]},${geo[2]}`,
    };
  }

  for (const [re, plataforma] of REDES) {
    const m = t.match(re);
    if (m) {
      return {
        tipo: 'red', nombre: 'Perfil en red social',
        campos: [['Plataforma', plataforma], ['Usuario', m[1]]],
        valores: { plataforma, usuario: m[1] },
        abrir: t,
      };
    }
  }

  if (/^https?:\/\//i.test(t)) {
    let host = '';
    try { host = new URL(t).host; } catch { /* URL rara: se muestra tal cual */ }
    return {
      tipo: 'enlace', nombre: 'Enlace web',
      campos: host ? [['Sitio', host], ['Dirección completa', t]] : [['Dirección', t]],
      valores: { valor: t },
      abrir: t,
    };
  }

  return {
    tipo: 'enlace', nombre: 'Texto',
    campos: [['Contenido', t]],
    valores: { valor: t },
    abrir: null,
  };
}

/* ---------- seguridad ---------- */

const ACORTADORES = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'cutt.ly', 'rb.gy', 'shorturl.at', 'rebrand.ly', 's.id', 'acortar.link',
  'tiny.cc', 'lnkd.in', 'bl.ink', 't.ly', 'shorturl.com',
];

/**
 * Avisos sobre lo que se acaba de leer. Un QR no deja ver a dónde lleva hasta
 * que se abre: estos son los casos en los que conviene mirar dos veces.
 */
export function avisosSeguridad(contenido) {
  const avisos = [];
  const t = String(contenido || '').trim();
  if (!/^https?:\/\//i.test(t)) return avisos;

  let u;
  try { u = new URL(t); } catch { return avisos; }
  const host = u.hostname.toLowerCase();

  if (ACORTADORES.includes(host) || ACORTADORES.some((a) => host.endsWith('.' + a))) {
    avisos.push({
      nivel: 'aviso',
      texto: `Es un enlace acortado (${host}). No se ve el destino real hasta abrirlo, así que ábrelo solo si sabes de quién viene el código.`,
    });
  }

  if (host.startsWith('xn--') || host.includes('.xn--')) {
    avisos.push({
      nivel: 'aviso',
      texto: 'El dominio usa caracteres no latinos codificados. Es una técnica habitual para imitar el nombre de un sitio conocido.',
    });
  }

  if (u.username || u.password) {
    avisos.push({
      nivel: 'error',
      texto: 'La dirección lleva usuario y contraseña incrustados antes del dominio. Es la forma clásica de disfrazar a qué sitio te lleva de verdad.',
    });
  }

  if (u.protocol === 'http:') {
    avisos.push({
      nivel: 'aviso',
      texto: 'La conexión no va cifrada (http, no https). No introduzcas datos personales en esa página.',
    });
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    avisos.push({
      nivel: 'aviso',
      texto: 'El enlace apunta a una dirección IP en vez de a un nombre de dominio. Es poco habitual en sitios legítimos.',
    });
  }

  return avisos;
}
