// =====================================================
// [ReminderJob v1.10.0] - reminderLogic.web.js
// Recordatorios automáticos 24h antes de la cita
// FUENTE V2: KamisuiteReservations (fuente de verdad de reservas)
// Email: Wix Triggered VGPVvYO (cascada) o Brevo (plantilla CMS)
// según SalonConfig.emailProvider. WhatsApp vía centralita.
// Idempotencia garantizada por colección ReminderLog.
//
// ─────────────────────────────────────────────────────
// AUDITORÍA DE CONEXIONES (obligatoria en cada entrega)
// ─────────────────────────────────────────────────────
//  LEE de:
//    · KamisuiteReservations  → citas de mañana. FUENTE DE VERDAD V2.
//    · SalonConfig            → emailActive / waActive (canal entero),
//                               emailReminder / whatsappReminder
//                               (solo el recordatorio), emailProvider.
//    · Wix Contacts (CRM)     → mapa email/nombre → contactId (cascada).
//    · ReminderLog            → idempotencia (qué ya se envió).
//  ESCRIBE en:
//    · ReminderLog            → una fila por reserva notificada.
//    · CommunicationLog       → el WhatsApp, vía la centralita; y desde
//                               la v1.9.0 también el EMAIL, con apunte
//                               propio (registrarComunicacion).
//  LE LLAMA:
//    · reminderJob.js → jobs.config, cron "0 7 * * *" (07:00 UTC).
//  LLAMA A:
//    · comunicacionesLogic.registrarComunicacion (v1.4.0) → apunte del
//      email del recordatorio en el histórico de Comunicaciones.
//    · comunicacionesLogic.notificarRecordatorio (v1.4.0) → WhatsApp
//      (whatsappLogic v1.6.1, plantilla booking_reminder_es).
//    · brevoLogic.enviarEmailPlantilla (plantilla reminderLayout).
//    · wix-crm-backend triggeredEmails (plantilla VGPVvYO).
//  FLUJO DE PUNTA A PUNTA: verificado. Ya NO hay tramo muerto.
//
// CHANGELOG:
//   v1.0.x - Motor base, DRY_RUN, fixes de query y extracción.
//   v1.1.x - Resolución CRM email→contactId + nombre→contactId.
//   v1.2.x - Agrupación cascada. (v1.2.1 revertido: appendOrCreate)
//   v1.3.0 - porEmail → array de candidatos. Envío prueba cada uno.
//            Filtro @hair-times.com en origen.
//   v1.3.1 - FIX: extrae loginEmail de miembros Wix (no solo
//            info.emails). Filtra destinos @hair-times.com ANTES de
//            enviar via mapa inverso contactId → emails.
//            Maneja info.emails como objeto {items:[]} o como array.
//   v1.4.0 - Integración con centralita comunicacionesLogic.
//   v1.5.0 - Toggle SalonConfig.reminderActive (Boolean).
//   v1.6.0 - Email de recordatorio por Brevo si SalonConfig.emailProvider
//            = 'brevo': en enviarRecordatorio se envía a clientEmail vía
//            brevoLogic.enviarEmailPlantilla (plantilla reminderLayout),
//            SIN cascada de contactIds (Brevo va al email directo). Si
//            'wix' o vacío, la cascada Triggered VGPVvYO queda intacta.
//            WhatsApp vía centralita sin cambios. Nuevo helper
//            _getEmailProvider() (lectura defensiva, fail-safe → 'wix').
//            NOTA: la v1.5.0 (reminderActive) nunca se desplegó; esta
//            entrega salta de la v1.4.0 (producción) a la v1.6.0, que
//            incluye AMBOS: reminderActive + Brevo.
//   v1.7.0 - FIX CRÍTICO DE FUENTE DE DATOS (28-Ago-2026).
//   v1.7.1 - Solo comentarios: corregida la nota sobre los teléfonos de
//            Salon Kami (son ficticios, no clonados reales). Sin cambios
//            funcionales respecto a la v1.7.0.
//   v1.8.0 - Un interruptor por canal para el recordatorio de cita.
//   v1.9.0 - El recordatorio por EMAIL deja rastro en el histórico de
//            Comunicaciones.
//   v1.10.0- Jerarquía de interruptores: canal por encima, recordatorio
//            por debajo. Se abandona el maestro reminderActive.
//
// CAMBIOS v1.10.0:
//   JERARQUÍA (decisión de Jal, 30-Ago-2026):
//     · emailActive / waActive son los interruptores de CANAL. Si un
//       canal está cerrado, NO sale nada por él: ni confirmaciones, ni
//       compras, ni recordatorios. Manda sobre todo lo demás.
//     · emailReminder / whatsappReminder son los interruptores del
//       RECORDATORIO. Solo deciden si, con el canal ya abierto, el
//       salón quiere además el aviso automático de la cita de mañana.
//     · Un canal abierto con su recordatorio apagado = el salón sigue
//       mandando confirmaciones y compras por ahí, pero no recordatorios.
//     · Un canal cerrado = da igual lo que diga su recordatorio.
//
//   QUÉ CORRIGE: hasta la v1.9.0 el email del recordatorio NO consultaba
//   emailActive. Se enviaba aunque el salón tuviera el canal email
//   cerrado. El WhatsApp sí lo respetaba, porque va por la centralita y
//   allí se comprueba waActive. Era una asimetría real e invisible.
//
//   SE ABANDONA reminderActive: era un tercer interruptor maestro que no
//   está en la pantalla de configuración (solo existía en el CMS) y que
//   se solapaba con los dos de canal. Este módulo deja de leerlo. El
//   campo puede quedarse en el CMS sin efecto o borrarse.
//   ⚠️ CONSECUENCIA: si alguna cuenta lo tenía en "no" para silenciar el
//   cron, ya NO la silencia. Ese apagado hay que rehacerlo cerrando el
//   canal o el recordatorio correspondiente.
//
//   SEMÁNTICA DE LECTURA — deliberadamente distinta en cada nivel, y
//   copiada literalmente de cómo ya se leen hoy en producción:
//     · Canal: cerrado salvo que valga SÍ explícito (igual que hace la
//       centralita con emailActive y whatsappLogic con waActive). Vacío
//       = cerrado. Coincide con lo que pinta la pantalla de config.
//     · Recordatorio: abierto salvo que valga NO explícito. Vacío =
//       abierto, para que ninguna cuenta sin el campo creado se quede
//       muda de golpe.
//
//   El log de arranque dice ahora, por cada canal, si lo que lo cierra
//   es el canal o el recordatorio, para no volver a diagnosticar a ciegas.
//   Pareja widget: widget_salon_config v1.0.16.
//
// CAMBIOS v1.9.0:
//   - PROBLEMA QUE CIERRA: el email del recordatorio (tanto el camino
//     Brevo como la cascada de Wix) se enviaba sin escribir en
//     CommunicationLog. El WhatsApp sí lo hacía, vía la centralita. La
//     pantalla de Comunicaciones mostraba, por tanto, la mitad de los
//     recordatorios reales, y cualquier informe por canal salía sesgado
//     hacia WhatsApp.
//   - Tras el intento de envío por email se llama a
//     comunicacionesLogic.registrarComunicacion con el resultado real
//     (ok o error + motivo), el destinatario, el cliente, los servicios
//     y la fecha/hora de la cita. Mismos campos que ya escribe la
//     centralita para el WhatsApp → el histórico queda homogéneo.
//   - NO BLOQUEANTE: el apunte va en try/catch propio. Si falla el
//     registro, el recordatorio ya se envió y el cron sigue igual.
//   - Sin apunte cuando el canal email está cerrado por configuración:
//     no se ha intentado nada, así que no hay nada que registrar.
//   - Cero cambios en el envío: cascada de candidatos, Brevo,
//     idempotencia, agrupación y toggles quedan exactamente igual.
//
// CAMBIOS v1.8.0:
//   - Nuevo helper _getCanalesRecordatorio(): lee de SalonConfig los
//     campos `emailReminder` y `whatsappReminder` (Booleanos) y decide
//     qué canales del recordatorio están abiertos.
//   - Lectura DEFENSIVA, idéntica al patrón de reminderActive: solo
//     cierra un canal si el valor es false EXPLÍCITO. vacío / null /
//     true / error de lectura → canal ABIERTO. Así ninguna cuenta que
//     todavía no tenga los campos creados se queda muda.
//   - Si los DOS canales están cerrados, el cron aborta antes de las
//     queries pesadas, igual que con reminderActive=false.
//   - Si solo está cerrado el email: no se envía email (ni Wix ni
//     Brevo) y no se lee el proveedor, pero el WhatsApp sale.
//   - Si solo está cerrado el WhatsApp: no se invoca la centralita.
//   - La fila de ReminderLog (idempotencia) se sigue escribiendo
//     siempre que se haya intentado algo por algún canal, para que una
//     segunda ejecución el mismo día no duplique avisos.
//   - reminderActive sigue siendo el interruptor MAESTRO: si está en
//     false explícito, no sale nada por ningún canal aunque los dos
//     toggles nuevos estén encendidos.
//   - Pareja: salonConfigLogic v1.0.11 + widget_salon_config v1.0.14.
//
// CAMBIOS v1.7.0 — el cron leía de V1 y no encontraba NADA:
//   PROBLEMA: hasta la v1.6.0 este cron buscaba las citas de mañana en
//   `extendedBookings` (Wix Bookings) y en `SvExternalRecords`. En V2
//   las reservas NO se crean como bookings de Wix (recepcionProLogic
//   usa sessions.createSession sobre el ancla y registra la reserva en
//   `KamisuiteReservations`) y los externos también viven ahí. Desde la
//   migración de Hair-Times a V2 el cron encontraba CERO citas y por
//   tanto NO se enviaba ningún recordatorio, ni email ni WhatsApp.
//   Explica además la incidencia abierta desde junio: "el recordatorio
//   no genera logs en Salón Kami" (Salón Kami es V2 desde el principio).
//
//   SOLUCIÓN: se sustituyen `leerCitasWix` + `leerCitasExternos` por
//   una única `leerCitasV2` que consulta `KamisuiteReservations` con el
//   patrón productivo del proyecto (recepcionProLogic.getReservasPorFecha
//   y clienteAreaLogic próximas citas):
//     · rango sobre `fechaReserva` con colchón de ±3h y filtro final por
//       fecha Madrid (evita el borde de zona horaria).
//     · `.ne('status','CANCELADA')`.
//     · filtrado de BLOQUEOS con el patrón literal de
//       cierreLogicExtendido v1.1.4: family==='BLOQUEO' o clientName
//       que empieza por 'BLOQUEO:'.
//     · nombres de servicio desde `serviciosDetail` (separador ';;',
//       item 'label|precio|cantidad'), quitando las fases técnicas
//       (lavado / secado / proceso). Si queda vacío, cae a `title`.
//     · hora fin = fechaReserva + duracionTotal + extensionMin.
//   Devuelve EXACTAMENTE la misma forma de objeto que devolvían las dos
//   funciones V1, así que TODO lo de aguas abajo queda intacto: mapeo
//   CRM, cascada de candidatos, idempotencia, agrupación, email (Wix o
//   Brevo) y WhatsApp por la centralita.
//
//   · Cada reserva V2 ya es el pack completo del cliente (una fila por
//     cita, no una por fase), así que la agrupación normalmente deja el
//     grupo tal cual; sigue viva para el caso de dos reservas del mismo
//     cliente en el mismo día.
//   · `resolverCandidatos` usa ahora como PRIMER candidato el contactId
//     que ya trae la propia reserva, y después la cascada CRM de
//     siempre. Sin esto, una reserva con el email genérico del salón y
//     un nombre que no casa literalmente con el CRM se quedaba sin
//     candidatos y no recibía NI email NI WhatsApp.
//   · Se elimina el import de `extendedBookings` (ya no se usa).
//   · `source` pasa a valer 'v2' en ReminderLog (antes 'wix'/'externo').
//
//   No se toca:
//     - Cascada de candidatos email ni enviarRecordatorio
//     - Camino Brevo (_enviarRecordatorioBrevo) ni _getEmailProvider
//     - notificarWhatsAppViaCentralita
//     - Toggle reminderActive
//     - Idempotencia ReminderLog
//     - Constantes hardcoded (PROFESIONAL_DEFAULT, DOMINIO_SALON,
//       SITE_URL) — deuda técnica multi-tenant para versión futura.
//
// CAMBIOS v1.5.0:
//   - Nuevo helper _getReminderActive() lee SalonConfig.reminderActive
//     ANTES de ejecutar las 3 queries pesadas (CRM + Wix Bookings +
//     Externos). Si false → aborta limpiamente con resumen shape
//     estable (todos los contadores a 0, skipped:true, reason).
//   - Lectura DEFENSIVA: solo aborta si reminderActive === false
//     EXPLÍCITO. null/undefined/true/error → procede normal. Hair-Times
//     producción no se afecta hasta que su SalonConfig tenga el campo
//     en false; cuentas nuevas clonadas o sin campo siguen enviando.
//   - Motivo: poder apagar el cron por cuenta sin tocar código.
//     CORRECCIÓN 28-Ago-2026: la nota anterior decía que Salon Kami
//     tenía teléfonos reales clonados de Hair-Times. NO es así: los
//     contactos de Salon Kami son ficticios, salvo los números reales
//     del propio Jal. El riesgo real es otro y sigue vigente: esos
//     números ficticios tienen formato de móvil español asignable
//     (+34 600 8x xx xx), así que pueden corresponder a líneas de
//     terceros. Confirmaciones WhatsApp (recepcionProLogic v1.0.18+)
//     intactas — el toggle es exclusivo del cron de recordatorios.
//
//   No se toca:
//     - Cascada de candidatos email
//     - enviarRecordatorio (triggeredEmails.emailContact + cascada)
//     - notificarWhatsAppViaCentralita
//     - Mapeo CRM, idempotencia, agrupación
//     - Constantes hardcoded (PROFESIONAL_DEFAULT, DOMINIO_SALON,
//       SITE_URL) — deuda técnica multi-tenant para versión futura.
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';
import { triggeredEmails, contacts } from 'wix-crm-backend';

