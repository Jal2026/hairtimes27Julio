// =====================================================
// PAGE CODE — Recepción Interna Check-in
// HTML Component ID: #htmlRecepcion
// =====================================================
// v2.3.0 - HOTFIX: Restaurar handlers perdidos en publicación
//   - RESTAURADO: case 'ready' + cargarCache() al arrancar
//   - RESTAURADO: case 'buscarCliente' + buscarLocal() + handleSearch()
//   - RESTAURADO: case 'getStaff' + handleGetStaff()
//   - RESTAURADO: case 'consultarColoracion' + handleConsultarColoracion()
//   - RESTAURADO: case 'consultarTratamiento' + handleConsultarTratamiento()
//   - RESTAURADO: imports getMapeoMechas, consultarColor, getMapeoTratamiento, consultarTrat
//   - RESTAURADO: cacheContactos + cacheReady + push en crearContacto/ensureContactId
//   - SIN CAMBIOS: handleReservarColoracion, handleReservarTratamiento, handleReservarSimple,
//     handleConsultarOcupados, handleGetVariants, handleConsultarSimple, ensureContactId
// v2.2.0 - Garantizar contacto en CRM antes de reservar
// v2.1.1 - FIX: Import simplesLogic.web (era simplesLogic sin extensión)
// v2.1.0 - NEW: Servicios simples (getVariants, consultarSimple, reservarSimple)
// v2.0.2 - NEW: Consulta ocupados (calendarioLogic)
// v2.0.1 - FIX: sendToWidget helper
// v2.0.0 - Base: coloracionLogic + tratamientosLogic + recepcionLogic
// =====================================================

import { cargarTodosContactos, crearContacto } from 'backend/recepcionLogic.web';

// ── Coloración ──
import {
  getStaffResources as getStaffColor,
  getMapeoMechas,
  consultarDisponibilidadUnificada as consultarColor,
  confirmarEnCalendario as confirmarColor
} from 'backend/coloracionLogic.web';

// ── Tratamientos ──
import {
  getStaffResources as getStaffTrat,
  getMapeoTratamiento,
  consultarDisponibilidadUnificada as consultarTrat,
  confirmarEnCalendario as confirmarTrat
} from 'backend/tratamientosLogic.web';

import { getBookingsDelDia } from 'backend/calendarioLogic.web';

// ── Simples ──
// v2.1.1: Cambiado de 'backend/simplesLogic' a 'backend/simplesLogic.web'
import {
  getVariantsCMS,
  consultarDisponibilidadSimple,
  reservarSimple as reservarSimpleBackend
} from 'backend/simplesLogic.web';

const TAG = '[RecepcionPage][v2.3.0]';

// =====================================================
// STATE — Caché de contactos
// =====================================================

let cacheContactos = [];
let cacheReady = false;

// =====================================================
// HELPERS
// =====================================================

function sendToWidget(type, data = {}) {
  try {
    $w('#htmlRecepcion').postMessage({ type, ...data });
  } catch (e) {
    console.error(`${TAG} ❌ sendToWidget(${type}):`, e.message);
  }
}

// =====================================================
// CACHÉ DE CONTACTOS (recepcionLogic)
// =====================================================

async function cargarCache() {
  console.log(`${TAG} 📥 Cargando caché de contactos...`);
  sendToWidget('loading', { message: 'Cargando base de clientes...' });

  try {
    const result = await cargarTodosContactos();

    if (result.ok) {
      cacheContactos = result.clientes || [];
      cacheReady = true;
      console.log(`${TAG} ✅ Caché cargada: ${cacheContactos.length} contactos`);
      sendToWidget('cacheReady', { total: cacheContactos.length });
    } else {
      console.error(`${TAG} ❌ Error cargando caché:`, result.error);
      sendToWidget('error', { message: 'Error cargando base de clientes' });
    }
  } catch (e) {
    console.error(`${TAG} ❌ Error cargando caché:`, e);
    sendToWidget('error', { message: 'Error cargando base de clientes' });
  }
}

// =====================================================
// BÚSQUEDA LOCAL EN CACHÉ
// =====================================================

function buscarLocal(query) {
  if (!cacheReady) {
    return { ok: false, message: 'Caché no lista' };
  }

  const searchTerm = String(query).trim().toLowerCase();
  if (searchTerm.length < 2) {
    return { ok: true, clientes: [], message: 'Mínimo 2 caracteres' };
  }

  const searchPhone = searchTerm.replace(/[\s\-\(\)]/g, '');

  const filtered = cacheContactos.filter(c => {
    const nombre = (c.nombreCompleto || '').toLowerCase();
    const email = (c.email || '').toLowerCase();
    const telefono = (c.telefono || '').replace(/[\s\-\(\)]/g, '');

    return nombre.includes(searchTerm) ||
           email.includes(searchTerm) ||
           telefono.includes(searchPhone);
  });

  const limitados = filtered.slice(0, 20);

  return {
    ok: true,
    clientes: limitados,
    totalEncontrados: filtered.length,
    mostrados: limitados.length
  };
}

