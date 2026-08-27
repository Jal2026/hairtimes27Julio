// =====================================================
// [ReminderJob v1.6.0] - reminderLogic.web.js
// Recordatorios automáticos 24h antes de la cita
// Lee extendedBookings (Wix nativas) + SvExternalRecords (Externos)
// Email: Wix Triggered VGPVvYO (cascada) o Brevo (plantilla CMS)
// según SalonConfig.emailProvider. WhatsApp vía centralita.
// Idempotencia garantizada por colección ReminderLog.
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
//   - Motivo: en Salon Kami (demo V2) las reservas están clonadas de
//     Hair-Times con teléfonos reales. Si se enciende el reminder en
//     Salon Kami sin filtrar, los clientes de Hair-Times reciben doble
//     WhatsApp (uno por cuenta). Con reminderActive=false en Salon
//     Kami, el cron arranca y aborta antes de cualquier query a Wix
//     externos. Confirmaciones WhatsApp (recepcionProLogic v1.0.18+)
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
import { extendedBookings } from 'wix-bookings.v2';

// v1.4.0: Centralita de comunicaciones
import { notificarRecordatorio } from 'backend/comunicacionesLogic.web.js';
// v1.6.0: driver de email por plantilla (Brevo)
import { enviarEmailPlantilla } from 'backend/brevoLogic.web.js';

const TAG = '[ReminderJob v1.6.0]';
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
  return { inicio, fin, fechaLegible: formatearFechaES(manana) };
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

// ----------- v1.5.0: Toggle SalonConfig.reminderActive ---------
// Lectura defensiva: solo apaga si === false EXPLÍCITO.
// null/undefined/true/error de lectura → activo (fail-safe).
// Esto garantiza que Hair-Times producción no se ve afectado hasta
// que su SalonConfig tenga reminderActive=false explícitamente.
async function _getReminderActive() {
  try {
    const res = await wixData.query('SalonConfig')
      .limit(1)
      .find({ suppressAuth: true });
    if (res.items.length === 0) {
      console.log(`${TAG} ℹ️ SalonConfig vacío — asumiendo reminderActive=true por defecto`);
      return true;
    }
    const cfg = res.items[0];
    if (cfg.reminderActive === false) return false;
    return true;
  } catch (e) {
    console.error(`${TAG} ⚠️ Error leyendo SalonConfig.reminderActive (fail-safe → activo): ${e.message}`);
    return true;
  }
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

// ----------- Lectura Wix nativas -----------
// v1.4.0: añadida extracción de teléfono desde contactDetails.phone
async function leerCitasWix(inicio, fin) {
  try {
    const query = {
      filter: {
        "startDate": { "$gte": inicio.toISOString() },
        "endDate": { "$lte": fin.toISOString() },
        "status": { "$in": ["CONFIRMED", "PENDING"] }
      },
      sort: [{ fieldName: "startDate", order: "ASC" }],
      cursorPaging: { limit: 100 }
    };
    const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);
    const response = await elevatedQuery(query);
    const items = response?.extendedBookings || [];
    console.log(`${TAG} 📅 Wix nativas encontradas: ${items.length}`);
    return items.map(item => {
      const b = item.booking || item;
      const slot = b?.bookedEntity?.slot;
      const startDate = slot?.startDate ? new Date(slot.startDate) : null;
      const endDate = slot?.endDate ? new Date(slot.endDate) : null;
      const contact = b?.contactDetails || item?.contactDetails || {};
      return {
        bookingId: b._id,
        source: 'wix',
        contactId: contact?.contactId || b?.contactId || '',
        clientEmail: contact.email || '',
        clientPhone: contact.phone || '',  // v1.4.0: extracción de teléfono
        Nombre: contact.firstName || '',
        Apellido: contact.lastName || '',
        Fecha: startDate ? formatearFechaES(startDate) : '',
        horaInicio: startDate ? formatearHora(startDate) : '',
        horaFinal: endDate ? formatearHora(endDate) : '',
        servicios: b?.bookedEntity?.title || '',
        importeTotal: '',
        estadoPago: 'Pago en salón',
        _startMs: startDate ? startDate.getTime() : 0,
        _endMs: endDate ? endDate.getTime() : 0
      };
    });
  } catch (e) {
    console.error(`${TAG} ❌ Error leerCitasWix:`, e.message);
    return [];
  }
}

