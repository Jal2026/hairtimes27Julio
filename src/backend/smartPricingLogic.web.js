// =====================================================
// KAMISUITE - Backend: Smart Pricing
// =====================================================
// VERSION: 1.0.7
// FECHA: 27 de octubre de 2026
// ARCHIVO: backend/smartPricingLogic.web.js
//
// QUÉ ES
// ------
// Ofertas por día y hora en la reserva online. AKIRA analiza la ocupación
// real del salón cuando el dueño lo pide y propone tres opciones; el dueño
// elige una y queda como VERSIÓN VIGENTE. La reserva online aplica esa
// versión hueco a hueco y Recepción PRO la cobra con precio cerrado.
//
// Diseño aprobado por Jal el 21-oct-2026 (documento «KAMISUITE — Smart
// Pricing · Diseño Fase 1»). Reglas que este archivo hace cumplir:
//   · IA entiende → JS ejecuta. JavaScript calcula la ocupación y valida;
//     AKIRA solo propone. La reserva online NUNCA llama a la IA: lee la
//     versión vigente y aplica la regla.
//   · Encendido con SalonConfig.smartPricingActivo === true (estricto).
//     Vacío, null o error de lectura → APAGADO. Mismo criterio que
//     dailySummaryActive: nadie empieza a ver ofertas por desplegar.
//   · Nunca dos descuentos. Una hora solo lleva oferta si su porcentaje
//     supera la promo de catálogo del servicio; el descuento se aplica al
//     precio BASE del servicio principal, igual que la promo.
//   · Servicios sin precio cerrado (a valorar) no reciben oferta.
//
// ─────────────────────────────────────────────────────
// AUDITORÍA DE CONEXIONES
// ─────────────────────────────────────────────────────
//  LEE de:
//    · SalonConfig            → smartPricingActivo (interruptor).
//    · SmartPricingVersiones  → versión vigente, último análisis.
//    · KamisuiteReservations  → fases de las citas del periodo analizado.
//    · StaffConfig            → profesionales activos y su horario.
//    · ServiceCatalog         → precio base, promo del servicio y, desde
//                               v1.0.5, smartPricing (servicio con ofertas).
//  ESCRIBE en:
//    · SmartPricingVersiones  → una fila por análisis; la elegida pasa a
//                               vigente (READ-MERGE-UPDATE siempre).
//  LE LLAMAN:
//    · Page code de la página de gestión de smart pricing (webMethods).
//    · widgetPublicoLogic     → leerReglasVigentes, ofertasDeHoras,
//                               cargarIndicePromos, descuentoAutomaticoReserva,
//                               textoAvisoDescuento.
//    · reminderLogic          → cargarIndicePromos, descuentoAutomaticoReserva,
//                               textoAvisoDescuento, camposOfertaReserva.
//    · clienteAreaLogic       → pctOfertasEnHoras, camposOfertaReserva.
//    v1.0.6: TODAS async y llamadas con await (ver CHANGELOG).
//    Todos lo importan de forma DINÁMICA y dentro de try/catch: si este
//    módulo fallara al cargar, la reserva, el recordatorio y el Área de
//    Cliente siguen funcionando sin ofertas.
//  LLAMA A:
//    · Nadie para leer horarios: desde v1.0.2 usa su COPIA LITERAL de
//      widgetPublicoLogic.leerHorarioStaffEnDia (v0.13.0). Si esa función
//      cambia allí, se cambia también aquí.
//    · API de Anthropic (secreto KAMISUITE, modelo Sonnet), mismo patrón de
//      fetch que akiraLogic v1.9.0.
//
// ─────────────────────────────────────────────────────
// CAMPOS CMS — NOMBRES PROPUESTOS, CONFIRMAR CON cmsFieldReader
// ─────────────────────────────────────────────────────
//  Los IDs viven SOLO en las constantes F_VER, F_CFG_ACTIVO y F_RES de
//  este archivo. Si Wix crea alguno con otra capitalización, se cambia
//  aquí (y en recepcionProLogic, que tiene su copia de F_RES por no
//  importar este módulo: ver allí).
//
// ─────────────────────────────────────────────────────
// TIEMPOS Y EL TECHO DE 14 s DE WIX
// ─────────────────────────────────────────────────────
//  analizarYProponer puede tardar más de 14 s por la llamada a la IA. Wix
//  corta la respuesta al navegador (504) pero el backend sigue y termina.
//  Por eso la fila se inserta ANTES de llamar a la IA, con
//  propuestas.estado = 'calculando' y un solicitudId que manda el widget;
//  el page code, si la llamada falla, consulta getEstadoSmartPricing cada
//  pocos segundos hasta ver ese solicitudId en 'ok' o 'error'. Es el mismo
//  remedio que AKIRA aplicó al 504 de su primera pregunta (20-ago-2026).
//
// CHANGELOG:
//   v1.0.7 (27-oct-2026) — Umbrales del dueño: alerta y óptima.
//     El widget de gestión (v1.0.6) pinta el mapa en tres zonas con dos
//     números del dueño: «Alerta por debajo de» y «Óptima desde». Jal:
//     «que proponga también en la zona neutra». AKIRA puede proponer en
//     alerta y en moderada; nunca en óptima.
//     · analizarYProponer acepta `umbrales` { alerta, optima } (enteros,
//       0 ≤ alerta < optima ≤ 100). Sin dato o no válido (page code
//       anterior): UMBRALES_DEFECTO (20 y 55).
//     · Se guardan en `propuestas.umbrales` (campo JSON existente, igual
//       que los interruptores: ningún campo CMS nuevo). El widget arranca
//       con los del último análisis.
//     · getEstadoSmartPricing devuelve `umbralesDefecto` para el widget.
//     · A la IA: las tres zonas con sus números, empezar por la alerta,
//       se puede usar la moderada, nunca la óptima. Sustituye a «claramente
//       por debajo de la media del salón», que impedía la zona moderada.
//     · validarOpciones descarta toda franja que toque la zona óptima
//       (tocaOptima, nueva): un día entero, por su media (columna «Día»);
//       un tramo, por cada hora del tramo, y en 'horas', en todos los días
//       abiertos. Lo hace JavaScript aunque la IA se equivoque.
//     · Nada cambia en la reserva online, el recordatorio, el Área de
//       Cliente ni Recepción: las versiones ya elegidas siguen igual.
//   v1.0.6 (22-oct-2026) — Desde otros archivos, solo funciones async.
//     Diagnóstico en Hair-Times (widgetPublicoLogic 0.13.1, 22-oct-2026):
//     desde widgetPublicoLogic, las funciones NORMALES de este archivo
//     (pctOfertaEnHueco, calcularOfertaServicio) llegaban como `{}`, una
//     promesa sin esperar, y las `async` esperadas con await
//     (leerReglasVigentes, leerItemCatalogo) llegaban bien. Resultado:
//     ninguna oferta en la reserva, aunque regla, servicio y precio
//     estaban bien.
//     · REGLA: todo lo que otros .web.js llaman de aquí es `async` y se
//       llama con await. Es el patrón que el log demuestra que funciona.
//     · camposOfertaReserva, descuentoAutomaticoReserva y
//       textoAvisoDescuento pasan a `async` (nadie las usa dentro de este
//       archivo).
//     · Nuevas `async`, para no llamar hora a hora desde fuera:
//         ofertasDeHoras({ fecha, horas, setupUid, fresco })
//           → { activo, versionId, ventanaDias, ofertas:{ 'HH:MM': {pct, ahorro} } }
//         pctOfertasEnHoras({ fecha, horas, fresco })
//           → { activo, versionId, ofertas:{ 'HH:MM': pct } }  (solo regla)
//     · pctOfertaEnHueco y calcularOfertaServicio siguen siendo síncronas:
//       las usa este archivo por dentro. Desde fuera ya no se llaman.
//     · Cálculos idénticos a v1.0.5.
//   v1.0.5 (22-oct-2026) — Smart pricing solo en los servicios marcados.
//     Jal: «En los baratos como arreglo de corte no merece la pena. Hay que
//     incentivar los servicios más caros». Nuevo campo en ServiceCatalog
//     `smartPricing` (Booleano), constante F_CAT_SMART.
//     · calcularOfertaServicio solo da oferta si el servicio principal
//       tiene smartPricing === true (estricto, como el interruptor de
//       Setup Salón: vacío = sin oferta). Es la función que usan la
//       reserva online para enseñar la oferta y para revalidarla al
//       reservar, así que ningún otro archivo cambia.
//     · Las citas que ya tienen la oferta guardada la conservan: Recepción
//       cobra el porcentaje guardado en la cita.
//     · Se quita el diagnóstico temporal de v1.0.2 (🔎 import dinámico):
//       en Hair-Times devolvió VALOR, así que las llamadas de la reserva,
//       el recordatorio y el Área de Cliente a este archivo son correctas.
//       Se queda el log 🔎 de profesionales con horario.
//     · Sigue la copia propia de leerHorarioStaffEnDia: es la versión con
//       la que el análisis funciona en Hair-Times. Por qué falló la 1.0.1
//       no está aclarado (el import dinámico devuelve el valor bien).
//   v1.0.4 (22-oct-2026) — Interruptores DÍAS y HORAS antes de analizar.
//     Jal pidió interruptores previos al análisis para elegir qué tipo de
//     oferta propone AKIRA. Sin respuesta sobre «día y horas», se aplica
//     la opción recomendada:
//       · solo DÍAS   → 'dia'
//       · solo HORAS  → 'horas'
//       · los dos     → 'dia', 'dia_horas' y 'horas'
//       · ninguno     → no se analiza (aviso al dueño)
//     · analizarYProponer acepta `interruptores` { dias, horas }. Si no
//       llega (page code anterior), los dos cuentan como encendidos: mismo
//       comportamiento que v1.0.3.
//     · A la IA solo se le ofrecen los tipos permitidos (enum de la
//       herramienta e instrucciones) y validarOpciones descarta cualquier
//       franja de otro tipo.
//     · Los interruptores usados se guardan en `propuestas.interruptores`
//       (campo JSON existente: ningún campo CMS nuevo).
//   v1.0.3 (22-oct-2026) — TRES TIPOS DE OFERTA: día, día y horas, horas.
//     Jal: «Fui muy claro con los días y horas y no tienen por qué ir
//     juntas. Esto solo da horas. Se puede empezar por incentivar martes
//     sin horas concretas». Hasta v1.0.2 cada franja era siempre un día con
//     un tramo de horas. Ahora cada franja lleva `tipo`:
//       · 'dia'        { tipo, dow, pct }            martes entero
//       · 'dia_horas'  { tipo, dow, desde, hasta, pct } miércoles 14–16
//       · 'horas'      { tipo, desde, hasta, pct }    14–16 cualquier día
//     Se pueden mezclar en una misma opción. Si dos franjas coinciden en
//     una hora gana la mayor (nunca se suman), como antes.
//     · normalizarFranja (nueva) es la ÚNICA que decide si una franja vale;
//       la usan normalizarReglas y validarOpciones.
//     · Franjas guardadas antes, sin `tipo` (dow + desde + hasta), se leen
//       como 'dia_horas': nada de lo ya guardado cambia de significado.
//     · pctOfertaEnHueco entiende los tres tipos. Es la única función que
//       decide si un hueco lleva oferta (reserva online, revalidación al
//       reservar y Área de Cliente la usan vía calcularOfertaServicio y
//       pctOfertaEnHueco): esos archivos NO cambian.
//     · Herramienta de la IA e instrucciones: los tres tipos y cuándo usar
//       cada uno. La validación comprueba que el día o las horas tengan a
//       alguien trabajando.
//   v1.0.2 (22-oct-2026) — El análisis daba «No hay horario de profesionales».
//     Hair-Times, con widgetPublicoLogic 0.13.0 ya subido: la función de
//     horario se encuentra (el error «is not a function» desaparece), pero
//     la capacidad sale 0. El staff y el lector de horario son idénticos a
//     los del motor de reservas, que funciona; lo único distinto es que aquí
//     se llama a través de `await import('backend/widgetPublicoLogic.web')`.
//     En el proyecto no hay ningún precedente de llamar así a una función
//     NORMAL (no webMethod) y SÍNCRONA de otro .web.js.
//     · calcularOcupacion usa una copia literal de leerHorarioStaffEnDia
//       dentro de este archivo (llamada local, síncrona). Ya no importa
//       widgetPublicoLogic.
//     · DIAGNÓSTICO TEMPORAL (log 🔎): en cada análisis se llama una vez a
//       la función de widgetPublicoLogic por import dinámico y se registra
//       si devuelve el objeto o una promesa. Decide si la reserva online,
//       el recordatorio y el Área de Cliente (que llaman así a funciones
//       síncronas de ESTE archivo) necesitan `await`. No cambia ningún
//       resultado. Se quita cuando se sepa.
//     · Log 🔎 con nº de profesionales activos y cuántos tienen horario.
//   v1.0.1 (22-oct-2026) — Quitar meses del análisis.
//     Jal: «si te pilla verano ya estamos jodidos... Julio y agosto no es
//     una muestra válida para aplicar en septiembre octubre». Decidió
//     mantener el selector de semanas y poder desmarcar meses enteros.
//     · analizarYProponer acepta `mesesExcluidos` ['YYYY-MM', …]. Solo
//       cuentan los meses que caen dentro del periodo; el resto se ignora.
//     · calcularOcupacion salta los días de esos meses al medir capacidad
//       y ocupación. Si quedan menos de DIAS_MINIMOS_ANALISIS días, no
//       llama a la IA y devuelve un aviso para el dueño.
//     · La ocupación guardada lleva `mesesExcluidos` y `diasAnalizados`
//       (va dentro del campo `ocupacion`: NINGÚN campo CMS nuevo).
//     · A AKIRA se le dice qué meses se han quitado y cuántos días entran.
//     · getEstadoSmartPricing devuelve `ayer` (reloj de Madrid) y
//       `diasMinimos` para que el widget calcule los meses del periodo con
//       la misma fecha que el servidor.
//     · citasLeidas (solo log) cuenta solo las filas de días analizados.
//   v1.0.0 (21-oct-2026) — Creación.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';