// =====================================================
// HANDLERS — Contactos
// =====================================================

function handleSearch(msg) {
  console.log(`${TAG} 🔍 Buscando local: "${msg.query}"`);

  const result = buscarLocal(msg.query);

  if (result.ok) {
    console.log(`${TAG} ✅ Encontrados: ${result.totalEncontrados} (mostrando ${result.mostrados})`);
    sendToWidget('clientesEncontrados', {
      clientes: result.clientes,
      totalEncontrados: result.totalEncontrados,
      mostrados: result.mostrados
    });
  } else {
    sendToWidget('clientesEncontrados', { clientes: [] });
  }
}

async function handleCrearContacto(msg) {
  try {
    console.log(`${TAG} ➕ Crear contacto: ${msg.nombre} ${msg.apellido}`);
    const result = await crearContacto({
      nombre: msg.nombre,
      apellido: msg.apellido,
      telefono: msg.telefono,
      email: msg.email
    });

    if (result.ok) {
      // Añadir al caché local
      cacheContactos.push(result.cliente);
      console.log(`${TAG} ✅ Contacto creado y añadido a caché: ${result.contactId}`);
    }

    sendToWidget('contactoCreado', { data: result });
  } catch (e) {
    console.error(`${TAG} ❌ crearContacto:`, e.message);
    sendToWidget('contactoCreado', { data: { ok: false, error: { message: e.message } } });
  }
}

// =====================================================
// HANDLER — getStaff
// =====================================================

async function handleGetStaff(msg) {
  try {
    console.log(`${TAG} 👥 Cargando staff para ${msg.familia}/${msg.serviceId}`);

    let staffResult;
    let assignedStaffIds = [];

    if (msg.familia === 'coloracion') {
      const mapeoResult = await getMapeoMechas({ serviceId: msg.serviceId });
      if (mapeoResult.ok && mapeoResult.assignedStaffIds) {
        assignedStaffIds = mapeoResult.assignedStaffIds;
      }
      staffResult = await getStaffColor();
    } else if (msg.familia === 'tratamiento') {
      const mapeoResult = await getMapeoTratamiento({ serviceId: msg.serviceId });
      if (mapeoResult.ok && mapeoResult.assignedStaffIds) {
        assignedStaffIds = mapeoResult.assignedStaffIds;
      }
      staffResult = await getStaffTrat();
    } else if (msg.familia === 'simple') {
      // v2.1.0: Servicios simples — reutilizar staff de coloración (mismos recursos)
      staffResult = await getStaffColor();
    } else {
      staffResult = await getStaffColor(); // fallback
    }

    if (!staffResult?.ok) {
      sendToWidget('staffCargado', { staff: [] });
      return;
    }

    let filteredStaff = staffResult.staff.filter(s => s?.label && s?.resourceId);
    if (assignedStaffIds.length > 0) {
      const assignedSet = new Set(assignedStaffIds);
      filteredStaff = filteredStaff.filter(s => assignedSet.has(s.resourceId));
    }

    sendToWidget('staffCargado', { staff: filteredStaff });
    console.log(`${TAG} ✅ Staff cargado: ${filteredStaff.length}`);

  } catch (e) {
    console.error(`${TAG} ❌ getStaff:`, e.message);
    sendToWidget('staffCargado', { staff: [] });
  }
}

// =====================================================
// HANDLERS — Consultar disponibilidad
// =====================================================

async function handleConsultarColoracion(msg) {
  try {
    console.log(`${TAG} 📅 Consultar coloración: ${msg.publicServiceId}`);

    const result = await consultarColor({
      publicServiceId: msg.publicServiceId,
      fecha: msg.fecha,
      staffId: msg.staffId,
      staff2Id: msg.staff2Id,
      complementos: {
        peinadoKey: msg.peinado || null,
        tratamientoKey: msg.tratamiento || null,
        corte: msg.corte || false,
        total: msg.tinteCompleto || false
      }
    });

    sendToWidget('slotsDisponibles', { data: result });

  } catch (e) {
    console.error(`${TAG} ❌ consultarColoracion:`, e.message);
    sendToWidget('slotsDisponibles', { data: { ok: false, error: { message: e.message } } });
  }
}

