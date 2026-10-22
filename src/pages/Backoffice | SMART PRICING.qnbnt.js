/* ═══════════════════════════════════════════════════════════════
   pagecode_smart_pricing.js  v1.0.2
   KAMISUITE — Page code de la página de gestión de Smart Pricing
   ═══════════════════════════════════════════════════════════════
   CHANGELOG
   v1.0.2 · 22 Oct 2026 · Interruptores DÍAS / HORAS
     - 'spAnalizar' trae `interruptores` { dias, horas } y se pasa tal cual
       a analizarYProponer (smartPricingLogic v1.0.4), que decide qué tipos
       de oferta puede proponer AKIRA.
   v1.0.1 · 22 Oct 2026 · Meses quitados del análisis
     - 'spAnalizar' trae `mesesExcluidos` ['YYYY-MM', …] y se pasa tal cual
       a analizarYProponer (smartPricingLogic v1.0.1). El backend los
       valida; aquí solo se asegura que sea un array.
   v1.0.0 · 21 Oct 2026 · Creación (smart pricing, fase 1)
     - Puente entre el widget HTML de gestión y smartPricingLogic v1.0.0.
     - Mensajes del widget → page code:
         · 'spReady'    → estado (interruptor, versión vigente, último
                          análisis). El widget lo repite cada 800 ms hasta
                          recibir 'spEstado' (regla de reintento de KAMISUITE).
         · 'spAnalizar' { semanas, solicitudId } → analizarYProponer.
         · 'spElegir'   { versionId, opcion }     → elegirPropuesta.
     - Page code → widget: 'spEstado', 'spAnalizando', 'spAnalisisListo',
       'spElegido'. Objeto directo en postMessage, nunca JSON.stringify
       (patrón KAMISUITE desde el 10-may-2026: falla en móvil).
     - EL TECHO DE 14 s DE WIX. El análisis llama a la IA y puede pasar de
       14 s: Wix corta la respuesta, pero el backend sigue y termina. Si la
       llamada falla, este page code consulta el estado cada 3 s (máx. 2
       min) hasta ver el análisis con el mismo solicitudId en 'ok' o
       'error'. Mismo remedio que AKIRA aplicó a su 504 (20-ago-2026).

   ELEMENTO EN LA PÁGINA: componente HTML con ID #htmlSmartPricing
   BACKEND: smartPricingLogic.web.js v1.0.4
   ═══════════════════════════════════════════════════════════════ */

import { currentMember } from 'wix-members-frontend';
import { getEstadoSmartPricing, analizarYProponer, elegirPropuesta } from 'backend/smartPricingLogic.web';

const TAG = '[SmartPricingPage][v1.0.2]';
const WIDGET_ID = '#htmlSmartPricing';
const POLL_MS = 3000;
const POLL_MAX = 40;   // 40 × 3 s = 2 minutos

$w.onReady(async function () {
  const widget = $w(WIDGET_ID);

  // Quién elige la opción (queda guardado en la versión). Mismo patrón de
  // lectura de miembro que el page code de reserva.
  let nombreUsuario = '';
  try {
    const member = await currentMember.getMember();
    const cd = (member && member.contactDetails) || {};
    nombreUsuario = `${cd.firstName || ''} ${cd.lastName || ''}`.trim() || (member && member.loginEmail) || '';
  } catch (e) {
    nombreUsuario = '';
  }

  function sendToWidget(data) {
    widget.postMessage(data);
  }

  async function leerEstado() {
    const r = await getEstadoSmartPricing();
    return r;
  }

  async function esperarAnalisis(solicitudId) {
    for (let i = 0; i < POLL_MAX; i++) {
      await new Promise(resolve => setTimeout(resolve, POLL_MS));
      try {
        const r = await leerEstado();
        const p = r && r.ultimo && r.ultimo.propuestas;
        if (p && p.solicitudId === solicitudId && p.estado !== 'calculando') {
          sendToWidget({
            type: 'spAnalisisListo',
            ok: p.estado === 'ok',
            estado: r,
            message: p.estado === 'ok' ? '' : (p.mensaje || 'AKIRA no ha podido preparar las propuestas.')
          });
          return;
        }
      } catch (e) {
        console.warn(`${TAG} ⚠️ consulta de estado durante el análisis: ${e.message}`);
      }
    }
    sendToWidget({
      type: 'spAnalisisListo',
      ok: false,
      message: 'AKIRA está tardando más de lo normal. Vuelve a abrir esta pantalla en unos minutos.'
    });
  }

  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {

      case 'spReady': {
        try {
          const r = await leerEstado();
          sendToWidget({
            type: 'spEstado',
            ok: !!(r && r.ok),
            estado: r,
            message: (r && r.ok) ? '' : 'No se ha podido cargar el smart pricing. Recarga la página.'
          });
        } catch (err) {
          console.error(`${TAG} ❌ spReady:`, err.message);
          sendToWidget({ type: 'spEstado', ok: false, message: 'No se ha podido cargar el smart pricing. Recarga la página.' });
        }
        break;
      }

      case 'spAnalizar': {
        const solicitudId = String(msg.solicitudId || Date.now());
        sendToWidget({ type: 'spAnalizando' });
        try {
          const mesesExcluidos = Array.isArray(msg.mesesExcluidos) ? msg.mesesExcluidos : [];
          const interruptores = (msg.interruptores && typeof msg.interruptores === 'object') ? msg.interruptores : null;
          const r = await analizarYProponer({ semanas: msg.semanas, mesesExcluidos, interruptores, solicitudId });
          const estado = await leerEstado();
          sendToWidget({
            type: 'spAnalisisListo',
            ok: !!(r && r.ok),
            estado,
            message: (r && r.ok) ? '' : ((r && r.error && r.error.message) || 'No se ha podido completar el análisis.')
          });
        } catch (err) {
          // Corte de Wix (504) u otro fallo de red: el backend puede seguir
          // trabajando. Se espera al análisis por su solicitudId.
          console.warn(`${TAG} ⚠️ analizarYProponer sin respuesta (${err.message}) → consultando estado`);
          await esperarAnalisis(solicitudId);
        }
        break;
      }

      case 'spElegir': {
        try {
          const r = await elegirPropuesta({
            versionId: msg.versionId,
            opcion: msg.opcion,
            elegidaPor: nombreUsuario
          });
          const estado = await leerEstado();
          sendToWidget({
            type: 'spElegido',
            ok: !!(r && r.ok),
            estado,
            message: (r && r.ok) ? '' : ((r && r.error && r.error.message) || 'No se ha podido guardar la elección.')
          });
        } catch (err) {
          console.error(`${TAG} ❌ spElegir:`, err.message);
          sendToWidget({ type: 'spElegido', ok: false, message: 'No se ha podido guardar la elección. Vuelve a intentarlo.' });
        }
        break;
      }

      default:
        break;
    }
  });
});