const VERSION = '1.0.7';
const TAG = `[SmartPricing][${VERSION}]`;
const AUTH = { suppressAuth: true };

// ── Colecciones ──
const CMS_VERSIONES = 'SmartPricingVersiones';
const CMS_CONFIG    = 'SalonConfig';
const CMS_RESERVAS  = 'KamisuiteReservations';
const CMS_STAFF     = 'StaffConfig';
const CMS_CATALOGO  = 'ServiceCatalog';

// ── Field IDs (propuestos; confirmar tras crear los campos) ──
const F_VER = {
  fechaAnalisis: 'fechaAnalisis',
  periodoDesde:  'periodoDesde',
  periodoHasta:  'periodoHasta',
  ocupacion:     'ocupacion',
  propuestas:    'propuestas',
  opcionElegida: 'opcionElegida',
  reglas:        'reglas',
  vigente:       'vigente',
  elegidaPor:    'elegidaPor'
};
const F_CFG_ACTIVO = 'smartPricingActivo';
// v1.0.5 — ServiceCatalog: el servicio participa en smart pricing.
const F_CAT_SMART = 'smartPricing';
const F_RES = {
  pct:       'ofertaPct',
  ahorro:    'ofertaAhorro',
  versionId: 'ofertaVersionId'
};

// ── Estándar decidido por Jal el 21-oct-2026 ──
// La ventana se GUARDA en la versión elegida (reglas.ventanaDias); esta
// constante solo es el valor con el que nace cada versión.
const VENTANA_DIAS_ESTANDAR = 2;
const SEMANAS_PERMITIDAS = [4, 8, 12];
const SEMANAS_DEFECTO = 8;
// v1.0.1 — Mínimo de días que deben quedar tras quitar meses: 4 semanas,
// lo mismo que la opción más corta del selector.
const DIAS_MINIMOS_ANALISIS = 28;
// v1.0.7 — Umbrales con los que nace el widget si no hay análisis previo.
const UMBRALES_DEFECTO = { alerta: 20, optima: 55 };

