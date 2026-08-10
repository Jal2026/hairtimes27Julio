// =====================================================
// KAMISUITE — Backend: FICHAS DE CLIENTE (CMS-first)
// =====================================================
// VERSION: 1.0.1
// FECHA:   10 de agosto de 2026
// ARCHIVO: backend/clientRecordsLogic.web.js
//
// CHANGELOG
//   v1.0.1 (10-Ago-2026) — El MENSAJE QUE EL CLIENTE DEJA AL RESERVAR
//     ONLINE viaja a la ficha. Vive en `KamisuiteReservations.notes`:
//     lo escribe el widget público (`state.nota` → `notas` →
//     crearReservaPublica → crearPackReserva → campo `notes`), y hasta
//     hoy no se leía en ninguna pantalla de Recepción.
//       · Cada visita devuelve ahora `nota`.
//       · Se descarta la marca técnica 'RECURSO INTERNO', que el motor
//         de disponibilidad escribe en ese mismo campo y no es mensaje
//         de nadie.
//       · NEW `notaReserva`: el mensaje de la cita desde la que se abre
//         la ficha. Esa reserva se excluye de `visitas` (es la de hoy),
//         así que sin este campo su mensaje no se vería justo cuando
//         más falta hace.
//     Aditivo puro: quien no lea los campos nuevos funciona igual.
//   v1.0.0 (10-Ago-2026) — Versión inicial. Sustituye a los campos
//     personalizados de Wix Contacts como fuente de las fichas de
//     COLOR, TRATAMIENTO y notas generales del cliente.
//
//     POR QUÉ NACE ESTE ARCHIVO (decisión Jal 10-ago-2026, opción B):
//     El CRM guarda hoy esas notas en campos personalizados de Wix
//     Contacts (`color`, `tratamientos`, `customnotaspublicas`,
//     `notas_fonyemjtcfteotgxzkaamjbuwmyuz`). Tres problemas que hacen
//     inviable extender ese modelo a la ficha técnica:
//       1) La CLAVE del campo la genera Wix por sitio. El sufijo
//          `fonyemjtcfteotgxzkaamjbuwmyuz` es aleatorio y distinto en
//          cada salón: hardcoding por tenant, prohibido por la
//          Auditoría de Hardcoding. La prueba está en la cascada de
//          alias + lector recursivo que fichaClienteLogic necesita.
//       2) Wix deduplica contactos por email. Con emails genéricos de
//          reserva, decenas de personas comparten contactId. Una nota
//          comercial compartida se tolera; una fórmula de color, no.
//       3) Un campo de texto por categoría no tiene histórico: sin
//          fecha, sin autor, sin visita. La fórmula de hace seis meses
//          se pierde al sobrescribir, y el histórico ES el valor.
//
//     MODELO: una FILA POR ANOTACIÓN. Nunca se sobrescribe nada.
//     Retirar una anotación es `active = false`, no un borrado.
//
// PROPÓSITO
//   Servir el popup de ficha del modal de cita de Recepción PRO, y en
//   una fase posterior al CRM de Ficha Cliente, que dejará de leer y
//   escribir en Wix Contacts.
//
// COLECCIONES
//   - KamisuiteClientRecords  (LECTURA + ESCRITURA) — las anotaciones.
//   - KamisuiteReservations   (SOLO LECTURA) — las últimas visitas.
//
// ⚠️ SIN DATOS ECONÓMICOS
//   Igual que getFichaTecnicaCliente (memoriaLegacyLogic v1.0.3), las
//   últimas visitas se sirven SIN importes. El filtrado es AQUÍ, no en
//   el widget: lo que no sale del backend no existe en el cliente.
//   `serviciosDetail` se parsea y se descarta el precio de cada línea.
//
// ⚠️ ENVENENAMIENTO DE contactId — DEFENSA SIN HARDCODING
//   Muchas reservas llevan el contactId del owner del sitio porque Wix
//   lo asigna cuando no recibe uno válido. Consultar las visitas solo
//   por contactId devolvería citas de cientos de personas distintas.
//   consoleIA lo resuelve con una lista POISONED_CONTACT_IDS que hay
//   que mantener salón a salón. Aquí NO se replica esa lista: se cruza
//   el contactId con el NOMBRE normalizado del cliente de la cita
//   actual. Si el contactId está limpio el filtro no descarta nada; si
//   está envenenado deja solo las visitas de esa persona. Determinista
//   y multi-tenant, sin ninguna constante por salón.
//
// ⚠️ MENSAJE DEL ÁREA DE CLIENTE — LECTURA TEMPORAL
//   `appendNotaCliente` (clienteAreaLogic v1.6.6) sigue escribiendo el
//   mensaje del cliente en Wix Contacts, acumulando entradas con el
//   formato `[fecha] texto | [fecha] texto`. Este backend lo LEE de
//   ahí, con el mismo lector flexible de fichaClienteLogic, para que
//   el popup lo muestre desde el primer día. En el salón donde ese
//   campo no exista devuelve lista vacía, sin romper nada. Ese canal
//   se migrará a esta misma colección (source = 'CLIENTE') en la fase
//   en la que el CRM deje de usar Wix Contacts.
//
// NO SE TOCA NINGÚN ARCHIVO EXISTENTE
//   Aditivo puro. No importa recepcionProLogic (motor compartido por
//   Recepción PRO, Lite Mobile y el widget público), ni fichaClienteLogic,
//   ni clienteAreaLogic. Los helpers de lectura de Wix Contacts se
//   replican LOCALMENTE, siguiendo la lección de clienteAreaLogic
//   v1.6.1: los imports cross-backend devolvían vacío en silencio.
// =====================================================

