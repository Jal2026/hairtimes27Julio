// [ResumenDiarioJob v1.1.3]
// ─────────────────────────────────────────────────────────────
// POR QUÉ CUATRO FUNCIONES Y NO UNA
//
// Wix ignora en silencio cualquier tarea programada que se repita más
// de una vez por hora (mínimo 1 h en planes free y premium normales;
// solo Elite / Business Elite bajan a 5 min). Un cron '*/15 * * * *'
// NO falla ni avisa: la tarea sencillamente no existe. Eso fue el
// fallo de la v1.1.0.
//
// Pero el límite es POR TAREA, no por sitio: los planes normales
// admiten hasta 20 tareas programadas. Así que en lugar de una tarea
// despertando 4 veces por hora (prohibido), se declaran CUATRO tareas
// escalonadas, cada una una vez por hora (permitido):
//     :00  '0 * * * *'
//     :15  '15 * * * *'
//     :30  '30 * * * *'
//     :45  '45 * * * *'
//
// Las cuatro llaman al MISMO motor. La decisión de enviar o no la sigue
// tomando ejecutarResumenDiarioProgramado comparando la hora Madrid con
// SalonConfig.dailySummaryTime, así que la hora sigue siendo
// configurable por salón sin tocar código.
//
// Se exportan cuatro funciones distintas, y no la misma repetida en las
// cuatro entradas de jobs.config, para no depender de que Wix acepte
// entradas duplicadas apuntando al mismo par archivo/función.
//
// v1.1.3: cuatro tareas escalonadas (minutos reales, plan Plus).
// v1.1.2: vuelta al cron horario tras el fallo del '*/15'.
// ─────────────────────────────────────────────────────────────

import { ejecutarResumenDiarioProgramado } from 'backend/resumenDiarioLogic.web';

export async function resumenDiarioTick00() {
  await ejecutarResumenDiarioProgramado();
}

export async function resumenDiarioTick15() {
  await ejecutarResumenDiarioProgramado();
}

export async function resumenDiarioTick30() {
  await ejecutarResumenDiarioProgramado();
}

export async function resumenDiarioTick45() {
  await ejecutarResumenDiarioProgramado();
}