// v1.4.0: Centralita de comunicaciones
import { notificarRecordatorio, registrarComunicacion } from 'backend/comunicacionesLogic.web.js';
// v1.6.0: driver de email por plantilla (Brevo)
import { enviarEmailPlantilla } from 'backend/brevoLogic.web.js';

const TAG = '[ReminderJob v1.10.0]';

// v1.7.0: colección fuente de verdad de reservas en V2
const CMS_RESERVAS = 'KamisuiteReservations';
const TIMEZONE = 'Europe/Madrid';
const EMAIL_RECORDATORIO_ID = 'VGPVvYO';
const PROFESIONAL_DEFAULT = 'Equipo Hair-Times';
const DRY_RUN = false;

// Dominio del salón — cualquier @hair-times.com se ignora
const DOMINIO_SALON = '@hair-times.com';

// Servicios técnicos que no aportan info al cliente en el email
const SERVICIOS_OCULTOS = ['lavado', 'secado', 'proceso'];

// ----------- Helpers fecha Madrid -----------
function ventanaManana() {
  const ahora = new Date();
  const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const yyyy_mm_dd = manana.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  const inicio = new Date(`${yyyy_mm_dd}T00:00:00+02:00`);
  const fin = new Date(`${yyyy_mm_dd}T23:59:59+02:00`);
  // v1.7.0: fechaYMD (Madrid) para el filtro fino de leerCitasV2
  return { inicio, fin, fechaYMD: yyyy_mm_dd, fechaLegible: formatearFechaES(manana) };
}

