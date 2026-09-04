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
