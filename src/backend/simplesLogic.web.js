// =====================================================
// KAMISUITE - Servicios Simples Backend simplesLogic.web
// =====================================================
// VERSION: 1.5.0
// FECHA: 9 de mayo de 2026
//
// CAMBIOS v1.5.0:
// - NEW: Integración con centralita comunicacionesLogic.
//   Tras crear el booking exitosamente (post-confirmación + post-RECEPCION),
//   se llama a notificarConfirmacion() para que la centralita envíe
//   email + WhatsApp + futuros canales según SalonConfig.
//
//   IMPORTANTE: Esto cubre un agujero histórico. Hasta v1.4.0 los
//   clientes que reservaban un servicio simple desde Recepción PRO,
//   AKIRA u otros caminos NO recibían confirmación. Solo los que
//   reservaban por la web pública la recibían (Wix nativa la envía).
//
//   Por qué no hay riesgo de doble email para reservas web:
//   El widget nativo de Wix Bookings de la web pública crea la reserva
//   por dentro de Wix sin pasar por simplesLogic.reservarSimple
//   (verificado en logs 9-may-2026). Por tanto la centralita solo se
//   activa para los caminos donde la reserva entra por API: Recepción
//   PRO, AKIRA, Instagram, etc. — y son justamente los que hoy quedan
//   sin notificar.
//
//   Detalles:
//   (a) Import: añadido notificarConfirmacion de comunicacionesLogic.
//   (b) Nombre del servicio público: extraído de svc.info.name (Wix V2)
//       para pasarlo a la centralita como "servicios".
//   (c) Llamada envuelta en try/catch no-blocking: si la centralita
//       falla, la reserva ya está creada, marcada y confirmada — el
//       cliente simplemente no recibe la notificación.
//   (d) emailVariables idénticas en estructura a las que usan
//       coloracionLogic v3.2.7 y tratamientosLogic v1.0.9, para que
//       el template Wix VA5UQRG reciba los mismos campos.
//
//   No se toca:
//     - reservarSimple flujo principal
//     - ensureContactInCRM
//     - createBooking + Order + Confirm + Marcado RECEPCION
//     - consultarDisponibilidadSimple
//     - getVariantsCMS
//
//   Riesgo: bajo. El cambio es aditivo y aislado al final del flujo.
//
// CAMBIOS v1.4.0:
// - FIX CRÍTICO: ensureContactInCRM() garantiza que SIEMPRE se cree
//   contacto en Wix CRM antes de escribir el booking.
//
// CAMBIOS v1.3.0:
// - NEW: Acepta origenRecepcion para solapamiento forzado
//
// CAMBIOS v1.2.1:
// - FIX: Timezone — usa madridToUTC (patrón coloracionLogic)
//
// CAMBIOS v1.2.0:
// - FIX: Duración leída de Wix Bookings (getService)
// - FIX: Precio leído de Wix Bookings (getService)
// - FIX: resourceId OBLIGATORIO
// - FIX: email vacío no se manda
//
// CAMBIOS v1.1.0:
// - CONVERTIDO de .jsw a .web.js con webMethod wrappers
// - FIX: Orden correcto → Order ANTES de Confirm
// - FIX: numberOfParticipants (no totalParticipants)
//
// Servicios sin lógica de cascada ni GAP.
// Usa Wix Bookings V2 API directamente.
// Variantes se leen del CMS: SvSimpleServiceVariants
//
// ARCHIVO: backend/simplesLogic.web.js
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { availabilityCalendar, bookings, services } from 'wix-bookings.v2';
import { checkout } from 'wix-ecom-backend';
import { contacts } from 'wix-crm-backend';
import wixData from 'wix-data';

// v1.5.0: Centralita de comunicaciones
import { notificarConfirmacion } from 'backend/comunicacionesLogic.web.js';

const TAG = '[SimplesLogic][1.5.0]';
const TIMEZONE = 'Europe/Madrid';
const CMS_VARIANTS = 'SvSimpleServiceVariants';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS: Extraer datos del servicio Wix
// ═══════════════════════════════════════════════════════════════════════════