function formatearFechaES(d) {
  return d.toLocaleDateString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function formatearHora(d) {
  return d.toLocaleTimeString('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit', minute: '2-digit'
  });
}

function esEmailSalon(email) {
  if (!email) return true;
  return email.toLowerCase().trim().endsWith(DOMINIO_SALON);
}

// ----------- v1.6.0: Proveedor de email (SalonConfig.emailProvider) -----
// Lectura defensiva: solo 'brevo' activa Brevo. Vacío/otro/error → 'wix'
// (fail-safe: no rompe el canal Triggered existente).
async function _getEmailProvider() {
  try {
    const res = await wixData.query('SalonConfig')
      .limit(1)
      .find({ suppressAuth: true });
    if (res.items.length === 0) return 'wix';
    const p = String(res.items[0].emailProvider || '').toLowerCase().trim();
    return p === 'brevo' ? 'brevo' : 'wix';
  } catch (e) {
    console.error(`${TAG} ⚠️ Error leyendo SalonConfig.emailProvider (fail-safe → wix): ${e.message}`);
    return 'wix';
  }
}

// ----------- Extraer TODOS los emails de un contacto CRM -----------
function extraerEmailsContacto(c) {
  const emails = new Set();

  // 1) info.emails — puede ser array directo o {items: [...]}
  const infoEmails = c?.info?.emails;
  if (infoEmails) {
    const lista = Array.isArray(infoEmails)
      ? infoEmails
      : Array.isArray(infoEmails.items)
        ? infoEmails.items
        : [];
    for (const entry of lista) {
      const e = (entry?.email || entry || '').toLowerCase().trim();
      if (e) emails.add(e);
    }
  }

  // 2) c.emails (fallback antiguo)
  const cEmails = c?.emails;
  if (cEmails) {
    const lista = Array.isArray(cEmails)
      ? cEmails
      : Array.isArray(cEmails.items)
        ? cEmails.items
        : [];
    for (const entry of lista) {
      const e = (entry?.email || entry || '').toLowerCase().trim();
      if (e) emails.add(e);
    }
  }

  // 3) primaryEmail
  const primary = (c?.primaryEmail || '').toLowerCase().trim();
  if (primary) emails.add(primary);

  // 4) loginEmail (miembros del sitio)
  const login = (c?.loginEmail || '').toLowerCase().trim();
  if (login) emails.add(login);

  // 5) primaryInfo.email
  const primaryInfo = (c?.primaryInfo?.email || '').toLowerCase().trim();
  if (primaryInfo) emails.add(primaryInfo);

  return [...emails];
}