// ── Filtro de profesionales: copia literal del motor de huecos ──
const NOTA_RECURSO_INTERNO = 'RECURSO INTERNO';

// ── IA (mismo modelo principal que akiraLogic v1.9.0) ──
const MODEL_PRIMARY = 'claude-sonnet-4-6';
const IA_TIMEOUT_MS = 60000;
const IA_MAX_TOKENS = 2000;

// ── Caché corta para la reserva online (lectura de versión vigente) ──
// Las lecturas para MOSTRAR usan caché de 60 s. La revalidación al crear
// la reserva y el Área de Cliente leen siempre en fresco.
const CACHE_TTL_MS = 60000;
let _cacheReglas = null;      // { ts, valor }
const _cacheItems = {};       // setupUid → { ts, item }

const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// =====================================================
// HELPERS BÁSICOS
// =====================================================

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function safeErr(e) {
  return { message: e?.message || String(e) };
}

function parseHHMM(s) {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

function fmtHHMM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// jsonIn defensivo — copia literal del patrón de widgetPublicoLogic.
function jsonIn(v, unwrapKey) {
  if (v == null || v === '') return [];
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch (e) { return []; }
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (unwrapKey && Array.isArray(v[unwrapKey])) return v[unwrapKey];
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.ids))   return v.ids;
    if (Array.isArray(v.names)) return v.names;
    return [];
  }
  if (Array.isArray(v)) return v;
  return [];
}

// Objeto CMS (campo Objeto) leído de forma defensiva: objeto o JSON string.
function objIn(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch (e) { return null; }
  }
  return (typeof v === 'object') ? v : null;
}

// Reloj del salón: mismos patrones de conversión que widgetPublicoLogic.
function ymdMadrid(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}
function minMadrid(date) {
  return parseHHMM(date.toLocaleTimeString('es-ES', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false
  }));
}

// Día de la semana de un 'YYYY-MM-DD' (0 = domingo). Mismo resultado que
// `new Date(y, mo - 1, d).getDay()` del motor, sin depender de la zona.
function dowDeFecha(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.getUTCDay();
}

function sumarDias(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Une intervalos [s, e) solapados. Entrada y salida: [{s, e}].
function unirIntervalos(arr) {
  const a = arr.filter(x => x.e > x.s).sort((x, y) => x.s - y.s);
  const out = [];
  for (const it of a) {
    const last = out[out.length - 1];
    if (last && it.s <= last.e) { if (it.e > last.e) last.e = it.e; }
    else out.push({ s: it.s, e: it.e });
  }
  return out;
}

function solape(a, b, c, d) {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

// =====================================================
// REGLAS — LECTURA Y EVALUACIÓN (lo usa la reserva online)
// =====================================================

/**
 * Field IDs de la oferta en KamisuiteReservations, para quien la lea.
 * Función y no constante exportada: es el patrón de export del proyecto en
 * backends .web.js (funciones planas, como akiraEntrenador).
 */
export async function camposOfertaReserva() {   // v1.0.6 — async
  return { ...F_RES };
}

/**
 * v1.0.3 — Valida UNA franja y la devuelve limpia, o null si no vale.
 *   'dia'        → { tipo, dow, pct }
 *   'dia_horas'  → { tipo, dow, desde, hasta, pct }
 *   'horas'      → { tipo, desde, hasta, pct }
 * Sin `tipo` (franjas guardadas hasta v1.0.2): dow + desde + hasta →
 * 'dia_horas'; solo dow → 'dia'; solo horas → 'horas'.
 */
function normalizarFranja(f) {
  const pct = Math.round(Number(f?.pct));
  if (!Number.isFinite(pct) || pct < 1 || pct > 100) return null;
  const rawDow = f?.dow;
  const hayDow = rawDow !== null && rawDow !== undefined && rawDow !== '';
  const dow = Number(rawDow);
  const dowOk = hayDow && Number.isInteger(dow) && dow >= 0 && dow <= 6;
  const d = parseHHMM(f?.desde);
  const h = parseHHMM(f?.hasta);
  const horasOk = d != null && h != null && d < h;
  let tipo = String(f?.tipo || '');
  if (!tipo) tipo = (dowOk && horasOk) ? 'dia_horas' : (dowOk ? 'dia' : (horasOk ? 'horas' : ''));
  if (tipo === 'dia') return dowOk ? { tipo, dow, pct } : null;
  if (tipo === 'dia_horas') return (dowOk && horasOk) ? { tipo, dow, desde: fmtHHMM(d), hasta: fmtHHMM(h), pct } : null;
  if (tipo === 'horas') return horasOk ? { tipo, desde: fmtHHMM(d), hasta: fmtHHMM(h), pct } : null;
  return null;
}

// v1.0.4 — Tipos de franja que AKIRA puede proponer según los
// interruptores DÍAS / HORAS del widget. Sin dato → encendido.
const TIPOS_FRANJA = ['dia', 'dia_horas', 'horas'];
function leerInterruptores(raw) {
  return { dias: raw?.dias !== false, horas: raw?.horas !== false };
}
function tiposDesdeInterruptores(intr) {
  if (intr.dias && intr.horas) return [...TIPOS_FRANJA];
  if (intr.dias) return ['dia'];
  if (intr.horas) return ['horas'];
  return [];
}

// v1.0.7 — Umbrales del dueño. Mismo criterio que el widget v1.0.6.
function leerUmbrales(raw) {
  const a = Number(raw?.alerta), o = Number(raw?.optima);
  if (Number.isInteger(a) && Number.isInteger(o) && a >= 0 && o <= 100 && a < o) return { alerta: a, optima: o };
  return { ...UMBRALES_DEFECTO };
}

/**
 * v1.0.7 — ¿La franja toca la zona óptima? Día entero: su media (columna
 * «Día»). Tramo: cada hora que se solapa con el tramo; en 'horas', en
 * todos los días. Las horas cerradas no cuentan.
 */
function tocaOptima(f, ocupacion, optima) {
  for (const d of ocupacion.dias) {
    if (f.tipo !== 'horas' && Number(d.dow) !== Number(f.dow)) continue;
    if (f.tipo === 'dia') return d.pct != null && Number(d.pct) >= optima;
    const dI = parseHHMM(f.desde), hI = parseHHMM(f.hasta);
    for (const c of (d.celdas || [])) {
      if (c.pct == null) continue;
      const h = parseHHMM(c.hora);
      if (h < hI && h + 60 > dI && Number(c.pct) >= optima) return true;
    }
  }
  return false;
}

/**
 * Normaliza y valida unas reglas. Devuelve null si no hay nada aplicable.
 * Forma: { ventanaDias, franjas: [franja normalizada (ver normalizarFranja)] }
 */
function normalizarReglas(raw) {
  const r = objIn(raw);
  if (!r) return null;
  const franjasIn = Array.isArray(r.franjas) ? r.franjas : [];
  const franjas = [];
  for (const f of franjasIn) {
    const limpia = normalizarFranja(f);
    if (limpia) franjas.push(limpia);
  }
  if (!franjas.length) return null;
  const v = Math.round(Number(r.ventanaDias));
  const ventanaDias = (Number.isFinite(v) && v >= 0 && v <= 7) ? v : VENTANA_DIAS_ESTANDAR;
  return { ventanaDias, franjas };
}

/**
 * ¿Está encendido el smart pricing y qué reglas aplican?
 * Devuelve { activo, versionId, reglas }. activo=false ante cualquier
 * duda (interruptor apagado o vacío, sin versión vigente, error).
 *
 * @param {{fresco?: boolean}} opts  fresco=true salta la caché de 60 s
 *   (revalidación al crear una reserva, Área de Cliente).
 */
export async function leerReglasVigentes({ fresco = false } = {}) {
  const apagado = { activo: false, versionId: '', reglas: null };
  if (!fresco && _cacheReglas && (Date.now() - _cacheReglas.ts) < CACHE_TTL_MS) {
    return _cacheReglas.valor;
  }
  try {
    const rCfg = await wixData.query(CMS_CONFIG).limit(1).find(AUTH);
    const cfg = rCfg.items?.[0];
    if (!cfg || cfg[F_CFG_ACTIVO] !== true) {
      _cacheReglas = { ts: Date.now(), valor: apagado };
      return apagado;
    }
    const rVer = await wixData.query(CMS_VERSIONES)
      .eq(F_VER.vigente, true)
      .descending('_updatedDate')
      .limit(1)
      .find(AUTH);
    const fila = rVer.items?.[0];
    const reglas = fila ? normalizarReglas(fila[F_VER.reglas]) : null;
    const valor = reglas
      ? { activo: true, versionId: fila._id, reglas }
      : apagado;
    _cacheReglas = { ts: Date.now(), valor };
    return valor;
  } catch (e) {
    console.warn(`${TAG} ⚠️ leerReglasVigentes no concluyente: ${e.message} → apagado`);
    // Un error NO se cachea: la siguiente lectura lo vuelve a intentar.
    return apagado;
  }
}

/**
 * Porcentaje de oferta de un hueco según las reglas (0 si ninguna).
 * Un hueco pertenece a una franja si su HORA DE INICIO cae en
 * [desde, hasta). Si varias franjas coinciden, gana la mayor.
 */
export function pctOfertaEnHueco(reglas, fechaISO, horaHHmm) {
  if (!reglas || !Array.isArray(reglas.franjas) || !reglas.franjas.length) return 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaISO || ''))) return 0;
  const m = parseHHMM(horaHHmm);
  if (m == null) return 0;
  const dow = dowDeFecha(String(fechaISO));
  let mejor = 0;
  for (const fRaw of reglas.franjas) {
    // v1.0.3 — tres tipos; normalizarFranja también lee las de antes.
    const f = normalizarFranja(fRaw);
    if (!f) continue;
    if (f.tipo !== 'horas' && f.dow !== dow) continue;
    if (f.tipo !== 'dia') {
      const d = parseHHMM(f.desde), h = parseHHMM(f.hasta);
      if (!(m >= d && m < h)) continue;
    }
    if (f.pct > mejor) mejor = f.pct;
  }
  return mejor;
}

