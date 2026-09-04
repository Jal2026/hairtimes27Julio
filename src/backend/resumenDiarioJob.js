import { ejecutarResumenDiarioProgramado } from 'backend/resumenDiarioLogic.web';

export async function resumenDiarioJobDaily() {
  await ejecutarResumenDiarioProgramado();
}