// ----------- Mapa CRM -----------
// porEmail: email → [contactId, ...]
// porNombre: nombre completo → contactId | null
// emailsDeContacto: contactId → [email, ...] (para filtrar destinos)
async function cargarMapaCRM() {
  try {
    const elevatedQuery = elevate(contacts.queryContacts);
    const allContacts = [];
    let hasMore = true;
    let skip = 0;
    const pageSize = 1000;

    while (hasMore) {
      const result = await elevatedQuery()
        .skip(skip)
        .limit(pageSize)
        .find();
      const items = result?.items || [];
      allContacts.push(...items);
      if (items.length < pageSize) {
        hasMore = false;
      } else {
        skip += pageSize;
      }
      if (skip >= 10000) {
        hasMore = false;
      }
    }

    const porEmail = {};
    const porNombre = {};
    const emailsDeContacto = {};

    for (const c of allContacts) {
      const id = c._id || c.id;
      if (!id) continue;

      // Extraer todos los emails de este contacto
      const todosEmails = extraerEmailsContacto(c);
      emailsDeContacto[id] = todosEmails;

      // Indexar cada email real → contactId
      for (const email of todosEmails) {
        if (!esEmailSalon(email)) {
          if (!porEmail[email]) porEmail[email] = [];
          if (!porEmail[email].includes(id)) {
            porEmail[email].push(id);
          }
        }
      }

      // Nombre completo
      const infoName = c?.info?.name || {};
      const first = (infoName.first || c?.name?.first || c?.firstName || '').trim();
      const last = (infoName.last || c?.name?.last || c?.lastName || '').trim();
      const fullName = `${first} ${last}`.trim().toLowerCase();
      if (fullName && fullName.length > 1) {
        if (porNombre[fullName] === undefined) {
          porNombre[fullName] = id;
        } else {
          porNombre[fullName] = null;
        }
      }
    }

    const totalEmails = Object.keys(porEmail).length;
    const nombresUnicos = Object.values(porNombre).filter(v => v !== null).length;
    console.log(`${TAG} 📇 Mapa CRM: ${allContacts.length} contactos, ${totalEmails} emails indexados, ${nombresUnicos} nombres únicos`);
    return { porEmail, porNombre, emailsDeContacto };
  } catch (e) {
    console.error(`${TAG} ❌ Error cargarMapaCRM:`, e.message);
    return { porEmail: {}, porNombre: {}, emailsDeContacto: {} };
  }
}

// ----------- v1.8.0: Canales abiertos del recordatorio ---------
// Lee SalonConfig.emailReminder y SalonConfig.whatsappReminder.
// Lectura defensiva: solo cierra el canal con false EXPLÍCITO.
// vacío / null / true / error → canal abierto (fail-safe).
async function _getCanalesRecordatorio() {
  try {
    const res = await wixData.query('SalonConfig')
      .limit(1)
      .find({ suppressAuth: true });

    if (res.items.length === 0) {
      console.log(`${TAG} ℹ️ SalonConfig vacío — no se puede determinar el estado de los canales, no se envía nada`);
      return { email: false, whatsapp: false };
    }

    const cfg = res.items[0];

    // NIVEL 1 — el canal. Cerrado salvo SÍ explícito. Misma lectura que
    // hace la centralita (emailActive) y el driver de WhatsApp (waActive):
    // si el canal está cerrado NO sale nada por él, recordatorios incluidos.
    const canalEmail    = cfg.emailActive === true;
    const canalWhatsapp = cfg.waActive    === true;

    // NIVEL 2 — el recordatorio dentro de ese canal. Abierto salvo NO
    // explícito, para que una cuenta sin el campo creado no enmudezca.
    const recEmail    = cfg.emailReminder    !== false;
    const recWhatsapp = cfg.whatsappReminder !== false;

    const email    = canalEmail    && recEmail;
    const whatsapp = canalWhatsapp && recWhatsapp;

    // Motivo explícito del cierre: evita volver a diagnosticar a ciegas.
    const porQue = (canal, rec) => canal ? (rec ? 'ON' : 'OFF (recordatorio apagado)') : 'OFF (canal cerrado)';
    console.log(`${TAG} 🔀 Recordatorio → EMAIL: ${porQue(canalEmail, recEmail)} | WHATSAPP: ${porQue(canalWhatsapp, recWhatsapp)}`);

    return { email, whatsapp };

  } catch (e) {
    // Fail-safe conservador: ante un error de lectura NO se envía. Un
    // recordatorio de menos se recupera; uno de más, no.
    console.error(`${TAG} ⚠️ Error leyendo los interruptores de canal — no se envía nada por precaución: ${e.message}`);
    return { email: false, whatsapp: false };
  }
}

