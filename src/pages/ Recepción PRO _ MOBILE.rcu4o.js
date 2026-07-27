// =====================================================
// KAMISUITE — Page Code: Recepción PRO Mobile
// =====================================================
// VERSION: 0.2.4
// FECHA: 3 de junio de 2026
// Página: /recepcionpromobile
// Custom Element ID en Editor: kamisuiteBookingLite (tag: kamisuite-booking-lite)
//
// Comunicación:
//   Page → Element: el.setAttribute('response', JSON.stringify({type, ...data, ts}))
//   Element → Page: el.on('booking-message', handler)  (CustomEvent)
//
// Backends utilizados (NO modificados):
//   calendarioVista.web.js        → getStaffResources, getTodasReservasDia, getCalendarioSettings
//   serviceCatalogLogic.web.js    → getCatalogoMobile (v1.1.0)
//   recepcionLogic.web.js         → cargarTodosContactos, crearContacto
//   simplesLogic.web.js           → getVariantsCMS, reservarSimple
//   coloracionLogic.web.js        → getMapeoMechas, confirmarEnCalendario
//   tratamientosLogic.web.js      → getMapeoTratamiento, confirmarEnCalendario
//   testCheckout.web.js           → getBookingsAgrupados, cancelarBookingsPack (v0.2.3)
//
// Todas las firmas copiadas literalmente de pagecode_recepcionPRO v2.1.6.
//
// CHANGELOG:
//   v0.2.4 — Ocultar Wix Smart Chat en esta página interna.
//     · El asistente de IA de Wix (burbuja flotante, elemento global del
//       sitio) debe seguir activo en la web pública para clientes, pero NO
//       en esta página interna. Se oculta SOLO aquí con $w(...).hide() dentro
//       del onReady. No se toca el site code global (eso lo quitaría en toda
//       la web, incluida la pública). Solo funciona en el sitio PUBLICADO,
//       no en el preview del Editor. Línea aditiva con try/catch.
//     · NOTA: en móvil hide() sobre el chat de Wix puede no bastar (limitación
//       conocida de la plataforma). Si la burbuja sigue saliendo en el móvil
//       real, requiere plan B (ocultar por CSS). Pendiente de verificar.
//   v0.2.3 — NEW: Cancelar reserva desde AppointmentDetail.
//     · handleGetReservasDia carga packs en paralelo con getBookingsAgrupados
//       (mismo patrón que pagecode_recepcionPRO handleGetReservas: Promise.all
//       de getTodasReservasDia + getBookingsAgrupados). El CE necesita los
//       packs para resolver la cascada completa de bookingIds al cancelar.
//     · Nuevo handler handleCancelarReserva → cancelarBookingsPack({ bookingIds }),
//       firma idéntica a la usada por PRO (checkout-delete).
//     · reservas-dia ahora incluye 'packs'. Cambio aditivo: si el CE no los
//       usa, no rompe nada.
//     · Cero modificación de handlers existentes (reserva, contactos, opciones).
//   v0.2.2 — Log diagnóstico: cuando recibe reservas del backend imprime
//     desglose por resourceId y staffConfig efectivo. Aparece en Google Cloud.
//   v0.2.1 — FIX: ensureContactId() antes de cada reserva, igual que producción
//     PRO. Para clientes nuevos crea el contacto primero y luego reserva con
//     el memberContactId resultante.
//   v0.2.0 — Fase 1+2+3 completas. Reservas SIMPLES, COLORACIÓN y TRATAMIENTO.
//     Nuevos handlers: cargarCacheContactos (background), buscarCliente,
//     crearContacto, getServiceOptions (returns addon spec dinámico),
//     crearReserva (router por family).
//   v0.1.2 — kickoff proactivo de handleReady().
//   v0.1.1 — firma exacta getTodasReservasDia.
//   v0.1.0 — Fase 0 calendario read-only.
// =====================================================

// ── Calendar Vista ──
import {
  getStaffResources,
  getTodasReservasDia,
  getCalendarioSettings
} from 'backend/calendarioVista.web.js';

// ── ServiceCatalog ──
import { getCatalogoMobile } from 'backend/serviceCatalogLogic.web';

// ── Recepción / Contactos ──
import { cargarTodosContactos, crearContacto } from 'backend/recepcionLogic.web';