import wixData from 'wix-data';
import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';

const VERSION = '1.0.1';
const TAG = `[ClientRecords][${VERSION}]`;

// =====================================================
// COLECCIONES
// =====================================================

const COL_RECORDS  = 'KamisuiteClientRecords';
const COL_RESERVAS = 'KamisuiteReservations';

// =====================================================
// IDs DE CAMPO DE KamisuiteClientRecords
// =====================================================
// Bloque aislado a propósito. Si Wix generó algún ID distinto al
// declarado al crear la colección, se corrige AQUÍ y en ningún otro
// sitio del archivo.
// =====================================================

const F_CONTACT_ID   = 'contactId';
const F_CLIENT_NAME  = 'clientName';
const F_CLIENT_PHONE = 'clientPhone';
const F_RECORD_TYPE  = 'recordType';
const F_RECORD_TEXT  = 'recordText';
const F_RECORD_DATE  = 'recordDate';
const F_AUTHOR       = 'author';
const F_BOOKING_ID   = 'bookingId';
const F_SOURCE       = 'source';
const F_ACTIVE       = 'active';

// =====================================================
// VALORES CONTROLADOS
// =====================================================

const TIPOS_VALIDOS   = ['COLOR', 'TRATAMIENTO', 'GENERAL'];
const ORIGENES_VALIDOS = ['RECEPCION', 'CRM', 'CLIENTE'];

const TIPO_DEFECTO   = 'GENERAL';
const ORIGEN_DEFECTO = 'RECEPCION';

const LIMITE_TEXTO   = 4000;
const LIMITE_NOTAS   = 60;
const LIMITE_CITAS   = 3;

const TIMEZONE_MADRID = 'Europe/Madrid';

// v1.0.1 — Marca que el motor de disponibilidad escribe en `notes` de las
// filas técnicas. Copiada literal de widgetPublicoLogic y recepcionProLogic,
// donde ya se filtra con este mismo criterio. No es un mensaje de nadie.
const NOTA_RECURSO_INTERNO = 'RECURSO INTERNO';

/**
 * Devuelve el mensaje real del cliente, o cadena vacía.
 */
