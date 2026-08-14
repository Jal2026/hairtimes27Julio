// ═══════════════════════════════════════════════════════════════
// Page Code — Reservas y Pagos Editor  v2.2.0
// Bridge entre widget HTML y paymentReservationsLogic.web.js
// ═══════════════════════════════════════════════════════════════
// CHANGELOG:
//   v2.2.0 (14-ago-2026) — ANULACIÓN DE COBROS. Nuevo handler
//     'anular' → anularPaymentReservation({_id, motivo, usuario}).
//     Responde 'anulado' / 'anularError'.
//
//     OJO: este page code NO es un pass-through ciego. El handler
//     'delete' desestructura {_id} del payload, así que cualquier
//     campo nuevo enviado por el widget se perdería aquí. Por eso
//     el handler 'anular' desestructura los TRES campos explícita-
//     mente. Si mañana se añade un cuarto (p.ej. adjuntar el
//     justificante), hay que tocar también este archivo.
//
//     El handler 'delete' se CONSERVA intacto por retrocompatibi-
//     lidad durante el despliegue: con page code v2.2.0 ya pegado
//     y widget v2.2.0 todavía en producción, el botón Borrar sigue
//     funcionando. Una vez el widget v2.3.0 esté desplegado en
//     TODOS los salones, este handler y el import de
//     eliminarPaymentReservation pueden retirarse.
//
//     Requiere backend paymentReservationsLogic v1.4.0.
//     Contrapartida en widget: edicionpagoswidget v2.3.0.
//
//   v2.1.0 (1-ago-2026) — HARD DELETE. Nuevos handlers 'avisosBorrado'
//     (getAvisosBorradoReserva) y 'hardDelete' (eliminarReservaCompleta).
//     Contrato CRUD previo intacto.
//   v2.0.0 (25-jun-2026) — SIMPLIFICACIÓN CRUD PURO.
//     · Eliminados imports de resolverContactIdsReales y exportarTodoJSON
//       (el widget ya no expone diagnóstico CRM ni exportación).
//     · Eliminados handlers 'resolveRealCids' y 'exportJSON' (muertos).
//     · Se conservan: 'ready', 'refresh', 'save', 'delete' — el contrato
//       postMessage del CRUD queda intacto.
//   v1.3.0 (7-may-2026) — handlers 'delete' y 'refresh'.
//   v1.2.1/v1.2.0/v1.1.0/v1.0.0 — diagnóstico CRM (retirado en v2.0.0).
// ═══════════════════════════════════════════════════════════════

import {
  listarPaymentReservations,
  actualizarPaymentReservation,
  eliminarPaymentReservation,
  anularPaymentReservation,
  getAvisosBorradoReserva,
  eliminarReservaCompleta
} from 'backend/paymentReservationsLogic.web';