// ----------- v1.7.0: Lectura de citas desde KamisuiteReservations -----------
//
// FUENTE DE VERDAD V2. Sustituye a leerCitasWix (extendedBookings) y a
// leerCitasExternos (SvExternalRecords), ambas V1 y ambas vacías desde
// la migración de Hair-Times a V2.
//
// Patrón de query copiado literalmente de recepcionProLogic
// `getReservasPorFecha`: rango amplio sobre `fechaReserva` (±3h de
// colchón) y filtro fino por fecha Madrid, para no perder ni colar
// reservas por el borde de zona horaria.
//
// Devuelve EXACTAMENTE la misma forma de objeto que devolvían las dos
// funciones V1, de modo que la agrupación, la cascada de candidatos, la
// idempotencia y los dos canales de envío siguen funcionando sin tocar.
async function leerCitasV2(inicio, fin, fechaYMD) {
  try {
    const startUTC = new Date(inicio.getTime() - 3 * 3600000);
    const endUTC = new Date(fin.getTime() + 3 * 3600000);

    const res = await wixData.query(CMS_RESERVAS)
      .ge('fechaReserva', startUTC)
      .le('fechaReserva', endUTC)
      .ne('status', 'CANCELADA')
      .ascending('fechaReserva')
      .limit(200)
      .find({ suppressAuth: true });

    let bloqueosFiltrados = 0;
    let fueraDeDia = 0;

    const citas = [];

    for (const r of (res.items || [])) {
      if (!r.fechaReserva) continue;

      const start = r.fechaReserva instanceof Date
        ? r.fechaReserva : new Date(r.fechaReserva);

      // Filtro fino por día Madrid (patrón getReservasPorFecha)
      const diaMadrid = start.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
      if (diaMadrid !== fechaYMD) { fueraDeDia++; continue; }

      // Bloqueos del calendario: NO son clientes.
      // Patrón literal de cierreLogicExtendido v1.1.4.
      if (r.family === 'BLOQUEO') { bloqueosFiltrados++; continue; }
      if (typeof r.clientName === 'string' && r.clientName.startsWith('BLOQUEO:')) {
        bloqueosFiltrados++; continue;
      }

      const minutos = (Number(r.duracionTotal) || 0) + (Number(r.extensionMin) || 0);
      const end = new Date(start.getTime() + minutos * 60000);

      const partes = String(r.clientName || '').trim().split(' ');

      const servicios = _nombresServicioVisibles(r);

      citas.push({
        bookingId: r._id,
        source: 'v2',
        contactId: r.contactId || '',
        clientEmail: r.clientEmail || '',
        clientPhone: r.clientPhone || '',
        Nombre: partes[0] || '',
        Apellido: partes.slice(1).join(' ') || '',
        Fecha: formatearFechaES(start),
        horaInicio: formatearHora(start),
        horaFinal: formatearHora(end),
        servicios: servicios,
        importeTotal: r.precioTotal ? `${r.precioTotal} €` : '',
        estadoPago: r.status === 'PAGADO' ? 'Pagado' : 'Pago en salón',
        _startMs: start.getTime(),
        _endMs: end.getTime()
      });
    }

    console.log(`${TAG} 📅 Reservas V2 encontradas: ${citas.length} (bloqueos descartados: ${bloqueosFiltrados} | fuera del día: ${fueraDeDia})`);
    return citas;

  } catch (e) {
    console.error(`${TAG} ❌ Error leerCitasV2:`, e.message);
    return [];
  }
}

// v1.7.0: nombres de servicio legibles para el cliente.
// `serviciosDetail` se construye en recepcionProLogic como
// 'Label|precio|cantidad' separado por ';;'. Se quitan las fases
// técnicas (lavado / secado / proceso) que no aportan nada al cliente.
// Si tras el filtrado no queda ninguna línea, se cae al `title` de la
// reserva para no mandar nunca un recordatorio con el servicio vacío.
function _nombresServicioVisibles(reserva) {
  const detalle = String(reserva.serviciosDetail || '');

  const nombres = detalle
    .split(';;')
    .map(item => String(item).split('|')[0].trim())
    .filter(Boolean)
    .filter(nombre => !SERVICIOS_OCULTOS.some(s => nombre.toLowerCase().startsWith(s)));

  if (nombres.length > 0) {
    // Sin duplicados, respetando el orden de la cita
    const unicos = [];
    for (const n of nombres) {
      if (!unicos.includes(n)) unicos.push(n);
    }
    return unicos.join(', ');
  }

  const titulo = String(reserva.title || '').split(' — ')[0].trim();
  return titulo || 'Tu cita';
}


// ----------- Filtro idempotencia -----------
async function filtrarYaEnviados(citas) {
  if (!citas.length) return [];
  const ids = citas.map(c => c.bookingId);
  const res = await wixData.query('ReminderLog')
    .hasSome('bookingId', ids)
    .limit(1000)
    .find({ suppressAuth: true });
  const yaEnviados = new Set(res.items.map(i => i.bookingId));
  const restantes = citas.filter(c => !yaEnviados.has(c.bookingId));
  console.log(`${TAG} 🔍 ${yaEnviados.size} ya enviados | ${restantes.length} pendientes`);
  return restantes;
}

// ----------- Resolver candidatos -----------
function resolverCandidatos(cita, mapas) {
  const emailCliente = (cita.clientEmail || '').toLowerCase().trim();
  const esGenerico = esEmailSalon(emailCliente) || !emailCliente;

  // 1) Email real → todos los contactIds asociados a ese email
  if (!esGenerico) {
    const candidatos = mapas.porEmail[emailCliente];
    if (candidatos && candidatos.length > 0) {
      // v1.7.0: el contactId de la propia reserva va primero si existe
      const lista = [...candidatos];
      if (cita.contactId && !lista.includes(cita.contactId)) {
        lista.unshift(cita.contactId);
      }
      return { candidatos: lista, claveAgrupacion: `email_${emailCliente}` };
    }
  }

  // 2) Nombre completo en CRM (para emails genéricos)
  const fullName = `${cita.Nombre} ${cita.Apellido}`.trim().toLowerCase();
  if (fullName && fullName.length > 1) {
    const idPorNombre = mapas.porNombre[fullName];
    if (idPorNombre) {
      const lista = [idPorNombre];
      if (cita.contactId && !lista.includes(cita.contactId)) {
        lista.unshift(cita.contactId);
      }
      return { candidatos: lista, claveAgrupacion: `nombre_${fullName}` };
    }
  }

  // 3) v1.7.0 — ÚLTIMO RECURSO: la reserva V2 ya trae su propio
  //    contactId. Antes, si el email era el genérico del salón y el
  //    nombre no casaba literalmente con el CRM, la cita caía en
  //    "sin resolver" y el cliente se quedaba SIN email y SIN WhatsApp,
  //    aun teniendo su teléfono delante en la reserva.
  if (cita.contactId) {
    return {
      candidatos: [cita.contactId],
      claveAgrupacion: `contacto_${cita.contactId}`
    };
  }

  // 4) v1.7.0 — sin contactId pero con teléfono: se agrupa igualmente
  //    para que al menos salga el WhatsApp. El email no se enviará
  //    (la cascada no tiene candidatos), y así queda registrado.
  const telefono = String(cita.clientPhone || '').trim();
  if (telefono) {
    return { candidatos: [], claveAgrupacion: `tel_${telefono}` };
  }

  return { candidatos: [], claveAgrupacion: null };
}