function notaDeReserva(item) {
  const n = txt(item && item.notes);
  if (!n) return '';
  if (n.includes(NOTA_RECURSO_INTERNO)) return '';
  return n;
}

// =====================================================
// CAMPO DEL MENSAJE DEL ÁREA DE CLIENTE (Wix Contacts)
// =====================================================
// Clave base + alias copiados LITERALMENTE de fichaClienteLogic
// (FIELD_NOTAS_CLIENTE / CRM_FIELD_DEFS.notasClienteSalon) y de
// clienteAreaLogic v1.6.6, que usa la variante con guion. La clave
// es del sitio de KALÓNICE; en otro salón no existirá y la lectura
// devolverá simplemente vacío.
// =====================================================

const FIELD_NOTAS_CLIENTE = 'notas_fonyemjtcfteotgxzkaamjbuwmyuz';

const FIELD_NOTAS_CLIENTE_ALIASES = [
  'notas_fonyemjtcfteotgxzkaamjbuwmyuz',
  'notas-fonyemjtcfteotgxzkaamjbuwmyuz',
  'custom.notas_fonyemjtcfteotgxzkaamjbuwmyuz',
  'custom.notas-fonyemjtcfteotgxzkaamjbuwmyuz',
  'customnotasfonyemjtcfteotgxzkaamjbuwmyuz',
  'notasClienteSalon',
  'notasclientesalon'
];

// =====================================================
// UTILIDADES BÁSICAS
// =====================================================

function safeErr(e) {
  return { name: e?.name || 'Error', message: e?.message || String(e) };
}

function txt(v) {
  return String(v == null ? '' : v).trim();
}