// ── Simples (variantes + reserva) ──
import {
  getVariantsCMS,
  reservarSimple as reservarSimpleBackend
} from 'backend/simplesLogic.web';

// ── Coloración ──
import {
  getMapeoMechas,
  confirmarEnCalendario as confirmarColor
} from 'backend/coloracionLogic.web';

// ── Tratamientos ──
import {
  getMapeoTratamiento,
  confirmarEnCalendario as confirmarTrat
} from 'backend/tratamientosLogic.web';

// ── Checkout (packs + cancelar) — v0.2.3 ──
import {
  getBookingsAgrupados,
  cancelarBookingsPack
} from 'backend/testCheckout.web';

const TAG = '[BookingLitePage v0.2.2]';
const PRELOAD_BATCH = 5;

let _el = null;
let _staff = [];
let _staffScheduleMap = {};
let _externalResourceIds = [];
let _cacheContactos = [];
let _cacheReady = false;

function sendResponse(type, data = {}) {
  if (!_el) return;
  try {
    _el.setAttribute('response', JSON.stringify({ type, ...data, ts: Date.now() }));
  } catch (e) {
    console.error(`${TAG} ❌ sendResponse:`, e?.message);
  }
}

function addDaysISO(iso, delta) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =====================================================
// INIT: staff + settings + catálogo en paralelo
// =====================================================
async function handleReady() {
  console.log(`${TAG} 📱 CE listo. Cargando datos iniciales en paralelo…`);
  try {
    const [staffRes, settingsRes, catalogoRes] = await Promise.all([
      getStaffResources(),
      getCalendarioSettings(),
      getCatalogoMobile()
    ]);

    if (!staffRes?.ok) {
      sendResponse('error', { message: staffRes?.error?.message || 'Error staff' });
      return;
    }

    _staff = staffRes.staff || [];
    _staffScheduleMap = {};
    _externalResourceIds = [];
    for (const s of _staff) {
      if (s.scheduleId) _staffScheduleMap[s.scheduleId] = s.id;
      if (s.isExternal) _externalResourceIds.push(s.id);
    }

    const settings = settingsRes?.ok ? (settingsRes.settings || {}) : {};
    const catalogo = catalogoRes?.ok ? (catalogoRes.servicios || []) : [];

    console.log(`${TAG} 🎯 Init OK: ${_staff.length} staff · ${catalogo.length} servicios · schedules=${Object.keys(_staffScheduleMap).length} · externos=${_externalResourceIds.length}`);
    // Diagnóstico v0.2.2: imprime staff y su config para ver visible/position
    for (const s of _staff) {
      const cfg = (settings.staffConfig || {})[s.id] || {};
      console.log(`${TAG} 👤 Staff id=${s.id} name="${s.name}" visible=${cfg.visible !== false} position=${cfg.position || '?'} schedule=${s.scheduleId || '-'} ext=${!!s.isExternal}`);
    }
    sendResponse('init-data', { staff: _staff, settings, catalogo });

    // Cargar contactos en background (no bloqueamos la primera renderización)
    cargarCacheContactosBackground();
  } catch (e) {
    console.error(`${TAG} ❌ handleReady:`, e?.message);
    sendResponse('error', { message: 'Error cargando datos iniciales' });
  }
}

// =====================================================
// CACHE DE CONTACTOS (background)
// =====================================================
async function cargarCacheContactosBackground() {
  try {
    const result = await cargarTodosContactos();
    if (result?.ok) {
      _cacheContactos = result.clientes || [];
      _cacheReady = true;
      console.log(`${TAG} 👥 Cache de clientes lista: ${_cacheContactos.length}`);
      sendResponse('contactos-cache-ready', { total: _cacheContactos.length });
    } else {
      console.warn(`${TAG} ⚠️ cargarTodosContactos sin ok`);
    }
  } catch (e) {
    console.error(`${TAG} ❌ cargarCacheContactos:`, e?.message);
  }
}