/**
 * Promo de catálogo de un servicio. Regla dura IDÉNTICA a
 * widgetPublicoLogic.adaptarServicio (v0.7.0) y a recepcionProLogic v1.0.19:
 * solo con descuentoActivo === true y descuentoPromo número > 0, clampado.
 */
export function pctPromoCatalogo(item) {
  if (!item) return 0;
  return (item.descuentoActivo === true
          && typeof item.descuentoPromo === 'number'
          && Number.isFinite(item.descuentoPromo)
          && item.descuentoPromo > 0)
    ? Math.min(100, Math.max(0, item.descuentoPromo))
    : 0;
}

/**
 * Fila del catálogo por setupUid. Caché de 60 s salvo fresco=true.
 */
export async function leerItemCatalogo(setupUid, { fresco = false } = {}) {
  if (!setupUid) return null;
  const c = _cacheItems[setupUid];
  if (!fresco && c && (Date.now() - c.ts) < CACHE_TTL_MS) return c.item;
  const r = await wixData.query(CMS_CATALOGO)
    .eq('setupUid', setupUid)
    .limit(1)
    .find(AUTH);
  const item = r.items?.[0] || null;
  _cacheItems[setupUid] = { ts: Date.now(), item };
  return item;
}

/**
 * Oferta efectiva de un hueco para un servicio concreto.
 * Devuelve { pct, ahorro, basePrice }; pct=0 cuando no hay oferta que
 * mostrar: sin regla, servicio no marcado para smart pricing (v1.0.5),
 * servicio a valorar, o promo de catálogo igual o mayor (nunca dos
 * descuentos).
 */
export function calcularOfertaServicio({ reglas, fecha, hora, item }) {
  const nada = { pct: 0, ahorro: 0, basePrice: 0 };
  if (!reglas || !item) return nada;
  if (item[F_CAT_SMART] !== true) return nada;   // v1.0.5 — solo servicios marcados
  // Precio base: mismo criterio que adaptarServicio (price > 0, si no "a valorar").
  const basePrice = toNum(item.price) > 0 ? toNum(item.price) : 0;
  if (!basePrice) return nada;
  const pctRegla = pctOfertaEnHueco(reglas, fecha, hora);
  if (!pctRegla) return nada;
  const pctPromo = pctPromoCatalogo(item);
  if (pctRegla <= pctPromo) return nada;
  const ahorro = round2(basePrice * pctRegla / 100);
  if (!(ahorro > 0)) return nada;
  return { pct: pctRegla, ahorro, basePrice };
}

/**
 * v1.0.6 — Ofertas de varias horas de un día para un servicio, en UNA
 * llamada async. Es lo que usa la reserva online (mostrar y revalidar).
 * Mismo cálculo que calcularOfertaServicio, hora a hora.
 * @returns {{activo:boolean, versionId:string, ventanaDias:number,
 *            ofertas: Object<string, {pct:number, ahorro:number}>}}
 */
export async function ofertasDeHoras({ fecha, horas, setupUid, fresco = false } = {}) {
  const nada = { activo: false, versionId: '', ventanaDias: 0, ofertas: {} };
  const vig = await leerReglasVigentes({ fresco });
  if (!vig.activo) return nada;
  const item = await leerItemCatalogo(setupUid, { fresco });
  const ofertas = {};
  for (const h of (Array.isArray(horas) ? horas : [])) {
    const of = calcularOfertaServicio({ reglas: vig.reglas, fecha, hora: h, item });
    if (of.pct > 0) ofertas[h] = { pct: of.pct, ahorro: of.ahorro };
  }
  return { activo: true, versionId: vig.versionId, ventanaDias: vig.reglas.ventanaDias, ofertas };
}

/**
 * v1.0.6 — Porcentaje de la REGLA vigente en varias horas de un día, sin
 * mirar el servicio (Área de Cliente: la cita ya lleva su oferta y se
 * recalcula el porcentaje del hueco nuevo). Una llamada async.
 * @returns {{activo:boolean, versionId:string, ofertas: Object<string, number>}}
 */
export async function pctOfertasEnHoras({ fecha, horas, fresco = false } = {}) {
  const vig = await leerReglasVigentes({ fresco });
  if (!vig.activo) return { activo: false, versionId: '', ofertas: {} };
  const ofertas = {};
  for (const h of (Array.isArray(horas) ? horas : [])) {
    const pct = pctOfertaEnHueco(vig.reglas, fecha, h);
    if (pct > 0) ofertas[h] = pct;
  }
  return { activo: true, versionId: vig.versionId, ofertas };
}

// =====================================================
// DESCUENTO AUTOMÁTICO DE UNA CITA (confirmación y recordatorio)
// =====================================================

/**
 * Índice setupUid → { price, descuentoActivo, descuentoPromo }.
 * Réplica literal del cruce de recepcionProLogic.getReservasPorFecha
 * v1.0.19, para que lo que dicen los avisos sea lo que cobra recepción.
 */
export async function cargarIndicePromos(setupUids) {
  const uids = [...new Set((setupUids || []).filter(u => typeof u === 'string' && u))];
  const idx = {};
  if (!uids.length) return idx;
  const res = await wixData.query(CMS_CATALOGO)
    .hasSome('setupUid', uids)
    .limit(1000)
    .find(AUTH);
  for (const it of (res.items || [])) {
    if (!it.setupUid) continue;
    const rawPromo = Number(it.descuentoPromo);
    idx[it.setupUid] = {
      price: toNum(it.price),
      descuentoActivo: it.descuentoActivo === true,
      descuentoPromo: Number.isFinite(rawPromo) ? Math.min(100, Math.max(0, rawPromo)) : 0
    };
  }
  return idx;
}

/**
 * Descuento automático de una cita: el MAYOR entre la oferta grabada y la
 * promo de catálogo (suma por servicio, como recepción). Nunca la suma.
 * Devuelve { tipo: 'oferta'|'promo'|'', importe, pct }.
 */