function isGuid(x) {
  return typeof x === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

/**
 * Normaliza un nombre para comparar. Sin acentos, sin dobles espacios,
 * en minúsculas. Se usa para la defensa contra contactId envenenado.
 */
function normalizarNombre(v) {
  return txt(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza un teléfono quitando separadores. Mismo criterio que
 * getFichaTecnicaCliente en memoriaLegacyLogic v1.0.3.
 */
function normalizarTelefono(v) {
  return txt(v).replace(/[\s\-()+.]/g, '');
}

function fechaISO(v) {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toISOString();
  } catch (_) {
    return '';
  }
}

function fechaLegible(v) {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-ES', {
      timeZone: TIMEZONE_MADRID,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (_) {
    return '';
  }
}

function horaLegible(v) {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-ES', {
      timeZone: TIMEZONE_MADRID,
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return '';
  }
}

/**
 * serviciosDetail se guarda como `Label|precio;;Label|precio`
 * (recepcionProLogic, composición en el bloque 8 de crearPackReserva).
 * Aquí se descarta el precio: la ficha NO lleva dinero.
 */
function labelsDeServiciosDetail(detail) {
  const raw = txt(detail);
  if (!raw) return [];
  return raw
    .split(';;')
    .map(part => txt(String(part).split('|')[0]))
    .filter(Boolean);
}

// =====================================================
// HELPERS FLEXIBLES WIX CONTACTS
// =====================================================
// Copiados LITERALMENTE de fichaClienteLogic. Wix devuelve
// extendedFields con formas distintas según la vía de lectura, y este
// lector las cubre todas. No se reinventa: se replica.
// =====================================================

function normalizarClaveDebug(x) {
  return String(x == null ? '' : x)
    .trim()
    .toLowerCase()
    .replace(/^custom\./, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function esClaveCoincidente(k, baseKey, aliases = []) {
  const nk = normalizarClaveDebug(k);
  if (!nk) return false;

  const candidatos = [baseKey, ...(Array.isArray(aliases) ? aliases : [])]
    .filter(Boolean)
    .map(normalizarClaveDebug)
    .filter(Boolean);

  return candidatos.includes(nk);
}

function valorDeItemExtendedField(item) {
  if (!item || typeof item !== 'object') return item;
  const props = [
    'value', 'checked', 'checkbox', 'booleanValue', 'boolValue',
    'selected', 'isChecked', 'enabled', 'text', 'label', 'name'
  ];
  for (const p of props) {
    if (Object.prototype.hasOwnProperty.call(item, p)) return item[p];
  }
  return item;
}

function leerExtendedFieldFlexible(extendedFields, baseKey, aliases = []) {
  const ef = extendedFields && typeof extendedFields === 'object' ? extendedFields : {};
  const limpio = String(baseKey || '').trim();
  if (!limpio) return { key: '', value: undefined, path: '', source: 'empty-base' };

  const sinCustom = limpio.replace(/^custom\./i, '');
  const candidatos = [];
  [limpio, `custom.${sinCustom}`, sinCustom, ...(Array.isArray(aliases) ? aliases : [])].forEach(k => {
    if (k && !candidatos.includes(k)) candidatos.push(k);
  });

  for (const k of candidatos) {
    if (Object.prototype.hasOwnProperty.call(ef, k)) {
      return { key: k, value: ef[k], path: k, source: 'direct-exact' };
    }
  }

  for (const k of Object.keys(ef)) {
    if (esClaveCoincidente(k, limpio, aliases)) {
      return { key: k, value: ef[k], path: k, source: 'direct-fuzzy' };
    }
  }

  const arraysCandidatos = [];
  if (Array.isArray(ef)) arraysCandidatos.push({ arr: ef, path: 'extendedFields' });
  if (Array.isArray(ef.items)) arraysCandidatos.push({ arr: ef.items, path: 'extendedFields.items' });
  if (Array.isArray(ef.values)) arraysCandidatos.push({ arr: ef.values, path: 'extendedFields.values' });
  if (Array.isArray(ef.fields)) arraysCandidatos.push({ arr: ef.fields, path: 'extendedFields.fields' });

  for (const pack of arraysCandidatos) {
    for (let i = 0; i < pack.arr.length; i++) {
      const item = pack.arr[i];
      if (!item || typeof item !== 'object') continue;
      const itemKey = item.key || item.fieldKey || item.fieldName || item.name || item.id || item._id || '';
      if (esClaveCoincidente(itemKey, limpio, aliases)) {
        return {
          key: itemKey,
          value: valorDeItemExtendedField(item),
          path: `${pack.path}[${i}]`,
          source: 'items-array'
        };
      }
    }
  }

  const seen = new Set();

  function walk(obj, path, depth) {
    if (!obj || typeof obj !== 'object' || depth > 4 || seen.has(obj)) return null;
    seen.add(obj);

    const objKey = obj.key || obj.fieldKey || obj.fieldName || obj.name || obj.id || obj._id || '';
    if (esClaveCoincidente(objKey, limpio, aliases)) {
      return {
        key: objKey,
        value: valorDeItemExtendedField(obj),
        path,
        source: 'nested-key-object'
      };
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const r = walk(obj[i], `${path}[${i}]`, depth + 1);
        if (r) return r;
      }
      return null;
    }

    for (const [k, v] of Object.entries(obj)) {
      if (esClaveCoincidente(k, limpio, aliases)) {
        return { key: k, value: v, path: path ? `${path}.${k}` : k, source: 'nested-property' };
      }
      if (v && typeof v === 'object') {
        const r = walk(v, path ? `${path}.${k}` : k, depth + 1);
        if (r) return r;
      }
    }

    return null;
  }

  const nested = walk(ef, 'extendedFields', 0);
  if (nested) return nested;

  return { key: '', value: undefined, path: '', source: 'not-found' };
}

/**
 * El mensaje del Área de Cliente se acumula en un único campo con el
 * formato `[fecha] texto | [fecha] texto`. Parser copiado literal de
 * parseNotasHistorico (clienteAreaLogic v1.6.6): devuelve el más
 * reciente primero.
 */
function parseNotasHistorico(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return String(raw)
    .split(' | ')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const m = entry.match(/^\[([^\]]+)\]\s*(.+)$/);
      if (m) return { fecha: m[1].trim(), texto: m[2].trim() };
      return { fecha: '', texto: entry };
    })
    .reverse();
}

