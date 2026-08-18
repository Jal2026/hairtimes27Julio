// =====================================================
// PAGE CODE — Informe de Personal Externo
// =====================================================
// VERSION: 1.1.0
// FECHA: 18 de agosto de 2026
// HTML Component ID: #htmlExternos     ← ADAPTAR al ID real del editor
// Backend: externosInformeLogic.web.js → obtenerInformeExternos()
//
// Puente entre el widget HTML y el backend, con el mismo patrón que el
// page code de Estadísticas: el widget manda 'ready' al cargar y el page
// code responde con el mes en curso.
//
// ACCESO (decisión de Jal, 18-ago-2026): de momento solo nivel de
//   dirección. NO existe todavía un nivel de acceso propio para el
//   personal externo; cuando se defina, este es el punto donde se
//   engancha la comprobación.
// =====================================================

import { obtenerInformeExternos } from 'backend/externosInformeLogic.web';

const TAG = '[ExtInformeBridge v1.1.0]';

// ⚠️ ADAPTAR: ID del HTML Component tal como aparezca en el editor de Wix.
const HTML_ID = '#htmlExternos';

$w.onReady(function () {

  $w(HTML_ID).onMessage(async (event) => {
    try {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      // ── Widget listo: carga el mes en curso ──
      if (msg.type === 'ready') {
        const hoy = new Date();
        const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        await cargar(toISODate(primerDia), toISODate(ultimoDia));
        return;
      }

      // ── Cambio de periodo desde el widget ──
      if (msg.type === 'load') {
        await cargar(msg.fechaDesde, msg.fechaHasta);
        return;
      }

      // ── v1.1.0: Comparativa de dos periodos ──
      //    Mismo patrón que el page code de Estadísticas: dos llamadas al
      //    mismo método en paralelo. No hace falta backend nuevo.
      if (msg.type === 'loadComparativa') {
        const { periodoA, periodoB } = msg;
        console.log(TAG, 'Comparativa:',
          periodoA.fechaDesde, '-', periodoA.fechaHasta, 'VS',
          periodoB.fechaDesde, '-', periodoB.fechaHasta);

        $w(HTML_ID).postMessage({ type: 'loading', message: 'Cargando comparativa' });

        const [resA, resB] = await Promise.all([
          obtenerInformeExternos({ fechaDesde: periodoA.fechaDesde, fechaHasta: periodoA.fechaHasta }),
          obtenerInformeExternos({ fechaDesde: periodoB.fechaDesde, fechaHasta: periodoB.fechaHasta })
        ]);

        if (!resA?.ok) {
          $w(HTML_ID).postMessage({ type: 'error', message: resA?.error || 'Error en el periodo A' });
          return;
        }

        $w(HTML_ID).postMessage({
          type: 'comparativa',
          periodoA: resA,
          periodoB: resB,
          labelA: periodoA.label,
          labelB: periodoB.label
        });
        return;
      }

    } catch (err) {
      console.error(TAG, 'Error:', err);
      $w(HTML_ID).postMessage({ type: 'error', message: err.message });
    }
  });

  async function cargar(fechaDesde, fechaHasta) {
    console.log(TAG, 'Cargando:', fechaDesde, '→', fechaHasta);
    $w(HTML_ID).postMessage({ type: 'loading', message: 'Cargando informe' });

    const res = await obtenerInformeExternos({ fechaDesde, fechaHasta });

    if (!res?.ok) {
      $w(HTML_ID).postMessage({ type: 'error', message: res?.error || 'Error obteniendo datos' });
      return;
    }
    $w(HTML_ID).postMessage({ type: 'informe', payload: res });
  }

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

});