function isGuid(x) {
  return typeof x === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

function extractScheduleId(svc) {
  return svc?.scheduleId
    || svc?.schedule?.id
    || svc?.schedule?._id
    || svc?.scheduling?.scheduleId
    || svc?.availability?.scheduleId
    || null;
}

function extractLocation(svc) {
  const loc0 = svc?.locations?.[0] || svc?.location || {};
  const bLoc = loc0?.businessLocation || loc0?.location || loc0;
  const locationType = bLoc?.locationType || loc0?.locationType || 'OWNER_BUSINESS';
  const locationId = bLoc?.id || bLoc?._id || loc0?.id || null;
  return locationId ? { locationType, id: locationId } : { locationType };
}

// v1.5.0: Extraer nombre legible del servicio para la confirmación al cliente
function extractServiceName(svc) {
  return svc?.name
      || svc?.info?.name
      || svc?.serviceName
      || svc?.title
      || 'Servicio';
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Formato fecha bonita para email
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: hora final formateada
// ═══════════════════════════════════════════════════════════════════════════

function calcularHoraFinal(horaHHmm, duracionMin) {
  const [h, m] = horaHHmm.split(':').map(Number);
  const totalMin = h * 60 + m + duracionMin;
  const hF = Math.floor(totalMin / 60) % 24;
  const mF = totalMin % 60;
  return `${String(hF).padStart(2, '0')}:${String(mF).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER v1.2.1: madridToUTC — Patrón EXACTO de coloracionLogic
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// HELPER v1.2.0: Extraer duración real del servicio Wix
// ═══════════════════════════════════════════════════════════════════════════

function extractDuration(svc, durationMinutesParam) {
  const durations = svc?.schedule?.availabilityConstraints?.sessionDurations || [];

  if (durations.length === 0) {
    return durationMinutesParam || 30;
  }

  if (durationMinutesParam && durations.includes(durationMinutesParam)) {
    return durationMinutesParam;
  }

  return durations[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER v1.2.0: Extraer precio real del servicio Wix
// ═══════════════════════════════════════════════════════════════════════════

function extractPrice(svc, priceParam) {
  const wixPrice = parseFloat(svc?.payment?.fixed?.price?.value) || 0;

  if (priceParam && priceParam > 0) {
    return priceParam;
  }

  return wixPrice;
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.4.0: GARANTIZAR CONTACTO CRM ANTES DE CREAR BOOKING
// ═══════════════════════════════════════════════════════════════════════════

async function ensureContactInCRM(contactDetails, memberContactId) {
  if (memberContactId && isGuid(memberContactId)) return memberContactId;

  const { firstName, lastName, email, phone } = contactDetails || {};
  if (!firstName && !email && !phone) {
    console.warn(`${TAG} \u26a0\ufe0f ensureContactInCRM: sin datos suficientes para crear contacto`);
    return null;
  }

  try {
    console.log(`${TAG} \ud83d\udd0d ensureContactInCRM: creando/buscando contacto para ${firstName} ${lastName || ''} | ${email || ''} | ${phone || ''}`);
    const contactInfo = {
      name: { first: firstName || '', last: lastName || '' },
      emails: (email && email !== 'booking@hair-times.com') ? [{ email }] : [],
      phones: phone ? [{ phone }] : []
    };
    const elevatedCreate = elevate(contacts.createContact);
    const result = await elevatedCreate(contactInfo, { allowDuplicates: false, suppressAuth: true });
    const newId = result?.contact?._id || result?._id || null;
    if (newId) {
      console.log(`${TAG} \u2705 Contacto CRM asegurado: ${newId}`);
    } else {
      console.warn(`${TAG} \u26a0\ufe0f ensureContactInCRM: createContact no devolvi\u00f3 ID`);
    }
    return newId;
  } catch (e) {
    console.error(`${TAG} \u26a0\ufe0f ensureContactInCRM fall\u00f3: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER v1.5.0: Resolver nombre legible del staff a partir del resourceId
// ═══════════════════════════════════════════════════════════════════════════

const STAFF_NAMES_MAP = {
  '0c22fa77-3602-4876-b744-ded83ed540f8': 'Angela',
  '0e69d7a3-4e36-40ec-9f3d-348f5bf3524d': 'Raquel',
  'b888c390-361d-4b0d-80f7-e0ba808bd7ce': 'Ricardo'
};

function getStaffNameById(staffId) {
  return STAFF_NAMES_MAP[staffId] || 'Tu profesional';
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. LEER VARIANTES DESDE CMS
// ═══════════════════════════════════════════════════════════════════════════

export const getVariantsCMS = webMethod(
  Permissions.Anyone,
  async ({ serviceId }) => {
    try {
      console.log(`${TAG} \ud83d\udccb Leyendo variantes CMS`);

      const result = await wixData.query(CMS_VARIANTS)
        .ascending('order')
        .find();

      const variants = (result.items || []).map(item => ({
        serviceId: item.serviceId,
        label: item.label,
        durationMinutes: item.durationMinutes,
        priceEuro: item.priceEuro,
        order: item.order
      }));

      console.log(`${TAG} \u2705 ${variants.length} variantes encontradas`);
      return { ok: true, variants };
    } catch (e) {
      console.error(`${TAG} \u274c getVariantsCMS:`, e.message);
      return { ok: false, error: { message: e.message }, variants: [] };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 2. CONSULTAR DISPONIBILIDAD SIMPLE
// ═══════════════════════════════════════════════════════════════════════════

export const consultarDisponibilidadSimple = webMethod(
  Permissions.Anyone,
  async ({ serviceId, fecha, staffId, durationMinutes }) => {
    const t0 = Date.now();
    try {
      console.log(`${TAG} \ud83d\udcc5 Disponibilidad simple: ${serviceId} | ${fecha} | staff=${staffId} | dur=${durationMinutes}min`);

      const startDate = `${fecha}T00:00:00.000`;
      const endDate = `${fecha}T23:59:59.000`;

      const query = {
        filter: {
          serviceId: [serviceId],
          startDate,
          endDate,
          ...(staffId && staffId !== 'ANY' ? { resourceId: [staffId] } : {})
        }
      };

      const options = { timezone: TIMEZONE };

      console.log(`${TAG} \ud83d\udce6 Query:`, JSON.stringify(query));

      const elevatedQuery = elevate(availabilityCalendar.queryAvailability);
      const availability = await elevatedQuery(query, options);

      const entries = availability?.availabilityEntries || [];

      const slots = entries
        .filter(entry => entry.bookable)
        .map(entry => {
          const slot = entry.slot || {};
          const startDateStr = slot.startDate;
          if (!startDateStr) return null;

          const start = new Date(startDateStr);
          const timeStr = start.toLocaleTimeString('es-ES', {
            timeZone: TIMEZONE,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });

          return {
            startTime: timeStr,
            staffId: slot.resource?.id || null,
            _slotStartDate: slot.startDate,
            _slotEndDate: slot.endDate,
            _resourceId: slot.resource?.id || null,
            _sessionId: slot.sessionId || null
          };
        })
        .filter(Boolean);

      const tiempoConsulta = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`${TAG} \u2705 ${slots.length} slots disponibles (${tiempoConsulta}s)`);

      return { ok: true, slots, tiempoConsulta };
    } catch (e) {
      const tiempoConsulta = ((Date.now() - t0) / 1000).toFixed(1);
      console.error(`${TAG} \u274c consultarDisponibilidadSimple:`, e.message);
      return { ok: false, error: { message: e.message }, slots: [], tiempoConsulta };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 3. RESERVAR SERVICIO SIMPLE
// ═══════════════════════════════════════════════════════════════════════════
// FLUJO:
//   1. getService → scheduleId + location + duración REAL + precio REAL + nombre
//   2. madridToUTC para construir startDate en UTC correcto
//   3. ensureContactInCRM → garantizar contacto CRM
//   4. createBooking con rate.labeledPriceOptions + paymentOptions
//   5. createCheckout + createOrder  ← ORDER PRIMERO
//   6. confirmBooking               ← CONFIRM DESPUÉS
//   7. Marcar RECEPCION (extended fields)
//   8. v1.5.0: notificarConfirmacion via centralita ← NUEVO
// ═══════════════════════════════════════════════════════════════════════════

export const reservarSimple = webMethod(
  Permissions.Anyone,
  async ({ serviceId, fechaISO, horaHHmm, empleadoId, durationMinutes, price, variantLabel, contactDetails, modoPago, memberContactId, origenRecepcion = false }) => {
    const t0 = Date.now();
    try {
      console.log(`${TAG} \ud83c\udfaf Reservar simple: ${serviceId} | ${fechaISO} ${horaHHmm} | staff=${empleadoId} | dur_param=${durationMinutes}min | price_param=${price}\u20ac${origenRecepcion ? ' [SKIP-AVAILABILITY]' : ''}`);
console.warn(`${TAG} 📅 Reserva entrante: fecha=${fechaISO} hora=${horaHHmm} servicio=${serviceId} variante=${variantLabel||'-'} cliente=${contactDetails?.firstName||''} ${contactDetails?.lastName||''} tel=${contactDetails?.phone||''} origen=${origenRecepcion?'RECEPCION':'WEB'}`);
      // ── 1. Leer servicio de Wix para obtener scheduleId, location, duración y precio REALES ──
      const elevatedGet = elevate(services.getService);
      const svcResult = await elevatedGet(serviceId);
      const svc = svcResult?.service || svcResult || {};

      const scheduleId = extractScheduleId(svc);
      const location = extractLocation(svc);

      // v1.2.0: Duración y precio REALES de Wix
      const realDuration = extractDuration(svc, durationMinutes);
      const realPrice = extractPrice(svc, price);

      // v1.5.0: Nombre legible del servicio para la confirmación
      const realServiceName = extractServiceName(svc);

      console.log(`${TAG} \ud83d\udccb Service data: scheduleId=${scheduleId} | location=${JSON.stringify(location)} | realDuration=${realDuration}min | realPrice=${realPrice}\u20ac | name=${realServiceName}`);

      // ── 2. Construir startDate y endDate — MADRID → UTC ──
      const startUTC = madridToUTC(fechaISO, horaHHmm);
      const endUTC = addMinutes(startUTC, realDuration);

      console.log(`${TAG} \ud83d\udd50 Hora Madrid: ${horaHHmm} \u2192 UTC start: ${startUTC} | end: ${endUTC}`);

      // ── 3. Resolver resourceId — OBLIGATORIO ──
      const resourceId = (empleadoId && empleadoId !== 'ANY') ? empleadoId : null;
      if (!resourceId) {
        console.error(`${TAG} \u274c resourceId es obligatorio. empleadoId recibido: '${empleadoId}'`);
        return { ok: false, error: { message: 'Debe seleccionar un empleado concreto (no ANY/null)' }, tiempoReserva: ((Date.now() - t0) / 1000).toFixed(1) };
      }

      // ── 4. v1.4.0: Garantizar contacto CRM — TODOS LOS CANALES ──
      const finalContactId = await ensureContactInCRM(contactDetails, memberContactId);

      // ── 5. Crear booking ──
      const cd = {};
      cd.firstName = contactDetails?.firstName || 'Cliente';
      if (contactDetails?.lastName) cd.lastName = contactDetails.lastName;
      if (contactDetails?.email) cd.email = contactDetails.email;
      if (contactDetails?.phone) cd.phone = contactDetails.phone;

      const bookingInfo = {
        bookedEntity: {
          slot: {
            serviceId,
            scheduleId,
            startDate: startUTC,
            endDate: endUTC,
            timezone: TIMEZONE,
            resource: { id: resourceId },
            location
          },
          rate: {
            labeledPriceOptions: {
              general: {
                amount: String(realPrice),
                currency: "EUR",
                downPayAmount: "0"
              }
            }
          }
        },
        numberOfParticipants: 1,
        contactDetails: cd,
        selectedPaymentOption: 'OFFLINE'
      };

      // v1.4.0: Vincular contacto CRM al booking
      if (finalContactId && isGuid(finalContactId)) {
        bookingInfo.contactId = finalContactId;
      }

      const options = {
        paymentOptions: { wixPayOffline: {} },
        suppressAuth: true
      };

      // v1.3.0: Solapamiento forzado cuando viene de recepción/checkout (strict equality)
      if (origenRecepcion === true) {
        options.flowControlSettings = { skipAvailabilityValidation: true };
        console.log(`${TAG} \u26a1 flowControlSettings.skipAvailabilityValidation = true`);
      }

      console.log(`${TAG} \ud83d\udce6 Booking payload:`, JSON.stringify(bookingInfo));

      const elevatedCreate = elevate(bookings.createBooking);
      const result = await elevatedCreate(bookingInfo, options);

      const bookingId = result?._id || result?.id || result?.booking?._id;
      const revision = result?.revision || result?.booking?.revision;

      console.log(`${TAG} \ud83d\udccb Booking creado: id=${bookingId} rev=${revision}`);

      // ── 6. CREAR ORDER (ANTES de confirm) ──
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
          await elevatedCreateOrder(checkoutResult._id, {
            payNow: { option: "FULL_PAYMENT_OFFLINE" }
          });
          console.log(`${TAG} \u2705 Order creada con precio ${realPrice}\u20ac`);
        }
      } catch (orderErr) {
        console.warn(`${TAG} \u26a0\ufe0f Order WARN:`, orderErr.message);
      }

      // ── 7. Confirmar booking (DESPUÉS de Order) ──
      try {
        if (revision != null && result?.status !== 'CONFIRMED' && result?.booking?.status !== 'CONFIRMED') {
          const elevatedConfirm = elevate(bookings.confirmBooking);
          await elevatedConfirm(bookingId, revision, {
            participantNotification: { notifyParticipants: false }
          });
          console.log(`${TAG} \u2705 Booking confirmado`);
        }
      } catch (confErr) {
        console.warn(`${TAG} \u26a0\ufe0f confirmBooking WARN:`, confErr.message);
      }

      // ── 8. Marcar origen RECEPCION ──
      try {
        const elevatedUpdate = elevate(bookings.updateExtendedFields);
        await elevatedUpdate(bookingId, '_user_fields', {
          namespaceData: { reservaderecepcion: 'RECEPCION' }
        });
        console.log(`${TAG} \u2705 Marcado RECEPCION`);
      } catch (extErr) {
        console.warn(`${TAG} \u26a0\ufe0f marcarRecepcion WARN:`, extErr.message);
      }

      // ── 9. v1.5.0: Notificación al cliente vía centralita ──
      // No-blocking: si la centralita falla, la reserva ya está creada,
      // confirmada y marcada — el cliente simplemente no recibe la
      // notificación, igual que en v1.4.0 y anteriores.
      try {
        const fechaBonita = formatFechaEmail(fechaISO);
        const horaFinal = calcularHoraFinal(horaHHmm, realDuration);
        const staffName = getStaffNameById(resourceId);
        // Si hay variantLabel (ej: "Recogido fiesta") lo añadimos al nombre del servicio
        const serviciosStr = variantLabel
          ? `${realServiceName} (${variantLabel})`
          : realServiceName;
        const importeStr = `${realPrice}\u20ac`;
        const estadoPagoStr = modoPago === 'ONLINE' ? 'Pagado online \u2714' : 'Pago en sal\u00f3n';

        await notificarConfirmacion({
          contactId:     finalContactId,
          email:         contactDetails?.email || '',
          telefono:      contactDetails?.phone || '',
          nombreCliente: `${cd.firstName}${cd.lastName ? ' ' + cd.lastName : ''}`.trim(),
          fecha:         fechaBonita,
          hora:          horaHHmm,
          servicios:     serviciosStr,
          estilista:     staffName,
          // emailVariables: idénticas en estructura a coloracionLogic v3.2.7
          // y tratamientosLogic v1.0.9, para que el template Wix VA5UQRG
          // reciba los mismos campos.
          emailVariables: {
            Fecha:         fechaBonita,
            Nombre:        cd.firstName,
            Apellido:      cd.lastName || '',
            servicios:     serviciosStr,
            profesional:   staffName,
            horaInicio:    horaHHmm,
            horaFinal:     horaFinal,
            importeTotal:  importeStr,
            origen:        origenRecepcion ? 'Recepci\u00f3n PRO' : 'Reserva Online',
            estadoPago:    estadoPagoStr,
            SITE_URL:      'https://www.hair-times.com'
          }
        });
        console.log(`${TAG} \u2705 Notificaci\u00f3n via centralita enviada`);
      } catch (notifErr) {
        console.error(`${TAG} \u26a0\ufe0f Error en notificarConfirmacion (no-blocking): ${notifErr.message}`);
      }

      const tiempoReserva = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`${TAG} \u2705 Reserva creada: ${bookingId} | ${realDuration}min | ${realPrice}\u20ac (${tiempoReserva}s)`);

      return {
        ok: true,
        bookingId,
        price: realPrice,
        duration: realDuration,
        tiempoReserva
      };
    } catch (e) {
      const tiempoReserva = ((Date.now() - t0) / 1000).toFixed(1);
      console.error(`${TAG} \u274c reservarSimple:`, e.message);
      console.error(`${TAG} \u274c Stack:`, e.stack);
      return { ok: false, error: { message: e.message }, tiempoReserva };
    }
  }
);