// =====================================================
// RESERVAS — un solo día
// =====================================================
async function handleGetReservasDia(fecha) {
  if (!fecha) return;
  try {
    // v0.2.3: reservas + packs en paralelo, igual que pagecode_recepcionPRO
    // handleGetReservas (Promise.all de getTodasReservasDia + getBookingsAgrupados).
    const [result, packsResult] = await Promise.all([
      getTodasReservasDia({
        fecha,
        staffScheduleMap: _staffScheduleMap,
        externalResourceIds: _externalResourceIds
      }),
      getBookingsAgrupados({ fechaISO: fecha })
    ]);
    const packs = packsResult?.ok ? (packsResult.packs || []) : [];
    if (!result?.ok) {
      sendResponse('reservas-dia', { fecha, reservas: [], packs });
      return;
    }
    // Diagnóstico v0.2.2: desglose por resourceId
    const reservas = result.reservas || [];
    const breakdown = {};
    for (const r of reservas) {
      const rid = r.resourceId || 'NO_RESOURCE';
      if (!breakdown[rid]) breakdown[rid] = [];
      breakdown[rid].push(`${r.startTime||'?'}-${(r.durMin||0)}min "${(r.servicio||'').substring(0,30)}" tipo=${r.tipo||'?'}`);
    }
    console.log(`${TAG} 📅 ${fecha}: ${reservas.length} reservas, ${packs.length} packs. Desglose por resourceId:`);
    for (const rid in breakdown) {
      const inStaff = _staff.find(s => s.id === rid);
      console.log(`${TAG}   resourceId=${rid} ${inStaff?`(${inStaff.name})`:'⚠️ NO_EN_STAFF'} → ${breakdown[rid].length} reservas: ${breakdown[rid].join(' | ')}`);
    }
    sendResponse('reservas-dia', { fecha, reservas, packs });
  } catch (e) {
    console.error(`${TAG} ❌ handleGetReservasDia ${fecha}:`, e?.message);
    sendResponse('reservas-dia', { fecha, reservas: [], packs: [] });
  }
}

