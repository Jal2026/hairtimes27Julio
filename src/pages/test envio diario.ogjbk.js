// =====================================================
// KAMISUITE - Page Code: disparo manual del Resumen Diario
// =====================================================
// VERSION: 1.1.0
// FECHA: 4 de septiembre de 2026
//
// v1.1.0: Disparo por BOTÓN (antes se enviaba solo al abrir la página).
//
// PARA QUÉ:
//   Probar el resumen diario SIN esperar a la tarea programada.
//   Pulsas el botón y el correo sale en ese momento.
//
// CÓMO SE USA:
//   1. Arrastra un botón a una página de pruebas.
//   2. Pega este código en el código de esa página.
//   3. Si tu botón NO se llama button1, cambia el ID en la línea
//      marcada abajo (ID_BOTON). Es el único sitio donde se toca.
//   4. Vista previa, pulsar el botón. No hace falta publicar.
//   5. El resultado sale en el propio botón y, con detalle, en la
//      consola del navegador (F12 → Consola).
//
// IMPORTANTE:
//   · Va con forzar: true — se salta la comprobación de "ya enviado
//     hoy", que si no bloquearía el segundo intento del mismo día.
//   · NO mira el interruptor ni la hora de Salón Config: eso solo lo
//     comprueba la tarea programada. Aquí envía siempre que pulses.
//   · Sí necesita que dailySummaryRecipients tenga correos, o en su
//     defecto que generalEmail del salón esté relleno.
//   · enviarResumenDiario es Permissions.SiteMember: hay que estar
//     con la sesión iniciada en el sitio.
//   · Este archivo es SOLO para pruebas. Bórralo cuando el resumen
//     esté validado.
// =====================================================

import { enviarResumenDiario } from 'backend/resumenDiarioLogic.web.js';

// ⬇⬇⬇ ÚNICO SITIO A TOCAR SI TU BOTÓN TIENE OTRO ID ⬇⬇⬇
const ID_BOTON = '#button1';
// ⬆⬆⬆ ------------------------------------------------ ⬆⬆⬆

$w.onReady(function () {

  let boton = null;
  try {
    boton = $w(ID_BOTON);
  } catch (e) {
    boton = null;
  }

  if (!boton || typeof boton.onClick !== 'function') {
    console.error(`[PruebaResumen] ❌ No encuentro el botón ${ID_BOTON}. Cambia ID_BOTON por el ID real del botón (panel de propiedades del elemento).`);
    return;
  }

  const etiquetaOriginal = boton.label;

  boton.onClick(async () => {
    boton.disable();
    boton.label = 'Enviando...';
    console.log('[PruebaResumen] ▶️ Lanzando envío manual del resumen diario...');

    try {
      const r = await enviarResumenDiario({ forzar: true });

      console.log('[PruebaResumen] Respuesta completa:', JSON.stringify(r, null, 2));

      if (r && r.ok) {
        boton.label = `Enviado (${r.enviados})`;
        console.log(`[PruebaResumen] ✅ Enviado a ${r.enviados} de ${r.destinatarios} destinatario(s). Fecha: ${r.fecha}`);
        if (r.errores && r.errores.length) {
          console.warn('[PruebaResumen] ⚠️ Algunos fallaron:', r.errores);
        }
      } else if (r && r.skipped) {
        boton.label = 'No envió';
        console.warn(`[PruebaResumen] ⏸️ No envió. Motivo: ${r.reason}`);
      } else {
        boton.label = 'Error';
        console.error('[PruebaResumen] ❌ Error:', (r && r.error && r.error.message) || 'sin detalle');
      }

    } catch (e) {
      // Un fallo aquí suele ser de permisos (sesión no iniciada) o de
      // ruta del import. El mensaje lo dice.
      boton.label = 'Error';
      console.error('[PruebaResumen] ❌ Excepción:', e.message);
    }

    // Se rearma para poder volver a pulsar sin recargar la página.
    setTimeout(() => {
      boton.label = etiquetaOriginal;
      boton.enable();
    }, 4000);
  });

  console.log(`[PruebaResumen] Listo. Pulsa ${ID_BOTON} para enviar el resumen.`);
});