async function handleConsultarTratamiento(msg) {
  try {
    console.log(`${TAG} 📅 Consultar tratamiento: ${msg.publicServiceId}`);

    const result = await consultarTrat({
      publicServiceId: msg.publicServiceId,
      fecha: msg.fecha,
      staffId: msg.staffId,
      staff2Id: msg.staff2Id,
      complementos: {
        longitudPelo: msg.longitudPelo || 'M',
        corte: msg.corte || false
      }
    });

    sendToWidget('slotsDisponibles', { data: result });

  } catch (e) {
    console.error(`${TAG} ❌ consultarTratamiento:`, e.message);
    sendToWidget('slotsDisponibles', { data: { ok: false, error: { message: e.message } } });
  }
}

// =====================================================
// v2.2.0: Garantizar que el contacto exista en CRM antes de reservar
// =====================================================

async function ensureContactId(msg) {
  if (msg.memberContactId) return msg.memberContactId;

  const cd = msg.contactDetails || {};
  if (!cd.firstName && !cd.phone && !cd.email) return null;

  try {
    console.log(`${TAG} 🔍 ensureContactId: buscando/creando contacto...`);
    const res = await crearContacto({
      nombre: cd.firstName || '',
      apellido: cd.lastName || '',
      telefono: cd.phone || '',
      email: cd.email || ''
    });
    if (res?.ok && res?.contactId) {
      cacheContactos.push(res.cliente);
      console.log(`${TAG} ✅ ContactId obtenido: ${res.contactId}`);
      return res.contactId;
    }
  } catch (e) {
    console.error(`${TAG} ⚠️ ensureContactId falló:`, e.message);
  }
  return null;
}

// =====================================================
// HANDLERS — Reservar (COLORACIÓN)
// =====================================================

async function handleReservarColoracion(msg) {
  try {
    console.log(`${TAG} 🎯 Reservar coloración: ${msg.publicServiceId}`);

    // v2.2.0: Garantizar contacto en CRM
    msg.memberContactId = await ensureContactId(msg);

    console.log(`${TAG} 📦 Datos reserva:`, JSON.stringify({
      publicServiceId: msg.publicServiceId,
      fechaISO: msg.fechaISO,
      horaHHmm: msg.horaHHmm,
      empleadoId: msg.empleadoId,
      empleado2Id: msg.empleado2Id,
      totalChecked: msg.totalChecked,
      modoPago: msg.modoPago
    }));

    const result = await confirmarColor({
      publicServiceId: msg.publicServiceId,
      fechaISO: msg.fechaISO,
      horaHHmm: msg.horaHHmm,
      empleadoId: msg.empleadoId,
      empleado2Id: msg.empleado2Id,
      peinadoValue: msg.peinadoValue,
      tratamientoValue: msg.tratamientoValue,
      corteChecked: msg.corteChecked,
      totalChecked: msg.totalChecked,
      contactDetails: msg.contactDetails,
      modoPago: msg.modoPago,
      guardarNota: msg.guardarNota || false,
      memberContactId: msg.memberContactId,
      origenRecepcion: true
    });

    sendToWidget('reservaCompletada', { data: result });

  } catch (e) {
    console.error(`${TAG} ❌ reservarColoracion:`, e.message);
    sendToWidget('reservaCompletada', { data: { ok: false, error: { message: e.message } } });
  }
}

// =====================================================
// HANDLERS — Reservar (TRATAMIENTO)
// =====================================================

async function handleReservarTratamiento(msg) {
  try {
    console.log(`${TAG} 🎯 Reservar tratamiento`);

    // v2.2.0: Garantizar contacto en CRM
    msg.memberContactId = await ensureContactId(msg);

    const result = await confirmarTrat({
      publicServiceId: msg.publicServiceId,
      fechaISO: msg.fechaISO,
      horaHHmm: msg.horaHHmm,
      empleadoId: msg.empleadoId,
      empleado2Id: msg.empleado2Id,
      longitudPelo: msg.longitudPelo,
      corteChecked: msg.corteChecked,
      contactDetails: msg.contactDetails,
      modoPago: msg.modoPago,
      guardarNota: msg.guardarNota || false,
      memberContactId: msg.memberContactId,
      origenRecepcion: true
    });

    sendToWidget('reservaCompletada', { data: result });

  } catch (e) {
    console.error(`${TAG} ❌ reservarTratamiento:`, e.message);
    sendToWidget('reservaCompletada', { data: { ok: false, error: { message: e.message } } });
  }
}

// =====================================================
// v2.0.2: CONSULTA OCUPADOS (calendarioLogic)
// =====================================================