// ----------- Lectura Externos -----------
// v1.4.0: añadida extracción de teléfono (si SvExternalRecords lo tiene)
async function leerCitasExternos(inicio, fin) {
  try {
    const res = await wixData.query('SvExternalRecords')
      .ge('date', inicio)
      .le('date', fin)
      .eq('status', 'CONFIRMADA')
      .limit(100)
      .find({ suppressAuth: true });
    console.log(`${TAG} 📅 Externos encontrados: ${res.items.length}`);
    return res.items.map(r => {
      const start = new Date(r.date);
      const end = new Date(start.getTime() + (r.totalDuration || 0) * 60000);
      const partes = (r.clientName || '').trim().split(' ');
      return {
        bookingId: r._id,
        source: 'externo',
        contactId: r.contactId,
        clientEmail: r.clientEmail || '',
        clientPhone: r.clientPhone || '',  // v1.4.0: si existe en CMS
        Nombre: partes[0] || '',
        Apellido: partes.slice(1).join(' ') || '',
        Fecha: formatearFechaES(start),
        horaInicio: formatearHora(start),
        horaFinal: formatearHora(end),
        servicios: r.title || '',
        importeTotal: r.totalPrice ? `${r.totalPrice} €` : '',
        estadoPago: r.status === 'PAGADO' ? 'Pagado' : 'Pago en salón',
        _startMs: start.getTime(),
        _endMs: end.getTime()
      };
    });
  } catch (e) {
    console.error(`${TAG} ❌ Error leerCitasExternos:`, e.message);
    return [];
  }
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
      return { candidatos: [...candidatos], claveAgrupacion: `email_${emailCliente}` };
    }
  }

  // 2) Nombre completo en CRM (para emails genéricos)
  const fullName = `${cita.Nombre} ${cita.Apellido}`.trim().toLowerCase();
  if (fullName && fullName.length > 1) {
    const idPorNombre = mapas.porNombre[fullName];
    if (idPorNombre) {
      return { candidatos: [idPorNombre], claveAgrupacion: `nombre_${fullName}` };
    }
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
    if (!cita._claveAgrupacion || cita._candidatos.length === 0) {
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
    const { inicio, fin, fechaLegible } = ventanaManana();
    console.log(`${TAG} 📆 Ventana mañana: ${fechaLegible} (${inicio.toISOString()} → ${fin.toISOString()})`);

    // v1.5.0: Toggle SalonConfig.reminderActive — abortar si === false explícito.
    // Lectura defensiva: null/undefined/true/error → activo (fail-safe).
    // Se comprueba ANTES de las 3 queries pesadas (CRM + Wix Bookings + Externos)
    // para no consumir API quota innecesariamente cuando el cron está apagado.
    const reminderActive = await _getReminderActive();
    if (!reminderActive) {
      console.log(`${TAG} ⏸️ Recordatorios DESACTIVADOS en SalonConfig.reminderActive=false — ejecución abortada limpiamente`);
      return {
        ok: true,
        skipped: true,
        reason: 'reminderActive=false en SalonConfig',
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

    const [mapas, wix, externos] = await Promise.all([
      cargarMapaCRM(),
      leerCitasWix(inicio, fin),
      leerCitasExternos(inicio, fin)
    ]);

    const todas = [...wix, ...externos];
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
    const emailProvider = await _getEmailProvider();
    console.log(`${TAG} ✉️ Proveedor de email: ${emailProvider}`);

    for (const grupo of agrupados) {
      if (DRY_RUN) {
        const validos = grupo._candidatos.filter(id => !contactoEnviaASalon(id, mapas.emailsDeContacto));
        console.log(`${TAG} 🧪 DRY_RUN → ${grupo.Nombre} ${grupo.Apellido} | ${grupo.servicios} | ${grupo.horaInicio}-${grupo.horaFinal} | tel=${grupo.clientPhone || 'sin tel'} | fases=${grupo._totalFases} | candidatos=${grupo._candidatos.length} (${validos.length} válidos)`);
        okCount++;
        continue;
      }

      // 1. Email: cascada Triggered (wix) o Brevo, según emailProvider
      const r = await enviarRecordatorio(grupo, mapas.emailsDeContacto, emailProvider);
      await registrarLogGrupo(grupo, r);
      if (r.ok) {
        okCount++;
        console.log(`${TAG} ✅ ${grupo.Nombre} ${grupo.Apellido} → ${grupo.servicios} (${grupo._totalFases} fases)`);
      } else {
        errCount++;
        console.error(`${TAG} ❌ ${grupo.Nombre} ${grupo.Apellido}: ${r.error}`);
      }

      // 2. v1.4.0: WhatsApp vía centralita (en paralelo, no-blocking)
      // Se invoca SIEMPRE (ok o error de email) porque WhatsApp es canal
      // paralelo. Si el email falló por contactos solo @hair-times.com,
      // WhatsApp es el último recurso para llegar al cliente.
      // Si no hay teléfono, la centralita lo detecta y se salta.
      await notificarWhatsAppViaCentralita(grupo, r.contactIdUsado || (grupo._candidatos[0] || ''));
      waInvocaciones++;
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
      waInvocaciones: waInvocaciones  // v1.4.0
    };
    console.log(`${TAG} 🏁 Resumen:`, resumen);
    return resumen;
  }
);