// =====================================================
// LECTURAS INTERNAS
// =====================================================

/**
 * Anotaciones del cliente, más recientes primero.
 * El filtro de `active` se hace EN MEMORIA a propósito: una fila sin
 * el campo informado no debe desaparecer por un `.eq(active, true)`.
 */
async function leerAnotaciones(contactId, limite) {
  const res = await wixData.query(COL_RECORDS)
    .eq(F_CONTACT_ID, contactId)
    .descending(F_RECORD_DATE)
    .limit(Math.max(1, Math.min(limite, 200)))
    .find({ suppressAuth: true });

  const items = Array.isArray(res?.items) ? res.items : [];

  return items
    .filter(it => it && it[F_ACTIVE] !== false)
    .map(it => ({
      id: it._id,
      tipo: txt(it[F_RECORD_TYPE]).toUpperCase() || TIPO_DEFECTO,
      texto: txt(it[F_RECORD_TEXT]),
      autor: txt(it[F_AUTHOR]),
      origen: txt(it[F_SOURCE]).toUpperCase() || ORIGEN_DEFECTO,
      reservaId: txt(it[F_BOOKING_ID]),
      fechaISO: fechaISO(it[F_RECORD_DATE] || it._createdDate),
      fecha: fechaLegible(it[F_RECORD_DATE] || it._createdDate)
    }))
    .filter(a => a.texto);
}

/**
 * Últimas visitas del cliente, SIN importes.
 *
 * Defensa contra contactId envenenado: se descartan las reservas cuyo
 * `clientName` normalizado no coincida con el del cliente de la cita
 * abierta. Con contactId limpio no descarta nada.
 */
async function leerUltimasVisitas(contactId, clientName, clientPhone, excluirReservaId, limite) {
  const res = await wixData.query(COL_RESERVAS)
    .eq('contactId', contactId)
    .descending('fechaReserva')
    .limit(60)
    .find({ suppressAuth: true });

  const items = Array.isArray(res?.items) ? res.items : [];

  const nombreRef = normalizarNombre(clientName);
  const telefonoRef = normalizarTelefono(clientPhone);
  const excluir = txt(excluirReservaId);

  const filtradas = items.filter(it => {
    if (!it) return false;
    if (excluir && it._id === excluir) return false;
    if (txt(it.status).toUpperCase() === 'CANCELADA') return false;
    if (txt(it.family).toUpperCase() === 'BLOQUEO') return false;

    // Sin nombre de referencia no se puede desambiguar: se acepta.
    if (!nombreRef) return true;

    if (normalizarNombre(it.clientName) === nombreRef) return true;

    // Segunda vía: mismo teléfono. Cubre el cambio de forma de escribir
    // el nombre (mayúsculas, apellido ausente) sobre el mismo cliente.
    if (telefonoRef && normalizarTelefono(it.clientPhone) === telefonoRef) return true;

    return false;
  });

  return filtradas
    .slice(0, Math.max(1, Math.min(limite, 10)))
    .map(it => ({
      reservaId: it._id,
      fechaISO: fechaISO(it.fechaReserva),
      fecha: fechaLegible(it.fechaReserva),
      hora: horaLegible(it.fechaReserva),
      profesional: txt(it.staffName),
      estado: txt(it.status).toUpperCase() || 'CONFIRMADA',
      servicios: labelsDeServiciosDetail(it.serviciosDetail),
      nota: notaDeReserva(it)     // v1.0.1 — mensaje dejado al reservar online
    }));
}

/**
 * Mensaje que el cliente dejó al reservar la cita desde la que se abre la
 * ficha. Esa reserva se excluye de `visitas` por ser la actual, así que sin
 * esta lectura su mensaje no se vería justo cuando más falta hace.
 */