export async function descuentoAutomaticoReserva({ fases, ofertaPct, ofertaAhorro, promoIdx }) {   // v1.0.6 — async
  let promoTotal = 0;
  let promoPct = 0;
  const uids = new Set();
  for (const f of (Array.isArray(fases) ? fases : [])) {
    if (f && f.tipo === 'servicio' && typeof f.setupUid === 'string' && f.setupUid) uids.add(f.setupUid);
  }
  for (const uid of uids) {
    const info = promoIdx ? promoIdx[uid] : null;
    if (!info || !info.descuentoActivo || info.descuentoPromo <= 0 || info.price <= 0) continue;
    const ahorro = round2(info.price * info.descuentoPromo / 100);
    if (ahorro <= 0) continue;
    promoTotal += ahorro;
    if (info.descuentoPromo > promoPct) promoPct = info.descuentoPromo;
  }
  promoTotal = round2(promoTotal);
  const ofA = round2(toNum(ofertaAhorro));
  const ofP = toNum(ofertaPct);
  if (ofA > 0 && ofA > promoTotal) return { tipo: 'oferta', importe: ofA, pct: ofP };
  if (promoTotal > 0) return { tipo: 'promo', importe: promoTotal, pct: promoPct };
  return { tipo: '', importe: 0, pct: 0 };
}

/**
 * Texto del aviso que se añade a «servicios» en confirmación y
 * recordatorio. Una sola línea (los parámetros de plantilla de WhatsApp no
 * admiten saltos). PROPUESTA DE COPY pendiente de aprobación de Jal.
 */
export async function textoAvisoDescuento(tipo, pct) {   // v1.0.6 — async
  const p = Math.round(toNum(pct));
  if (tipo === 'oferta' && p > 0) return `Oferta −${p} % al pagar en el salón`;
  if (tipo === 'promo' && p > 0) return `Promoción −${p} % al pagar en el salón`;
  return '';
}

// =====================================================
// OCUPACIÓN (lo calcula JavaScript, no la IA)
// =====================================================

// v1.0.2 — COPIA LITERAL de widgetPublicoLogic v0.13.0 leerHorarioStaffEnDia.
// Lee horario {from,to} del staff para un dow concreto.
// Devuelve null si está cerrado, no tiene horario configurado, o no parsea.
function leerHorarioStaffEnDia(staffRow, dow) {
  const raw = staffRow?.workingHoursSessionIds;
  if (!raw) return null;
  let items = [];
  try {
    if (typeof raw === 'string') {
      const obj = JSON.parse(raw);
      items = Array.isArray(obj?.items) ? obj.items : (Array.isArray(obj) ? obj : []);
    } else if (raw && typeof raw === 'object') {
      items = Array.isArray(raw.items) ? raw.items : (Array.isArray(raw) ? raw : []);
    }
  } catch (e) {
    console.warn(`${TAG} ⚠️ workingHours JSON inválido (${staffRow?.canonicalName || staffRow?._id}):`, e.message);
    return null;
  }
  const day = items.find(it => Number(it?.dow) === dow);
  if (!day || !day.open) return null;
  const from = parseHHMM(day.from);
  const to = parseHHMM(day.to);
  if (from == null || to == null || from >= to) return null;
  return { from, to };
}

async function leerStaffActivo() {
  const r = await wixData.query(CMS_STAFF)
    .eq('active', true)
    .limit(100)
    .find(AUTH);
  // Filtro literal del motor de huecos: fuera recursos internos,
  // CUALQUIERA y PROCESO (no son personas).
  return (r.items || []).filter(it => {
    if (String(it.notes || '').includes(NOTA_RECURSO_INTERNO)) return false;
    const canon = String(it.canonicalName || '').toUpperCase();
    if (canon === 'CUALQUIERA' || canon === 'PROCESO') return false;
    return true;
  });
}

async function leerReservasPeriodo(desdeYMD, hastaYMD) {
  const startUTC = new Date(new Date(`${desdeYMD}T00:00:00`).getTime() - 3 * 3600000);
  const endUTC = new Date(new Date(`${hastaYMD}T23:59:59`).getTime() + 3 * 3600000);
  const items = [];
  let res = await wixData.query(CMS_RESERVAS)
    .ge('fechaReserva', startUTC)
    .le('fechaReserva', endUTC)
    .ne('status', 'CANCELADA')
    .limit(1000)
    .find(AUTH);
  let paginas = 0;
  while (true) {
    for (const it of (res.items || [])) items.push(it);
    paginas++;
    if (paginas >= 20) {
      console.warn(`${TAG} leerReservasPeriodo: tope de 20 páginas (${items.length} filas)`);
      break;
    }
    if (!res.hasNext()) break;
    res = await res.next();
  }
  return items;
}

/**
 * Ocupación por día de la semana y franja horaria de 60 min.
 * Capacidad = horario de cada profesional menos sus bloqueos.
 * Ocupado   = fases de cita que ocupan (PROCESO no: el profesional está
 *             libre, Conceptos Fundacionales §1), unidas por profesional.
 * El horario de cada profesional es el ACTUAL de StaffConfig: no existe
 * histórico de horarios.
 */
// v1.0.1 — Periodo de N semanas que acaba ayer y meses del periodo que el
// dueño ha quitado. Solo se conservan 'YYYY-MM' válidos que caen dentro.
function periodoAnalisis(semanas, mesesExcluidos) {
  const hasta = sumarDias(ymdMadrid(new Date()), -1);
  const desde = sumarDias(hasta, -(semanas * 7 - 1));
  const enPeriodo = new Set();
  for (let ymd = desde; ymd <= hasta; ymd = sumarDias(ymd, 1)) enPeriodo.add(ymd.slice(0, 7));
  const excl = new Set(
    (Array.isArray(mesesExcluidos) ? mesesExcluidos : [])
      .map(m => String(m || '').trim())
      .filter(m => /^\d{4}-\d{2}$/.test(m) && enPeriodo.has(m))
  );
  let diasAnalizados = 0;
  for (let ymd = desde; ymd <= hasta; ymd = sumarDias(ymd, 1)) {
    if (!excl.has(ymd.slice(0, 7))) diasAnalizados++;
  }
  return { desde, hasta, excl, diasAnalizados };
}

function nombreMes(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  return `${MESES_ES[m - 1] || ym} ${y}`;
}

