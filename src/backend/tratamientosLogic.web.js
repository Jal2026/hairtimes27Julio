// =====================================================
// KAMISUITE - Backend tratamientosLogic.web para Tratamientos Capilares
// =====================================================
// VERSION: 1.1.0-TRATAMIENTOS
// FECHA: 26 de mayo de 2026
// BASE: coloracionLogic v3.2.0
//
// CAMBIOS v1.1.0:
// - FIX CRÍTICO: skipAvailability=true en TODAS las fases de la cascada
//   (PRE, APLICACIÓN y POST) tanto desde web pública como desde recepción.
//   Wix revalidaba disponibilidad en cada fase individual, provocando
//   SLOT_NOT_AVAILABLE aleatorios en reservas online válidas.
//   La disponibilidad ya se valida en consultarDisponibilidadUnificada;
//   la revalidación de Wix por fase es redundante y causa race conditions.
// - FIX: Fases PRE-aplicación ahora con await (antes fire-and-forget).
//   El LAVADO previo se creaba sin await, podía ocupar el slot del
//   estilista y hacer que Wix rechazara la APLICACIÓN inmediatamente
//   después por SLOT_NOT_AVAILABLE.
//
// CAMBIOS v1.0.9:
// - MIGRACIÓN A CENTRALITA DE COMUNICACIONES (mismo patrón que
//   coloracionLogic v3.2.7).
//
//   Cambios concretos:
//   (a) Import: se elimina `triggeredEmails` de wix-crm-backend,
//       se añade import de `notificarConfirmacion` de
//       comunicacionesLogic.web.js.
//   (b) Eliminada la constante hardcoded EMAIL_CONFIRMACION_ID = 'VA5UQRG'
//       (el template ID ahora vive en SalonConfig.confirmationTemplateId).
//   (c) Eliminada la función enviarConfirmacionReserva() completa
//       (~32 líneas). La centralita absorbe esa responsabilidad.
//   (d) En crearComplementos() la llamada a enviarConfirmacionReserva()
//       se reemplaza por notificarConfirmacion() pasando contactId, email,
//       telefono, nombreCliente, fecha, hora, servicios, estilista y las
//       mismas emailVariables de antes para no romper el template Wix.
//   (e) Llamada envuelta en try/catch no-blocking: si la centralita
//       falla, la reserva ya está creada — el cliente simplemente no
//       recibe la notificación.
//
//   No se toca:
//     - confirmarEnCalendario flujo principal
//     - createAndConfirmBookingPhase
//     - Motor de disponibilidad, cascada Staff1/Staff2, longitud, etc.
//     - sendInternalAlert ni saveNotaToCRM
//     - ensureContactInCRM (sigue en su versión v1.0.8 vieja —
//       deuda técnica anotada para v1.0.10 futura)
//
//   Riesgo: bajo. Cambio sustractivo y aislado en bloque post-booking.
//
// CAMBIOS v1.0.8:
// - FIX CRÍTICO: ensureContactInCRM() garantiza contacto CRM
//   en TODOS los canales antes de crear booking.
//
// CAMBIOS v1.0.7:
// - NEW: skipAvailability en modo recepción
// - FIX: Try/catch individual por fase en complementos
//
// CAMBIOS v1.0.5:
// - FIX: Filtro cierre dinámico en MODO SIMPLE y CASCADA (ANEXO v3.2.3)
// - FIX: Campos explícitos Botox (id_aplicacion_botox_mediano/largo/superlargo,
//   id_planchado_botox_mediano/largo/superlargo) con prioridad sobre búsqueda
//   dinámica. Elimina confusiones M/L/XL en field IDs del CMS.
//   Fallback dinámico mantenido para Nanoplastia/Kerastase.
//
// CAMBIOS v1.0.4:
// - FIX: CUALQUIERA resuelve a humano real libre en confirmarEnCalendario()
//
// CAMBIOS v1.0.3:
// - NEW: Fase SECADO reconocida en buildFasesOrdenadasTratamiento()
//   Kerastase usa SECADO en vez de PLANCHADO (idSecado + minSecado)
//
// CAMBIOS v1.0.2:
// - FIX: PLANCHADO ahora usa búsqueda dinámica por tratamiento+longitud
//
// CAMBIOS v1.0.1:
// - NEW: Campo origenRecepcion para marcar reservas de recepción
//
// DIFERENCIAS vs coloracionLogic:
// 1. APLICACION varía según longitud pelo (M/L/XL) → idAplicacionBotoxM/L/XL
// 2. PLANCHADO varía según tratamiento+longitud → búsqueda dinámica
// 3. LAVADO va donde diga ordenFases (puede ir al inicio o al final)
// 4. Único complemento opcional: CORTE
// 5. NO hay: peinado, secado, tratamiento complemento, tinte total/raíz
// 6. PROCESO es solo GAP sin booking
// 7. Sin cascada 2 tramos - es un bloque continuo
//
// SERVICIOS SOPORTADOS:
// - Botox Capilar
// - Nanoplastia
// - Kerastase Premiere// =====================================================

import wixData from 'wix-data';
import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { availabilityCalendar, bookings, services } from 'wix-bookings.v2';
import { resources as resourcesBackend } from 'wix-bookings-backend';
import { checkout } from 'wix-ecom-backend';
import { contacts, notifications } from 'wix-crm-backend';

// v1.0.9: triggeredEmails ya no se importa aquí — la centralita lo hace
// v1.0.9: Centralita de comunicaciones
import { notificarConfirmacion } from 'backend/comunicacionesLogic.web.js';

const VERSION = '1.1.0-TRATAMIENTOS';
// v1.1.0: skipAvailability=true en todas las fases + await en PRE-aplicación.
//   Elimina SLOT_NOT_AVAILABLE por race condition entre fases de la cascada.
// v1.0.9: Migración a centralita comunicacionesLogic. Eliminado envío directo
//   triggeredEmails y constante EMAIL_CONFIRMACION_ID. Sin cambios funcionales
//   en reserva — solo en cómo se entrega la confirmación al cliente.
// v1.0.8: ensureContactInCRM
// v1.0.7: skipAvailability + try/catch individual
// v1.0.6: Validación de rango continuo para TRAMO B en CASCADA
const TAG = `[Tratamiento][${VERSION}]`;

// =====================================================
// CONSTANTES
// =====================================================

const COLLECTION_PUBLIC_SERVICES = 'Bookings/Services';
const COLLECTION_MAPEO = 'SvMapeoServicios';
const COLLECTION_PROMO = 'PromoColor';
const BUSINESS_TIMEZONE = 'Europe/Madrid';

// v1.0.9: Eliminada constante EMAIL_CONFIRMACION_ID = 'VA5UQRG'
// El template ID ahora vive en SalonConfig.confirmationTemplateId
// y se gestiona desde comunicacionesLogic.web.js (centralita).

const STAFF_IDS = {
  PROCESO: 'ac0c405a-f8c7-4580-a915-da28c89b2d43',
  ANGELA: '0c22fa77-3602-4876-b744-ded83ed540f8',
  RAQUEL: '0e69d7a3-4e36-40ec-9f3d-348f5bf3524d',
  RICARDO: 'b888c390-361d-4b0d-80f7-e0ba808bd7ce',
  CUALQUIERA: '240bb817-cd83-4a7c-ac1a-caef60f85315'
};

const HUMANOS_REALES = [STAFF_IDS.ANGELA, STAFF_IDS.RAQUEL, STAFF_IDS.RICARDO];

const STAFF_NAMES = {
  [STAFF_IDS.ANGELA]: 'Angela',
  [STAFF_IDS.RAQUEL]: 'Raquel',
  [STAFF_IDS.RICARDO]: 'Ricardo'
};

const STAFF_BLOCKLIST_NAMES = new Set(['PROCESO', 'CUALQUIERA']);

// =====================================================
// UTILIDADES (idénticas a coloracionLogic)
// =====================================================

function safeErr(e) {
  const out = { name: e?.name || 'Error', message: e?.message || String(e) };
  if (e?.details) out.details = e.details;
  if (e?.stack) out.stack = e.stack;
  return out;
}

function isGuid(x) {
  return typeof x === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

function toNum(v) {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pickImageUrl(serviceItem) {
  const v = serviceItem?.imageURL || serviceItem?.image || serviceItem?.mainImage || serviceItem?.media;
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.src || v.url || v.imageUrl || v.fileUrl || '';
  return '';
}

function formatLocalDate(date) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return dtf.format(date);
}

function formatLocalTime(date) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return dtf.format(date);
}

function formatFechaEmail(fechaISO) {
  const [year, month, day] = fechaISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  
  const dias = ['Domingo', 'Lunes', 'Martes', 'Mi\u00e9rcoles', 'Jueves', 'Viernes', 'S\u00e1bado'];
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  const diaSemana = dias[date.getDay()];
  const diaNum = date.getDate();
  const mes = meses[date.getMonth()];
  
  return `${diaSemana} ${diaNum} de ${mes}`;
}