async function handleConsultarOcupados(msg) {
  try {
    console.log(`${TAG} 🔍 Consultar ocupados: ${msg.fecha} | Staff: ${msg.staffId}${msg.modoTodos ? ' [TODOS]' : ''}`);

    const result = await getBookingsDelDia({
      fecha: msg.fecha,
      staffId: msg.staffId
    });

    sendToWidget('ocupadosCargados', {
      data: result,
      staffLabel: msg.staffLabel || '',
      modoTodos: msg.modoTodos || false
    });

  } catch (e) {
    console.error(`${TAG} ❌ consultarOcupados:`, e.message);
    sendToWidget('ocupadosCargados', {
      data: { ok: false, error: { message: e.message } },
      staffLabel: msg.staffLabel || '',
      modoTodos: msg.modoTodos || false
    });
  }
}

// =====================================================
// v2.1.0: SERVICIOS SIMPLES (simplesLogic)
// =====================================================

async function handleGetVariants(msg) {
  try {
    console.log(`${TAG} 📋 Variantes para ${msg.serviceId}`);
    const result = await getVariantsCMS({ serviceId: msg.serviceId });
    sendToWidget('variantesCargadas', { variants: result.variants || [] });
  } catch (e) {
    console.error(`${TAG} ❌ getVariants:`, e.message);
    sendToWidget('variantesCargadas', { variants: [] });
  }
}

async function handleConsultarSimple(msg) {
  try {
    console.log(`${TAG} 📅 Consultar simple: ${msg.serviceId} | ${msg.fecha} | staff=${msg.staffId} | dur=${msg.durationMinutes}min`);

    const result = await consultarDisponibilidadSimple({
      serviceId: msg.serviceId,
      fecha: msg.fecha,
      staffId: msg.staffId,
      durationMinutes: msg.durationMinutes
    });

    // Añadir precio al resultado
    if (result.ok) {
      result.precio = { total: msg.price };
    }

    sendToWidget('slotsDisponibles', { data: result });
  } catch (e) {
    console.error(`${TAG} ❌ consultarSimple:`, e.message);
    sendToWidget('slotsDisponibles', { data: { ok: false, error: { message: e.message } } });
  }
}

async function handleReservarSimple(msg) {
  try {
    console.log(`${TAG} 🎯 Reservar simple: ${msg.serviceId} | ${msg.fechaISO} ${msg.horaHHmm}`);

    // v2.2.0: Garantizar contacto en CRM
    msg.memberContactId = await ensureContactId(msg);

    const result = await reservarSimpleBackend({
      serviceId: msg.serviceId,
      fechaISO: msg.fechaISO,
      horaHHmm: msg.horaHHmm,
      empleadoId: msg.empleadoId,
      durationMinutes: msg.durationMinutes,
      price: msg.price,
      variantLabel: msg.variantLabel,
      contactDetails: msg.contactDetails,
      modoPago: msg.modoPago,
      memberContactId: msg.memberContactId,
      origenRecepcion: true
    });

    sendToWidget('reservaCompletada', { data: result });
  } catch (e) {
    console.error(`${TAG} ❌ reservarSimple:`, e.message);
    sendToWidget('reservaCompletada', { data: { ok: false, error: { message: e.message } } });
  }
}

// =====================================================
// ON READY
// =====================================================

$w.onReady(function () {
  console.log(`${TAG} ✅ Page ready`);

  $w('#htmlRecepcion').onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    console.log(`${TAG} 📨 Mensaje recibido: ${msg.type}`);

    switch (msg.type) {
      // ── Contactos ──
      case 'ready':
        if (cacheReady) {
          sendToWidget('cacheReady', { total: cacheContactos.length });
        }
        break;
      case 'buscarCliente':
        handleSearch(msg);
        break;
      case 'crearContacto':
        await handleCrearContacto(msg);
        break;

      // ── Staff ──
      case 'getStaff':
        await handleGetStaff(msg);
        break;

      // ── Disponibilidad ──
      case 'consultarColoracion':
        await handleConsultarColoracion(msg);
        break;
      case 'consultarTratamiento':
        await handleConsultarTratamiento(msg);
        break;

      // ── Reservar ──
      case 'reservarColoracion':
        await handleReservarColoracion(msg);
        break;
      case 'reservarTratamiento':
        await handleReservarTratamiento(msg);
        break;

      // ── Ocupados ──
      case 'consultarOcupados':
        await handleConsultarOcupados(msg);
        break;

      // ── Simples ──
      case 'getVariants':
        await handleGetVariants(msg);
        break;
      case 'consultarSimple':
        await handleConsultarSimple(msg);
        break;
      case 'reservarSimple':
        await handleReservarSimple(msg);
        break;

      default:
        console.warn(`${TAG} ⚠️ Tipo desconocido: ${msg.type}`);
    }
  });

  // Cargar caché de contactos al arrancar
  cargarCache();

  console.log(`${TAG} 👂 Listener activo, caché iniciada`);
});