async function calcularOcupacion(semanas, periodo) {
  const { desde, hasta, excl, diasAnalizados } = periodo || periodoAnalisis(semanas, []);

  const [staff, reservas] = await Promise.all([leerStaffActivo(), leerReservasPeriodo(desde, hasta)]);
  const staffIds = new Set(staff.map(s => String(s.wixResourceId || s._id)));

  // v1.0.2 — Profesionales y horario (log 🔎).
  const conHorario = staff.filter(s => [0, 1, 2, 3, 4, 5, 6].some(d => leerHorarioStaffEnDia(s, d)));
  console.log(`${TAG} 🔎 profesionales activos ${staff.length} · con horario ${conHorario.length}${conHorario.length ? '' : ' · ' + staff.map(s => `${s.canonicalName || s._id}:${typeof s.workingHoursSessionIds}`).join(', ')}`);

  // key `${ymd}|${staffId}` → { ocup:[{s,e}], bloq:[{s,e}] }
  const porDiaStaff = {};
  const push = (ymd, sid, tipo, s, e) => {
    if (!sid || !staffIds.has(String(sid)) || !(e > s)) return;
    const k = `${ymd}|${sid}`;
    if (!porDiaStaff[k]) porDiaStaff[k] = { ocup: [], bloq: [] };
    porDiaStaff[k][tipo].push({ s, e });
  };

  for (const r of reservas) {
    const esBloqueo = r.family === 'BLOQUEO'
      || (typeof r.clientName === 'string' && r.clientName.startsWith('BLOQUEO:'));
    const tipo = esBloqueo ? 'bloq' : 'ocup';
    const fasesArr = jsonIn(r.fases, 'items');
    if (!Array.isArray(fasesArr) || !fasesArr.length) {
      if (r.fechaReserva && r.duracionTotal) {
        const start = new Date(r.fechaReserva);
        const sm = minMadrid(start);
        if (sm != null) push(ymdMadrid(start), r.staffId, tipo, sm, sm + toNum(r.duracionTotal));
      }
      continue;
    }
    for (const f of fasesArr) {
      if (f?.ocupa === false) continue;   // PROCESO libera al profesional
      if (!f.start || !f.end) continue;
      const ds = new Date(f.start), de = new Date(f.end);
      const sm = minMadrid(ds), em = minMadrid(de);
      if (sm == null || em == null) continue;
      push(ymdMadrid(ds), f.staffId || r.staffId || '', tipo, sm, em);
    }
  }

  // Acumuladores [dow][hora] en minutos
  const cap = {}, occ = {};
  let minHora = 24 * 60, maxHora = 0;
  for (let ymd = desde; ymd <= hasta; ymd = sumarDias(ymd, 1)) {
    if (excl.has(ymd.slice(0, 7))) continue;   // v1.0.1 — mes quitado por el dueño
    const dow = dowDeFecha(ymd);
    for (const s of staff) {
      const horario = leerHorarioStaffEnDia(s, dow);
      if (!horario) continue;
      const sid = String(s.wixResourceId || s._id);
      const datos = porDiaStaff[`${ymd}|${sid}`] || { ocup: [], bloq: [] };
      const bloq = unirIntervalos(datos.bloq);
      const ocup = unirIntervalos(datos.ocup);
      const h0 = Math.floor(horario.from / 60) * 60;
      for (let h = h0; h < horario.to; h += 60) {
        const bS = Math.max(h, horario.from), bE = Math.min(h + 60, horario.to);
        if (bE <= bS) continue;
        let capMin = bE - bS;
        for (const b of bloq) capMin -= solape(bS, bE, b.s, b.e);
        if (capMin <= 0) continue;
        let occMin = 0;
        for (const o of ocup) {
          // Lo ocupado dentro de un bloqueo no cuenta dos veces.
          let m = solape(bS, bE, o.s, o.e);
          for (const b of bloq) m -= solape(Math.max(bS, o.s), Math.min(bE, o.e), b.s, b.e);
          if (m > 0) occMin += m;
        }
        occMin = Math.min(occMin, capMin);
        const k = `${dow}|${h}`;
        cap[k] = (cap[k] || 0) + capMin;
        occ[k] = (occ[k] || 0) + occMin;
        if (h < minHora) minHora = h;
        if (h + 60 > maxHora) maxHora = h + 60;
      }
    }
  }

  const horas = [];
  for (let h = minHora; h < maxHora; h += 60) horas.push(fmtHHMM(h));
  const orden = [1, 2, 3, 4, 5, 6, 0];   // lunes primero
  let capTot = 0, occTot = 0;
  const dias = orden.map(dow => {
    let capD = 0, occD = 0;
    const celdas = horas.map(hh => {
      const k = `${dow}|${parseHHMM(hh)}`;
      const c = cap[k] || 0, o = occ[k] || 0;
      capD += c; occD += o;
      return { hora: hh, capacidadMin: c, ocupadoMin: o, pct: c > 0 ? Math.round(o * 100 / c) : null };
    });
    capTot += capD; occTot += occD;
    return { dow, nombre: DIAS_ES[dow], pct: capD > 0 ? Math.round(occD * 100 / capD) : null, celdas };
  });

  return {
    desde, hasta, semanas,
    horas,
    dias,
    mediaPct: capTot > 0 ? Math.round(occTot * 100 / capTot) : null,
    mesesExcluidos: [...excl].sort(),
    diasAnalizados,
    citasLeidas: reservas.filter(r => {
      if (!r.fechaReserva) return true;
      const d = new Date(r.fechaReserva);
      return isNaN(d.getTime()) ? true : !excl.has(ymdMadrid(d).slice(0, 7));
    }).length
  };
}

// =====================================================
// PROPUESTAS DE AKIRA
// =====================================================

const TOOL_PROPONER = {
  name: 'proponer_opciones',
  description: 'Devuelve exactamente tres opciones de ofertas. Cada oferta es un día entero, un tramo de horas de un día, o un tramo de horas de cualquier día.',
  input_schema: {
    type: 'object',
    properties: {
      opciones: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            titulo: { type: 'string', description: 'Nombre corto de la opción, máximo 40 caracteres.' },
            explicacion: { type: 'string', description: 'Una o dos frases para el dueño del salón: qué franjas toca y por qué.' },
            franjas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tipo: { type: 'string', enum: ['dia', 'dia_horas', 'horas'], description: "'dia' = todo el día de la semana indicado; 'dia_horas' = un tramo de horas de ese día; 'horas' = un tramo de horas de cualquier día abierto." },
                  dow: { type: 'integer', description: "0 domingo, 1 lunes … 6 sábado. Obligatorio en 'dia' y 'dia_horas'; no se usa en 'horas'." },
                  desde: { type: 'string', description: "HH:MM, inicio incluido. Obligatorio en 'dia_horas' y 'horas'; no se usa en 'dia'." },
                  hasta: { type: 'string', description: "HH:MM, fin excluido. Obligatorio en 'dia_horas' y 'horas'; no se usa en 'dia'." },
                  pct: { type: 'integer', description: 'Porcentaje de descuento entero.' }
                },
                required: ['tipo', 'pct']
              }
            }
          },
          required: ['titulo', 'explicacion', 'franjas']
        }
      }
    },
    required: ['opciones']
  }
};

function _withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Copia literal del patrón de akiraLogic v1.9.0 (_postAnthropic).
async function _postAnthropic(apiKey, body, timeoutMs, label) {
  const res = await _withTimeout(
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    }),
    timeoutMs, label
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data && data.error ? data.error.message : `HTTP ${res.status}`);
  return data;
}

function promptOcupacion(ocupacion, promos) {
  const lineas = [];
  lineas.push(`Periodo analizado: ${ocupacion.desde} a ${ocupacion.hasta} (${ocupacion.semanas} semanas).`);
  if (Array.isArray(ocupacion.mesesExcluidos) && ocupacion.mesesExcluidos.length) {
    lineas.push(`El dueño ha quitado del análisis estos meses por no ser representativos: ${ocupacion.mesesExcluidos.map(nombreMes).join(', ')}. Días analizados: ${ocupacion.diasAnalizados}.`);
  }
  lineas.push(`Ocupación media del salón: ${ocupacion.mediaPct == null ? 'sin datos' : ocupacion.mediaPct + ' %'}.`);
  lineas.push('Ocupación por día y franja (porcentaje del tiempo de trabajo ocupado por citas; "cerrado" = nadie trabaja):');
  for (const d of ocupacion.dias) {
    const celdas = d.celdas.map(c => `${c.hora} ${c.pct == null ? 'cerrado' : c.pct + '%'}`).join(' · ');
    lineas.push(`- ${d.nombre} (dow ${d.dow}, media ${d.pct == null ? 'cerrado' : d.pct + '%'}): ${celdas}`);
  }
  if (promos.length) {
    lineas.push('Promociones de catálogo ya activas (un servicio con promo igual o mayor que la oferta no mostrará la oferta):');
    for (const p of promos) lineas.push(`- ${p.label}: ${p.pct} %`);
  } else {
    lineas.push('No hay promociones de catálogo activas.');
  }
  return lineas.join('\n');
}

async function leerPromosActivas() {
  try {
    const r = await wixData.query(CMS_CATALOGO)
      .eq('descuentoActivo', true)
      .limit(1000)
      .find(AUTH);
    return (r.items || [])
      .map(it => ({ label: it.label || '', pct: pctPromoCatalogo(it) }))
      .filter(p => p.pct > 0 && p.label);
  } catch (e) {
    console.warn(`${TAG} ⚠️ leerPromosActivas: ${e.message}`);
    return [];
  }
}

/**
 * Valida y limpia las opciones de la IA contra la ocupación real:
 * solo franjas en días u horas donde alguien trabaja, porcentajes
 * enteros 1–100, como mucho 3 opciones. Lo que no pasa se descarta.
 * v1.0.3 — tres tipos de franja (ver normalizarFranja).
 */
