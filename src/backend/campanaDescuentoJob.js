// =====================================================
// KAMISUITE — Tarea programada: campaña de descuento
// =====================================================
// Archivo: campanaDescuentoJob.js
// Versión: 1.0.0
// =====================================================
// v1.0.0 (24 Nov 2026): cuatro ticks por hora (:01, :16, :31, :46),
//   porque cada tarea programada corre como mucho una vez por hora.
//   Cada tick llama a ejecutarCampanaProgramada (tiendaEdicionLogic
//   v1.6.0), que aplica la campaña al llegar el inicio y la termina al
//   llegar el fin. Mismo patrón que resumenDiarioJob.js.
// =====================================================
import { ejecutarCampanaProgramada } from 'backend/tiendaEdicionLogic.web';

export async function campanaDescuentoTick01() {
  await ejecutarCampanaProgramada();
}

export async function campanaDescuentoTick16() {
  await ejecutarCampanaProgramada();
}

export async function campanaDescuentoTick31() {
  await ejecutarCampanaProgramada();
}

export async function campanaDescuentoTick46() {
  await ejecutarCampanaProgramada();
}