// ----------- Verificar si un contactId enviaría a @hair-times.com -----------
function contactoEnviaASalon(contactId, emailsDeContacto) {
  const emails = emailsDeContacto[contactId] || [];
  if (emails.length === 0) return false; // sin emails, dejamos que Wix decida
  // Si TODOS los emails son @hair-times.com → no enviar
  return emails.every(e => esEmailSalon(e));
}

// ----------- Agrupación cascada -----------
// v1.4.0: añadida propagación de teléfono al objeto agrupado
function agruparPorCliente(citas) {
  const grupos = {};
  const sinResolver = [];

  for (const cita of citas) {
    // v1.7.0: basta con tener clave de agrupación. Antes se exigía
    // además al menos un candidato de CRM, y eso dejaba fuera del
    // WhatsApp a clientes de los que SÍ tenemos el teléfono en la
    // reserva pero cuyo contactId no se pudo resolver.
    if (!cita._claveAgrupacion) {
      sinResolver.push(cita);
      continue;
    }
    const key = cita._claveAgrupacion;
    if (!grupos[key]) {
      grupos[key] = [];
    }
    grupos[key].push(cita);
  }

  const agrupados = [];

  for (const [clave, citasCliente] of Object.entries(grupos)) {
    citasCliente.sort((a, b) => a._startMs - b._startMs);

    // Nombre más largo del grupo
    let mejorNombre = '';
    let mejorApellido = '';
    for (const c of citasCliente) {
      const fullActual = `${mejorNombre} ${mejorApellido}`.trim();
      const fullCandidata = `${c.Nombre} ${c.Apellido}`.trim();
      if (fullCandidata.length > fullActual.length) {
        mejorNombre = c.Nombre;
        mejorApellido = c.Apellido;
      }
    }

    // Combinar servicios: filtrar técnicos ocultos
    const serviciosVisibles = [];
    for (const c of citasCliente) {
      const nombre = (c.servicios || '').trim();
      if (!nombre) continue;
      const esOculto = SERVICIOS_OCULTOS.some(s =>
        nombre.toLowerCase().startsWith(s)
      );
      if (!esOculto) {
        serviciosVisibles.push(nombre);
      }
    }
    const serviciosCombinados = serviciosVisibles.length > 0
      ? serviciosVisibles.join(', ')
      : citasCliente.map(c => c.servicios).filter(Boolean).join(', ');

    const primeraHora = citasCliente[0].horaInicio;
    const ultimaHora = citasCliente[citasCliente.length - 1].horaFinal;
    const importe = citasCliente.find(c => c.importeTotal)?.importeTotal || '';

    const emailReal = citasCliente.find(c => !esEmailSalon(c.clientEmail) && c.clientEmail)?.clientEmail || '';

    // v1.4.0: tomar el primer teléfono no vacío del grupo
    const telefonoReal = citasCliente.find(c => c.clientPhone && c.clientPhone.trim())?.clientPhone || '';

    // Candidatos: unión sin duplicados
    const todosLosCandidatos = [];
    for (const c of citasCliente) {
      for (const id of (c._candidatos || [])) {
        if (!todosLosCandidatos.includes(id)) {
          todosLosCandidatos.push(id);
        }
      }
    }

    agrupados.push({
      _candidatos: todosLosCandidatos,
      Nombre: mejorNombre,
      Apellido: mejorApellido,
      clientEmail: emailReal,
      clientPhone: telefonoReal,  // v1.4.0
      Fecha: citasCliente[0].Fecha,
      horaInicio: primeraHora,
      horaFinal: ultimaHora,
      servicios: serviciosCombinados,
      importeTotal: importe,
      estadoPago: citasCliente[0].estadoPago,
      source: citasCliente[0].source,
      _bookingIds: citasCliente.map(c => c.bookingId),
      _totalFases: citasCliente.length
    });
  }

  for (const c of sinResolver) {
    console.warn(`${TAG} ⚠️ Sin contactId: ${c.Nombre} ${c.Apellido} | email=${c.clientEmail} | servicio=${c.servicios}`);
  }

  console.log(`${TAG} 📦 Agrupación: ${citas.length} citas → ${agrupados.length} clientes + ${sinResolver.length} sin resolver`);
  return { agrupados, sinResolver };
}

// ----------- Envío email con reintentos por candidato -----------
// v1.6.0: envío del recordatorio por Brevo (plantilla reminderLayout).
// Va directo a grupo.clientEmail (email real ya resuelto en la agrupación),
// SIN la cascada de contactIds (que es específica del Triggered de Wix).
async function _enviarRecordatorioBrevo(grupo) {
  const emailReal = grupo.clientEmail || '';
  if (esEmailSalon(emailReal)) {
    return { ok: false, error: `email @salon/vacío, no se envía por Brevo (${grupo.Nombre} ${grupo.Apellido})` };
  }
  const nombreCliente = `${grupo.Nombre || ''} ${grupo.Apellido || ''}`.trim();
  const variables = {
    Fecha:        grupo.Fecha,
    Nombre:       grupo.Nombre,
    Apellido:     grupo.Apellido,
    servicios:    grupo.servicios,
    profesional:  PROFESIONAL_DEFAULT,
    horaInicio:   grupo.horaInicio,
    horaFinal:    grupo.horaFinal,
    importeTotal: grupo.importeTotal,
    origen:       grupo.source === 'externo' ? 'Servicios Externos' : 'Reserva Online',
    estadoPago:   grupo.estadoPago
  };
  try {
    const r = await enviarEmailPlantilla({
      to:            emailReal,
      toName:        nombreCliente,
      templateField: 'reminderLayout',
      subject:       'Recordatorio de tu cita',
      variables,
      event:         'recordatorio'
    });
    if (r && r.ok) {
      console.log(`${TAG} 📧 Recordatorio Brevo enviado a ${emailReal} (${r.messageId || ''})`);
      return { ok: true, contactIdUsado: '', brevo: true };
    }
    return { ok: false, error: `Brevo: ${(r && r.error) || 'error desconocido'}` };
  } catch (e) {
    return { ok: false, error: `Brevo excepción: ${e.message}` };
  }
}