function validarOpciones(opcionesIA, ocupacion, tipos = TIPOS_FRANJA, umb = null) {
  const abierto = {};   // `${dow}|${hora}` → true si hay capacidad
  for (const d of ocupacion.dias) {
    for (const c of d.celdas) if (c.capacidadMin > 0) abierto[`${d.dow}|${parseHHMM(c.hora)}`] = true;
  }
  const out = [];
  let fueraOptima = 0;   // v1.0.7
  for (const op of (Array.isArray(opcionesIA) ? opcionesIA : []).slice(0, 3)) {
    const franjas = [];
    for (const fIA of (Array.isArray(op?.franjas) ? op.franjas : [])) {
      const f = normalizarFranja(fIA);
      if (!f) continue;
      if (!tipos.includes(f.tipo)) continue;   // v1.0.4 — interruptores DÍAS / HORAS
      // Al menos una hora con alguien trabajando: ese día (dia), ese día
      // en el tramo (dia_horas) o cualquier día en el tramo (horas).
      const dows = f.tipo === 'horas' ? [0, 1, 2, 3, 4, 5, 6] : [f.dow];
      let tocaAbierto = false;
      for (const dw of dows) {
        if (f.tipo === 'dia') {
          tocaAbierto = Object.keys(abierto).some(k => k.startsWith(`${dw}|`));
        } else {
          const dI = parseHHMM(f.desde), hI = parseHHMM(f.hasta);
          for (let h = Math.floor(dI / 60) * 60; h < hI; h += 60) {
            if (abierto[`${dw}|${h}`]) { tocaAbierto = true; break; }
          }
        }
        if (tocaAbierto) break;
      }
      if (!tocaAbierto) continue;
      // v1.0.7 — Nunca en la zona óptima del dueño.
      if (umb && tocaOptima(f, ocupacion, umb.optima)) { fueraOptima++; continue; }
      franjas.push(f);
    }
    if (!franjas.length) continue;
    out.push({
      titulo: String(op?.titulo || '').slice(0, 60) || `Opción ${out.length + 1}`,
      explicacion: String(op?.explicacion || '').slice(0, 400),
      franjas
    });
  }
  if (fueraOptima) console.log(`${TAG} 🟢 ${fueraOptima} franja(s) de la IA descartadas por tocar la zona óptima (≥ ${umb.optima} %)`);
  return out;
}

async function pedirPropuestasIA(ocupacion, tipos = TIPOS_FRANJA, umb = UMBRALES_DEFECTO) {
  const apiKey = await getSecret('KAMISUITE');
  if (!apiKey) throw new Error('Secreto KAMISUITE no accesible');
  const promos = await leerPromosActivas();

  // v1.0.4 — Solo los tipos que permiten los interruptores DÍAS / HORAS.
  const DESC_TIPO = {
    dia: "- 'dia': un día de la semana entero, a cualquier hora. Úsalo cuando ese día en conjunto (su media) flojea. Ejemplo: martes −10 %.",
    dia_horas: "- 'dia_horas': un tramo de horas de un día concreto. Úsalo cuando el día en general va bien pero ese tramo flojea. Ejemplo: miércoles 14:00–16:00 −10 %.",
    horas: "- 'horas': un tramo de horas de cualquier día. Úsalo cuando el mismo tramo flojea en casi todos los días abiertos, en lugar de repetirlo día a día. Ejemplo: 14:00–16:00 −10 %."
  };
  const lineasTipos = tipos.length > 1
    ? ['Cada oferta (franja) es de uno de estos tipos, y puedes mezclarlos en una misma opción:']
    : ['Todas las ofertas (franjas) deben ser de este tipo, y de ningún otro:'];
  tipos.forEach(t => lineasTipos.push(DESC_TIPO[t]));
  lineasTipos.push('- Si dos franjas coinciden en una hora, se aplica la mayor; nunca se suman. No cubras lo mismo dos veces sin motivo.');
  lineasTipos.push(tipos.includes('dia')
    ? '- Usa la forma más sencilla que cubra lo flojo. Una opción puede ser un único día entero.'
    : '- Usa la forma más sencilla que cubra lo flojo.');

  const system = [
    'Eres AKIRA, asesora de negocio de un salón de peluquería que usa KAMISUITE.',
    'Tu tarea: proponer ofertas para la reserva online, con el fin de mover clientas desde los días y horas llenos hacia los días y horas flojos.',
    ...lineasTipos,
    'Reglas:',
    '- Propón EXACTAMENTE tres opciones de intensidad creciente: la primera prudente, la segunda equilibrada y la tercera más ambiciosa.',
    // v1.0.7 — Zonas del dueño en lugar de «por debajo de la media».
    `- El dueño ha fijado tres zonas de ocupación: ALERTA por debajo de ${umb.alerta} %, MODERADA desde ${umb.alerta} % hasta por debajo de ${umb.optima} %, y ÓPTIMA desde ${umb.optima} %.`,
    '- Empieza por los días y tramos en ALERTA; también puedes usar los de zona MODERADA.',
    `- Nunca pongas oferta en zona ÓPTIMA. Un día entero es óptimo si su media llega a ${umb.optima} %; un tramo de horas lo es si alguna de sus horas llega a ${umb.optima} % (en un tramo de cualquier día, en cualquiera de los días abiertos). Esas ofertas se descartan.`,
    '- Nunca uses días ni tramos en los que el salón está cerrado.',
    '- Porcentajes enteros y moderados; el descuento se aplica al precio del servicio principal.',
    '- Los tramos de horas van en horas en punto (HH:00), con hasta > desde.',
    '- La explicación va dirigida al dueño, en español, en una o dos frases, sin tecnicismos.',
    '- No inventes datos: básate solo en la tabla.'
  ].join('\n');

  const herramienta = JSON.parse(JSON.stringify(TOOL_PROPONER));
  herramienta.input_schema.properties.opciones.items.properties.franjas.items.properties.tipo.enum = [...tipos];

  const body = {
    model: MODEL_PRIMARY,
    max_tokens: IA_MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: promptOcupacion(ocupacion, promos) }],
    tools: [herramienta],
    tool_choice: { type: 'tool', name: TOOL_PROPONER.name }
  };

  const t0 = Date.now();
  const data = await _postAnthropic(apiKey, body, IA_TIMEOUT_MS, MODEL_PRIMARY);
  const bloque = (data.content || []).find(b => b.type === 'tool_use' && b.name === TOOL_PROPONER.name);
  const u = data.usage || {};
  console.log(`${TAG} 🤖 IA ${Date.now() - t0}ms · in ${u.input_tokens || 0} · out ${u.output_tokens || 0}`);
  if (!bloque) throw new Error('La IA no devolvió opciones');
  return validarOpciones(bloque.input?.opciones, ocupacion, tipos, umb);
}

// =====================================================
// WEBMETHODS — WIDGET DE GESTIÓN
// =====================================================

function filaVistaPublica(fila) {
  if (!fila) return null;
  return {
    versionId: fila._id,
    fechaAnalisis: fila[F_VER.fechaAnalisis] || null,
    periodoDesde: fila[F_VER.periodoDesde] || null,
    periodoHasta: fila[F_VER.periodoHasta] || null,
    ocupacion: objIn(fila[F_VER.ocupacion]),
    propuestas: objIn(fila[F_VER.propuestas]),
    opcionElegida: fila[F_VER.opcionElegida] == null ? null : Number(fila[F_VER.opcionElegida]),
    reglas: normalizarReglas(fila[F_VER.reglas]),
    vigente: fila[F_VER.vigente] === true,
    elegidaPor: fila[F_VER.elegidaPor] || ''
  };
}

/**
 * Estado para el widget de gestión: interruptor, versión vigente y último
 * análisis (que puede estar aún calculando).
 */
