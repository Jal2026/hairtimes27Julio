// ═══════════════════════════════════════════════════════════════
// Page Code — Reservas y Pagos Editor  v2.3.0
// Bridge entre widget HTML y paymentReservationsLogic.web.js
// ═══════════════════════════════════════════════════════════════
// CHANGELOG:
//   v2.3.0 (14-ago-2026) — EMISIÓN DE TICKET / FACTURA desde el Editor.
//     Motivo: un cliente que vuelve días después a pedir su factura se
//     localiza aquí en segundos (todos los cobros, con buscador y
//     filtros); en Recepción PRO hay que dar con el día y la cita.
//
//     Tres handlers nuevos que envuelven facturacionSalonLogic v1.0.6:
//       'obtenerDocPago'     → 'docPago'
//       'generarTicketPago'  → 'ticketPagoGenerado'
//       'generarFacturaPago' → 'facturaPagoGenerada'
//
//     EL ROUTING VIVE AQUÍ, no en el widget. El widget manda siempre el
//     bookingId de la fila y este page code decide la familia:
//       · 'KRI_…' → cita  → *Cita({ reservaId: bookingId.slice(4) })
//       · resto   → venta → *Venta({ sourceKey: bookingId })
//         (TIENDA con orderId de Wix Stores, ESP_ de venta manual)
//     Así el widget no duplica una regla de negocio que ya vive en el
//     backend, y añadir una familia nueva se hace en un solo sitio.
//
//     Errores y 'duplicado' se propagan tal cual: el widget los pinta.
//     No se interpreta ni se reescribe ningún mensaje del backend.
//
//     Requiere facturacionSalonLogic v1.0.6 (el fix de _pagoVigente es
//     OBLIGATORIO: sin él, una fila anulada puede acabar facturada).
//     Contrapartida en widget: edicionpagoswidget v2.4.0.
//
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

// v2.3.0 — Emisión de documentos de venta (facturacionSalonLogic v1.0.6)
import {
  obtenerDocumentoReserva,
  generarTicketCita,
  generarFacturaCita,
  obtenerDocumentoVenta,
  generarTicketVenta,
  generarFacturaVenta
} from 'backend/facturacionSalonLogic.web';

// v2.3.0 — Familia de un cobro a partir de su bookingId.
// 'KRI_' = cita interna (4 chars, mismo prefijo que recepcionProLogic
// y paymentReservationsLogic). Cualquier otro prefijo es venta sin cita.
const PREFIJO_CITA = 'KRI_';
function familiaDeCobro(bookingId) {
  const b = String(bookingId || '');
  if (b.startsWith(PREFIJO_CITA)) {
    const reservaId = b.slice(4);
    return reservaId ? { tipo: 'cita', reservaId } : null;
  }
  return b ? { tipo: 'venta', sourceKey: b } : null;
}

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

    // ── v2.3.0 — ¿Tiene ya documento este cobro? ──
    // El widget lo llama al abrir el modal para decidir entre pintar
    // los botones [Ticket] [Factura] o el badge "Ya facturado".
    if (msg.type === 'obtenerDocPago') {
      try {
        const { bookingId } = msg.payload || {};
        const fam = familiaDeCobro(bookingId);
        if (!fam) {
          widget.postMessage({ type: 'docPago', payload: { existe: false, sinClave: true } });
          return;
        }
        const result = (fam.tipo === 'cita')
          ? await obtenerDocumentoReserva({ reservaId: fam.reservaId })
          : await obtenerDocumentoVenta({ sourceKey: fam.sourceKey });
        if (result && result.ok) {
          widget.postMessage({
            type: 'docPago',
            payload: { existe: !!result.existe, documento: result.documento || null }
          });
        } else {
          // No es un error de usuario: el modal se abre igual, solo que
          // sin saber si hay documento. Se avisa sin bloquear.
          widget.postMessage({
            type: 'docPago',
            payload: { existe: false, error: (result && result.error) || 'No se pudo consultar' }
          });
        }
      } catch (err) {
        widget.postMessage({ type: 'docPago', payload: { existe: false, error: err.message || 'Error inesperado' } });
      }
    }

    // ── v2.3.0 — Emitir TICKET (factura simplificada) ──
    if (msg.type === 'generarTicketPago') {
      try {
        const { bookingId } = msg.payload || {};
        const fam = familiaDeCobro(bookingId);
        if (!fam) {
          widget.postMessage({ type: 'ticketPagoGenerado', payload: { ok: false, error: 'Cobro sin bookingId: no se puede emitir documento.' } });
          return;
        }
        const result = (fam.tipo === 'cita')
          ? await generarTicketCita({ reservaId: fam.reservaId })
          : await generarTicketVenta({ sourceKey: fam.sourceKey });
        widget.postMessage({ type: 'ticketPagoGenerado', payload: result || { ok: false, error: 'Sin respuesta del backend' } });
      } catch (err) {
        widget.postMessage({ type: 'ticketPagoGenerado', payload: { ok: false, error: err.message || 'Error inesperado' } });
      }
    }

    // ── v2.3.0 — Emitir FACTURA COMPLETA ──
    // vatId / legalName son opcionales: si no vienen, el backend los
    // busca en el CRM del contacto. Si tampoco están ahí devuelve un
    // error claro y el widget despliega el formulario para capturarlos.
    if (msg.type === 'generarFacturaPago') {
      try {
        const { bookingId, vatId, legalName } = msg.payload || {};
        const fam = familiaDeCobro(bookingId);
        if (!fam) {
          widget.postMessage({ type: 'facturaPagoGenerada', payload: { ok: false, error: 'Cobro sin bookingId: no se puede emitir documento.' } });
          return;
        }
        const result = (fam.tipo === 'cita')
          ? await generarFacturaCita({ reservaId: fam.reservaId, vatId, legalName })
          : await generarFacturaVenta({ sourceKey: fam.sourceKey, vatId, legalName });
        widget.postMessage({ type: 'facturaPagoGenerada', payload: result || { ok: false, error: 'Sin respuesta del backend' } });
      } catch (err) {
        widget.postMessage({ type: 'facturaPagoGenerada', payload: { ok: false, error: err.message || 'Error inesperado' } });
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
