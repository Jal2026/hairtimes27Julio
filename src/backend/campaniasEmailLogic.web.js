/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — Campañas de email (Brevo) · Backend web module · v1.0.1
 * Ruta: backend/campaniasEmailLogic.web.js
 * FECHA: 12 Octubre 2026
 *
 * REQUIERE: pagecode_comunicaciones.js v1.6.1 + Comunicaciones v1.7.1 (widget)
 *
 * QUÉ ES: el gestor de campañas de email de Centrimerca
 *   (centriComunicaciones.web.js v1.0.4, en producción) clonado a KAMISUITE.
 *   Crear, probar, programar y enviar campañas a listas de contactos de
 *   Brevo, y su seguimiento con las cifras de Brevo.
 *
 * CHANGELOG
 * ---------
 * v1.0.1 (12-Oct-2026) — Tipos de plantilla, colores del salón y canal email.
 *   - Plantillas y campañas llevan `tipo`: 'servicio' (avisos a clientes,
 *     p.ej. salón cerrado tal día) o 'marketing'. La app tiene un
 *     compositor para cada uno. Vacío = 'marketing'.
 *   - Un borrador recuperable por tipo (antes uno solo).
 *   - Identidad del salón ampliada con los COLORES Y LA TIPOGRAFÍA del
 *     diseño que tenga elegido el salón (SalonConfig.widgetSkin, el mismo
 *     que usan el widget público, bonos, PRIME, tarjetas, área de cliente
 *     y AKIRA). Los diseños definen el color en oklch; aquí se convierte a
 *     hexadecimal para el correo. Fórmula comprobada contra rojo, verde y
 *     azul puros (#ff0000, #00ff00, #0000ff) y blanco/negro.
 *   - Canal email cerrado (SalonConfig.emailActive distinto de true, mismo
 *     criterio que el motor de recordatorios) → no se guarda, no se prueba
 *     y no se envía nada. Se devuelve el estado en la carga para que la
 *     app apague las funciones.
 * v1.0.0 (12-Oct-2026) — Clon de centriComunicaciones.web.js v1.0.4.
 *   Diferencias con el original, todas por la arquitectura de KAMISUITE:
 *   - Sin _exigirAdmin() ni colección de autorizados: igual que el resto
 *     de funciones de Comunicaciones de KAMISUITE (whatsappLogic), los
 *     webMethods solo exigen sesión de miembro (Permissions.SiteMember).
 *   - Cuenta de Brevo PROPIA DE CADA SALÓN. El secreto es KAMISUITE_BREVO
 *     del propio sitio: cada sitio guarda sus secretos, así que el mismo
 *     código sirve para todos sin compartir nada entre salones.
 *   - Remitente desde SalonConfig (no hay CentriConfig). Mismos campos que
 *     usa brevoLogic.web.js v1.2.0: senderEmail, senderName || brandName,
 *     generalEmail como dirección de respuestas. SIN remitente de reserva
 *     fijo en código: si senderEmail está vacío, la campaña no se crea y
 *     se dice por qué. El remitente tiene que estar validado en la cuenta
 *     de Brevo de ese salón.
 *   - Identidad del salón para las plantillas (cero datos de salón en el
 *     HTML): se devuelve en `identidad` y el widget rellena los marcadores
 *     ${logo} ${salon} ${direccion} ${telefono} ${web} — los mismos nombres
 *     que ya usan las plantillas transaccionales de brevoLogic.
 *   - Subida de imágenes y galería: NO viven aquí. El page code reutiliza
 *     uploadImagenMarketing / listarImagenesMedia de whatsappLogic.web.js
 *     (v1.6.1, en producción), que hacen exactamente lo mismo que
 *     subirImagenCampania / listarGaleria de Centrimerca.
 *   - Mensajes de error en español con indicación de qué hacer. El detalle
 *     técnico de Brevo queda en el log (console.error), no en pantalla.
 *   - Funciones con sufijo Email para no confundirlas con las campañas de
 *     WhatsApp (guardarCampaign / listarCampaigns de whatsappLogic).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PROCEDENCIA (patrones copiados, no inventados)
 * ───────────────────────────────────────────────────────────────────────────
 * Llamadas a Brevo, borrador recuperable, programación con comprobación de
 *   estado, seguimiento con estadísticas: COPIA de centriComunicaciones.web.js
 *   v1.0.4 (Centrimerca), en producción.
 * Caché de la API key: patrón de brevoLogic.web.js v1.2.0 (KAMISUITE).
 * Lectura de SalonConfig (.limit(1).find suppressAuth): patrón de
 *   brevoLogic.web.js v1.2.0.
 * convertWixImageUrl: copia literal de brevoLogic.web.js v1.2.0.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * API DE BREVO USADA (verificada en Centrimerca, 5 oct 2026)
 * ───────────────────────────────────────────────────────────────────────────
 *   GET  /v3/contacts/lists?limit&offset            → { lists:[{id,name,uniqueSubscribers}] }
 *        (totalSubscribers está en retirada y vale 0: se usa uniqueSubscribers)
 *   POST /v3/emailCampaigns                          → 201 { id }  (nace en draft)
 *   PUT  /v3/emailCampaigns/{id}                     → 204  (solo draft o programada)
 *   POST /v3/emailCampaigns/{id}/sendTest {emailTo}  → 204 | 400 { unexistingEmails,
 *        withoutListEmails, blackListedEmails }  · máx. 50 pruebas/día
 *   POST /v3/emailCampaigns/{id}/sendNow             → 204 | 402 sin créditos
 *   GET  /v3/emailCampaigns/{id}                     → estado de la campaña
 *   GET  /v3/emailCampaigns?type=classic&statistics=globalStats&excludeHtmlContent=true
 *
 * PROGRAMAR: PUT con scheduledAt y después se LEE la campaña para comprobar
 *   que Brevo la ha dejado en estado 'queued'. Si no, error con el estado real.
 *
 * PENDIENTE HEREDADO DE CENTRIMERCA: Brevo añade su cabecera por defecto
 *   («Si usted no es capaz de ver este email…»). Enviar header:'' la rechaza
 *   Brevo (missing_parameter). Sin resolver.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AUDITORÍA DE CONEXIONES
 * ───────────────────────────────────────────────────────────────────────────
 *  LEE de:
 *    · SalonConfig     → senderEmail, senderName, brandName, generalEmail,
 *                        logoUrl, address, phone, siteUrl (field IDs ya en
 *                        producción en brevoLogic); emailActive (centralita
 *                        y reminderLogic); widgetSkin (salonConfigLogic,
 *                        widgetPublicoLogic, catalogoConsultaLogic).
 *    · EmailTemplates  → plantillas activas.
 *    · EmailCampaigns  → último borrador y datos del formulario por campaña.
 *    · Brevo           → listas y campañas de la cuenta del salón.
 *  ESCRIBE en:
 *    · EmailCampaigns  → una fila por campaña (READ-MERGE-UPDATE).
 *    · Brevo           → campañas (crear, actualizar, probar, enviar, programar).
 *    · NO escribe en CommunicationLog: una campaña no es un envío uno a uno;
 *      su seguimiento son las cifras de Brevo.
 *  LE LLAMA:
 *    · Page code Comunicaciones (escritorio y móvil, mismo archivo) v1.6.0.
 *  LLAMA A:
 *    · Ningún otro backend del proyecto.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COLECCIONES NUEVAS (crear en cada sitio de salón)
 * ───────────────────────────────────────────────────────────────────────────
 *   EmailTemplates: nombre (Texto), descripcion (Texto), html (Texto),
 *                   campos (Texto, JSON), activa (Booleano), orden (Número),
 *                   tipo (Texto: 'servicio' | 'marketing')
 *   EmailCampaigns: campaignId, plantillaId, nombre, asunto, preheader,
 *                   valores (Texto, JSON), listas (Texto, JSON), estado,
 *                   tipo — todos Texto
 *   Field IDs idénticos a los de Centrimerca (CentriPlantillas /
 *   CentriCampanias) más `tipo`. PENDIENTE: confirmación de Jal de los IDs
 *   reales.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MARCADORES QUE RELLENA EL SALÓN (no se piden en el formulario)
 * ───────────────────────────────────────────────────────────────────────────
 *   ${logo} ${salon} ${direccion} ${telefono} ${web}
 *   ${colorFondo} ${colorTarjeta} ${colorSuave} ${colorHundido}
 *   ${colorLinea} ${colorLinea2} ${colorTexto} ${colorTexto2} ${colorTexto3}
 *   ${colorAcento} ${colorAcento2} ${colorAcentoTexto} ${colorAcentoSuave}
 *   ${colorAcentoLinea} ${radio} ${fuente}
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { webMethod, Permissions } from 'wix-web-module';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';
import { fetch } from 'wix-fetch';

const VERSION = '1.0.1';
const TAG = `[CampaniasEmail][${VERSION}]`;
const AUTH = { suppressAuth: true };

// ── IDs de colección ───────────────────────────────────────────────────────
const C_SALON      = 'SalonConfig';       // fila única
const C_PLANTILLAS = 'EmailTemplates';
const C_CAMPANIAS  = 'EmailCampaigns';

// ── Secreto y API ──────────────────────────────────────────────────────────
// Secreto del propio sitio: contiene la clave de la cuenta Brevo de ESTE salón.
const SECRETO   = 'KAMISUITE_BREVO';
const BREVO_API = 'https://api.brevo.com/v3';

// ── Límites ────────────────────────────────────────────────────────────────
const MAX_PRUEBAS     = 10;               // el widget también lo limita a 10
const MARGEN_PROG_MS  = 5 * 60 * 1000;    // programar al menos 5 min en el futuro
const LIMITE_LISTAS   = 50;
const LIMITE_CAMPANAS = 50;

// ── Mensaje genérico para fallos técnicos (el detalle va al log) ───────────
const MSG_FALLO = 'No se ha podido completar la operación. Vuelve a intentarlo en unos segundos.';
const MSG_CANAL_CERRADO = 'El canal email está apagado en la configuración del salón. Mientras siga así, desde aquí no se envía nada por email.';

// ── Tipos de plantilla / campaña (v1.0.1) ──────────────────────────────────
function _tipo(v) { return _txt(v).toLowerCase() === 'servicio' ? 'servicio' : 'marketing'; }

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function _txt(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

function _num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* wix:image:// → URL pública. Copia literal de brevoLogic.web.js v1.2.0.
   Los clientes de email no cargan wix:image://. */
function convertWixImageUrl(wixUrl) {
  if (!wixUrl) return '';
  if (typeof wixUrl !== 'string') return '';
  if (!wixUrl.startsWith('wix:image://')) return wixUrl;
  try {
    const match = wixUrl.match(/wix:image:\/\/v1\/([^\/]+)/);
    if (match && match[1]) return 'https://static.wixstatic.com/media/' + match[1];
  } catch (e) {}
  return '';
}

/* ═══ DISEÑOS DE COLOR DEL SALÓN (v1.0.1) ═══════════════════════════════════
   COPIA LITERAL de los tokens de window.KR_SKINS y de los valores por
   defecto de :host (Niebla) de public/custom-elements/
   kamisuite-widget-bundle.js — la fuente de los diseños que elige cada
   salón en SalonConfig.widgetSkin. Solo los tokens que usa un correo.
   Si se añade o cambia un diseño en el bundle, hay que copiarlo aquí.
   Un diseño solo redefine algunos tokens; el resto cae a Niebla, igual
   que hace el bundle (applySkin solo pisa los que trae). */
const SKIN_BASE = {
  '--kr-bg':          'oklch(98.6% 0.003 250)',
  '--kr-surface':     'oklch(100% 0 0)',
  '--kr-surface-2':   'oklch(97.4% 0.004 250)',
  '--kr-inset':       'oklch(96.2% 0.005 252)',
  '--kr-line':        'oklch(91% 0.006 252)',
  '--kr-line-2':      'oklch(84% 0.008 252)',
  '--kr-ink':         'oklch(30% 0.013 258)',
  '--kr-ink-2':       'oklch(48% 0.011 258)',
  '--kr-ink-3':       'oklch(64% 0.009 258)',
  '--kr-accent':      'oklch(40% 0.022 258)',
  '--kr-accent-2':    'oklch(33% 0.024 258)',
  '--kr-accent-ink':  'oklch(98.5% 0.003 250)',
  '--kr-accent-soft': 'oklch(93.5% 0.012 256)',
  '--kr-accent-line': 'oklch(62% 0.02 256)',
  '--kr-radius':      '10px',
  '--kr-font':        '"Bai Jamjuree", ui-sans-serif, system-ui, sans-serif'
};
const SKINS = {
  niebla: {},
  arena: {
    '--kr-bg': 'oklch(98.4% 0.009 78)', '--kr-surface': 'oklch(99.6% 0.006 80)',
    '--kr-surface-2': 'oklch(97% 0.012 78)', '--kr-inset': 'oklch(95.6% 0.014 76)',
    '--kr-line': 'oklch(90% 0.016 72)', '--kr-line-2': 'oklch(82% 0.02 68)',
    '--kr-ink': 'oklch(31% 0.018 60)', '--kr-ink-2': 'oklch(48% 0.016 60)', '--kr-ink-3': 'oklch(64% 0.014 62)',
    '--kr-accent': 'oklch(42% 0.028 64)', '--kr-accent-2': 'oklch(35% 0.03 62)',
    '--kr-accent-soft': 'oklch(93% 0.022 72)', '--kr-accent-line': 'oklch(64% 0.026 66)',
    '--kr-radius': '13px'
  },
  grafito: {
    '--kr-bg': 'oklch(99% 0 0)', '--kr-surface': 'oklch(100% 0 0)',
    '--kr-surface-2': 'oklch(97% 0 0)', '--kr-inset': 'oklch(95.5% 0 0)',
    '--kr-line': 'oklch(89% 0 0)', '--kr-line-2': 'oklch(80% 0 0)',
    '--kr-ink': 'oklch(20% 0 0)', '--kr-ink-2': 'oklch(42% 0 0)', '--kr-ink-3': 'oklch(62% 0 0)',
    '--kr-accent': 'oklch(22% 0 0)', '--kr-accent-2': 'oklch(12% 0 0)', '--kr-accent-ink': 'oklch(99% 0 0)',
    '--kr-accent-soft': 'oklch(94.5% 0 0)', '--kr-accent-line': 'oklch(55% 0 0)',
    '--kr-radius': '6px'
  },
  lumiere: {
    '--kr-bg': 'oklch(98.2% 0.012 88)', '--kr-surface': 'oklch(99.6% 0.008 88)',
    '--kr-surface-2': 'oklch(96.6% 0.016 86)', '--kr-inset': 'oklch(95% 0.02 84)',
    '--kr-line': 'oklch(90% 0.022 82)', '--kr-line-2': 'oklch(80% 0.03 80)',
    '--kr-ink': 'oklch(26% 0.012 70)', '--kr-ink-2': 'oklch(45% 0.014 72)', '--kr-ink-3': 'oklch(62% 0.018 76)',
    '--kr-accent': 'oklch(56% 0.085 78)', '--kr-accent-2': 'oklch(47% 0.08 74)', '--kr-accent-ink': 'oklch(99% 0.01 88)',
    '--kr-accent-soft': 'oklch(93% 0.035 84)', '--kr-accent-line': 'oklch(66% 0.075 80)',
    '--kr-radius': '4px'
  },
  botanica: {
    '--kr-bg': 'oklch(98.6% 0.01 150)', '--kr-surface': 'oklch(99.8% 0.006 150)',
    '--kr-surface-2': 'oklch(97% 0.016 152)', '--kr-inset': 'oklch(95.4% 0.02 152)',
    '--kr-line': 'oklch(90% 0.022 154)', '--kr-line-2': 'oklch(81% 0.03 156)',
    '--kr-ink': 'oklch(28% 0.025 160)', '--kr-ink-2': 'oklch(46% 0.022 158)', '--kr-ink-3': 'oklch(63% 0.02 156)',
    '--kr-accent': 'oklch(48% 0.09 156)', '--kr-accent-2': 'oklch(40% 0.085 158)',
    '--kr-accent-soft': 'oklch(93% 0.03 152)', '--kr-accent-line': 'oklch(62% 0.08 156)',
    '--kr-radius': '16px'
  },
  aurora: {
    '--kr-bg': 'oklch(98.7% 0.006 320)', '--kr-surface': 'oklch(100% 0 0)',
    '--kr-surface-2': 'oklch(97.4% 0.01 322)', '--kr-inset': 'oklch(96% 0.014 326)',
    '--kr-line': 'oklch(91% 0.016 330)', '--kr-line-2': 'oklch(82% 0.024 336)',
    '--kr-ink': 'oklch(27% 0.03 326)', '--kr-ink-2': 'oklch(46% 0.026 330)', '--kr-ink-3': 'oklch(64% 0.022 334)',
    '--kr-accent': 'oklch(56% 0.16 350)', '--kr-accent-2': 'oklch(48% 0.17 352)',
    '--kr-accent-soft': 'oklch(94% 0.04 348)', '--kr-accent-line': 'oklch(66% 0.14 350)',
    '--kr-radius': '12px',
    '--kr-font': '"Instrument Sans", ui-sans-serif, system-ui, sans-serif'
  },
  oceano: {
    '--kr-bg': 'oklch(98.4% 0.012 232)', '--kr-surface': 'oklch(99.7% 0.007 232)',
    '--kr-surface-2': 'oklch(97% 0.018 233)', '--kr-inset': 'oklch(95.2% 0.024 233)',
    '--kr-line': 'oklch(90% 0.028 234)', '--kr-line-2': 'oklch(80.5% 0.042 236)',
    '--kr-ink': 'oklch(28% 0.045 250)', '--kr-ink-2': 'oklch(46% 0.038 248)', '--kr-ink-3': 'oklch(63% 0.032 244)',
    '--kr-accent': 'oklch(50% 0.13 244)', '--kr-accent-2': 'oklch(42% 0.14 246)', '--kr-accent-ink': 'oklch(99% 0.015 233)',
    '--kr-accent-soft': 'oklch(93% 0.038 234)', '--kr-accent-line': 'oklch(64% 0.11 240)',
    '--kr-radius': '12px'
  }
};

/* oklch(L% C H) → #rrggbb. Conversión estándar OKLab → sRGB. */
function _oklchAHex(valor) {
  const m = String(valor || '').match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/i);
  if (!m) { return ''; }
  const L = Number(m[1]) / 100, C = Number(m[2]), H = Number(m[3]) * Math.PI / 180;
  const a = C * Math.cos(H), b = C * Math.sin(H);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, mm = m_ * m_ * m_, s = s_ * s_ * s_;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s
  ].map(c => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
}

/* Pila de fuentes para correo: la del diseño primero y respaldo seguro.
   Comillas simples: el valor va dentro de un atributo style="...". */
function _fuenteEmail(kf) {
  const primera = String(kf || '').split(',')[0].replace(/["']/g, '').trim();
  return (primera ? `'${primera}', ` : '') + 'Arial, Helvetica, sans-serif';
}

/* Colores y forma del diseño elegido por el salón, listos para el correo. */
function _coloresSalon(widgetSkin) {
  const nombre = _txt(widgetSkin).toLowerCase();
  const t = Object.assign({}, SKIN_BASE, SKINS[nombre] || {});
  return {
    colorFondo:       _oklchAHex(t['--kr-bg']),
    colorTarjeta:     _oklchAHex(t['--kr-surface']),
    colorSuave:       _oklchAHex(t['--kr-surface-2']),
    colorHundido:     _oklchAHex(t['--kr-inset']),
    colorLinea:       _oklchAHex(t['--kr-line']),
    colorLinea2:      _oklchAHex(t['--kr-line-2']),
    colorTexto:       _oklchAHex(t['--kr-ink']),
    colorTexto2:      _oklchAHex(t['--kr-ink-2']),
    colorTexto3:      _oklchAHex(t['--kr-ink-3']),
    colorAcento:      _oklchAHex(t['--kr-accent']),
    colorAcento2:     _oklchAHex(t['--kr-accent-2']),
    colorAcentoTexto: _oklchAHex(t['--kr-accent-ink']),
    colorAcentoSuave: _oklchAHex(t['--kr-accent-soft']),
    colorAcentoLinea: _oklchAHex(t['--kr-accent-line']),
    radio:            _txt(t['--kr-radius']) || '10px',
    fuente:           _fuenteEmail(t['--kr-font'])
  };
}

/* `campos` es un campo de Texto con JSON. Se parsea en bucle por si llega
   doblemente serializado. Devuelve [] si no es un array válido: el widget
   deduce entonces los campos de los marcadores. (Centrimerca v1.0.4) */
function _parseCampos(v) {
  let x = v;
  for (let i = 0; i < 3 && typeof x === 'string'; i++) {
    const s = x.trim();
    if (!s) { return []; }
    try { x = JSON.parse(s); } catch (e) { return []; }
  }
  return Array.isArray(x) ? x : [];
}

/* JSON en campo de Texto, parseado en bucle como _parseCampos.
   Devuelve `defecto` si no se puede leer. (Centrimerca v1.0.4) */
function _parseJson(v, defecto) {
  let x = v;
  for (let i = 0; i < 3 && typeof x === 'string'; i++) {
    const s = x.trim();
    if (!s) { return defecto; }
    try { x = JSON.parse(s); } catch (e) { return defecto; }
  }
  return (x === null || x === undefined) ? defecto : x;
}

/* Guarda en EmailCampaigns el estado del formulario de una campaña.
   Una fila por campaignId: READ-MERGE-UPDATE si existe, insert si no.
   Devuelve { ok } o { ok:false, error }. No lanza. (Centrimerca v1.0.4) */
async function _guardarFila(campania, campaignId, estado) {
  try {
    const c = campania || {};
    const datos = {
      campaignId: String(campaignId),
      plantillaId: _txt(c.plantillaId),
      nombre: _txt(c.nombre),
      asunto: _txt(c.asunto),
      preheader: _txt(c.preheader),
      valores: JSON.stringify((c.valores && typeof c.valores === 'object') ? c.valores : {}),
      listas: JSON.stringify((Array.isArray(c.listas) ? c.listas : []).map(String)),
      estado,
      tipo: _tipo(c.tipo)
    };
    const res = await wixData.query(C_CAMPANIAS).eq('campaignId', String(campaignId)).limit(1).find(AUTH);
    const fila = res.items && res.items[0];
    if (fila) {
      await wixData.update(C_CAMPANIAS, Object.assign({}, fila, datos), AUTH);
    } else {
      await wixData.insert(C_CAMPANIAS, datos, AUTH);
    }
    return { ok: true };
  } catch (e) {
    console.error(`${TAG} ❌ no se pudo guardar ${C_CAMPANIAS} (campaña ${campaignId}):`, e.message);
    return { ok: false, error: e.message };
  }
}

/* Cambia solo el estado de la fila (enviada, programada, descartado). */
async function _marcarEstado(campaignId, estado) {
  try {
    const res = await wixData.query(C_CAMPANIAS).eq('campaignId', String(campaignId)).limit(1).find(AUTH);
    const fila = res.items && res.items[0];
    if (!fila) { return { ok: true }; }
    await wixData.update(C_CAMPANIAS, Object.assign({}, fila, { estado }), AUTH);
    return { ok: true };
  } catch (e) {
    console.error(`${TAG} ❌ no se pudo marcar ${estado} en ${C_CAMPANIAS} (campaña ${campaignId}):`, e.message);
    return { ok: false, error: e.message };
  }
}

/* Último borrador sin enviar de un tipo, en el formato que restaura el
   widget. v1.0.1: uno por tipo. */
async function _leerUltimoBorrador(tipo) {
  let q = wixData.query(C_CAMPANIAS).eq('estado', 'borrador');
  q = (tipo === 'servicio') ? q.eq('tipo', 'servicio') : q.ne('tipo', 'servicio');
  const res = await q.descending('_updatedDate').limit(1).find(AUTH);
  const f = res.items && res.items[0];
  if (!f || !_txt(f.campaignId)) { return null; }
  return {
    tipo: _tipo(f.tipo),
    campaignId: _txt(f.campaignId),
    plantillaId: _txt(f.plantillaId),
    nombre: _txt(f.nombre),
    asunto: _txt(f.asunto),
    preheader: _txt(f.preheader),
    valores: _parseJson(f.valores, {}),
    listas: _parseJson(f.listas, [])
  };
}

function _emailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')); }

// ── Caché API key (patrón brevoLogic.web.js v1.2.0) ─────────────────────────
const KEY_CACHE_TTL = 30 * 60 * 1000; // 30 min
let _keyCache = null;
let _keyCacheTs = 0;

async function _getBrevoKey() {
  const now = Date.now();
  if (_keyCache && (now - _keyCacheTs) < KEY_CACHE_TTL) {
    return _keyCache;
  }
  try {
    _keyCache = await getSecret(SECRETO);
    _keyCacheTs = now;
    return _keyCache;
  } catch (err) {
    console.error(`${TAG} error obteniendo ${SECRETO}:`, err.message);
    return null;
  }
}

/**
 * Llamada genérica a la API de Brevo. (Centrimerca v1.0.4)
 * Varias respuestas son 204 sin cuerpo: se lee texto y se parsea solo si hay.
 * Devuelve { ok, status, data }.
 */
async function _brevo(metodo, ruta, cuerpo) {
  const key = await _getBrevoKey();
  if (!key) {
    return { ok: false, status: 0, data: { message: `Secreto ${SECRETO} no disponible.` } };
  }
  try {
    const opts = {
      method: metodo,
      headers: {
        'api-key': key,
        'Accept': 'application/json'
      }
    };
    if (cuerpo !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(cuerpo);
    }
    const response = await fetch(BREVO_API + ruta, opts);
    const texto = await response.text();
    let data = {};
    if (texto) {
      try { data = JSON.parse(texto); } catch (e) { data = { message: texto }; }
    }
    if (!response.ok) {
      console.error(`${TAG} Brevo ${metodo} ${ruta} → ${response.status}:`, texto);
      return { ok: false, status: response.status, data };
    }
    return { ok: true, status: response.status, data };
  } catch (err) {
    console.error(`${TAG} error en fetch a Brevo ${metodo} ${ruta}:`, err.message);
    return { ok: false, status: 0, data: { message: err.message } };
  }
}

// Mensaje para pantalla a partir de una respuesta fallida de Brevo.
// En español y con indicación de qué hacer; el detalle ya está en el log.
function _errBrevo(r, contexto) {
  if (r && r.status === 402) {
    return `${contexto}: Brevo indica que no hay créditos suficientes. Hay que ampliar el plan de la cuenta de Brevo de este salón.`;
  }
  if (!r || !r.status) {
    return `${contexto}: no se ha podido conectar con Brevo. Comprueba que la clave de Brevo de este salón está guardada en el sitio y vuelve a intentarlo.`;
  }
  return `${contexto}: Brevo ha rechazado la petición (código ${r.status}). Revisa la cuenta de Brevo del salón y vuelve a intentarlo.`;
}

// ── SalonConfig: remitente e identidad (patrón brevoLogic.web.js v1.2.0) ────
async function _leerSalon() {
  const res = await wixData.query(C_SALON).limit(1).find(AUTH);
  const s = (res.items && res.items[0]) || {};
  return {
    // Canal: cerrado salvo SÍ explícito (mismo criterio que reminderLogic).
    canalEmailAbierto: s.emailActive === true,
    remitente: {
      nombre:  _txt(s.senderName) || _txt(s.brandName),
      email:   _txt(s.senderEmail),
      replyTo: _txt(s.generalEmail)
    },
    identidad: Object.assign({
      logo:      convertWixImageUrl(s.logoUrl),
      salon:     _txt(s.brandName),
      direccion: _txt(s.address),
      telefono:  _txt(s.phone),
      web:       _txt(s.siteUrl)
    }, _coloresSalon(s.widgetSkin))
  };
}

// ── Listas de Brevo (Centrimerca v1.0.4) ────────────────────────────────────
async function _leerListas() {
  const r = await _brevo('GET', `/contacts/lists?limit=${LIMITE_LISTAS}&offset=0&sort=desc`);
  if (!r.ok) { return { ok: false, error: _errBrevo(r, 'No se han podido leer las listas de Brevo') }; }
  const listas = (r.data.lists || []).map(l => ({
    id: String(l.id),
    nombre: _txt(l.name),
    contactos: _num(l.uniqueSubscribers)
  }));
  return { ok: true, listas };
}

// ── Crear o actualizar la campaña en Brevo (sin programar ni enviar) ────────
// Devuelve { ok, campaignId } o { ok:false, error }. (Centrimerca v1.0.4)
async function _guardarEnBrevo(campania, remitente) {
  const c = campania || {};
  const asunto = _txt(c.asunto);
  const html = String(c.html || '');

  if (!remitente.email) {
    return { ok: false, error: 'Falta el correo remitente en la configuración del salón. Escribe una dirección validada en la cuenta de Brevo de este salón.' };
  }
  if (!asunto)           { return { ok: false, error: 'Falta el asunto.' }; }
  if (html.length <= 10) { return { ok: false, error: 'El contenido del correo está vacío.' }; }

  const listIds = (Array.isArray(c.listas) ? c.listas : [])
    .map(x => Number(x))
    .filter(n => Number.isFinite(n) && n > 0);

  const cuerpo = {
    name: _txt(c.nombre) || asunto,
    subject: asunto,
    sender: remitente.nombre ? { name: remitente.nombre, email: remitente.email } : { email: remitente.email },
    htmlContent: html,
    previewText: _txt(c.preheader),
    mirrorActive: true
  };
  if (remitente.replyTo) { cuerpo.replyTo = remitente.replyTo; }
  if (listIds.length)    { cuerpo.recipients = { listIds }; }

  const id = _txt(c.campaignId);

  if (id) {
    const r = await _brevo('PUT', `/emailCampaigns/${encodeURIComponent(id)}`, cuerpo);
    if (r.ok) { return { ok: true, campaignId: id }; }
    // Si la campaña ya no existe en Brevo, se crea una nueva abajo.
    if (r.status !== 404) { return { ok: false, error: _errBrevo(r, 'No se ha podido actualizar la campaña en Brevo') }; }
    console.warn(`${TAG} la campaña ${id} ya no existe en Brevo: se crea una nueva`);
    await _marcarEstado(id, 'descartado');
  }

  const r = await _brevo('POST', '/emailCampaigns', cuerpo);
  if (!r.ok) { return { ok: false, error: _errBrevo(r, 'No se ha podido crear la campaña en Brevo') }; }
  const nuevo = r.data && r.data.id;
  if (!nuevo) {
    console.error(`${TAG} Brevo no devolvió el id de la campaña:`, JSON.stringify(r.data));
    return { ok: false, error: 'Brevo no ha devuelto la referencia de la campaña. Revisa en Brevo si se ha creado y vuelve a intentarlo.' };
  }
  console.log(`${TAG} 🆕 campaña creada en Brevo: ${nuevo}`);
  return { ok: true, campaignId: String(nuevo) };
}

// Estado de Brevo → estado que entiende el widget.
const ESTADO = { sent: 'enviada', queued: 'programada', draft: 'borrador', in_process: 'enviando' };

// ═══════════════════════════════════════════════════════════════════════════
// 1. DATOS INICIALES  (widget: emailInit → emailInit)
// ═══════════════════════════════════════════════════════════════════════════
export const cargarCampaniasEmail = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const leerBorrador = (tipo) => _leerUltimoBorrador(tipo).catch(e => {
        console.error(`${TAG} no se pudo leer el último borrador (${tipo}):`, e.message);
        return null;
      });
      const [salon, resPl, resListas, borradorServicio, borradorMarketing] = await Promise.all([
        _leerSalon(),
        wixData.query(C_PLANTILLAS).eq('activa', true).ascending('orden').limit(100).find(AUTH),
        _leerListas(),
        leerBorrador('servicio'),
        leerBorrador('marketing')
      ]);

      if (!resListas.ok) { return { ok: false, error: resListas.error }; }

      const plantillas = (resPl.items || []).map(it => ({
        id: it._id,
        nombre: _txt(it.nombre),
        descripcion: _txt(it.descripcion),
        html: String(it.html || ''),
        campos: _parseCampos(it.campos),
        tipo: _tipo(it.tipo)
      }));

      console.log(`${TAG} ✅ carga: ${plantillas.length} plantillas, ${resListas.listas.length} listas, canal email ${salon.canalEmailAbierto ? 'abierto' : 'CERRADO'}`);
      return {
        ok: true,
        canalEmail: { abierto: salon.canalEmailAbierto },
        config: { remitente: salon.remitente },
        identidad: salon.identidad,
        plantillas,
        listas: resListas.listas,
        borradores: { servicio: borradorServicio, marketing: borradorMarketing }
      };

    } catch (e) {
      console.error(`${TAG} ❌ cargarCampaniasEmail:`, e.message);
      return { ok: false, error: `No se ha podido cargar el gestor de campañas. Comprueba que las colecciones ${C_PLANTILLAS} y ${C_CAMPANIAS} existen en este sitio y vuelve a intentarlo.` };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 2. GUARDAR BORRADOR
// ═══════════════════════════════════════════════════════════════════════════
export const guardarBorradorEmail = webMethod(
  Permissions.SiteMember,
  async ({ campania }) => {
    try {
      const salon = await _leerSalon();
      if (!salon.canalEmailAbierto) { return { ok: false, error: MSG_CANAL_CERRADO }; }
      const g = await _guardarEnBrevo(campania, salon.remitente);
      if (!g.ok) { return g; }
      // Sin esta fila el borrador no se puede recuperar → se informa.
      const f = await _guardarFila(campania, g.campaignId, 'borrador');
      if (!f.ok) {
        return { ok: false, campaignId: g.campaignId, error: `El borrador está guardado en Brevo, pero no aquí, así que no se podrá recuperar. Comprueba que la colección ${C_CAMPANIAS} existe en este sitio.` };
      }
      return g;
    } catch (e) {
      console.error(`${TAG} ❌ guardarBorradorEmail:`, e.message);
      return { ok: false, error: MSG_FALLO };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 3. ENVIAR PRUEBA  (guarda primero: la prueba es de la versión actual)
// ═══════════════════════════════════════════════════════════════════════════
export const enviarPruebaEmail = webMethod(
  Permissions.SiteMember,
  async ({ campania, emails }) => {
    const lista = (Array.isArray(emails) ? emails : []).map(_txt).filter(Boolean);
    if (!lista.length) { return { ok: false, error: 'Falta al menos una dirección de prueba.' }; }
    if (lista.length > MAX_PRUEBAS) { return { ok: false, error: `Máximo ${MAX_PRUEBAS} direcciones de prueba.` }; }
    const malos = lista.filter(e => !_emailValido(e));
    if (malos.length) { return { ok: false, error: `Dirección no válida: ${malos.join(', ')}` }; }

    try {
      const salon = await _leerSalon();
      if (!salon.canalEmailAbierto) { return { ok: false, error: MSG_CANAL_CERRADO }; }
      const g = await _guardarEnBrevo(campania, salon.remitente);
      if (!g.ok) { return g; }
      await _guardarFila(campania, g.campaignId, 'borrador');   // no bloquea la prueba

      const r = await _brevo('POST', `/emailCampaigns/${encodeURIComponent(g.campaignId)}/sendTest`, { emailTo: lista });
      if (!r.ok) {
        const d = r.data || {};
        const partes = [];
        if (Array.isArray(d.unexistingEmails) && d.unexistingEmails.length) {
          partes.push(`no existen como contacto en Brevo: ${d.unexistingEmails.join(', ')}`);
        }
        if (Array.isArray(d.withoutListEmails) && d.withoutListEmails.length) {
          partes.push(`no están en ninguna lista de Brevo: ${d.withoutListEmails.join(', ')}`);
        }
        if (Array.isArray(d.blackListedEmails) && d.blackListedEmails.length) {
          partes.push(`están bloqueadas o dadas de baja: ${d.blackListedEmails.join(', ')}`);
        }
        const detalle = partes.length ? ` (${partes.join('; ')})` : '';
        return { ok: false, campaignId: g.campaignId, error: _errBrevo(r, 'No se ha podido enviar la prueba') + detalle };
      }

      console.log(`${TAG} 📧 prueba de la campaña ${g.campaignId} enviada a ${lista.join(', ')}`);
      return { ok: true, campaignId: g.campaignId, emails: lista };

    } catch (e) {
      console.error(`${TAG} ❌ enviarPruebaEmail:`, e.message);
      return { ok: false, error: MSG_FALLO };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 4. ENVIAR AHORA O PROGRAMAR
// ═══════════════════════════════════════════════════════════════════════════
export const enviarCampaniaEmail = webMethod(
  Permissions.SiteMember,
  async ({ campania }) => {
    const c = campania || {};
    const listas = Array.isArray(c.listas) ? c.listas : [];
    if (!listas.length) { return { ok: false, error: 'No hay listas de destinatarios.' }; }

    const programada = c.modo === 'programada';
    let fechaIso = '';
    if (programada) {
      const t = new Date(c.fecha).getTime();
      if (!Number.isFinite(t)) { return { ok: false, error: 'Fecha de programación no válida.' }; }
      if (t < Date.now() + MARGEN_PROG_MS) { return { ok: false, error: 'La hora programada debe ser al menos 5 minutos posterior a ahora.' }; }
      fechaIso = new Date(t).toISOString();
    }

    try {
      const salon = await _leerSalon();
      if (!salon.canalEmailAbierto) { return { ok: false, error: MSG_CANAL_CERRADO }; }
      const g = await _guardarEnBrevo(c, salon.remitente);
      if (!g.ok) { return g; }
      const id = encodeURIComponent(g.campaignId);

      if (!programada) {
        const r = await _brevo('POST', `/emailCampaigns/${id}/sendNow`);
        if (!r.ok) { return { ok: false, campaignId: g.campaignId, error: _errBrevo(r, 'Brevo no ha aceptado el envío') }; }
        await _guardarFila(c, g.campaignId, 'enviada');
        console.log(`${TAG} 🚀 campaña ${g.campaignId} enviada ahora`);
        return { ok: true, campaignId: g.campaignId, programada: false, fecha: '' };
      }

      // Programar: PUT con scheduledAt y comprobación del estado real.
      const rp = await _brevo('PUT', `/emailCampaigns/${id}`, { scheduledAt: fechaIso });
      if (!rp.ok) { return { ok: false, campaignId: g.campaignId, error: _errBrevo(rp, 'Brevo no ha aceptado la programación') }; }

      const rg = await _brevo('GET', `/emailCampaigns/${id}?excludeHtmlContent=true`);
      if (!rg.ok) {
        return { ok: false, campaignId: g.campaignId, error: _errBrevo(rg, 'La programación se ha enviado, pero no se ha podido comprobar. Revisa la campaña en Brevo') };
      }
      const estado = _txt(rg.data && rg.data.status);
      if (estado !== 'queued') {
        return { ok: false, campaignId: g.campaignId, error: `Brevo ha guardado la fecha, pero la campaña figura como «${ESTADO[estado] || estado || '—'}», no como programada. Revísala en Brevo antes de volver a intentarlo.` };
      }

      await _guardarFila(c, g.campaignId, 'programada');
      console.log(`${TAG} ⏰ campaña ${g.campaignId} programada para ${fechaIso}`);
      return { ok: true, campaignId: g.campaignId, programada: true, fecha: fechaIso };

    } catch (e) {
      console.error(`${TAG} ❌ enviarCampaniaEmail:`, e.message);
      return { ok: false, error: MSG_FALLO };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 4b. DESCARTAR BORRADOR
// Solo deja de recuperarse en el gestor. La campaña sigue en Brevo como
// borrador; se puede borrar desde su panel si se quiere.
// ═══════════════════════════════════════════════════════════════════════════
export const descartarBorradorEmail = webMethod(
  Permissions.SiteMember,
  async ({ campaignId }) => {
    const id = _txt(campaignId);
    if (!id) { return { ok: false, error: 'No hay ningún borrador que descartar.' }; }

    const r = await _marcarEstado(id, 'descartado');
    if (!r.ok) { return { ok: false, campaignId: id, error: MSG_FALLO }; }
    console.log(`${TAG} 🗑️ borrador ${id} descartado en el gestor`);
    return { ok: true, campaignId: id };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 5. SEGUIMIENTO — campañas con estadísticas globales
// ═══════════════════════════════════════════════════════════════════════════
export const listarCampaniasEmail = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const [r, rl] = await Promise.all([
        _brevo('GET', `/emailCampaigns?type=classic&statistics=globalStats&limit=${LIMITE_CAMPANAS}&offset=0&sort=desc&excludeHtmlContent=true`),
        _leerListas()
      ]);
      if (!r.ok) { return { ok: false, error: _errBrevo(r, 'No se han podido leer las campañas de Brevo') }; }

      const porLista = {};
      ((rl.ok && rl.listas) || []).forEach(l => { porLista[l.id] = l.contactos; });

      // Datos del formulario guardados en EmailCampaigns, por campaignId.
      const brutas = r.data.campaigns || [];
      const ids = brutas.map(c => String(c.id));
      const porId = {};
      if (ids.length) {
        try {
          const rf = await wixData.query(C_CAMPANIAS).hasSome('campaignId', ids).limit(1000).find(AUTH);
          (rf.items || []).forEach(f => { porId[_txt(f.campaignId)] = f; });
        } catch (e) {
          console.error(`${TAG} no se pudo leer ${C_CAMPANIAS} para Seguimiento:`, e.message);
        }
      }

      const ahora = Date.now();
      const campanias = brutas.map(c => {
        const gs = (c.statistics && c.statistics.globalStats) || {};
        let estado = ESTADO[c.status] || _txt(c.status);
        // sendNow la deja en cola con la hora actual → mientras tanto, 'enviando'.
        if (c.status === 'queued') {
          const t = new Date(c.scheduledAt).getTime();
          if (Number.isFinite(t) && t <= ahora) { estado = 'enviando'; }
        }
        const f = porId[String(c.id)];
        const datos = f ? {
          tipo: _tipo(f.tipo),
          plantillaId: _txt(f.plantillaId),
          nombre: _txt(f.nombre),
          asunto: _txt(f.asunto),
          preheader: _txt(f.preheader),
          valores: _parseJson(f.valores, {}),
          listas: _parseJson(f.listas, [])
        } : null;
        const listasIds = (c.recipients && Array.isArray(c.recipients.lists)) ? c.recipients.lists : [];
        const previstos = listasIds.reduce((t, id) => t + _num(porLista[String(id)]), 0);
        return {
          id: String(c.id),
          nombre: _txt(c.name),
          asunto: _txt(c.subject),
          estado,
          fecha: _txt(c.sentDate) || _txt(c.scheduledAt) || '',
          destinatarios: c.status === 'sent' ? _num(gs.sent) : previstos,
          entregados: _num(gs.delivered),
          aperturas: _num(gs.uniqueViews),
          clics: _num(gs.uniqueClicks),
          bajas: _num(gs.unsubscriptions),
          rebotes: _num(gs.hardBounces) + _num(gs.softBounces),
          datos
        };
      });

      return { ok: true, campanias };

    } catch (e) {
      console.error(`${TAG} ❌ listarCampaniasEmail:`, e.message);
      return { ok: false, error: MSG_FALLO };
    }
  }
);