$w.onReady(function () {
  const widget = $w('#htmlPaymentReservations');

  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    // ── Widget listo: cargar datos ──
    if (msg.type === 'ready') {
      try {
        const result = await listarPaymentReservations();
        if (result.success) {
          widget.postMessage({
            type: 'data',
            payload: { items: result.items, total: result.total }
          });
        } else {
          widget.postMessage({
            type: 'error',
            message: result.error || 'Error cargando datos'
          });
        }
      } catch (err) {
        widget.postMessage({
          type: 'error',
          message: err.message || 'Error inesperado'
        });
      }
    }

    // ── Refrescar lista completa (mismo handler que ready) ──
    if (msg.type === 'refresh') {
      try {
        const result = await listarPaymentReservations();
        if (result.success) {
          widget.postMessage({
            type: 'data',
            payload: { items: result.items, total: result.total, isRefresh: true }
          });
        } else {
          widget.postMessage({
            type: 'refreshError',
            message: result.error || 'Error refrescando datos'
          });
        }
      } catch (err) {
        widget.postMessage({
          type: 'refreshError',
          message: err.message || 'Error inesperado'
        });
      }
    }

    // ── Guardar edición ──
    if (msg.type === 'save') {
      try {
        const { _id, campos } = msg.payload;
        const result = await actualizarPaymentReservation(_id, campos);
        if (result.success) {
          widget.postMessage({
            type: 'saved',
            payload: { item: result.item }
          });
        } else {
          widget.postMessage({
            type: 'saveError',
            message: result.error || 'Error guardando'
          });
        }
      } catch (err) {
        widget.postMessage({
          type: 'saveError',
          message: err.message || 'Error inesperado'
        });
      }
    }

    // ── Eliminar registro (LEGACY — ver nota v2.2.0 en cabecera) ──
    if (msg.type === 'delete') {
      try {
        const { _id } = msg.payload || {};
        if (!_id) {
          widget.postMessage({
            type: 'deleteError',
            message: '_id no proporcionado'
          });
          return;
        }
        const result = await eliminarPaymentReservation(_id);
        if (result.success) {
          widget.postMessage({
            type: 'deleted',
            payload: { deletedId: result.deletedId }
          });
        } else {
          widget.postMessage({
            type: 'deleteError',
            message: result.error || 'Error eliminando'
          });
        }
      } catch (err) {
        widget.postMessage({
          type: 'deleteError',
          message: err.message || 'Error inesperado'
        });
      }
    }

    // ── ANULAR COBRO (v2.2.0) ──
    // Sustituye funcionalmente a 'delete' desde el widget v2.3.0.
    // El cobro NO se borra: se marca ANULADO y se crea la fila de
    // reversión. motivo es obligatorio (lo valida también el backend).
    if (msg.type === 'anular') {
      try {
        const { _id, motivo, usuario } = msg.payload || {};
        if (!_id) {
          widget.postMessage({
            type: 'anularError',
            message: '_id no proporcionado'
          });
          return;
        }
        const result = await anularPaymentReservation({ _id, motivo, usuario });
        if (result && result.success) {
          widget.postMessage({
            type: 'anulado',
            payload: {
              anuladoId: result.anuladoId,
              reversionId: result.reversionId,
              importeRevertido: result.importeRevertido,
              reservaRevertida: result.reservaRevertida,
              avisos: result.avisos
            }
          });
        } else {
          widget.postMessage({
            type: 'anularError',
            message: (result && result.error) || 'Error anulando el cobro'
          });
        }
      } catch (err) {
        widget.postMessage({
          type: 'anularError',
          message: err.message || 'Error inesperado'
        });
      }
    }

    // ── HARD DELETE: avisos previos (canje / factura / nº cobros) ──
    if (msg.type === 'avisosBorrado') {
      try {
        const { reservaId } = msg.payload || {};
        const result = await getAvisosBorradoReserva({ reservaId });
        if (result && result.ok) {
          widget.postMessage({
            type: 'avisosResult',
            payload: { reservaId, reserva: result.reserva, avisos: result.avisos }
          });
        } else {
          widget.postMessage({
            type: 'hardDeleteError',
            message: (result && result.error) || 'No se pudieron leer los avisos'
          });
        }
      } catch (err) {
        widget.postMessage({ type: 'hardDeleteError', message: err.message || 'Error inesperado' });
      }
    }

    // ── HARD DELETE: borrado total de la reserva ──
    if (msg.type === 'hardDelete') {
      try {
        const { reservaId } = msg.payload || {};
        const result = await eliminarReservaCompleta({ reservaId });
        if (result && result.success) {
          widget.postMessage({
            type: 'hardDeleted',
            payload: {
              reservaId,
              avisos: result.avisos,
              sessionesBorradas: result.sessionesBorradas,
              cobrosBorrados: result.cobrosBorrados
            }
          });
        } else {
          widget.postMessage({
            type: 'hardDeleteError',
            message: (result && result.error) || 'No se pudo borrar la reserva'
          });
        }
      } catch (err) {
        widget.postMessage({ type: 'hardDeleteError', message: err.message || 'Error inesperado' });
      }
    }
  });
});