export const getEstadoSmartPricing = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const rCfg = await wixData.query(CMS_CONFIG).limit(1).find(AUTH);
      const interruptor = rCfg.items?.[0]?.[F_CFG_ACTIVO] === true;

      const [rVig, rUlt] = await Promise.all([
        wixData.query(CMS_VERSIONES).eq(F_VER.vigente, true).descending('_updatedDate').limit(1).find(AUTH),
        wixData.query(CMS_VERSIONES).descending(F_VER.fechaAnalisis).limit(1).find(AUTH)
      ]);
      return {
        ok: true,
        version: VERSION,
        interruptor,
        semanasPermitidas: SEMANAS_PERMITIDAS,
        semanasDefecto: SEMANAS_DEFECTO,
        ayer: sumarDias(ymdMadrid(new Date()), -1),
        diasMinimos: DIAS_MINIMOS_ANALISIS,
        umbralesDefecto: { ...UMBRALES_DEFECTO },   // v1.0.7
        vigente: filaVistaPublica(rVig.items?.[0]),
        ultimo: filaVistaPublica(rUlt.items?.[0])
      };
    } catch (e) {
      console.error(`${TAG} ❌ getEstadoSmartPricing:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

/**
 * Calcula la ocupación, la guarda y pide a AKIRA las tres propuestas.
 * Puede superar los 14 s de Wix: ver cabecera. El widget manda un
 * solicitudId propio para reconocer su análisis al consultar el estado.
 */
export const analizarYProponer = webMethod(
  Permissions.SiteMember,
  async ({ semanas, mesesExcluidos = [], interruptores = null, umbrales = null, solicitudId = '' } = {}) => {
    const t0 = Date.now();
    let filaId = '';
    try {
      // v1.0.4 — Interruptores DÍAS / HORAS.
      const intr = leerInterruptores(interruptores);
      const tipos = tiposDesdeInterruptores(intr);
      const umb = leerUmbrales(umbrales);   // v1.0.7
      if (!tipos.length) {
        return { ok: false, version: VERSION, error: { message: 'Enciende Días, Horas o los dos para que AKIRA pueda proponer.' } };
      }
      const sem = SEMANAS_PERMITIDAS.includes(Number(semanas)) ? Number(semanas) : SEMANAS_DEFECTO;
      const periodo = periodoAnalisis(sem, mesesExcluidos);
      if (periodo.diasAnalizados < DIAS_MINIMOS_ANALISIS) {
        return { ok: false, version: VERSION, error: { message: `Sin los meses quitados quedan ${periodo.diasAnalizados} días y hacen falta al menos ${DIAS_MINIMOS_ANALISIS} (4 semanas). Elige más semanas o quita menos meses.` } };
      }
      const ocupacion = await calcularOcupacion(sem, periodo);
      if (ocupacion.mediaPct == null) {
        return { ok: false, version: VERSION, error: { message: 'No hay horario de profesionales con el que medir la ocupación.' } };
      }

      const insert = await wixData.insert(CMS_VERSIONES, {
        [F_VER.fechaAnalisis]: new Date(),
        [F_VER.periodoDesde]: new Date(`${ocupacion.desde}T12:00:00Z`),
        [F_VER.periodoHasta]: new Date(`${ocupacion.hasta}T12:00:00Z`),
        [F_VER.ocupacion]: ocupacion,
        [F_VER.propuestas]: { estado: 'calculando', solicitudId: String(solicitudId || ''), interruptores: intr, umbrales: umb },
        [F_VER.vigente]: false
      }, AUTH);
      filaId = insert._id;
      console.log(`${TAG} 📊 Ocupación ${ocupacion.desde}→${ocupacion.hasta}${ocupacion.mesesExcluidos.length ? ` sin ${ocupacion.mesesExcluidos.join(',')}` : ''} (${ocupacion.diasAnalizados} días) media ${ocupacion.mediaPct}% (${ocupacion.citasLeidas} citas) · umbrales ${umb.alerta}/${umb.optima} · fila ${filaId} · ${Date.now() - t0}ms`);

      let propuestas;
      try {
        const opciones = await pedirPropuestasIA(ocupacion, tipos, umb);
        propuestas = opciones.length
          ? { estado: 'ok', solicitudId: String(solicitudId || ''), interruptores: intr, umbrales: umb, opciones }
          : { estado: 'error', solicitudId: String(solicitudId || ''), interruptores: intr, umbrales: umb, mensaje: 'AKIRA no ha encontrado franjas flojas que proponer en este periodo.' };
      } catch (iaErr) {
        console.error(`${TAG} ❌ IA:`, iaErr.message);
        propuestas = { estado: 'error', solicitudId: String(solicitudId || ''), interruptores: intr, umbrales: umb, mensaje: 'AKIRA no ha podido preparar las propuestas. Vuelve a intentarlo en unos minutos.' };
      }

      // READ-MERGE-UPDATE: wixData.update reemplaza el documento entero.
      const actual = await wixData.get(CMS_VERSIONES, filaId, AUTH);
      const fusion = { ...actual, [F_VER.propuestas]: propuestas };
      const guardada = await wixData.update(CMS_VERSIONES, fusion, AUTH);

      console.log(`${TAG} ✅ analizarYProponer ${propuestas.estado} · ${(propuestas.opciones || []).length} opciones · ${Date.now() - t0}ms`);
      return { ok: propuestas.estado === 'ok', version: VERSION, analisis: filaVistaPublica(guardada), error: propuestas.estado === 'ok' ? null : { message: propuestas.mensaje } };
    } catch (e) {
      console.error(`${TAG} ❌ analizarYProponer:`, e.message);
      if (filaId) {
        try {
          const actual = await wixData.get(CMS_VERSIONES, filaId, AUTH);
          await wixData.update(CMS_VERSIONES, { ...actual, [F_VER.propuestas]: { estado: 'error', solicitudId: String(solicitudId || ''), mensaje: 'No se ha podido completar el análisis.' } }, AUTH);
        } catch (_) { /* sin más remedio: queda en 'calculando' */ }
      }
      return { ok: false, version: VERSION, error: { message: 'No se ha podido completar el análisis. Vuelve a intentarlo.' } };
    }
  }
);

/**
 * El dueño elige una de las tres opciones de un análisis. Esa fila pasa a
 * ser la ÚNICA vigente; las demás vigentes se apagan. Todas las escrituras
 * son READ-MERGE-UPDATE.
 */
export const elegirPropuesta = webMethod(
  Permissions.SiteMember,
  async ({ versionId, opcion, elegidaPor = '' } = {}) => {
    try {
      const n = Number(opcion);
      if (!versionId || ![1, 2, 3].includes(n)) {
        return { ok: false, version: VERSION, error: { message: 'Elige una de las tres opciones.' } };
      }
      const fila = await wixData.get(CMS_VERSIONES, versionId, AUTH);
      if (!fila) return { ok: false, version: VERSION, error: { message: 'Ese análisis ya no existe.' } };
      const propuestas = objIn(fila[F_VER.propuestas]);
      const op = propuestas && propuestas.estado === 'ok' && Array.isArray(propuestas.opciones)
        ? propuestas.opciones[n - 1] : null;
      if (!op) return { ok: false, version: VERSION, error: { message: 'Esa opción no está disponible.' } };

      const reglas = normalizarReglas({ ventanaDias: VENTANA_DIAS_ESTANDAR, franjas: op.franjas });
      if (!reglas) return { ok: false, version: VERSION, error: { message: 'Esa opción no tiene franjas aplicables.' } };

      // 1) La elegida pasa a vigente.
      const elegida = await wixData.update(CMS_VERSIONES, {
        ...fila,
        [F_VER.opcionElegida]: n,
        [F_VER.reglas]: reglas,
        [F_VER.vigente]: true,
        [F_VER.elegidaPor]: String(elegidaPor || '').slice(0, 120)
      }, AUTH);

      // 2) Las demás vigentes se apagan. Si alguna falla, la reserva online
      //    usa igualmente la vigente más reciente (la recién elegida).
      const rVig = await wixData.query(CMS_VERSIONES).eq(F_VER.vigente, true).limit(100).find(AUTH);
      for (const otra of (rVig.items || [])) {
        if (otra._id === elegida._id) continue;
        try {
          const actual = await wixData.get(CMS_VERSIONES, otra._id, AUTH);
          await wixData.update(CMS_VERSIONES, { ...actual, [F_VER.vigente]: false }, AUTH);
        } catch (eOtra) {
          console.warn(`${TAG} ⚠️ No se pudo apagar la versión ${otra._id}: ${eOtra.message}`);
        }
      }

      _cacheReglas = null;
      console.log(`${TAG} ✅ Versión ${elegida._id} vigente (opción ${n}, ${reglas.franjas.length} franjas)`);
      return { ok: true, version: VERSION, vigente: filaVistaPublica(elegida) };
    } catch (e) {
      console.error(`${TAG} ❌ elegirPropuesta:`, e.message);
      return { ok: false, version: VERSION, error: { message: 'No se ha podido guardar la elección. Vuelve a intentarlo.' } };
    }
  }
);