async function enviarRecordatorio(grupo, emailsDeContacto, emailProvider) {
  // v1.6.0: camino Brevo — envío directo a clientEmail (sin cascada de contactIds)
  if (emailProvider === 'brevo') {
    return await _enviarRecordatorioBrevo(grupo);
  }

  if (!grupo._candidatos || grupo._candidatos.length === 0) {
    return { ok: false, error: `sin candidatos (${grupo.Nombre} ${grupo.Apellido})` };
  }

  const elevatedEmailContact = elevate(triggeredEmails.emailContact);
  const variables = {
    Fecha: grupo.Fecha,
    Nombre: grupo.Nombre,
    Apellido: grupo.Apellido,
    servicios: grupo.servicios,
    profesional: PROFESIONAL_DEFAULT,
    horaInicio: grupo.horaInicio,
    horaFinal: grupo.horaFinal,
    importeTotal: grupo.importeTotal,
    origen: grupo.source === 'externo' ? 'Servicios Externos' : 'Reserva Online',
    estadoPago: grupo.estadoPago,
    SITE_URL: 'https://www.hair-times.com'
  };

  // Filtrar candidatos que solo tienen emails @hair-times.com
  const candidatosValidos = grupo._candidatos.filter(id =>
    !contactoEnviaASalon(id, emailsDeContacto)
  );

  if (candidatosValidos.length === 0) {
    return { ok: false, error: `todos los candidatos tienen solo email @hair-times.com (${grupo.Nombre} ${grupo.Apellido})` };
  }

  // Probar cada candidato válido hasta que uno funcione
  const errores = [];
  for (const contactId of candidatosValidos) {
    try {
      await elevatedEmailContact(EMAIL_RECORDATORIO_ID, contactId, { variables });
      console.log(`${TAG} 📧 Enviado a ${grupo.clientEmail || 'N/A'} con contactId ${contactId} (intento ${errores.length + 1}/${candidatosValidos.length})`);
      // v1.4.0: devolvemos también el contactId que funcionó, útil para la centralita
      return { ok: true, contactIdUsado: contactId };
    } catch (e) {
      errores.push(`${contactId}: ${e.message}`);
    }
  }

  return { ok: false, error: `Todos fallaron (${candidatosValidos.length}/${grupo._candidatos.length} válidos): ${errores.join(' | ')}` };
}

// ----------- v1.9.0: apunte del EMAIL en el histórico ---------------
// El WhatsApp lo registra la centralita al enviarlo. El email lo envía
// este módulo por su cuenta (Brevo directo o cascada Triggered de Wix),
// así que el apunte tiene que hacerlo también él o el envío queda
// invisible en la pantalla de Comunicaciones.
// No bloqueante: si el registro falla, el recordatorio ya salió.
async function registrarEmailRecordatorio(grupo, resultado) {
  try {
    const nombreCliente = `${grupo.Nombre || ''} ${grupo.Apellido || ''}`.trim();
    await registrarComunicacion({
      event:           'recordatorio',
      channel:         'email',
      recipient:       grupo.clientEmail || '',
      clientName:      nombreCliente,
      result:          resultado && resultado.ok ? 'ok' : 'error',
      errorDetail:     resultado && resultado.ok ? '' : String((resultado && resultado.error) || ''),
      services:        grupo.servicios || '',
      staffName:       PROFESIONAL_DEFAULT,
      appointmentDate: grupo.Fecha || '',
      appointmentTime: grupo.horaInicio || ''
    });
  } catch (logErr) {
    console.error(`${TAG} ⚠️ Apunte de email en histórico (no bloqueante): ${logErr.message}`);
  }
}

// ----------- v1.4.0: Notificación WhatsApp via centralita -----------
// Se llama después de enviarRecordatorio (en ambos casos: ok o error).
// Pasa canalesExcluidos:['email'] para que la centralita NO duplique
// el email — la cascada de candidatos ya gestiona el email arriba.
// No-blocking: si falla, no afecta al flujo del cron.
async function notificarWhatsAppViaCentralita(grupo, contactIdParaCentralita) {
  try {
    const nombreCliente = `${grupo.Nombre || ''} ${grupo.Apellido || ''}`.trim();

    await notificarRecordatorio({
      contactId:     contactIdParaCentralita || '',
      email:         grupo.clientEmail || '',
      telefono:      grupo.clientPhone || '',
      nombreCliente: nombreCliente,
      fecha:         grupo.Fecha,
      hora:          grupo.horaInicio,
      servicios:     grupo.servicios,
      estilista:     PROFESIONAL_DEFAULT,
      // canalesExcluidos: el email ya lo gestiona enviarRecordatorio
      // arriba con su lógica de cascada de candidatos. La centralita
      // solo debe disparar WhatsApp.
      canalesExcluidos: ['email'],
      // emailVariables se pasan por compatibilidad pero no se usarán
      // (canal email excluido). La centralita las ignorará.
      emailVariables: {
        Fecha:         grupo.Fecha,
        Nombre:        grupo.Nombre,
        Apellido:      grupo.Apellido,
        servicios:     grupo.servicios,
        profesional:   PROFESIONAL_DEFAULT,
        horaInicio:    grupo.horaInicio,
        horaFinal:     grupo.horaFinal,
        importeTotal:  grupo.importeTotal,
        origen:        grupo.source === 'externo' ? 'Servicios Externos' : 'Reserva Online',
        estadoPago:    grupo.estadoPago,
        SITE_URL:      'https://www.hair-times.com'
      }
    });
    console.log(`${TAG} 📱 Centralita WhatsApp invocada para ${grupo.Nombre} ${grupo.Apellido} (tel=${grupo.clientPhone || 'sin tel'})`);
  } catch (waErr) {
    console.error(`${TAG} ⚠️ Error en centralita WhatsApp (no-blocking) para ${grupo.Nombre} ${grupo.Apellido}: ${waErr.message}`);
  }
}

async function registrarLogGrupo(grupo, resultado) {
  for (const bookingId of grupo._bookingIds) {
    try {
      await wixData.insert('ReminderLog', {
        bookingId: bookingId,
        source: grupo.source,
        sentAt: new Date(),
        clientEmail: grupo.clientEmail,
        status: resultado.ok ? 'OK' : 'ERROR',
        error: resultado.error || ''
      }, { suppressAuth: true });
    } catch (e) {
      console.error(`${TAG} ❌ Error registrarLog ${bookingId}:`, e.message);
    }
  }
}

