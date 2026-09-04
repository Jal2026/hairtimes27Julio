// [ResumenDiarioJob v1.1.0]
// Se despierta cada cuarto de hora (jobs.config). La decisión de enviar
// o no la toma ejecutarResumenDiarioProgramado comparando la hora Madrid
// con SalonConfig.dailySummaryTime.
// v1.1.0: renombrada desde resumenDiarioHorario (v1.0.0 era horaria).

import { ejecutarResumenDiarioProgramado } from 'backend/resumenDiarioLogic.web';

export async function resumenDiarioTick() {
  await ejecutarResumenDiarioProgramado();
}