async function leerNotaDeReserva(reservaId) {
  const rid = txt(reservaId);
  if (!rid) return '';
  try {
    const item = await wixData.get(COL_RESERVAS, rid, { suppressAuth: true });
    return notaDeReserva(item);
  } catch (e) {
    console.log(`${TAG} nota de reserva no disponible: ${safeErr(e).message}`);
    return '';
  }
}

/**
 * Mensaje permanente que el cliente deja desde su Área de Cliente.
 * Lectura temporal contra Wix Contacts — ver nota de cabecera.
 */
async function leerMensajeAreaCliente(contactId) {
  try {
    const elevatedGet = elevate(contacts.getContact);
    const contact = await elevatedGet(contactId);
    if (!contact) return { historico: [], raw: '' };

    const ef = contact.info?.extendedFields || {};
    const lectura = leerExtendedFieldFlexible(
      ef,
      FIELD_NOTAS_CLIENTE,
      FIELD_NOTAS_CLIENTE_ALIASES
    );

    const raw = typeof lectura.value === 'string' ? lectura.value : '';
    if (!txt(raw)) return { historico: [], raw: '' };

    console.log(`${TAG} mensaje área cliente: origen=${lectura.source} chars=${raw.length}`);
    return { historico: parseNotasHistorico(raw), raw };

  } catch (e) {
    // El campo puede no existir en este salón. No es un error operativo.
    console.log(`${TAG} mensaje área cliente no disponible: ${safeErr(e).message}`);
    return { historico: [], raw: '' };
  }
}

// =====================================================
// 1 · LECTURA COMPLETA PARA EL POPUP
// =====================================================
// Una sola llamada devuelve las tres cosas que el popup pinta:
// anotaciones, últimas visitas y mensaje del Área de Cliente.
// =====================================================

export const getFichaClienteRecords = webMethod(
  Permissions.SiteMember,
  async (opts = {}) => {
    try {
      const {
        contactId = '',
        clientName = '',
        clientPhone = '',
        excluirReservaId = '',
        limiteNotas = LIMITE_NOTAS,
        limiteCitas = LIMITE_CITAS,
        incluirMensajeCliente = true
      } = opts || {};

      const cid = txt(contactId);
      if (!isGuid(cid)) {
        return {
          ok: false,
          version: VERSION,
          error: { message: 'contactId requerido' },
          anotaciones: [],
          visitas: [],
          mensajeCliente: []
        };
      }

      const [anotaciones, visitas, mensaje, notaReserva] = await Promise.all([
        leerAnotaciones(cid, limiteNotas),
        leerUltimasVisitas(cid, clientName, clientPhone, excluirReservaId, limiteCitas),
        incluirMensajeCliente ? leerMensajeAreaCliente(cid) : Promise.resolve({ historico: [], raw: '' }),
        leerNotaDeReserva(excluirReservaId)
      ]);

      // Agrupación por tipo, para que el popup no tenga que filtrar.
      const porTipo = { COLOR: [], TRATAMIENTO: [], GENERAL: [] };
      for (const a of anotaciones) {
        if (porTipo[a.tipo]) porTipo[a.tipo].push(a);
        else porTipo.GENERAL.push(a);
      }

      console.log(
        `${TAG} getFichaClienteRecords ${cid} · notas=${anotaciones.length} ` +
        `visitas=${visitas.length} mensajes=${mensaje.historico.length}`
      );

      return {
        ok: true,
        version: VERSION,
        contactId: cid,
        anotaciones,
        porTipo,
        visitas,
        mensajeCliente: mensaje.historico,
        // v1.0.1 — mensaje de la cita abierta. Vacío si la ficha se abre
        // desde la barra superior, donde no hay cita de referencia.
        notaReserva
      };

    } catch (e) {
      console.error(`${TAG} ❌ getFichaClienteRecords:`, e);
      return {
        ok: false,
        version: VERSION,
        error: safeErr(e),
        anotaciones: [],
        visitas: [],
        mensajeCliente: []
      };
    }
  }
);

