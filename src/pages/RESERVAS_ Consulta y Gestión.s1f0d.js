// =====================================================
// PAGE CODE — Mi Espacio (Members Area Custom Page)
// HTML Component ID: #htmlMiEspacio
// Backend: memberAreaLogic.web.js + testCheckout.web.js
// =====================================================
// v1.0 - Próximas, Anteriores, Cancelar, Cambiar fecha, Repetir
// v1.0.1 - FIX: pasar email del member para fallback en filtrado
// v1.0.2 - FIX: pre-carga datos en paralelo con widget init
// v1.0.3 - FIX: onMessage antes de await + dataPromise cubre
//          getMember+getMisCitas para eliminar race condition móvil
// =====================================================

import { getMisCitas, cancelarMiCita, cancelarMiCitaExterno } from 'backend/memberAreaLogic.web';
import { consultarSlotsParaCambio, cambiarFechaBookings } from 'backend/testCheckout.web';
import { currentMember } from 'wix-members-frontend';
import wixLocationFrontend from 'wix-location-frontend';

const TAG = '[MiEspacio v1.0.3]';

$w.onReady(async function () {

  const widget = $w('#htmlMiEspacio');
  let memberContactId = '';
  let memberEmail = '';
  let cachedData = null;

  function sendToWidget(type, data) {
    widget.postMessage({ type, ...data });
  }

  // ─── dataPromise: cubre TODO el flujo async (getMember + getMisCitas) ───
  // Se asigna ANTES de registrar onMessage para que nunca sea null
  const dataPromise = (async () => {
    try {
      const member = await currentMember.getMember();
      memberContactId = member?.contactId || '';
      memberEmail = member?.loginEmail || '';
      console.log(`${TAG} 👤 Member contactId: ${memberContactId} | email: ${memberEmail}`);

      if (!memberContactId) {
        cachedData = { ok: false, error: 'No se pudo identificar tu sesión' };
        return;
      }

      console.log(`${TAG} ⏳ Cargando citas...`);
      const res = await getMisCitas({ contactId: memberContactId, email: memberEmail });
      if (res?.ok) {
        cachedData = { ok: true, proximas: res.proximas, anteriores: res.anteriores };
      } else {
        cachedData = { ok: false, error: res?.error?.message || 'Error cargando tus citas' };
      }
    } catch (err) {
      console.error(`${TAG} ❌ init:`, err);
      cachedData = { ok: false, error: err.message };
    }
    console.log(`${TAG} ✅ Datos listos: ok=${cachedData?.ok}`);
  })();

  // ─── Enviar datos al widget (siempre espera a que dataPromise termine) ───
  async function sendCachedData() {
    await dataPromise;
    if (cachedData?.ok) {
      sendToWidget('data', { proximas: cachedData.proximas, anteriores: cachedData.anteriores });
    } else {
      sendToWidget('error', { message: cachedData?.error || 'Error cargando tus citas' });
    }
  }

  // ─── Recargar datos frescos (después de cancelar/reschedule) ───
  async function reloadCitas() {
    sendToWidget('loading', {});
    try {
      const res = await getMisCitas({ contactId: memberContactId, email: memberEmail });
      if (res?.ok) {
        cachedData = { ok: true, proximas: res.proximas, anteriores: res.anteriores };
        sendToWidget('data', { proximas: res.proximas, anteriores: res.anteriores });
      } else {
        sendToWidget('error', { message: res?.error?.message || 'Error cargando tus citas' });
      }
    } catch (err) {
      console.error(`${TAG} ❌ reloadCitas:`, err);
      sendToWidget('error', { message: err.message });
    }
  }

  // ─── REGISTRAR onMessage (síncrono, dataPromise ya existe) ───
  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'ready') {
      console.log(`${TAG} 📨 Widget ready recibido`);
      await sendCachedData();
      return;
    }

    // ─── CANCELAR ───
    if (msg.type === 'cancelar') {
      console.log(`${TAG} 🗑️ Cancelar: externo=${msg.isExterno}`);
      try {
        let res;
        if (msg.isExterno) {
          res = await cancelarMiCitaExterno({
            contactId: memberContactId,
            registroId: msg.registroId,
            sessionId: msg.sessionId
          });
        } else {
          res = await cancelarMiCita({
            contactId: memberContactId,
            bookingIds: msg.bookingIds
          });
        }

        if (res?.ok) {
          sendToWidget('cancelOk', { message: 'Cita cancelada' });
          await reloadCitas();
        } else {
          sendToWidget('cancelError', { message: res?.error?.message || res?.error || 'Error al cancelar' });
        }
      } catch (err) {
        console.error(`${TAG} ❌ cancelar:`, err);
        sendToWidget('cancelError', { message: err.message });
      }
      return;
    }

    // ─── CONSULTAR SLOTS PARA CAMBIAR FECHA ───
    if (msg.type === 'querySlots') {
      console.log(`${TAG} 📅 querySlots: ${msg.fechaISO} | svc=${msg.serviceId}`);
      try {
        const res = await consultarSlotsParaCambio({
          fechaISO: msg.fechaISO,
          serviceId: msg.serviceId,
          staffId: msg.staffId || null
        });
        sendToWidget('slotsResult', { slots: res?.slots || [], ok: res?.ok || false });
      } catch (err) {
        console.error(`${TAG} ❌ querySlots:`, err);
        sendToWidget('slotsResult', { slots: [], ok: false, error: err.message });
      }
      return;
    }

    // ─── CAMBIAR FECHA (RESCHEDULE) ───
    if (msg.type === 'reschedule') {
      console.log(`${TAG} 📅 reschedule: ${msg.servicios?.length} svcs → ${msg.nuevaFechaISO} ${msg.nuevaHoraHHmm}`);
      try {
        const res = await cambiarFechaBookings({
          servicios: msg.servicios,
          nuevaFechaISO: msg.nuevaFechaISO,
          nuevaHoraHHmm: msg.nuevaHoraHHmm,
          forzado: false
        });

        if (res?.ok) {
          sendToWidget('rescheduleOk', { message: 'Cita cambiada correctamente' });
          await reloadCitas();
        } else {
          sendToWidget('rescheduleError', { message: res?.error || 'Error al cambiar fecha' });
        }
      } catch (err) {
        console.error(`${TAG} ❌ reschedule:`, err);
        sendToWidget('rescheduleError', { message: err.message });
      }
      return;
    }

    // ─── REPETIR → navegar a página de reservas ───
    if (msg.type === 'repetir') {
      console.log(`${TAG} 🔄 Repetir: ${msg.titulo}`);
      wixLocationFrontend.to('/reservas2');
      return;
    }

    // ─── RESIZE ───
    if (msg.type === 'resize' && msg.height > 100) {
      widget.style.height = `${msg.height}px`;
    }
  });

  // Esperar a que termine la carga (para que $w.onReady no cierre antes)
  await dataPromise;
});