// ----------- ORQUESTADOR -----------
export const ejecutarRecordatoriosDiarios = webMethod(
  Permissions.Admin,
  async () => {
    console.log(`${TAG} ▶️ Inicio ejecución | DRY_RUN=${DRY_RUN}`);
    const { inicio, fin, fechaYMD, fechaLegible } = ventanaManana();
    console.log(`${TAG} 📆 Ventana mañana: ${fechaLegible} (${inicio.toISOString()} → ${fin.toISOString()})`);

    // v1.10.0: un único punto de decisión. Se comprueba ANTES de las
    // queries pesadas (CRM + KamisuiteReservations) para no gastar quota
    // cuando no hay nada que enviar. Si los dos canales están cerrados
    // —sea por el interruptor de canal o por el del recordatorio— se
    // aborta limpiamente. reminderActive ya no se lee (v1.10.0).
    const canales = await _getCanalesRecordatorio();
    if (!canales.email && !canales.whatsapp) {
      console.log(`${TAG} ⏸️ Recordatorio cerrado por los dos canales — ejecución abortada limpiamente`);
      return {
        ok: true,
        skipped: true,
        reason: 'recordatorio cerrado por email y por WhatsApp en SalonConfig',
        dryRun: DRY_RUN,
        fecha: fechaLegible,
        totalCitas: 0,
        clientesAgrupados: 0,
        sinResolver: 0,
        yaEnviados: 0,
        enviadosOk: 0,
        enviadosError: 0,
        waInvocaciones: 0
      };
    }

    const [mapas, todas] = await Promise.all([
      cargarMapaCRM(),
      leerCitasV2(inicio, fin, fechaYMD)
    ]);

    console.log(`${TAG} 📊 Total citas mañana: ${todas.length}`);

    // Resolver candidatos para cada cita
    for (const cita of todas) {
      const { candidatos, claveAgrupacion } = resolverCandidatos(cita, mapas);
      cita._candidatos = candidatos;
      cita._claveAgrupacion = claveAgrupacion;
    }

    const pendientes = await filtrarYaEnviados(todas);
    const { agrupados, sinResolver } = agruparPorCliente(pendientes);

    let okCount = 0, errCount = 0;
    let waInvocaciones = 0;  // v1.4.0: métrica de invocaciones a centralita

    // v1.6.0: proveedor de email leído una vez para todo el lote
    // v1.8.0: solo si el canal email del recordatorio está abierto
    let emailProvider = 'wix';
    if (canales.email) {
      emailProvider = await _getEmailProvider();
      console.log(`${TAG} ✉️ Proveedor de email: ${emailProvider}`);
    } else {
      console.log(`${TAG} ✉️ Recordatorio por email DESACTIVADO — no se lee proveedor`);
    }

    for (const grupo of agrupados) {
      if (DRY_RUN) {
        const validos = grupo._candidatos.filter(id => !contactoEnviaASalon(id, mapas.emailsDeContacto));
        console.log(`${TAG} 🧪 DRY_RUN → ${grupo.Nombre} ${grupo.Apellido} | ${grupo.servicios} | ${grupo.horaInicio}-${grupo.horaFinal} | tel=${grupo.clientPhone || 'sin tel'} | fases=${grupo._totalFases} | candidatos=${grupo._candidatos.length} (${validos.length} válidos)`);
        okCount++;
        continue;
      }

      // 1. Email: cascada Triggered (wix) o Brevo, según emailProvider.
      //    v1.8.0: solo si el canal email del recordatorio está abierto.
      let r = { ok: false, error: 'recordatorio por email desactivado en la configuración del salón' };
      if (canales.email) {
        r = await enviarRecordatorio(grupo, mapas.emailsDeContacto, emailProvider);
        if (r.ok) {
          okCount++;
          console.log(`${TAG} ✅ ${grupo.Nombre} ${grupo.Apellido} → ${grupo.servicios} (${grupo._totalFases} citas)`);
        } else {
          errCount++;
          console.error(`${TAG} ❌ ${grupo.Nombre} ${grupo.Apellido}: ${r.error}`);
        }
        // v1.9.0: rastro del email en el histórico de Comunicaciones.
        await registrarEmailRecordatorio(grupo, r);
      }

      // 2. v1.4.0: WhatsApp vía centralita (en paralelo, no-blocking)
      // Se invoca SIEMPRE (ok o error de email) porque WhatsApp es canal
      // paralelo. Si el email falló por contactos solo @hair-times.com,
      // WhatsApp es el último recurso para llegar al cliente.
      // Si no hay teléfono, la centralita lo detecta y se salta.
      // v1.8.0: solo si el canal WhatsApp del recordatorio está abierto.
      let waLanzado = false;
      if (canales.whatsapp) {
        await notificarWhatsAppViaCentralita(grupo, r.contactIdUsado || (grupo._candidatos[0] || ''));
        waInvocaciones++;
        waLanzado = true;
      }

      // 3. Idempotencia: se registra si se intentó algo por algún canal.
      //    Con el email cerrado, el ok del registro lo marca el WhatsApp;
      //    así una segunda ejecución el mismo día no duplica el aviso.
      await registrarLogGrupo(
        grupo,
        (r.ok || waLanzado) ? { ok: true, error: r.ok ? '' : r.error } : r
      );
    }

    const resumen = {
      ok: true,
      dryRun: DRY_RUN,
      fecha: fechaLegible,
      totalCitas: todas.length,
      clientesAgrupados: agrupados.length,
      sinResolver: sinResolver.length,
      yaEnviados: todas.length - pendientes.length,
      enviadosOk: okCount,
      enviadosError: errCount,
      waInvocaciones: waInvocaciones,  // v1.4.0
      canalEmail: canales.email,       // v1.8.0
      canalWhatsapp: canales.whatsapp  // v1.8.0
    };
    console.log(`${TAG} 🏁 Resumen:`, resumen);
    return resumen;
  }
);