// =====================================================
// 2 · GUARDAR UNA ANOTACIÓN
// =====================================================
// Siempre INSERT. Nunca update: el histórico no se sobrescribe.
// =====================================================

export const guardarFichaClienteRecord = webMethod(
  Permissions.SiteMember,
  async (opts = {}) => {
    try {
      const {
        contactId = '',
        clientName = '',
        clientPhone = '',
        recordType = TIPO_DEFECTO,
        recordText = '',
        author = '',
        bookingId = '',
        source = ORIGEN_DEFECTO
      } = opts || {};

      const cid = txt(contactId);
      if (!isGuid(cid)) {
        return { ok: false, version: VERSION, error: { message: 'contactId requerido' } };
      }

      const texto = txt(recordText).slice(0, LIMITE_TEXTO);
      if (!texto) {
        return { ok: false, version: VERSION, error: { message: 'El texto está vacío' } };
      }

      const tipo = txt(recordType).toUpperCase();
      const tipoFinal = TIPOS_VALIDOS.includes(tipo) ? tipo : TIPO_DEFECTO;

      const origen = txt(source).toUpperCase();
      const origenFinal = ORIGENES_VALIDOS.includes(origen) ? origen : ORIGEN_DEFECTO;

      const ahora = new Date();

      const registro = {
        [F_CONTACT_ID]:   cid,
        [F_CLIENT_NAME]:  txt(clientName),
        [F_CLIENT_PHONE]: txt(clientPhone),
        [F_RECORD_TYPE]:  tipoFinal,
        [F_RECORD_TEXT]:  texto,
        [F_RECORD_DATE]:  ahora,
        [F_AUTHOR]:       txt(author),
        [F_BOOKING_ID]:   txt(bookingId),
        [F_SOURCE]:       origenFinal,
        [F_ACTIVE]:       true
      };

      const insertado = await wixData.insert(COL_RECORDS, registro, { suppressAuth: true });

      console.log(
        `${TAG} ✅ anotación ${tipoFinal} guardada · cliente=${cid} ` +
        `autor=${txt(author) || '(sin firma)'} chars=${texto.length}`
      );

      return {
        ok: true,
        version: VERSION,
        anotacion: {
          id: insertado._id,
          tipo: tipoFinal,
          texto,
          autor: txt(author),
          origen: origenFinal,
          reservaId: txt(bookingId),
          fechaISO: fechaISO(ahora),
          fecha: fechaLegible(ahora)
        }
      };

    } catch (e) {
      console.error(`${TAG} ❌ guardarFichaClienteRecord:`, e);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 3 · RETIRAR UNA ANOTACIÓN
// =====================================================
// Soft delete: `active = false`. La fila se conserva. READ-MERGE-UPDATE,
// nunca un objeto parcial: wixData.update reemplaza el documento entero.
// =====================================================

export const desactivarFichaClienteRecord = webMethod(
  Permissions.SiteMember,
  async (opts = {}) => {
    try {
      const { recordId = '' } = opts || {};
      const rid = txt(recordId);
      if (!rid) {
        return { ok: false, version: VERSION, error: { message: 'recordId requerido' } };
      }

      const actual = await wixData.get(COL_RECORDS, rid, { suppressAuth: true });
      if (!actual) {
        return { ok: false, version: VERSION, error: { message: 'Anotación no encontrada' } };
      }

      actual[F_ACTIVE] = false;
      await wixData.update(COL_RECORDS, actual, { suppressAuth: true });

      console.log(`${TAG} 🗑 anotación ${rid} retirada`);
      return { ok: true, version: VERSION, recordId: rid };

    } catch (e) {
      console.error(`${TAG} ❌ desactivarFichaClienteRecord:`, e);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);