function calcularEndTimeCorrect(startTime, duracionMinutos) {
  const [hours, minutes] = startTime.split(':').map(Number);
  let totalMinutes = (hours * 60) + minutes + duracionMinutos;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

function addDaysToDateString(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHhmm(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function madridToUTC(fechaISO, horaHHmm) {
  const [year, month, day] = String(fechaISO).split('-').map(Number);
  const [hour, minute] = String(horaHHmm).split(':').map(Number);
  
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  
  const madridStr = d.toLocaleString('en-US', {
    timeZone: 'Europe/Madrid',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const match = madridStr.match(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+)/);
  if (!match) return d.toISOString();
  
  const madridHour = parseInt(match[4]);
  const madridMin = parseInt(match[5]);
  
  const targetMin = hour * 60 + minute;
  const madridMin2 = madridHour * 60 + madridMin;
  const diffMin = targetMin - madridMin2;
  
  const utc = new Date(d.getTime() + (diffMin * 60000));
  return utc.toISOString();
}

function addMinutes(iso, mins) {
  const ms = new Date(iso).getTime();
  return new Date(ms + mins * 60000).toISOString();
}

// =====================================================
// PROMO (mantenida para uso futuro)
// =====================================================

async function getPromoActiva(nombreServicio) {
  try {
    const r = await wixData.query(COLLECTION_PROMO)
      .eq('isActive', true)
      .limit(1)
      .find({ suppressAuth: true });
    
    const promo = (r?.items || [])[0];
    if (!promo) return null;
    
    const nombreUpper = String(nombreServicio || '').toUpperCase();
    let campoActivo = false;
    
    if (nombreUpper.includes('BOTOX')) {
      campoActivo = promo.idActivoBotox === true;
    } else if (nombreUpper.includes('NANOPLASTIA')) {
      campoActivo = promo.idActivoNanoplastia === true;
    } else if (nombreUpper.includes('KERASTASE') || nombreUpper.includes('K\u00c9RASTASE')) {
      campoActivo = promo.idActivoKerastase === true;
    }
    
    if (!campoActivo) return null;
    
    const discountPercent = toNum(promo.discountPercent);
    if (discountPercent <= 0) return null;
    
    return {
      promoNombre: promo.colorName || 'Promoci\u00f3n',
      discountPercent
    };
    
  } catch (e) {
    console.warn(`${TAG} Error leyendo promo:`, e.message);
    return null;
  }
}

// =====================================================
// PRECIOS (idéntico a coloracionLogic)
// =====================================================

async function getServicePrice(serviceId) {
  try {
    console.log(`${TAG} Leyendo precio: ${serviceId}`);
    
    try {
      const elevatedGetService = elevate(services.getService);
      const svc = await elevatedGetService(serviceId);
      
      let price = 0;
      let currency = 'EUR';
      
      if (svc?.price?.amount) {
        price = toNum(svc.price.amount);
        if (price > 0) {
          currency = svc.price.currency || 'EUR';
          return { price, currency };
        }
      }
      
      if (svc?.paymentOptions?.wixPayOnline?.price) {
        price = toNum(svc.paymentOptions.wixPayOnline.price);
        if (price > 0) {
          currency = svc.paymentOptions.wixPayOnline.currency || 'EUR';
          return { price, currency };
        }
      }
      
      if (svc?.paymentOptions?.wixPayOffline?.price) {
        price = toNum(svc.paymentOptions.wixPayOffline.price);
        if (price > 0) {
          currency = svc.paymentOptions.wixPayOffline.currency || 'EUR';
          return { price, currency };
        }
      }
    } catch (e) {
      console.warn(`${TAG} V2 API fall\u00f3, usando fallback:`, e.message);
    }
    
    const svcLegacy = await wixData.get(COLLECTION_PUBLIC_SERVICES, serviceId, { suppressAuth: true });
    const price = toNum(svcLegacy?.priceAmount) || 0;
    const currency = svcLegacy?.currency || 'EUR';
    
    return { price, currency };
    
  } catch (e) {
    console.error(`${TAG} Error leyendo precio de ${serviceId}:`, e);
    return { price: 0, currency: 'EUR' };
  }
}

async function calculateTotalPrice(serviceIds) {
  let total = 0;
  let currency = 'EUR';
  const breakdown = [];
  
  for (const serviceId of serviceIds) {
    if (!serviceId) continue;
    const { price, currency: curr } = await getServicePrice(serviceId);
    total += price;
    currency = curr;
    breakdown.push({ serviceId, price, currency });
  }
  
  console.log(`${TAG} TOTAL: ${total} ${currency}`);
  return { total, currency, breakdown };
}

// =====================================================
// STAFF (idéntico a coloracionLogic)
// =====================================================

function normalizeStaffLabel(label) {
  return String(label || '').trim();
}

function isBlockedStaffLabel(label) {
  const up = normalizeStaffLabel(label).toUpperCase();
  return STAFF_BLOCKLIST_NAMES.has(up);
}

function getStaffNameById(staffId) {
  return STAFF_NAMES[staffId] || 'Tu profesional';
}

async function listStaffResources() {
  try {
    const res = await resourcesBackend.queryResourceCatalog().find();
    const items = res?.items || [];

    const staff = [];
    const allNamed = [];

    for (const it of items) {
      const r = it?.resource || it?.resourceInfo || null;
      if (!r) continue;

      const resourceId = r._id || r.id || null;
      if (!resourceId) continue;

      const label = normalizeStaffLabel(r.name || r.displayName || r.title || '');
      if (label && !isBlockedStaffLabel(label)) {
        allNamed.push({ label, resourceId });
      }

      const tags = Array.isArray(r.tags) ? r.tags : [];
      if (!tags.includes('staff')) continue;
      if (!label || isBlockedStaffLabel(label)) continue;

      staff.push({ label, resourceId });
    }

    staff.sort((a, b) => String(a.label).localeCompare(String(b.label)));

    if (!staff.length && allNamed.length) {
      allNamed.sort((a, b) => String(a.label).localeCompare(String(b.label)));
      return allNamed;
    }

    return staff;
  } catch (e) {
    console.error(`${TAG} ERROR listStaffResources:`, safeErr(e));
    return [];
  }
}

// =====================================================
// LOCATION + SCHEDULE (idéntico a coloracionLogic)
// =====================================================

function normalizeLocationType(raw) {
  const s = String(raw || '').toUpperCase().trim();
  if (!s || s === 'UNDEFINED' || s === '0') return 'UNDEFINED';
  if (s === 'OWNER_BUSINESS' || s === '1') return 'OWNER_BUSINESS';
  if (s === 'OWNER_CUSTOM' || s === '2') return 'OWNER_CUSTOM';
  if (s === 'CUSTOM' || s === '3') return 'CUSTOM';
  if (s === 'BUSINESS' || s === 'OWNER' || s === 'BUSINESS_LOCATION') return 'OWNER_BUSINESS';
  return 'OWNER_BUSINESS';
}

function extractLocationForBooking(serviceV2) {
  const loc0 = Array.isArray(serviceV2?.locations) ? serviceV2.locations[0] : null;
  const locA = loc0?.location || loc0?.businessLocation || loc0 || serviceV2?.location || serviceV2?.defaultLocation || null;

  const rawType = locA?.locationType || locA?.type || locA?.businessLocation?.locationType || loc0?.locationType || null;
  const locationType = normalizeLocationType(rawType);
  const locationId = locA?.id || locA?._id || locA?.businessLocation?.id || null;

  return locationId ? { locationType, id: locationId } : { locationType };
}

function extractScheduleIdFromService(serviceV2) {
  const candidates = [
    serviceV2?.scheduleId,
    serviceV2?.schedule?.id,
    serviceV2?.schedule?._id,
    serviceV2?.scheduling?.scheduleId,
    serviceV2?.availability?.scheduleId,
    serviceV2?.bookingPolicy?.scheduleId,
    serviceV2?.details?.scheduleId,
  ].filter(v => typeof v === 'string' && v);
  return candidates[0] || null;
}

// =====================================================
// MAPEO CMS — ESPECÍFICO TRATAMIENTOS
// =====================================================

async function getMapeoByPublicServiceId(publicServiceId) {
  const r = await wixData.query(COLLECTION_MAPEO)
    .eq('idServicioPublico', publicServiceId)
    .limit(1)
    .find({ suppressAuth: true });
  return (r?.items || [])[0] || null;
}

async function getStaffMemberIdsFromService(serviceId) {
  if (!serviceId || !isGuid(serviceId)) return [];
  try {
    const elevatedGetService = elevate(services.getService);
    const svc = await elevatedGetService(serviceId);
    const staffIds = svc?.staffMemberIds || [];
    console.log(`${TAG} Staff asignados a ${serviceId}: ${staffIds.length} \u2192 ${staffIds.join(', ')}`);
    return staffIds;
  } catch (e) {
    console.warn(`${TAG} No pude obtener staffMemberIds de ${serviceId}:`, e.message);
    return [];
  }
}

function parseOrdenFases(ordenFasesStr) {
  if (!ordenFasesStr || typeof ordenFasesStr !== 'string') return [];
  return ordenFasesStr
    .split(',')
    .map(f => f.trim().toUpperCase())
    .filter(f => f.length > 0);
}

function buildMapeoTratamiento(item) {
  if (!item) return null;
  
  const mins = {
    proceso: toNum(item.minProceso),
    lavadoPrevio: toNum(item.minLavadoPrevio),
    final: toNum(item.minFinal),
    corte: toNum(item.minCorte),
    planchadoM: toNum(item.minPlanchadoM),
    planchadoL: toNum(item.minPlanchadoL),
    planchadoXl: toNum(item.minPlanchadoXl),
    secado: toNum(item.minSecado),
    gridVisualizacion: toNum(item.gridVisualizacion) || 15,
  };
  
  const aplicacionExplicita = {
    M: item.id_aplicacion_botox_mediano || '',
    L: item.id_aplicacion_botox_largo || '',
    XL: item.id_aplicacion_botox_superlargo || ''
  };
  const planchadoExplicito = {
    M: item.id_planchado_botox_mediano || '',
    L: item.id_planchado_botox_largo || '',
    XL: item.id_planchado_botox_superlargo || ''
  };
  
  const tieneAplicacionExplicita = aplicacionExplicita.M || aplicacionExplicita.L || aplicacionExplicita.XL;
  const tienePlanchadoExplicito = planchadoExplicito.M || planchadoExplicito.L || planchadoExplicito.XL;
  
  const aplicacionIds = tieneAplicacionExplicita ? aplicacionExplicita : findAplicacionByLongitud(item);
  const planchadoIds = tienePlanchadoExplicito ? planchadoExplicito : findPlanchadoByLongitud(item);
  
  console.log(`${TAG} Aplicaci\u00f3n: modo ${tieneAplicacionExplicita ? 'EXPL\u00cdCITO' : 'DIN\u00c1MICO'} | Planchado: modo ${tienePlanchadoExplicito ? 'EXPL\u00cdCITO' : 'DIN\u00c1MICO'}`);
  
  const ids = {
    aplicacionM: aplicacionIds.M || '',
    aplicacionL: aplicacionIds.L || '',
    aplicacionXl: aplicacionIds.XL || '',
    lavadoPrevio: item.idLavadoPrevio || '',
    final: item.idFinal || '',
    planchadoM: planchadoIds.M || '',
    planchadoL: planchadoIds.L || '',
    planchadoXl: planchadoIds.XL || '',
    corte: item.idCorte || '',
    secado: item.idSecado || '',
    proceso: item.idProceso || '',
  };
  
  console.log(`${TAG} Aplicaci\u00f3n din\u00e1mica: M=${ids.aplicacionM ? ids.aplicacionM.substring(0,8)+'...' : 'N/A'} | L=${ids.aplicacionL ? ids.aplicacionL.substring(0,8)+'...' : 'N/A'} | XL=${ids.aplicacionXl ? ids.aplicacionXl.substring(0,8)+'...' : 'N/A'}`);
  console.log(`${TAG} Planchado din\u00e1mico: M=${ids.planchadoM ? ids.planchadoM.substring(0,8)+'...' : 'N/A'} | L=${ids.planchadoL ? ids.planchadoL.substring(0,8)+'...' : 'N/A'} | XL=${ids.planchadoXl ? ids.planchadoXl.substring(0,8)+'...' : 'N/A'}`);
  
  const ordenFases = parseOrdenFases(item.ordenFases);
  
  return { mins, ids, ordenFases };
}

function findAplicacionByLongitud(item) {
  const result = { M: '', L: '', XL: '' };
  
  const keys = Object.keys(item);
  
  for (const key of keys) {
    const lower = key.toLowerCase();
    
    if (!lower.includes('aplicacion')) continue;
    
    const value = item[key];
    if (!value || typeof value !== 'string' || !isGuid(value.trim())) continue;
    
    if (lower.endsWith('xl')) {
      result.XL = value.trim();
    } else if (lower.endsWith('l')) {
      result.L = value.trim();
    } else if (lower.endsWith('m')) {
      result.M = value.trim();
    }
  }
  
  console.log(`${TAG} findAplicacionByLongitud: encontrados M=${!!result.M} L=${!!result.L} XL=${!!result.XL}`);
  
  return result;
}

function findPlanchadoByLongitud(item) {
  const result = { M: '', L: '', XL: '' };
  
  const keys = Object.keys(item);
  
  const candidatesM = [];
  const candidatesL = [];
  const candidatesXL = [];
  
  for (const key of keys) {
    const lower = key.toLowerCase();
    
    if (!lower.includes('planchado')) continue;
    
    if (lower.startsWith('min')) continue;
    
    const value = item[key];
    if (!value || typeof value !== 'string' || !isGuid(value.trim())) continue;
    
    const afterPlanchado = lower.substring(lower.indexOf('planchado') + 'planchado'.length);
    
    if (afterPlanchado.startsWith('xl')) {
      candidatesXL.push({ key, value: value.trim() });
    } else if (afterPlanchado.startsWith('l')) {
      candidatesL.push({ key, value: value.trim() });
    } else if (afterPlanchado.startsWith('m')) {
      candidatesM.push({ key, value: value.trim() });
    }
  }
  
  if (candidatesM.length > 0) result.M = candidatesM[0].value;
  if (candidatesL.length > 0) result.L = candidatesL[0].value;
  if (candidatesXL.length > 0) result.XL = candidatesXL[0].value;
  
  console.log(`${TAG} findPlanchadoByLongitud: encontrados M=${!!result.M}${candidatesM.length > 0 ? ' ('+candidatesM[0].key+')' : ''} | L=${!!result.L}${candidatesL.length > 0 ? ' ('+candidatesL[0].key+')' : ''} | XL=${!!result.XL}${candidatesXL.length > 0 ? ' ('+candidatesXL[0].key+')' : ''}`);
  
  return result;
}

function resolverPorLongitud(mapeo, longitud) {
  const lng = String(longitud || 'M').trim().toUpperCase();
  
  let idAplicacion, idPlanchado, minPlanchado;
  
  switch (lng) {
    case 'L':
      idAplicacion = mapeo.ids.aplicacionL;
      idPlanchado = mapeo.ids.planchadoL;
      minPlanchado = mapeo.mins.planchadoL;
      break;
    case 'XL':
      idAplicacion = mapeo.ids.aplicacionXl;
      idPlanchado = mapeo.ids.planchadoXl;
      minPlanchado = mapeo.mins.planchadoXl;
      break;
    default:
      idAplicacion = mapeo.ids.aplicacionM;
      idPlanchado = mapeo.ids.planchadoM;
      minPlanchado = mapeo.mins.planchadoM;
      break;
  }
  
  console.log(`${TAG} Longitud ${lng}: Aplicaci\u00f3n=${idAplicacion ? idAplicacion.substring(0,8)+'...' : 'N/A'} | Planchado=${idPlanchado ? idPlanchado.substring(0,8)+'...' : 'N/A'} (${minPlanchado} min)`);
  
  return { longitud: lng, idAplicacion, idPlanchado, minPlanchado };
}

function buildFasesOrdenadasTratamiento({ ordenFases, corte, mapeo, resolucionLongitud }) {
  const fases = [];
  
  const ordenEfectivo = ordenFases && ordenFases.length > 0
    ? ordenFases
    : ['LAVADO', 'APLICACION', 'PROCESO', 'CORTE', 'PLANCHADO'];
  
  const posLavado = ordenEfectivo.indexOf('LAVADO');
  const posAplicacion = ordenEfectivo.indexOf('APLICACION');
  const lavadoEsPrevio = posLavado < posAplicacion;
  
  console.log(`${TAG} Orden de fases: ${ordenEfectivo.join(' \u2192 ')} (lavado ${lavadoEsPrevio ? 'PREVIO' : 'POSTERIOR'})`);
  
  for (const fase of ordenEfectivo) {
    if (fase === 'APLICACION' || fase === 'PROCESO') continue;
    
    switch (fase) {
      case 'LAVADO':
        const idLavado = lavadoEsPrevio ? mapeo.ids.lavadoPrevio : mapeo.ids.final;
        const minLavado = lavadoEsPrevio ? mapeo.mins.lavadoPrevio : mapeo.mins.final;
        if (idLavado) {
          fases.push({
            fase: 'LAVADO',
            serviceId: idLavado,
            min: minLavado || 15,
            label: 'Lavado'
          });
        }
        break;
        
      case 'CORTE':
        if (corte && mapeo.ids.corte) {
          fases.push({
            fase: 'CORTE',
            serviceId: mapeo.ids.corte,
            min: mapeo.mins.corte,
            label: 'Corte'
          });
        }
        break;
        
      case 'PLANCHADO':
        if (resolucionLongitud.idPlanchado) {
          fases.push({
            fase: 'PLANCHADO',
            serviceId: resolucionLongitud.idPlanchado,
            min: resolucionLongitud.minPlanchado,
            label: `Planchado ${resolucionLongitud.longitud}`
          });
        } else {
          console.error(`${TAG} No hay ID de planchado para longitud ${resolucionLongitud.longitud}.`);
        }
        break;
        
      case 'SECADO':
        if (mapeo.ids.secado) {
          fases.push({
            fase: 'SECADO',
            serviceId: mapeo.ids.secado,
            min: mapeo.mins.secado || 15,
            label: 'Secado'
          });
        }
        break;
        
      default:
        console.warn(`${TAG} Fase desconocida en ordenFases: ${fase}`);
    }
  }
  
  console.log(`${TAG} Fases a crear: ${fases.map(f => `${f.fase}(${f.serviceId.substring(0,8)}..., ${f.min}min)`).join(' \u2192 ')}`);
  
  return fases;
}

// =====================================================
// MOTOR DE DISPONIBILIDAD
// =====================================================

async function _consultarStaffEspecifico(payload) {
  const { serviceId, duracionMinutos, staffId, selectedDate } = payload;
  
  const fromLocalDate = `${selectedDate}T00:00:00`;
  const toLocalDate = `${selectedDate}T23:59:59`;
  
  const query = {
    filter: {
      serviceId: [serviceId],
      startDate: fromLocalDate,
      endDate: toLocalDate
    },
    timezone: BUSINESS_TIMEZONE
  };
  
  if (staffId && isGuid(staffId) && staffId !== STAFF_IDS.CUALQUIERA) {
    query.filter.resourceId = [staffId];
  }
  
  try {
    const elevatedQueryAvailability = elevate(availabilityCalendar.queryAvailability);
    const response = await elevatedQueryAvailability(query);
    
    const rawSlots = response?.availabilityEntries || [];
    
    const slots = [];
    for (const entry of rawSlots) {
      const slot = entry?.slot;
      if (!slot?.startDate) continue;
      
      const startDate = new Date(slot.startDate);
      const startTime = formatLocalTime(startDate);
      const endTimeCalculated = calcularEndTimeCorrect(startTime, duracionMinutos);
      
      const slotStaffId = slot?.resource?.id || staffId;
      
      slots.push({
        startTime,
        endTime: endTimeCalculated,
        date: selectedDate,
        staffId: slotStaffId,
        bookable: entry?.bookable !== false
      });
    }
    
    return slots;
    
  } catch (e) {
    console.error(`${TAG} Error en _consultarStaffEspecifico:`, e.message);
    return [];
  }
}

async function _consultarDisponibilidadV3(payload) {
  const { serviceId, duracionMinutos, serviceName, staffId, selectedDate } = payload;
  
  console.log(`${TAG} consultarDisponibilidad`);
  console.log(`${TAG}    Servicio: ${serviceName || serviceId}`);
  console.log(`${TAG}    Duraci\u00f3n: ${duracionMinutos} min`);
  console.log(`${TAG}    Staff: ${staffId}`);
  console.log(`${TAG}    Fecha: ${selectedDate}`);
  
  const esCualquiera = staffId === STAFF_IDS.CUALQUIERA || staffId === 'ANY';
  
  let allSlots = [];
  
  if (esCualquiera) {
    console.log(`${TAG} Modo CUALQUIERA: consultando Angela, Raquel, Ricardo...`);
    
    const [slotsAngela, slotsRaquel, slotsRicardo] = await Promise.all([
      _consultarStaffEspecifico({ ...payload, staffId: STAFF_IDS.ANGELA }),
      _consultarStaffEspecifico({ ...payload, staffId: STAFF_IDS.RAQUEL }),
      _consultarStaffEspecifico({ ...payload, staffId: STAFF_IDS.RICARDO })
    ]);
    
    console.log(`${TAG}    Angela: ${slotsAngela.length} | Raquel: ${slotsRaquel.length} | Ricardo: ${slotsRicardo.length}`);
    
    allSlots = [...slotsAngela, ...slotsRaquel, ...slotsRicardo];
    
    const slotsByTime = new Map();
    for (const slot of allSlots) {
      if (!slotsByTime.has(slot.startTime)) {
        slotsByTime.set(slot.startTime, slot);
      }
    }
    allSlots = Array.from(slotsByTime.values());
    
  } else {
    allSlots = await _consultarStaffEspecifico(payload);
  }
  
  allSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
  
  console.log(`${TAG} Slots v\u00e1lidos: ${allSlots.length}`);
  
  return allSlots;
}

// =====================================================
// CONSULTA DISPONIBILIDAD UNIFICADA — TRATAMIENTOS
// =====================================================

export const consultarDisponibilidadUnificada = webMethod(
  Permissions.Anyone,
  async (payload) => {
    const startTime = Date.now();
    
    try {
      const { publicServiceId, fecha, staffId, staff2Id, complementos } = payload || {};
      
      console.log(`${TAG} consultarDisponibilidadUnificada`);
      console.log(`${TAG}    Servicio: ${publicServiceId}`);
      console.log(`${TAG}    Fecha: ${fecha}`);
      console.log(`${TAG}    Staff1: ${staffId} | Staff2: ${staff2Id}`);
      
      if (!isGuid(publicServiceId)) throw new Error('publicServiceId requerido');
      if (!fecha) throw new Error('fecha requerida');
      
      const item = await getMapeoByPublicServiceId(publicServiceId);
      if (!item) throw new Error(`No mapeo para ${publicServiceId}`);
      const mapeo = buildMapeoTratamiento(item);
      
      const nombreServicio = item.servicioPublico || '';
      
      const longitudPelo = complementos?.longitudPelo || 'M';
      const corteChecked = complementos?.corte || false;
      
      const resolucion = resolverPorLongitud(mapeo, longitudPelo);
      
      if (!isGuid(resolucion.idAplicacion)) {
        throw new Error(`No hay servicio t\u00e9cnico de aplicaci\u00f3n para longitud ${resolucion.longitud}`);
      }
      
      const fasesOrdenadas = buildFasesOrdenadasTratamiento({
        ordenFases: mapeo.ordenFases,
        corte: corteChecked,
        mapeo,
        resolucionLongitud: resolucion
      });
      
      const duracionGap = mapeo.mins.proceso || 0;
      
      const ordenEfectivo = mapeo.ordenFases.length > 0 ? mapeo.ordenFases : ['LAVADO', 'APLICACION', 'PROCESO', 'CORTE', 'PLANCHADO'];
      const posAplicacion = ordenEfectivo.indexOf('APLICACION');
      
      let duracionPreAplic = 0;
      let duracionPostAplic = 0;
      
      for (const fase of fasesOrdenadas) {
        const posFase = ordenEfectivo.indexOf(fase.fase);
        if (posFase < posAplicacion) {
          duracionPreAplic += fase.min;
        } else {
          duracionPostAplic += fase.min;
        }
      }
      
      const duracionTotal = duracionPreAplic + duracionGap + duracionPostAplic;
      
      console.log(`${TAG} Pre-aplic: ${duracionPreAplic} min | GAP: ${duracionGap} min | Post-aplic: ${duracionPostAplic} min | Total complementos: ${duracionTotal} min`);
      
      const staffPrimary = staffId === 'ANY' ? 'ANY' : staffId;
      const staffSecondary = (!staff2Id || staff2Id === 'ANY') ? staffPrimary : staff2Id;
      
      const necesitaCascada = staffPrimary !== staffSecondary && staffSecondary !== 'ANY';
      
      console.log(`${TAG} Modo: ${necesitaCascada ? 'CASCADA (2 staff)' : 'SIMPLE (1 staff)'}`);
      
      let slotsFinales = [];
      
      if (!necesitaCascada) {
        const slotsRaw = await _consultarDisponibilidadV3({
          serviceId: resolucion.idAplicacion,
          duracionMinutos: duracionTotal,
          serviceName: `Tratamiento ${resolucion.longitud}`,
          staffId: staffPrimary,
          selectedDate: fecha
        });
        
        const idLavadoRef = mapeo.ids.lavadoPrevio || mapeo.ids.final;
        if (idLavadoRef && slotsRaw.length > 0) {
          const slotsRef = await _consultarStaffEspecifico({
            serviceId: idLavadoRef,
            duracionMinutos: 15,
            staffId: staffPrimary === 'ANY' ? STAFF_IDS.ANGELA : staffPrimary,
            selectedDate: fecha
          });
          
          if (slotsRef.length > 0) {
            const ultimoStartRef = slotsRef[slotsRef.length - 1].startTime;
            const cierreMin = hhmmToMinutes(ultimoStartRef) + 15;
            const antes = slotsRaw.length;
            
            slotsFinales = slotsRaw.filter(s => hhmmToMinutes(s.startTime) + duracionTotal <= cierreMin);
            
            console.log(`${TAG} Filtro cierre SIMPLE: ${antes} \u2192 ${slotsFinales.length} (cierre deducido: ${minutesToHhmm(cierreMin)})`);
          } else {
            slotsFinales = slotsRaw;
          }
        } else {
          slotsFinales = slotsRaw;
        }
        
      } else {
        console.log(`${TAG} Cascada: Staff1=${staffPrimary} (LAVADO+APLIC) | Staff2=${staffSecondary} (CORTE+PLANCHADO)`);
        
        const [slotsTramoA, slotsTramoB] = await Promise.all([
          _consultarDisponibilidadV3({
            serviceId: resolucion.idAplicacion,
            duracionMinutos: duracionPreAplic,
            serviceName: 'LAVADO+APLICACI\u00d3N',
            staffId: staffPrimary,
            selectedDate: fecha
          }),
          _consultarDisponibilidadV3({
            serviceId: resolucion.idPlanchado,
            duracionMinutos: duracionPostAplic,
            serviceName: 'CORTE+PLANCHADO',
            staffId: staffSecondary,
            selectedDate: fecha
          })
        ]);
        
        console.log(`${TAG} TRAMO A (Staff1): ${slotsTramoA.length} slots | TRAMO B (Staff2): ${slotsTramoB.length} slots`);
        
        const horasTramoB = new Set(slotsTramoB.map(s => s.startTime));
        
        for (const slotA of slotsTramoA) {
          const inicioTramoB = redondearAlGrid(calcularEndTimeCorrect(slotA.endTime, duracionGap));
          
          if (horasTramoB.has(inicioTramoB)) {
            const slotB = slotsTramoB.find(s => s.startTime === inicioTramoB);
            slotsFinales.push({
              startTime: slotA.startTime,
              endTime: slotB ? slotB.endTime : calcularEndTimeCorrect(inicioTramoB, duracionPostAplic),
              staffId: slotA.staffId || staffPrimary
            });
          }
        }
        
        console.log(`${TAG} Slots cruzados: ${slotsFinales.length}`);
        
        if (slotsTramoB.length > 0) {
          const ultimoStartTramoB = slotsTramoB[slotsTramoB.length - 1].startTime;
          const cierreMin = hhmmToMinutes(ultimoStartTramoB) + (resolucion.minPlanchado || duracionPostAplic);
          const antes = slotsFinales.length;
          
          slotsFinales = slotsFinales.filter(slot => {
            const inicioTramoBMin = hhmmToMinutes(
              calcularEndTimeCorrect(slot.startTime, duracionPreAplic + duracionGap)
            );
            return inicioTramoBMin + duracionPostAplic <= cierreMin;
          });
          
          console.log(`${TAG} Filtro cierre CASCADA: ${antes} \u2192 ${slotsFinales.length} (cierre deducido: ${minutesToHhmm(cierreMin)})`);
        }
        
        const duracionServicioWixB = resolucion.minPlanchado || duracionPostAplic;
        if (slotsFinales.length > 0 && duracionPostAplic > duracionServicioWixB) {
          let slotStep = 5;
          if (slotsTramoB.length >= 2) {
            const first = hhmmToMinutes(slotsTramoB[0].startTime);
            const second = hhmmToMinutes(slotsTramoB[1].startTime);
            const detected = second - first;
            if (detected > 0 && detected <= 15) slotStep = detected;
          }
          
          const tramoBMinutos = new Set(slotsTramoB.map(s => hhmmToMinutes(s.startTime)));
          
          const antesRango = slotsFinales.length;
          slotsFinales = slotsFinales.filter(slot => {
            const inicioTramoBMin = hhmmToMinutes(
              calcularEndTimeCorrect(slot.startTime, duracionPreAplic + duracionGap)
            );
            const finVerificacion = inicioTramoBMin + duracionPostAplic - duracionServicioWixB;
            
            for (let m = inicioTramoBMin; m <= finVerificacion; m += slotStep) {
              if (!tramoBMinutos.has(m)) return false;
            }
            return true;
          });
          
          if (slotsFinales.length < antesRango) {
            console.log(`${TAG} Filtro rango continuo TRAMO B: ${antesRango} -> ${slotsFinales.length} (step=${slotStep}min, durPostAplic=${duracionPostAplic}min)`);
          }
        }
      }
      
      const gridVisualizacion = mapeo.mins.gridVisualizacion || 15;
      slotsFinales = slotsFinales.filter(slot => {
        const minutos = parseInt(slot.startTime.split(':')[1]);
        return minutos % gridVisualizacion === 0;
      });
      
      const startTimesVistos = new Set();
      slotsFinales = slotsFinales.filter(slot => {
        if (startTimesVistos.has(slot.startTime)) return false;
        startTimesVistos.add(slot.startTime);
        return true;
      });
      
      slotsFinales.sort((a, b) => a.startTime.localeCompare(b.startTime));
      
      console.log(`${TAG} Slots finales: ${slotsFinales.length}`);
      
      const serviceIdsParaPrecio = [resolucion.idAplicacion];
      if (corteChecked && mapeo.ids.corte) {
        serviceIdsParaPrecio.push(mapeo.ids.corte);
      }
      
      const priceInfo = await calculateTotalPrice(serviceIdsParaPrecio);
      
      let descuento = 0;
      let promoNombre = null;
      const promo = await getPromoActiva(nombreServicio);
      if (promo) {
        const precioBase = priceInfo.breakdown[0]?.price || 0;
        descuento = Math.round(precioBase * promo.discountPercent / 100);
        promoNombre = promo.promoNombre;
        console.log(`${TAG} Promo "${promoNombre}": ${promo.discountPercent}% sobre ${precioBase}\u20ac = -${descuento}\u20ac`);
      }
      
      const tiempoConsulta = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`${TAG} Precio: ${priceInfo.total}\u20ac (descuento: ${descuento}\u20ac)`);
      console.log(`${TAG} Tiempo: ${tiempoConsulta}s`);
      
      return {
        ok: true,
        version: VERSION,
        slots: slotsFinales,
        precio: {
          subtotal: priceInfo.total,
          descuento: descuento,
          total: priceInfo.total - descuento,
          currency: priceInfo.currency,
          promoNombre: promoNombre
        },
        mapeo,
        resolucionLongitud: resolucion,
        tiempoConsulta
      };
      
    } catch (e) {
      console.error(`${TAG} consultarDisponibilidadUnificada FAIL:`, e);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

function redondearAlGrid(horaHHMM) {
  const [hours, minutes] = horaHHMM.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  const rounded = Math.ceil(totalMinutes / 15) * 15;
  const newHours = Math.floor(rounded / 60) % 24;
  const newMinutes = rounded % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

// =====================================================
// CREAR BOOKING (idéntico a coloracionLogic)
// =====================================================

async function createAndConfirmBookingPhase({ serviceId, resourceId, startISO, endISO, notes, contactDetails, price, memberContactId, serviceInfo, skipAvailability = false }) {
  console.log(`${TAG} createBooking: ${serviceId.substring(0,8)}...`);

  let location, scheduleId;
  
  if (serviceInfo) {
    location = serviceInfo.location;
    scheduleId = serviceInfo.scheduleId;
  } else {
    const elevatedGetService = elevate(services.getService);
    const svcV2 = await elevatedGetService(serviceId);
    location = extractLocationForBooking(svcV2);
    scheduleId = extractScheduleIdFromService(svcV2);
  }

  if (!isGuid(scheduleId)) {
    throw new Error(`No scheduleId v\u00e1lido para ${serviceId}`);
  }

  const bookingInfo = {
    bookedEntity: {
      slot: {
        serviceId,
        scheduleId,
        startDate: startISO,
        endDate: endISO,
        timezone: 'Europe/Madrid',
        resource: { id: resourceId },
        location
      },
      rate: {
        labeledPriceOptions: {
          general: {
            amount: String(price || 0),
            currency: "EUR",
            downPayAmount: "0"
          }
        }
      }
    },
    numberOfParticipants: 1,
    contactDetails,
    notes,
    selectedPaymentOption: 'OFFLINE'
  };

  if (memberContactId && isGuid(memberContactId)) {
    bookingInfo.contactId = memberContactId;
  }

  const options = { paymentOptions: { wixPayOffline: {} }, suppressAuth: true };

  if (skipAvailability === true) {
    options.flowControlSettings = { skipAvailabilityValidation: true };
  }

  const elevatedCreate = elevate(bookings.createBooking);
  const created = await elevatedCreate(bookingInfo, options);

  const bookingId = created?._id || created?.id || created?.booking?._id;
  const revision = created?.revision || created?.booking?.revision;
  
  if (!bookingId) throw new Error('createBooking no devolvi\u00f3 bookingId');

  try {
    const checkoutOptions = {
      lineItems: [{
        quantity: 1,
        catalogReference: {
          appId: "13d21c63-b5ec-5912-8397-c3a5ddb27a97",
          catalogItemId: bookingId
        }
      }],
      channelType: "WEB"
    };
    const elevatedCheckout = elevate(checkout.createCheckout);
    const checkoutResult = await elevatedCheckout(checkoutOptions);
    if (checkoutResult?._id) {
      const elevatedCreateOrder = elevate(checkout.createOrder);
      await elevatedCreateOrder(checkoutResult._id, { payNow: { option: "FULL_PAYMENT_OFFLINE" } });
    }
  } catch (e) {
    console.warn(`${TAG} Order: ${e.message}`);
  }

  try {
    if (revision != null && created?.status !== 'CONFIRMED') {
      const elevatedConfirm = elevate(bookings.confirmBooking);
      await elevatedConfirm(bookingId, revision, { participantNotification: { notifyParticipants: false } });
    }
  } catch (e) {
    console.warn(`${TAG} confirmBooking WARN`, e.message);
  }

  return bookingId;
}

// =====================================================
// ACTUALIZAR CAMPO EXTENDIDO promocin (idéntico)
// =====================================================

async function updateBookingPromocion(bookingId, promoNombre, descuento) {
  try {
    if (!bookingId || !promoNombre || descuento === undefined) return;
    
    const promoCompleta = `${promoNombre}|${descuento}`;
    
    const elevatedUpdate = elevate(bookings.updateExtendedFields);
    await elevatedUpdate(bookingId, '_user_fields', {
      namespaceData: { promocin: promoCompleta }
    });
    
    console.log(`${TAG} Campo promocin guardado: ${promoCompleta}`);
  } catch (e) {
    console.warn(`${TAG} Error guardando promocin:`, e.message);
  }
}

// =====================================================
// MARCAR ORIGEN RECEPCIÓN (v1.0.1)
// =====================================================

async function marcarOrigenRecepcion(bookingId) {
  try {
    if (!bookingId) return;
    const elevatedUpdate = elevate(bookings.updateExtendedFields);
    await elevatedUpdate(bookingId, '_user_fields', {
      namespaceData: { reservaderecepcion: "RECEPCION" }
    });
    console.log(`${TAG} Marcado como RECEPCION: ${bookingId}`);
  } catch (e) {
    console.warn(`${TAG} Error marcando origen:`, e.message);
  }
}

function buildContactDetailsFromPayload(payload) {
  const cd = payload?.contactDetails || payload?.customer || null;

  const firstName = String(cd?.firstName || payload?.firstName || payload?.nombre || '').trim();
  const lastName = String(cd?.lastName || payload?.lastName || payload?.apellido || '').trim();
  const email = String(cd?.email || payload?.email || '').trim();
  const phone = String(cd?.phone || payload?.phone || payload?.telefono || '').trim();

  if (!firstName && !lastName && !email && !phone) {
    return { firstName: 'Reserva', lastName: 'HairTimes', email: 'booking@hair-times.com', phone: '' };
  }

  return { firstName: firstName || 'Cliente', lastName: lastName || '', email: email || 'booking@hair-times.com', phone };
}

// =====================================================
// v1.0.8: GARANTIZAR CONTACTO CRM ANTES DE CREAR BOOKING
//
// NOTA v1.0.9: Esta versión sigue siendo la antigua (allowDuplicates:false,
// sin búsqueda previa por teléfono/nombre). Pendiente migrar al patrón
// robusto de coloracionLogic v3.2.6 en v1.0.10 futura.
// =====================================================

async function ensureContactInCRM(contactDetails, memberContactId) {
  if (memberContactId && isGuid(memberContactId)) return memberContactId;
  const { firstName, lastName, email, phone } = contactDetails || {};
  if (!firstName && !email && !phone) {
    console.warn(`${TAG} ensureContactInCRM: sin datos suficientes`);
    return null;
  }
  try {
    console.log(`${TAG} ensureContactInCRM: ${firstName} ${lastName} | ${email} | ${phone}`);
    const contactInfo = {
      name: { first: firstName || '', last: lastName || '' },
      emails: (email && email !== 'booking@hair-times.com') ? [{ email }] : [],
      phones: phone ? [{ phone }] : []
    };
    const elevatedCreate = elevate(contacts.createContact);
    const result = await elevatedCreate(contactInfo, { allowDuplicates: false, suppressAuth: true });
    const newId = result?.contact?._id || result?._id || null;
    if (newId) console.log(`${TAG} Contacto CRM asegurado: ${newId}`);
    return newId;
  } catch (e) {
    console.error(`${TAG} ensureContactInCRM fallo: ${e.message}`);
    return null;
  }
}

// =====================================================
// ALERTAS Y NOTAS CRM
// =====================================================

async function sendInternalAlert(customerMessage, contactDetails, fechaISO, horaHHmm) {
  try {
    const clienteName = `${contactDetails.firstName} ${contactDetails.lastName}`.trim() || 'Cliente';
    const title = `\u26a0\ufe0f Mensaje cliente \u2014 Reserva`;
    const body = `${horaHHmm} | TRATAMIENTO | ${clienteName}: ${customerMessage}`;
    
    const elevatedNotify = elevate(notifications.notify);
    await elevatedNotify(body, ['Dashboard'], {
      title: title,
      actionTitle: 'Ver reserva',
      actionTarget: { url: 'https://www.hair-times.com/dashboard/bookings' }
    });
    
    console.log(`${TAG} Alerta interna enviada`);
  } catch (e) {
    console.error(`${TAG} Error enviando alerta interna:`, e.message);
  }
}

async function saveNotaToCRM(customerMessage, memberContactId) {
  try {
    if (!memberContactId || !isGuid(memberContactId)) return;
    
    const elevatedGet = elevate(contacts.getContact);
    const contact = await elevatedGet(memberContactId);
    
    if (!contact || !contact.revision) return;
    
    const currentFicha = contact?.info?.extendedFields?.['custom.ficha'] || '';
    const timestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    const newEntry = `[${timestamp}] ${customerMessage}`;
    
    const updatedFicha = currentFicha ? `${currentFicha} | ${newEntry}` : newEntry;
    
    const identifiers = { contactId: memberContactId, revision: contact.revision };
    const contactInfo = { extendedFields: { 'custom.ficha': updatedFicha } };
    
    const elevatedUpdate = elevate(contacts.updateContact);
    await elevatedUpdate(identifiers, contactInfo, { suppressAuth: true });
    
    console.log(`${TAG} Nota guardada en CRM`);
  } catch (e) {
    console.error(`${TAG} Error guardando nota CRM:`, e.message);
  }
}

// =====================================================
// v1.0.9: ENVÍO DE CONFIRMACIÓN VÍA CENTRALITA
//
// La función enviarConfirmacionReserva() de v1.0.8 ha sido eliminada.
// La centralita comunicacionesLogic.web.js gestiona ahora el envío
// por todos los canales activos (email Wix triggered, WhatsApp, etc).
//
// Se invoca directamente desde crearComplementos() abajo.
// =====================================================

// =====================================================
// WEB METHODS PÚBLICOS
// =====================================================

export const getConstants = webMethod(Permissions.Anyone, async () => {
  return {
    ok: true,
    version: VERSION,
    staffIds: STAFF_IDS,
    businessTimezone: BUSINESS_TIMEZONE
  };
});

export const getStaffResources = webMethod(Permissions.Anyone, async () => {
  try {
    const staff = await listStaffResources();
    return { ok: true, version: VERSION, staff };
  } catch (e) {
    console.error(`${TAG} getStaffResources FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const getServicioPublicoInfo = webMethod(Permissions.Anyone, async ({ serviceId }) => {
  try {
    if (!isGuid(serviceId)) throw new Error(`serviceId no es GUID`);
    const s = await wixData.get(COLLECTION_PUBLIC_SERVICES, serviceId);
    if (!s) throw new Error(`No encuentro servicio ${serviceId}`);
    return {
      ok: true,
      version: VERSION,
      serviceId,
      name: s.serviceName || s.name || '',
      description: String(s.description || '').trim(),
      imageUrl: pickImageUrl(s),
    };
  } catch (e) {
    console.error(`${TAG} getServicioPublicoInfo FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const getMapeoTratamiento = webMethod(Permissions.Anyone, async ({ serviceId }) => {
  try {
    if (!isGuid(serviceId)) throw new Error(`serviceId no es GUID`);
    const item = await getMapeoByPublicServiceId(serviceId);
    if (!item) throw new Error(`No mapeo para ${serviceId}`);
    
    const mapeo = buildMapeoTratamiento(item);
    
    const idRef = mapeo.ids.aplicacionM || mapeo.ids.aplicacionL || mapeo.ids.aplicacionXl;
    let assignedStaffIds = [];
    if (idRef && isGuid(idRef)) {
      const rawStaffIds = await getStaffMemberIdsFromService(idRef);
      assignedStaffIds = rawStaffIds.filter(id => id !== STAFF_IDS.CUALQUIERA);
      console.log(`${TAG} Staff asignados (sin CUALQUIERA): ${assignedStaffIds.length} \u2192 ${assignedStaffIds.join(', ')}`);
    }
    
    return { 
      ok: true, 
      version: VERSION, 
      serviceId, 
      mapeo,
      assignedStaffIds
    };
  } catch (e) {
    console.error(`${TAG} getMapeoTratamiento FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

async function resolverCualquieraAHumanoLibre(serviceId, fecha, horaHHmm) {
  console.log(`${TAG} Resolviendo CUALQUIERA \u2192 humano libre a ${horaHHmm}...`);
  
  const checks = await Promise.all(HUMANOS_REALES.map(async (staffId) => {
    const slots = await _consultarStaffEspecifico({
      serviceId,
      duracionMinutos: 15,
      staffId,
      selectedDate: fecha
    });
    const libre = slots.some(s => s.startTime === horaHHmm);
    return { staffId, libre };
  }));
  
  const libres = checks.filter(c => c.libre);
  console.log(`${TAG} Humanos libres a ${horaHHmm}: ${libres.map(l => STAFF_NAMES[l.staffId] || l.staffId).join(', ') || 'NINGUNO'}`);
  
  if (libres.length === 0) return null;
  
  const idx = Math.floor(Math.random() * libres.length);
  const elegido = libres[idx].staffId;
  console.log(`${TAG} CUALQUIERA \u2192 ${STAFF_NAMES[elegido] || elegido}`);
  
  return elegido;
}

export const confirmarEnCalendario = webMethod(Permissions.Anyone, async (payload) => {
  try {
    console.log(`${TAG} confirmarEnCalendario INICIO`);

    const {
      publicServiceId,
      fechaISO,
      horaHHmm,
      empleadoId,
      empleado2Id,
      longitudPelo = 'M',
      corteChecked = false,
      notes = '',
      guardarNota = false,
      origen = 'Reserva Online',
      modoPago = 'LOCAL',
      origenRecepcion = false
    } = payload || {};

    let memberContactId = payload?.memberContactId || null;

    if (!isGuid(publicServiceId)) throw new Error('publicServiceId requerido');
    if (!fechaISO) throw new Error('fechaISO requerido');
    if (!horaHHmm) throw new Error('horaHHmm requerido');
    if (!isGuid(empleadoId)) throw new Error('empleadoId requerido');

console.warn(`${TAG} 📅 Reserva entrante: fecha=${fechaISO} hora=${horaHHmm} servicio=${publicServiceId} longitud=${payload?.longitudPelo||'M'} corte=${!!payload?.corteChecked} cliente=${payload?.contactDetails?.firstName||''} ${payload?.contactDetails?.lastName||''} tel=${payload?.contactDetails?.phone||''} origen=${payload?.origen||'?'}`);

    let empleadoIdReal = empleadoId;
    if (empleadoId === STAFF_IDS.CUALQUIERA) {
      const itemTemp = await getMapeoByPublicServiceId(publicServiceId);
      if (!itemTemp) throw new Error(`No mapeo para ${publicServiceId}`);
      const mapeoTemp = buildMapeoTratamiento(itemTemp);
      const resTemp = resolverPorLongitud(mapeoTemp, longitudPelo);
      
      const humanoLibre = await resolverCualquieraAHumanoLibre(resTemp.idAplicacion, fechaISO, horaHHmm);
      if (!humanoLibre) {
        throw new Error('No hay profesional disponible a esa hora. Pruebe otro horario.');
      }
      empleadoIdReal = humanoLibre;
    }

    let extrasStaffId = empleadoIdReal;
    if (isGuid(empleado2Id) && empleado2Id !== empleadoIdReal) {
      let empleado2IdReal = empleado2Id;
      if (empleado2Id === STAFF_IDS.CUALQUIERA) {
        empleado2IdReal = empleadoIdReal;
      }
      extrasStaffId = empleado2IdReal;
    }
    
    console.log(`${TAG} Staff principal: ${empleadoIdReal} (${STAFF_NAMES[empleadoIdReal] || 'N/A'}) | Staff complementos: ${extrasStaffId} (${STAFF_NAMES[extrasStaffId] || 'N/A'}) | Longitud: ${longitudPelo} | Corte: ${corteChecked}`);

    const item = await getMapeoByPublicServiceId(publicServiceId);
    if (!item) throw new Error(`No mapeo para ${publicServiceId}`);
    const mapeo = buildMapeoTratamiento(item);

    const resolucion = resolverPorLongitud(mapeo, longitudPelo);
    
    if (!isGuid(resolucion.idAplicacion)) {
      throw new Error(`No hay servicio t\u00e9cnico de aplicaci\u00f3n para longitud ${resolucion.longitud}`);
    }

    const minGap = toNum(mapeo.mins.proceso);
    const corte = Boolean(corteChecked);

    const contactDetails = buildContactDetailsFromPayload(payload);

    memberContactId = await ensureContactInCRM(contactDetails, memberContactId);

    const cd = payload?.contactDetails || {};
    const customerMessage = String(cd?.mensaje || payload?.mensaje || '').trim();

    const fasesOrdenadas = buildFasesOrdenadasTratamiento({
      ordenFases: mapeo.ordenFases,
      corte,
      mapeo,
      resolucionLongitud: resolucion
    });
    
    console.log(`${TAG} Fases ordenadas: ${fasesOrdenadas.map(f => f.fase).join(' \u2192 ')}`);

    const ordenEfectivo = mapeo.ordenFases.length > 0 ? mapeo.ordenFases : ['LAVADO', 'APLICACION', 'PROCESO', 'CORTE', 'PLANCHADO'];
    const posAplicacion = ordenEfectivo.indexOf('APLICACION');
    
    const fasesPreAplic = [];
    const fasesPostAplic = [];
    
    for (const fase of fasesOrdenadas) {
      const posFase = ordenEfectivo.indexOf(fase.fase);
      if (posFase < posAplicacion) {
        fasesPreAplic.push(fase);
      } else {
        fasesPostAplic.push(fase);
      }
    }
    
    console.log(`${TAG} Pre-aplicaci\u00f3n: ${fasesPreAplic.map(f => f.fase).join(', ') || 'ninguna'}`);
    console.log(`${TAG} Post-aplicaci\u00f3n: ${fasesPostAplic.map(f => f.fase).join(', ') || 'ninguna'}`);

    console.log(`${TAG} Obteniendo serviceInfo y precios en paralelo...`);
    
    const elevatedGetService = elevate(services.getService);
    
    const serviceIdsUnicos = new Set([resolucion.idAplicacion]);
    for (const fase of fasesOrdenadas) {
      if (fase.serviceId && isGuid(fase.serviceId)) {
        serviceIdsUnicos.add(fase.serviceId);
      }
    }
    
    const serviceInfoPromises = Array.from(serviceIdsUnicos).map(async (svcId) => {
      const svc = await elevatedGetService(svcId);
      return {
        serviceId: svcId,
        location: extractLocationForBooking(svc),
        scheduleId: extractScheduleIdFromService(svc)
      };
    });
    
    const pricePromises = Array.from(serviceIdsUnicos).map(svcId => getServicePrice(svcId));
    
    const [serviceInfoResults, priceResults] = await Promise.all([
      Promise.all(serviceInfoPromises),
      Promise.all(pricePromises)
    ]);
    
    const serviceInfoMap = {};
    serviceInfoResults.forEach(info => { serviceInfoMap[info.serviceId] = info; });
    
    const priceMap = {};
    Array.from(serviceIdsUnicos).forEach((svcId, i) => { priceMap[svcId] = priceResults[i].price; });
    
    console.log(`${TAG} Info obtenida para ${serviceIdsUnicos.size} servicios`);

    const baseNotes = `Publico=${publicServiceId}\nMainStaff=${empleadoIdReal}; ExtraStaff=${extrasStaffId}\nLongitud=${resolucion.longitud}`;

    let cursorPreAplic = madridToUTC(fechaISO, horaHHmm);
    
for (const fase of fasesPreAplic) {
      const s = cursorPreAplic;
      const e = addMinutes(s, fase.min);
     
      console.log(`${TAG} [PRE] Creando ${fase.fase}: ${fase.serviceId.substring(0,8)}... (${fase.min} min) con staff principal`);
     
      await createAndConfirmBookingPhase({
        serviceId: fase.serviceId,
        resourceId: empleadoIdReal,
        startISO: s,
        endISO: e,
        notes: `${baseNotes}\nFASE=${fase.fase}`,
        contactDetails,
        price: priceMap[fase.serviceId] || 0,
        memberContactId,
        serviceInfo: serviceInfoMap[fase.serviceId],
        skipAvailability: true
      });
     
      cursorPreAplic = e;
    }
    const startAplic = cursorPreAplic;
    const svcAplic = await elevatedGetService(resolucion.idAplicacion);
    const duracionAplicWix = toNum(svcAplic?.schedule?.availabilityConstraints?.sessionDurations?.[0]) 
                           || toNum(svcAplic?.defaultDuration) 
                           || 60;
    
    const endAplic = addMinutes(startAplic, duracionAplicWix);
    
    console.log(`${TAG} Creando APLICACI\u00d3N (AWAIT): ${resolucion.idAplicacion.substring(0,8)}... (${duracionAplicWix} min)`);

const bAplic = await createAndConfirmBookingPhase({
      serviceId: resolucion.idAplicacion,
      resourceId: empleadoIdReal,
      startISO: startAplic,
      endISO: endAplic,
      notes: `${baseNotes}\nFASE=APLICACI\u00d3N`,
      contactDetails,
      price: priceMap[resolucion.idAplicacion],
      memberContactId,
      serviceInfo: serviceInfoMap[resolucion.idAplicacion],
      skipAvailability: true
    });
    console.log(`${TAG} Aplicaci\u00f3n confirmada: ${bAplic}`);

    let totalPrecio = priceMap[resolucion.idAplicacion] || 0;
    if (corte && mapeo.ids.corte) {
      totalPrecio += priceMap[mapeo.ids.corte] || 0;
    }

    let descuentoConfirm = 0;
    let promoNombreConfirm = null;
    const nombreServicio = item.servicioPublico || '';
    const promo = await getPromoActiva(nombreServicio);
    if (promo) {
      const precioBase = priceMap[resolucion.idAplicacion] || 0;
      descuentoConfirm = Math.round(precioBase * promo.discountPercent / 100);
      promoNombreConfirm = promo.promoNombre;
      console.log(`${TAG} Promo "${promoNombreConfirm}": -${descuentoConfirm}\u20ac`);
    }
    const totalConDescuento = totalPrecio - descuentoConfirm;

    if (promoNombreConfirm && bAplic) {
      updateBookingPromocion(bAplic, promoNombreConfirm, descuentoConfirm).catch(() => {});
    }

    if (origenRecepcion && bAplic) {
      marcarOrigenRecepcion(bAplic).catch(() => {});
    }

    const nombreServicioPublico = item.servicioPublico || item.nombreServicio || 'Tratamiento';
    const staffName = getStaffNameById(empleadoIdReal);
    const fechaBonita = formatFechaEmail(fechaISO);
    
    const serviciosEmailArray = [nombreServicioPublico];
    for (const fase of fasesOrdenadas) {
      if (fase.fase !== 'LAVADO') {
        serviciosEmailArray.push(fase.label);
      }
    }
    serviciosEmailArray.push('Lavado');
    const serviciosEmailString = serviciosEmailArray.join(' + ');

    // v1.0.9: notificación de confirmación delegada a centralita comunicacionesLogic
    const crearComplementos = async () => {
      try {
        let cursorBg = addMinutes(endAplic, minGap);
        let endFinalBg = cursorBg;

        for (const fase of fasesPostAplic) {
          const s = cursorBg;
          const e = addMinutes(s, fase.min);
          
          console.log(`${TAG} [POST] Creando ${fase.fase}: ${fase.serviceId.substring(0,8)}... (${fase.min} min) con staff complementos`);
          
          try {
            await createAndConfirmBookingPhase({
              serviceId: fase.serviceId,
              resourceId: extrasStaffId,
              startISO: s,
              endISO: e,
              notes: `${baseNotes}\nFASE=${fase.fase}`,
              contactDetails,
              price: priceMap[fase.serviceId] || 0,
              memberContactId,
              serviceInfo: serviceInfoMap[fase.serviceId],
              skipAvailability: true
            });
          } catch (faseErr) {
            console.error(`${TAG} Error fase POST ${fase.fase}: ${faseErr.message}`);
          }
          
          cursorBg = e;
          endFinalBg = e;
        }

        const horaFinalEmail = formatLocalTime(new Date(endFinalBg));
        const importeTotalStr = descuentoConfirm > 0
          ? `${totalConDescuento}\u20ac (${promoNombreConfirm}: -${descuentoConfirm}\u20ac)`
          : `${totalPrecio}\u20ac`;
        const estadoPagoStr = modoPago === 'ONLINE' ? 'Pagado online \u2714' : 'Pago en sal\u00f3n';

        // v1.0.9: Centralita gestiona email + WhatsApp + futuros canales
        try {
          await notificarConfirmacion({
            contactId:     memberContactId,
            email:         contactDetails.email,
            telefono:      contactDetails.phone,
            nombreCliente: `${contactDetails.firstName} ${contactDetails.lastName}`.trim(),
            fecha:         fechaBonita,
            hora:          horaHHmm,
            servicios:     serviciosEmailString,
            estilista:     staffName,
            // emailVariables: idénticas a las que usaba enviarConfirmacionReserva
            // de v1.0.8, para que el template Wix VA5UQRG reciba los mismos
            // campos que hoy y no haya regresión en el email.
            emailVariables: {
              Fecha:         fechaBonita,
              Nombre:        contactDetails.firstName,
              Apellido:      contactDetails.lastName,
              servicios:     serviciosEmailString,
              profesional:   staffName,
              horaInicio:    horaHHmm,
              horaFinal:     horaFinalEmail,
              importeTotal:  importeTotalStr,
              origen:        origen,
              estadoPago:    estadoPagoStr,
              SITE_URL:      'https://www.hair-times.com'
            }
          });
        } catch (notifErr) {
          // No-blocking: si la centralita falla, la reserva ya está creada.
          console.error(`${TAG} Error en notificarConfirmacion (no-blocking): ${notifErr.message}`);
        }

        console.log(`${TAG} Complementos + notificaci\u00f3n completados en background`);
      } catch (e) {
        console.error(`${TAG} Error en complementos:`, e.message);
      }
    };

    crearComplementos();

    if (customerMessage.length > 0) {
      sendInternalAlert(customerMessage, contactDetails, fechaISO, horaHHmm).catch(() => {});
      if (guardarNota && memberContactId && isGuid(memberContactId)) {
        saveNotaToCRM(customerMessage, memberContactId).catch(() => {});
      }
    }

    let checkoutUrl = null;
    
    if (modoPago === 'ONLINE') {
      try {
        console.log(`${TAG} Creando checkout para pago online...`);
        
        const servicioInfo = await wixData.get(COLLECTION_PUBLIC_SERVICES, publicServiceId, { suppressAuth: true });
        const nombreServicioCheckout = servicioInfo?.serviceName || servicioInfo?.name || 'Tratamiento capilar';
        
        const descripcion = `${nombreServicioCheckout} | ${fechaISO} ${horaHHmm} | ${serviciosEmailString}`;
        
        const checkoutOptions = {
          channelType: "WEB",
          customLineItems: [
            {
              quantity: 1,
              productName: {
                original: descripcion,
                translated: descripcion
              },
              price: String(totalConDescuento),
              itemType: {
                preset: "SERVICE"
              }
            }
          ],
          checkoutInfo: {
            buyerInfo: {
              email: contactDetails.email,
              firstName: contactDetails.firstName,
              lastName: contactDetails.lastName,
              phone: contactDetails.phone
            }
          }
        };
        
        const elevatedCreateCheckout = elevate(checkout.createCheckout);
        const checkoutResult = await elevatedCreateCheckout(checkoutOptions);
        
        const checkoutId = checkoutResult?._id;
        
        if (checkoutId) {
          const elevatedGetCheckoutUrl = elevate(checkout.getCheckoutUrl);
          const urlResult = await elevatedGetCheckoutUrl(checkoutId);
          checkoutUrl = urlResult?.checkoutUrl;
          
          console.log(`${TAG} Checkout URL obtenida: ${checkoutUrl}`);
        }
        
      } catch (checkoutError) {
        console.error(`${TAG} Error creando checkout:`, checkoutError.message);
      }
    }

    console.log(`${TAG} COMPLETADO - Total: ${totalConDescuento}\u20ac`);

    return {
      ok: true,
      version: VERSION,
      bookingIds: { aplicacion: bAplic },
      price: totalConDescuento,
      currency: 'EUR',
      modoPago,
      checkoutUrl
    };
  } catch (e) {
    console.error(`${TAG} confirmarEnCalendario FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});