// =====================================================
// PRE-CARGA — N días en batches paralelos
// =====================================================
async function handlePreloadReservas(fechaBase, dias) {
  if (!fechaBase || !dias || dias < 1) return;
  console.log(`${TAG} 📦 Pre-carga iniciada: ${dias} días desde ${fechaBase}`);
  const t0 = Date.now();
  const fechas = [];
  for (let i = 1; i <= dias; i++) fechas.push(addDaysISO(fechaBase, i));

  let cargados = 0;
  for (let i = 0; i < fechas.length; i += PRELOAD_BATCH) {
    const batch = fechas.slice(i, i + PRELOAD_BATCH);
    const resultados = await Promise.all(batch.map(async f => {
      try {
        const r = await getTodasReservasDia({
          fecha: f,
          staffScheduleMap: _staffScheduleMap,
          externalResourceIds: _externalResourceIds
        });
        return [f, (r?.ok ? r.reservas : []) || []];
      } catch (e) {
        return [f, []];
      }
    }));
    const porFecha = {};
    for (const [f, reservas] of resultados) porFecha[f] = reservas;
    cargados += batch.length;
    sendResponse('reservas-rango', { porFecha });
  }
  console.log(`${TAG} ✅ Pre-carga completa: ${cargados} días en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// =====================================================
// CLIENTES — buscar (in-memory)
// =====================================================
function handleBuscarCliente(msg) {
  const q = String(msg?.query || '').trim().toLowerCase();
  if (!_cacheReady) {
    sendResponse('clientes-encontrados', { clientes: [], cacheReady: false });
    return;
  }
  if (q.length < 2) {
    sendResponse('clientes-encontrados', { clientes: [], cacheReady: true });
    return;
  }
  const qPhone = q.replace(/[\s\-\(\)]/g, '');
  const filtered = _cacheContactos.filter(c => {
    const n = (c.nombreCompleto || '').toLowerCase();
    const e = (c.email || '').toLowerCase();
    const t = (c.telefono || '').replace(/[\s\-\(\)]/g, '');
    return n.includes(q) || e.includes(q) || t.includes(qPhone);
  });
  sendResponse('clientes-encontrados', {
    clientes: filtered.slice(0, 20),
    total: filtered.length,
    cacheReady: true
  });
}

// =====================================================
// CLIENTES — crear nuevo
// =====================================================
async function handleCrearContacto(msg) {
  try {
    const result = await crearContacto({
      nombre: msg.nombre || '',
      apellido: msg.apellido || '',
      telefono: msg.telefono || '',
      email: msg.email || ''
    });
    if (result?.ok && result?.cliente) {
      _cacheContactos.push(result.cliente);
    }
    sendResponse('contacto-creado', { data: result || { ok: false } });
  } catch (e) {
    sendResponse('contacto-creado', { data: { ok: false, error: { message: e?.message } } });
  }
}

// =====================================================
// SERVICE OPTIONS — devuelve addon spec según family
// =====================================================
async function handleGetServiceOptions(msg) {
  const { serviceId, family, hasVariants } = msg || {};
  if (!serviceId) {
    sendResponse('service-options', { serviceId, addons: [] });
    return;
  }
  try {
    // ── Caso 1: servicio simple con variantes ──
    if (family === 'simple' && hasVariants) {
      const r = await getVariantsCMS({ serviceId });
      const variants = (r?.ok ? (r.variants || []) : []);
      const options = variants.map(v => ({
        id: v.serviceId || `v_${v.label}`,
        name: `${v.label} · ${v.durationMinutes} min · ${v.priceEuro}€`,
        meta: {
          variantSubstituteServiceId: v.serviceId || null,
          variantDuration: v.durationMinutes,
          variantPrice: v.priceEuro,
          variantLabel: v.label
        }
      }));
      sendResponse('service-options', {
        serviceId,
        addons: options.length ? [{
          id: 'variante', kind: 'chips', label: 'Variante', required: true, options
        }] : []
      });
      return;
    }

    // ── Caso 2: coloración (mapeo de mechas/tinte/...) ──
    if (family === 'coloracion') {
      const r = await getMapeoMechas({ serviceId });
      const mapeo = r?.ok ? r.mapeo : null;
      if (!mapeo) {
        sendResponse('service-options', { serviceId, addons: [] });
        return;
      }
      const addons = [];

      // Peinado (solo opciones con ID válido en el mapeo)
      const peinadoOpts = [];
      if (mapeo.ids.peinadoS)   peinadoOpts.push({ id: 'S',           name: `Peinado S · ${mapeo.mins.peinadoS} min` });
      if (mapeo.ids.peinadoM)   peinadoOpts.push({ id: 'M',           name: `Peinado M · ${mapeo.mins.peinadoM} min` });
      if (mapeo.ids.peinadoL)   peinadoOpts.push({ id: 'L',           name: `Peinado L · ${mapeo.mins.peinadoL} min` });
      if (mapeo.ids.peinadoXl)  peinadoOpts.push({ id: 'XL',          name: `Peinado XL · ${mapeo.mins.peinadoXl} min` });
      if (mapeo.ids.secado)     peinadoOpts.push({ id: 'SECADO',      name: `Solo secado · ${mapeo.mins.secado || 15} min` });
      peinadoOpts.push({ id: 'SIN PEINADO', name: 'Sin peinado' });
      if (peinadoOpts.length > 1) {
        addons.push({ id: 'peinadoValue', kind: 'chips', label: 'Peinado', required: true, options: peinadoOpts });
      }

      // Tratamiento (solo opciones con ID válido)
      const tratOpts = [];
      if (mapeo.ids.tratKerastase)  tratOpts.push({ id: 'KERASTASE',  name: `Kerastase · ${mapeo.mins.tratKerastase} min` });
      if (mapeo.ids.tratHairtimes)  tratOpts.push({ id: 'HAIRTIMES',  name: `HairTimes · ${mapeo.mins.tratHairtimes} min` });
      if (mapeo.ids.matiz)          tratOpts.push({ id: 'MATIZ',      name: `Matiz · ${mapeo.mins.matiz} min` });
      tratOpts.push({ id: 'SIN TRATAMIENTO', name: 'Sin tratamiento' });
      if (tratOpts.length > 1) {
        addons.push({ id: 'tratamientoValue', kind: 'chips', label: 'Tratamiento', required: true, options: tratOpts });
      }

      // Corte (toggle, si el mapeo tiene corte)
      if (mapeo.ids.corte) {
        addons.push({ id: 'corteChecked', kind: 'toggle', label: `Añadir corte · ${mapeo.mins.corte || 0} min` });
      }

      // Tinte completo (toggle, si el mapeo tiene idTotal)
      if (mapeo.ids.total) {
        addons.push({ id: 'totalChecked', kind: 'toggle', label: `Tinte completo (no solo raíz)` });
      }

      sendResponse('service-options', { serviceId, addons });
      return;
    }

    // ── Caso 3: tratamiento ──
    if (family === 'tratamiento') {
      const r = await getMapeoTratamiento({ serviceId });
      const mapeo = r?.ok ? r.mapeo : null;
      if (!mapeo) {
        sendResponse('service-options', { serviceId, addons: [] });
        return;
      }
      const addons = [];

      // Longitud (solo opciones con aplicación válida)
      const longOpts = [];
      if (mapeo.ids.aplicacionM)  longOpts.push({ id: 'M',  name: 'Pelo medio' });
      if (mapeo.ids.aplicacionL)  longOpts.push({ id: 'L',  name: 'Pelo largo' });
      if (mapeo.ids.aplicacionXl) longOpts.push({ id: 'XL', name: 'Pelo extra largo' });
      if (longOpts.length) {
        addons.push({ id: 'longitudPelo', kind: 'chips', label: 'Longitud de pelo', required: true, options: longOpts });
      }

      // Corte
      if (mapeo.ids.corte) {
        addons.push({ id: 'corteChecked', kind: 'toggle', label: `Añadir corte · ${mapeo.mins.corte || 0} min` });
      }

      sendResponse('service-options', { serviceId, addons });
      return;
    }

    // ── Caso 4: simple sin variantes — no hay addons ──
    sendResponse('service-options', { serviceId, addons: [] });
  } catch (e) {
    console.error(`${TAG} ❌ handleGetServiceOptions:`, e?.message);
    sendResponse('service-options', { serviceId, addons: [], error: e?.message });
  }
}

// =====================================================
// ENSURE CONTACT ID (patrón exacto de pagecode_recepcionPRO líneas 372-381)
// =====================================================
async function ensureContactId(msg) {
  if (msg.memberContactId) return msg.memberContactId;
  const cd = msg.contactDetails || {};
  if (!cd.firstName && !cd.phone && !cd.email) return null;
  try {
    const res = await crearContacto({
      nombre: cd.firstName || '',
      apellido: cd.lastName || '',
      telefono: cd.phone || '',
      email: cd.email || ''
    });
    if (res?.ok && res?.contactId) {
      _cacheContactos.push(res.cliente);
      return res.contactId;
    }
  } catch (e) { /* silencioso */ }
  return null;
}

// =====================================================
// CREAR RESERVA — router por family
// =====================================================
async function handleCrearReserva(msg) {
  const {
    family, serviceId, fechaISO, horaHHmm, empleadoId,
    durationMinutes, price, variantLabel, variantServiceId,
    contactDetails, memberContactId,
    // addons coloración
    peinadoValue, tratamientoValue, corteChecked, totalChecked,
    // addons tratamiento
    longitudPelo
  } = msg || {};

  if (!serviceId || !fechaISO || !horaHHmm || !empleadoId) {
    sendResponse('reserva-creada', { ok: false, error: { message: 'Faltan parámetros obligatorios' } });
    return;
  }

  try {
    // Crear contacto si es cliente nuevo (igual que producción PRO)
    const cidReal = await ensureContactId({
      memberContactId,
      contactDetails: contactDetails || {}
    });
    const memberContactIdFinal = cidReal || memberContactId || null;

    let result;
    if (family === 'coloracion') {
      result = await confirmarColor({
        publicServiceId: serviceId,
        fechaISO,
        horaHHmm,
        empleadoId,
        empleado2Id: null,
        peinadoValue: peinadoValue || '',
        tratamientoValue: tratamientoValue || '',
        corteChecked: !!corteChecked,
        totalChecked: !!totalChecked,
        contactDetails: contactDetails || {},
        modoPago: 'LOCAL',
        guardarNota: false,
        memberContactId: memberContactIdFinal,
        origenRecepcion: true
      });
    } else if (family === 'tratamiento') {
      result = await confirmarTrat({
        publicServiceId: serviceId,
        fechaISO,
        horaHHmm,
        empleadoId,
        empleado2Id: null,
        longitudPelo: longitudPelo || 'M',
        corteChecked: !!corteChecked,
        contactDetails: contactDetails || {},
        modoPago: 'LOCAL',
        guardarNota: false,
        memberContactId: memberContactIdFinal,
        origenRecepcion: true
      });
    } else {
      // family === 'simple' (con o sin variante)
      // Si hay variante, el serviceId, durationMinutes y price deben ser los de la variante
      const finalServiceId = variantServiceId || serviceId;
      result = await reservarSimpleBackend({
        serviceId: finalServiceId,
        fechaISO,
        horaHHmm,
        empleadoId,
        durationMinutes: (typeof durationMinutes === 'number') ? durationMinutes : null,
        price: (typeof price === 'number') ? price : null,
        variantLabel: variantLabel || null,
        contactDetails: contactDetails || {},
        modoPago: 'LOCAL',
        memberContactId: memberContactIdFinal,
        origenRecepcion: true
      });
    }

    sendResponse('reserva-creada', result || { ok: false, error: { message: 'Sin respuesta del backend' } });

    // Si fue OK, invalidamos la cache del día para forzar recarga
    if (result?.ok) {
      // Pequeño delay para dar tiempo al backend a indexar
      setTimeout(() => {
        handleGetReservasDia(fechaISO);
      }, 800);
    }
  } catch (e) {
    console.error(`${TAG} ❌ handleCrearReserva:`, e?.message);
    sendResponse('reserva-creada', { ok: false, error: { message: e?.message || 'Error creando reserva' } });
  }
}

// =====================================================
// CANCELAR RESERVA — cancela todos los bookingIds del pack
// (firma idéntica a pagecode_recepcionPRO handleCheckoutDelete)
// =====================================================
async function handleCancelarReserva(msg) {
  const ids = Array.isArray(msg?.bookingIds) ? msg.bookingIds.filter(Boolean) : [];
  if (!ids.length) {
    sendResponse('reserva-cancelada', { ok: false, error: 'No se proporcionaron bookingIds' });
    return;
  }
  try {
    const res = await cancelarBookingsPack({ bookingIds: ids });
    if (res?.ok) {
      sendResponse('reserva-cancelada', { ok: true, mensaje: res.mensaje || 'Reserva cancelada', fecha: msg.fecha || null });
      // Recargar el día tras un pequeño delay para que Wix indexe la cancelación
      if (msg.fecha) {
        setTimeout(() => { handleGetReservasDia(msg.fecha); }, 800);
      }
    } else {
      sendResponse('reserva-cancelada', { ok: false, error: res?.error || 'Error al cancelar' });
    }
  } catch (e) {
    console.error(`${TAG} ❌ handleCancelarReserva:`, e?.message);
    sendResponse('reserva-cancelada', { ok: false, error: e?.message || 'Error al cancelar' });
  }
}

// =====================================================
// MOUNT
// =====================================================
$w.onReady(() => {
  console.log(`${TAG} 👂 Listener activo`);

  // v0.2.4: ocultar el Wix Smart Chat (asistente IA de Wix) SOLO en esta
  // página interna. Sigue activo en la web pública para clientes. Solo surte
  // efecto en el sitio publicado, no en el preview del Editor. try/catch por
  // si el elemento aún no está montado (resistente a elementos faltantes).
  try { $w('#f6B6E28D52B24De6Aab3Ff2Ccad8E2291').hide(); } catch (e) { /* chat no presente */ }

  _el = $w('#kamisuiteBookingLite');
  if (!_el) { console.error(`${TAG} ❌ Elemento #kamisuiteBookingLite no encontrado.`); return; }

  _el.on('booking-message', (event) => {
    const msg = event?.detail || {};
    if (!msg.type) return;
    try {
      switch (msg.type) {
        case 'ready':                  handleReady(); break;
        case 'get-reservas-dia':       handleGetReservasDia(msg.fecha); break;
        case 'preload-reservas':       handlePreloadReservas(msg.fechaBase, msg.dias); break;
        case 'buscar-cliente':         handleBuscarCliente(msg); break;
        case 'crear-contacto':         handleCrearContacto(msg); break;
        case 'get-service-options':    handleGetServiceOptions(msg); break;
        case 'crear-reserva':          handleCrearReserva(msg); break;
        case 'cancelar-reserva':       handleCancelarReserva(msg); break;
        default: console.warn(`${TAG} ⚠️ Tipo desconocido: ${msg.type}`);
      }
    } catch (err) {
      console.error(`${TAG} ❌ Error handler ${msg.type}:`, err?.message);
      sendResponse('error', { message: err?.message || 'Error inesperado' });
    }
  });

  // Kickoff proactivo (igual que pagecode_recepcionPRO)
  handleReady();
});