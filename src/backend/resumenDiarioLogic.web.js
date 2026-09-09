// =====================================================
// KAMISUITE - Backend: Resumen Diario por email
// =====================================================
// VERSION: 1.2.0
// FECHA: 9 de septiembre de 2026
// ARCHIVO: backend/resumenDiarioLogic.web.js
//
// v1.2.0: EL CORREO INCORPORA CAJA. Decisión de Jal (9-sep-2026) que
//         revierte en parte la del 4-sep, cuando caja, IVA y métodos de
//         pago se dejaron fuera a propósito. Tres bloques nuevos:
//
//         · TOP 3 DEL DÍA — los tres artículos que más dinero
//           generaron. Compiten los servicios (cada complemento con su
//           propio nombre), la tienda agrupada en una línea y los
//           especiales en otra. Ordenado POR LO COBRADO y por DÍA DE
//           COBRO. Los externos no compiten.
//         · COBRADO POR MÉTODO DE PAGO — el reparto por canal físico,
//           con la parte de tarjeta, efectivo y bizum de los cobros
//           mixtos ya repartida en su canal.
//         · DESGLOSE DE IVA — base imponible y cuota, con las propinas
//           apartadas de la base.
//
//         CERO CÁLCULO NUEVO AQUÍ TAMPOCO. Los tres salen del motor del
//         informe del día (cierreLogicExtendido v1.4.0), igual que el
//         resto del correo. El ranking se calcula allí y no aquí porque
//         solo allí están los cobros uno a uno; hacerlo por separado
//         habría abierto la puerta a que el correo y la pantalla dieran
//         cifras distintas.
//
//         REQUIERE cierreLogicExtendido v1.4.0. Con un motor anterior
//         el bloque del Top 3 sencillamente no se pinta y el correo
//         sale igual que hasta ahora; los otros dos sí funcionan con el
//         motor viejo, porque esos datos ya viajaban.
//
//         AVISO DE LECTURA. Los bloques de caja hablan del dinero que
//         entró hoy; el "Trabajo del día" que abre el correo habla de
//         las citas de hoy. Son dos ejes distintos y no tienen por qué
//         cuadrar ningún día en que se cobre una cita de otro día. El
//         correo lo advierte en una línea para que nadie lo lea como un
//         descuadre.
//
// v1.1.6: EL BOTÓN DE PRUEBA YA NO CANCELA EL ENVÍO AUTOMÁTICO.
//         Caso real del 5-sep: prueba manual a las 00:15 (4 correos,
//         los 4 OK) y, a las 20:15, la tarea escribió "⏸️ El resumen
//         de 2026-09-05 ya se envió" sin mandar nada.
//         Causa: la guarda anti-duplicado busca en CommunicationLog
//         apuntes de hoy con event='resumen_diario', y el envío
//         manual dejaba exactamente ese apunte. forzar:true saltaba
//         la guarda para SÍ MISMO, pero la cerraba para el automático
//         de esa noche.
//         · Los envíos manuales (forzar:true) se apuntan ahora con
//           event='resumen_diario_prueba'.
//         · La guarda sigue igual: solo mira 'resumen_diario', que ya
//           únicamente escribe la tarea programada.
//         · Sin cambios en la composición del correo ni en el envío:
//           el destinatario recibe exactamente lo mismo.
//         · Efecto en el Monitor de Comunicaciones: las pruebas se
//           distinguen de los envíos reales. El tipo nuevo aparecerá
//           en crudo hasta que se toque ese widget (igual que hoy le
//           pasa a 'resumen_diario').
//
// v1.1.5: SE RESTAURAN LAS CUATRO TAREAS ESCALONADAS DE LA v1.1.3.
//         Los registros del sitio demostraron que la v1.1.3 SÍ se
//         ejecutaba (ticks a las 22:30 y 22:45, leyendo interruptor,
//         hora y destinatarios). La v1.1.4 las eliminó por una
//         sospecha equivocada.
//         · jobs.config vuelve a 4 entradas (:00, :15, :30, :45).
//         · TRAMO_MIN 60 → 15.
//         · Vuelve la precisión de cuarto de hora: '23:15' sale a las
//           23:15.
//
// v1.1.4: SE ELIMINA TODO LO QUE NO TENÍA PRECEDENTE EN EL PROYECTO.
//         La tarea seguía sin ejecutarse y sin dejar rastro. El módulo
//         de lógica carga y funciona (probado con el botón manual), así
//         que el fallo estaba en el arranque. Lo único del arranque sin
//         precedente eran las CUATRO entradas de jobs.config apuntando
//         al mismo archivo (v1.1.3), invento propio igual que el '*/15'
//         de la v1.1.0.
//         · jobs.config vuelve a UNA sola entrada, cron '0 * * * *'.
//         · resumenDiarioJob.js queda calcado a reminderJob.js, que
//           lleva meses ejecutándose: mismo formato de import, misma
//           forma de export, sin comentarios delante del import.
//         · TRAMO_MIN 15 → 60 (despertares horarios).
//         · Coste: se pierde la precisión de cuarto de hora. La hora
//           configurada se redondea HACIA ARRIBA a la hora siguiente.
//           '21:00' sale a las 21:00 exactas.
//
// v1.1.3: PRECISIÓN DE CUARTO DE HORA SIN SALIR DEL PLAN PLUS.
//         El límite de Wix (1 repetición por hora como máximo) es POR
//         TAREA, no por sitio: los planes normales admiten hasta 20
//         tareas programadas. Así que en vez de UNA tarea despertando
//         4 veces por hora (prohibido, se ignora en silencio), van
//         CUATRO tareas escalonadas a :00, :15, :30 y :45, cada una
//         una vez por hora (permitido). Las cuatro llaman a este mismo
//         motor.
//         · TRAMO_MIN 60 → 15.
//         · La hora SIGUE en SalonConfig.dailySummaryTime: '20:15' sale
//           a las 20:15. Cambiarla no exige tocar código ni publicar.
//         · Ver resumenDiarioJob.js v1.1.3 y jobs.config (6 tareas).
//
// v1.1.2: VUELTA AL CRON HORARIO. CORRIGE UN FALLO GRAVE DE LA v1.1.0.
//         La v1.1.0 puso el cron en '*/15 * * * *' para admitir minutos.
//         Wix IGNORA en silencio cualquier tarea programada por debajo
//         de 1 hora (mínimo 1 h en planes free y premium normales; solo
//         Elite y Business Elite bajan a 5 min). No avisa, no registra,
//         no falla: la descarta. Resultado: la tarea nunca se ejecutó y
//         no había ni una línea en los registros.
//         · cron '*/15 * * * *' → '0 * * * *' (ver jobs.config)
//         · TRAMO_MIN 15 → 60, obligatorio: con despertares horarios y
//           una ventana de 15 min, una hora configurada como '17:15' no
//           coincidiría NUNCA (el tick de las 18:00 queda a 45 min).
//         · dailySummaryTime SIGUE siendo Texto 'HH:MM' y sigue
//           admitiendo minutos, pero el envío se redondea HACIA ARRIBA
//           a la hora siguiente: '17:15' sale a las 18:00.
//         · Para minutos reales haría falta plan Elite / Business Elite
//           y entonces '*/15' sí sería válido.
//
// v1.1.1: DIAGNÓSTICO. Cada despertar del cron deja ahora una línea en
//         los registros ANTES de leer nada. Hasta la v1.1.0, si el
//         interruptor estaba apagado la tarea se cortaba en silencio, y
//         eso hacía indistinguible "apagado" de "la tarea no se está
//         ejecutando". Con esto, silencio total en los registros solo
//         puede significar UNA cosa: la tarea no corre (sitio sin
//         publicar o job no registrado). Sin cambios de comportamiento.
//
// v1.1.0: HORA DE ENVÍO CON MINUTOS.
//         La v1.0.0 solo permitía horas en punto porque la tarea se
//         despertaba una vez por hora. Ahora se despierta cada cuarto
//         de hora y la hora se configura como texto HH:MM.
//         · dailySummaryHour (Number) → dailySummaryTime (Text 'HH:MM')
//         · cron '0 * * * *' → '*/15 * * * *' (ver jobs.config)
//         · El envío sale en el primer cuarto de hora igual o posterior
//           a la hora configurada: 17:15 sale a las 17:15; 17:20 saldría
//           a las 17:30. Lo natural es usar :00, :15, :30 o :45.
//
// v1.0.0: Correo de cierre de jornada. Overview corto para el gerente,
//         NO un informe. El informe completo vive en Recepción PRO y el
//         análisis en Estadísticas; esto es un vistazo desde el móvil.
//
// PROPÓSITO:
//   Enviar, a la hora que cada salón configure, un correo con la
//   actividad productiva y las ventas del día, más lo que hay mañana.
//   El arqueo de caja sigue FUERA: eso se hace en Recepción con el
//   cajón delante. Métodos de pago e IVA SÍ entran desde la v1.2.0.
//
// CONTENIDO DEL CORREO (10 bloques):
//   1. Trabajo del día      — total, citas, clientes
//   2. Por profesional      — importe y citas de cada uno
//   3. Citas sin cobrar     — hora, cliente, profesional, importe
//   4. Reservas entradas hoy— total, web / recepción
//   5. Ventas               — tienda (importe) · especiales (línea a línea)
//   6. Top 3 del día        — artículos que más dinero generaron  [v1.2.0]
//   7. Externos             — venta bruta y comisión del salón
//   8. Cobrado por método   — tarjeta / efectivo / bizum           [v1.2.0]
//   9. Desglose de IVA      — base imponible y cuota               [v1.2.0]
//  10. Mañana               — citas, hora de inicio y bloqueos de staff
//
// FUENTES (todas V2, sin cálculo nuevo salvo los bloques 4 y 10):
//   · cierreLogicExtendido.obtenerDatosCierreExtendidos → bloques
//     1,2,3,5,6,8,9
//     (rendimiento.total / .clientes / .clientesTotal / .staff / .pendientes,
//      cierre.productosTotal / .especiales / .especialesTotal,
//      cierre.ranking [v1.4.0] / .porMetodo / .iva)
//   · cierreExternosLogic.obtenerDatosCierreExternos    → bloque 7
//     (externos.ventaBruta / .comisionTotal / .citas)
//   · KamisuiteReservations (query propia)              → bloques 4 y 10
//   · StaffConfig (query propia)                        → nombre del staff
//     de cada bloqueo: la fila de bloqueo guarda staffId y deja staffName
//     vacío (recepcionProLogic v1.0.20+).
//   · SalonConfig                                       → interruptor,
//     hora de envío y lista de destinatarios.
//
// ENVÍO:
//   brevoLogic.enviarEmailBrevo({ to, subject, bodyHtml, event }).
//   Se elige ese método —y no enviarEmailPlantilla— porque la plantilla
//   de este correo es FIJA en código (decisión Jal): su forma cambia
//   según lo que pasó ese día (líneas de especiales variables, bloque de
//   externos que aparece o no, citas sin cobrar de 0 a N), y eso no se
//   deja parametrizar con marcadores.
//   La cabecera de marca, el logo y el pie los pone el envoltorio de
//   brevoLogic (_buildEmailHtml): aquí solo se compone el cuerpo.
//
// HISTÓRICO DE COMUNICACIONES:
//   brevoLogic._enviarEmail YA inserta la fila en CommunicationLog con
//   el event que se le pasa. Este módulo NO llama a registrarComunicacion:
//   hacerlo duplicaría el apunte de cada envío.
//   Eventos registrados: 'resumen_diario' (envío automático de la
//   tarea programada) y 'resumen_diario_prueba' (envío manual con
//   forzar:true). Se separan para que una prueba no cierre la guarda
//   anti-duplicado del envío de esa noche (v1.1.6).
//
// CAMPOS NUEVOS EN SalonConfig (crear en el CMS antes de usar):
//   · dailySummaryActive     Boolean — interruptor. VACÍO = APAGADO.
//   · dailySummaryTime       Text    — hora de envío 'HH:MM' (Madrid).
//                                      Ej.: '21:00', '17:15'. Vacío = no envía.
//   · dailySummaryRecipients Text    — correos separados por comas.
//                                      Vacío → generalEmail del salón.
//   Lectura defensiva: si los campos aún no existen, el módulo se queda
//   apagado y no envía nada. Ningún salón empieza a recibir correos por
//   el hecho de desplegar.
//
// TAREA PROGRAMADA:
//   Wix fija el cron en jobs.config, no por salón, y NO admite que una
//   MISMA tarea se repita más de una vez por hora. Por eso hay CUATRO
//   tareas escalonadas (:00, :15, :30, :45), cada una horaria: juntas
//   despiertan cada cuarto de hora sin infringir el límite. El motor
//   envía cuando el momento actual cae en el tramo de 15 minutos que
//   abre la hora configurada en dailySummaryTime. Efecto lateral bueno:
//   el cambio de horario verano/invierno se resuelve solo, porque la
//   comparación se hace siempre en hora local de Madrid.
//   Guarda anti-duplicado: si ya hay un envío 'resumen_diario' en
//   CommunicationLog de hoy, no se repite. Los envíos manuales de
//   prueba quedan fuera de esa cuenta (v1.1.6).
//
// FUNCIONES EXPORTADAS:
//   · construirResumenDiario({ fechaISO })  → datos + HTML (sin enviar)
//   · enviarResumenDiario({ fechaISO, forzar }) → compone y envía
//   · ejecutarResumenDiarioProgramado()     → entrada del cron horario
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

import { enviarEmailBrevo } from 'backend/brevoLogic.web.js';
import { obtenerDatosCierreExtendidos } from 'backend/cierreLogicExtendido.web.js';
import { obtenerDatosCierreExternos } from 'backend/cierreExternosLogic.web.js';

const VERSION = '1.2.0';
const TAG = `[ResumenDiario][${VERSION}]`;

const TIMEZONE_MADRID = 'Europe/Madrid';

const CMS_SALON_CONFIG = 'SalonConfig';
const CMS_RESERVAS     = 'KamisuiteReservations';
const CMS_STAFF        = 'StaffConfig';
const CMS_LOG          = 'CommunicationLog';

const EVENTO_LOG = 'resumen_diario';

// v1.1.6 — Evento con el que se apunta un envío MANUAL (forzar:true).
// Es distinto a propósito: la guarda anti-duplicado consulta el
// histórico filtrando por EVENTO_LOG, así que una prueba manual deja
// rastro visible en el Monitor pero NO cierra el candado del envío
// automático de esa misma noche.
const EVENTO_LOG_PRUEBA = 'resumen_diario_prueba';

// =====================================================
// HELPERS DE FECHA
// =====================================================

// Día Madrid en formato YYYY-MM-DD. Patrón literal de reminderLogic.
function diaMadrid(d) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
}

function hoyMadrid() {
  return diaMadrid(new Date());
}

function mananaMadrid() {
  return diaMadrid(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

// Minutos transcurridos desde medianoche en hora Madrid (0-1439).
// Se trabaja en minutos y no en 'HH:MM' para poder comparar tramos sin
// depender del formato de texto. La hora se normaliza con % 24 porque
// algunos motores devuelven "24" a las 00:00 con hour12:false.
function minutosActualesMadrid() {
  const txt = new Date().toLocaleTimeString('en-GB', {
    timeZone: TIMEZONE_MADRID, hour: '2-digit', minute: '2-digit', hour12: false
  });
  const m = String(txt).match(/(\d{1,2})\D(\d{2})/);
  if (!m) return -1;
  const h = Number(m[1]) % 24;
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59) return -1;
  return h * 60 + min;
}

// 'HH:MM' → minutos desde medianoche. Devuelve null si no es válido.
// Tolerante con '7:05', '07:05' y espacios; no acepta nada más.
function parsearHoraConfig(txt) {
  const s = String(txt || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\s*[:.\s]\s*(\d{1,2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// Texto legible de unos minutos desde medianoche, para los registros.
function minutosATexto(mins) {
  if (!Number.isFinite(mins) || mins < 0) return '--:--';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Ventana UTC amplia alrededor de un día Madrid. El filtro fino se hace
// después comparando el día Madrid de cada fila (patrón leerCitasV2).
// Evita depender del offset +01:00/+02:00, que cambia con el horario de
// verano.
function ventanaUTC(fechaISO) {
  const base = new Date(`${fechaISO}T00:00:00.000Z`);
  return {
    desde: new Date(base.getTime() - 3 * 3600000),
    hasta: new Date(base.getTime() + 27 * 3600000)
  };
}

function horaMadrid(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('es-ES', {
    timeZone: TIMEZONE_MADRID, hour: '2-digit', minute: '2-digit', hour12: false
  });
}

function fechaLegible(fechaISO) {
  try {
    const d = new Date(`${fechaISO}T12:00:00.000Z`);
    return d.toLocaleDateString('es-ES', {
      timeZone: TIMEZONE_MADRID, weekday: 'long', day: 'numeric', month: 'long'
    });
  } catch (e) {
    return fechaISO;
  }
}

// =====================================================
// HELPERS VARIOS
// =====================================================

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function eur(n) {
  return `${round2(n).toFixed(2).replace('.', ',')} €`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Una fila es un bloqueo del calendario si lleva family='BLOQUEO' o el
// prefijo fijo en clientName. Doble comprobación defensiva, igual que
// cierreLogicExtendido v1.1.4 y reminderLogic.
function esBloqueo(r) {
  if (!r) return false;
  if (r.family === 'BLOQUEO') return true;
  if (typeof r.clientName === 'string' && r.clientName.startsWith('BLOQUEO:')) return true;
  return false;
}

// =====================================================
// LECTURA DE CONFIGURACIÓN
// =====================================================

async function leerConfigResumen() {
  try {
    const res = await wixData.query(CMS_SALON_CONFIG)
      .limit(1)
      .find({ suppressAuth: true });

    if (!res.items.length) {
      return { activo: false, minutos: null, horaTexto: '', destinatarios: [], motivo: 'SalonConfig vacío' };
    }

    const cfg = res.items[0];

    // Interruptor: solo true explícito enciende. Vacío o campo inexistente
    // = apagado (decisión Jal: nadie recibe correos sin pedirlos).
    const activo = cfg.dailySummaryActive === true;

    // Hora de envío como texto 'HH:MM' (v1.1.0). Se guarda también el
    // texto original para poder decir en los registros qué se leyó.
    const horaTexto = String(cfg.dailySummaryTime || '').trim();
    const minutos = parsearHoraConfig(horaTexto);

    // Lista de destinatarios. Vacía → correo general del salón.
    const listaTxt = String(cfg.dailySummaryRecipients || '').trim();
    let destinatarios = listaTxt
      ? listaTxt.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@'))
      : [];

    if (!destinatarios.length) {
      const general = String(cfg.generalEmail || '').trim();
      if (general.includes('@')) destinatarios = [general];
    }

    // Sin duplicados (mismo correo repetido en la lista = un solo envío).
    destinatarios = Array.from(new Set(destinatarios.map(e => e.toLowerCase())));

    return { activo, minutos, horaTexto, destinatarios, brandName: cfg.brandName || '' };

  } catch (e) {
    console.error(`${TAG} ⚠️ Error leyendo SalonConfig (fail-safe → apagado): ${e.message}`);
    return { activo: false, minutos: null, horaTexto: '', destinatarios: [], motivo: e.message };
  }
}

// =====================================================
// BLOQUE 4 — RESERVAS ENTRADAS HOY
// =====================================================
// Eje distinto al resto del correo: no mira lo que se trabajó hoy, sino
// lo que se vendió hoy para cualquier día futuro. Se filtra por fecha de
// creación de la reserva, no por fecha de cita.
// origenRecepcion: true = la hizo Recepción · false = entró por la web
// (recepcionProLogic v1.0.17 / widgetPublicoLogic v0.3.0).

async function leerReservasCreadas(fechaISO) {
  const out = { total: 0, web: 0, recepcion: 0 };
  try {
    const { desde, hasta } = ventanaUTC(fechaISO);

    let items = [];
    let skip = 0;
    let hayMas = true;
    while (hayMas && skip < 2000) {
      const r = await wixData.query(CMS_RESERVAS)
        .ge('_createdDate', desde)
        .le('_createdDate', hasta)
        .skip(skip).limit(500)
        .find({ suppressAuth: true });
      items = items.concat(r.items || []);
      hayMas = (r.items || []).length === 500;
      skip += 500;
    }

    for (const r of items) {
      if (!r._createdDate) continue;
      if (diaMadrid(r._createdDate) !== fechaISO) continue;
      if (esBloqueo(r)) continue;                 // un bloqueo no es una reserva
      if (r.status === 'CANCELADA') continue;     // creada y anulada el mismo día

      out.total++;
      if (r.origenRecepcion === false) out.web++;
      else out.recepcion++;
    }

    console.log(`${TAG} 📥 Reservas entradas ${fechaISO}: ${out.total} (web ${out.web} · recepción ${out.recepcion})`);
    return out;

  } catch (e) {
    console.warn(`${TAG} ⚠️ Error leyendo reservas creadas: ${e.message}`);
    return out;
  }
}

// =====================================================
// BLOQUE 7 — MAÑANA (citas + bloqueos)
// =====================================================

async function leerManana(fechaISO) {
  const out = { fechaISO, citas: 0, primeraHora: '', bloqueos: [] };
  try {
    const { desde, hasta } = ventanaUTC(fechaISO);

    const r = await wixData.query(CMS_RESERVAS)
      .ge('fechaReserva', desde)
      .le('fechaReserva', hasta)
      .ne('status', 'CANCELADA')
      .ascending('fechaReserva')
      .limit(500)
      .find({ suppressAuth: true });

    const filas = (r.items || []).filter(x =>
      x.fechaReserva && diaMadrid(x.fechaReserva) === fechaISO
    );

    const citas = filas.filter(x => !esBloqueo(x));
    out.citas = citas.length;
    out.primeraHora = citas.length ? horaMadrid(citas[0].fechaReserva) : '';

    const bloqueos = filas.filter(esBloqueo);

    if (bloqueos.length) {
      // La fila de bloqueo guarda staffId y deja staffName vacío:
      // hay que resolver el nombre contra StaffConfig. El identificador
      // que viaja en la reserva es wixResourceId (getStaffColumnas).
      const mapaStaff = {};
      try {
        const st = await wixData.query(CMS_STAFF)
          .limit(100)
          .find({ suppressAuth: true });
        for (const s of (st.items || [])) {
          const nombre = String(s.displayName || s.canonicalName || '').replace(/^[A-Z]_/, '');
          if (s.wixResourceId) mapaStaff[s.wixResourceId] = nombre;
          mapaStaff[s._id] = nombre;
        }
      } catch (eStaff) {
        console.warn(`${TAG} ⚠️ Error leyendo StaffConfig: ${eStaff.message}`);
      }

      for (const b of bloqueos) {
        const inicio = new Date(b.fechaReserva);
        const dur = Number(b.duracionTotal) || 0;
        const fin = new Date(inicio.getTime() + dur * 60000);
        const motivo = String(b.title || '').trim()
          || String(b.clientName || '').replace(/^BLOQUEO:/, '').trim()
          || 'Bloqueado';

        out.bloqueos.push({
          staff: mapaStaff[b.staffId] || 'Sin asignar',
          motivo,
          desde: horaMadrid(inicio),
          hasta: horaMadrid(fin),
          minutos: dur
        });
      }

      out.bloqueos.sort((a, b) => String(a.staff).localeCompare(String(b.staff)));
    }

    console.log(`${TAG} 📅 Mañana ${fechaISO}: ${out.citas} citas · ${out.bloqueos.length} bloqueos`);
    return out;

  } catch (e) {
    console.warn(`${TAG} ⚠️ Error leyendo mañana: ${e.message}`);
    return out;
  }
}

// =====================================================
// GUARDA ANTI-DUPLICADO
// =====================================================
// El envío deja su fila en CommunicationLog (la escribe brevoLogic).
// Si ya hay una de hoy con este evento, el resumen ya salió.

async function yaEnviadoHoy(fechaISO) {
  try {
    const { desde, hasta } = ventanaUTC(fechaISO);
    const r = await wixData.query(CMS_LOG)
      .eq('event', EVENTO_LOG)
      .ge('_createdDate', desde)
      .le('_createdDate', hasta)
      .limit(50)
      .find({ suppressAuth: true });

    const deHoy = (r.items || []).filter(x =>
      x._createdDate && diaMadrid(x._createdDate) === fechaISO
    );
    return deHoy.length > 0;

  } catch (e) {
    // Fail-safe hacia NO enviar: un correo de más es peor que uno de menos.
    console.error(`${TAG} ⚠️ Error comprobando envíos previos (se aborta por seguridad): ${e.message}`);
    return true;
  }
}

// =====================================================
// COMPOSICIÓN DEL CUERPO HTML
// =====================================================
// Plantilla FIJA en código (decisión Jal · 4 sep 2026). La cabecera de
// marca, el logo y el pie los añade brevoLogic; aquí solo el cuerpo.

const S_H2   = 'margin:22px 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#111;';
const S_TBL  = 'width:100%;border-collapse:collapse;font-size:14px;';
const S_TD   = 'padding:6px 0;border-bottom:1px solid #eee;';
const S_TDR  = 'padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;';
const S_MUT  = 'color:#666;font-size:12px;';

function filaHtml(izq, der, sub) {
  return `<tr>
    <td style="${S_TD}">${izq}${sub ? `<div style="${S_MUT}">${sub}</div>` : ''}</td>
    <td style="${S_TDR}">${der}</td>
  </tr>`;
}

function construirHtml(d) {
  const p = [];

  p.push(`<p style="margin:0 0 4px;font-size:15px;"><strong>Resumen del ${esc(d.fechaLegible)}</strong></p>`);

  // ── 1 · TRABAJO DEL DÍA ─────────────────────────────
  p.push(`<div style="${S_H2}">Trabajo del día</div>`);
  p.push(`<table style="${S_TBL}">`);
  p.push(filaHtml('Total del día', `<strong>${eur(d.totalDia)}</strong>`));
  p.push(filaHtml('Citas', String(d.citas)));
  p.push(filaHtml('Clientes', String(d.clientes)));
  p.push(`</table>`);

  // ── 2 · POR PROFESIONAL ─────────────────────────────
  p.push(`<div style="${S_H2}">Por profesional</div>`);
  if (d.staff.length) {
    p.push(`<table style="${S_TBL}">`);
    for (const s of d.staff) {
      const etq = s.isExternal ? ' <span style="' + S_MUT + '">EXT</span>' : '';
      p.push(filaHtml(
        `${esc(s.staffName)}${etq}`,
        eur(s.total),
        `${s.citas} cita${s.citas === 1 ? '' : 's'}`
      ));
    }
    p.push(`</table>`);
  } else {
    p.push(`<p style="${S_MUT}">Sin actividad.</p>`);
  }

  // ── 3 · CITAS SIN COBRAR ────────────────────────────
  p.push(`<div style="${S_H2}">Citas sin cobrar</div>`);
  if (d.pendientes.length) {
    p.push(`<table style="${S_TBL}">`);
    for (const c of d.pendientes) {
      p.push(filaHtml(
        `${esc(c.hora)} · ${esc(c.cliente)}`,
        eur(c.importe),
        esc(c.staff)
      ));
    }
    p.push(filaHtml('<strong>Pendiente</strong>', `<strong>${eur(d.pendienteTotal)}</strong>`));
    p.push(`</table>`);
  } else {
    p.push(`<p style="${S_MUT}">Ninguna. Todo el trabajo del día quedó cobrado.</p>`);
  }

  // ── 4 · RESERVAS ENTRADAS HOY ───────────────────────
  p.push(`<div style="${S_H2}">Reservas entradas hoy</div>`);
  p.push(`<table style="${S_TBL}">`);
  p.push(filaHtml('Nuevas reservas', `<strong>${d.reservas.total}</strong>`));
  p.push(filaHtml('Por la web', String(d.reservas.web)));
  p.push(filaHtml('Por recepción', String(d.reservas.recepcion)));
  p.push(`</table>`);

  // ── 5 · VENTAS ──────────────────────────────────────
  p.push(`<div style="${S_H2}">Ventas</div>`);
  p.push(`<table style="${S_TBL}">`);
  p.push(filaHtml('Tienda', eur(d.tiendaTotal)));
  p.push(`</table>`);

  if (d.especiales.length) {
    p.push(`<div style="margin:12px 0 4px;${S_MUT}">Bonos, tarjetas y PRIME</div>`);
    p.push(`<table style="${S_TBL}">`);
    for (const e of d.especiales) {
      p.push(filaHtml(
        esc(e.cliente || 'Sin nombre'),
        eur(e.importe),
        esc(e.concepto)
      ));
    }
    p.push(filaHtml('<strong>Total especiales</strong>', `<strong>${eur(d.especialesTotal)}</strong>`));
    p.push(`</table>`);
  }

  // ── 6 · TOP 3 DEL DÍA ───────────────────────────────
  // Llega hecho del motor del informe. Con un motor anterior a v1.4.0
  // no llega nada y el bloque no aparece: el correo sale como antes.
  if (Array.isArray(d.top) && d.top.length) {
    p.push(`<div style="${S_H2}">Top 3 del día</div>`);
    p.push(`<table style="${S_TBL}">`);
    let pos = 0;
    for (const it of d.top) {
      pos += 1;
      const sub = it.tipo === 'tienda' ? 'Venta de productos'
                : it.tipo === 'especiales' ? 'Bonos, tarjetas y PRIME'
                : '';
      p.push(filaHtml(`${pos}. ${esc(it.nombre)}`, eur(it.importe), sub));
    }
    p.push(`</table>`);
    p.push(`<p style="${S_MUT}">Por dinero cobrado. La tienda cuenta como una sola línea y los especiales como otra.</p>`);
  }

  // ── 7 · EXTERNOS (solo si hubo) ─────────────────────
  if (d.externos && d.externos.citas > 0) {
    p.push(`<div style="${S_H2}">Servicios externos</div>`);
    p.push(`<table style="${S_TBL}">`);
    p.push(filaHtml('Venta bruta', eur(d.externos.ventaBruta), `${d.externos.citas} cita${d.externos.citas === 1 ? '' : 's'}`));
    p.push(filaHtml('<strong>Comisión del salón</strong>', `<strong>${eur(d.externos.comisionTotal)}</strong>`));
    p.push(`</table>`);
    p.push(`<p style="${S_MUT}">La venta bruta no es dinero del salón: solo entra la comisión.</p>`);
  }

  // ── 8 y 9 · CAJA DEL DÍA ────────────────────────────
  const caja = d.caja || { totalReal: 0, transacciones: 0, porMetodo: [], iva: {} };
  const ivaCaja = caja.iva || {};

  p.push(`<div style="${S_H2}">Caja del día</div>`);
  if (caja.porMetodo && caja.porMetodo.length) {
    p.push(`<table style="${S_TBL}">`);
    for (const m of caja.porMetodo) {
      p.push(filaHtml(esc(m.metodo), eur(m.importe)));
    }
    p.push(filaHtml(
      '<strong>Total cobrado</strong>',
      `<strong>${eur(caja.totalReal)}</strong>`,
      `${caja.transacciones} cobro${caja.transacciones === 1 ? '' : 's'}`
    ));
    p.push(`</table>`);

    p.push(`<div style="margin:12px 0 4px;${S_MUT}">IVA ${ivaCaja.vatRate || 0}%</div>`);
    p.push(`<table style="${S_TBL}">`);
    if (round2(ivaCaja.totalPropinas) > 0) {
      p.push(filaHtml('Propinas', eur(ivaCaja.totalPropinas), 'No forman base imponible'));
      p.push(filaHtml('Cobrado sin propinas', eur(ivaCaja.totalSinPropinas)));
    }
    p.push(filaHtml('Base imponible', eur(ivaCaja.baseImponible)));
    p.push(filaHtml('<strong>Cuota de IVA</strong>', `<strong>${eur(ivaCaja.cuotaIVA)}</strong>`));
    p.push(`</table>`);

    p.push(`<p style="${S_MUT}">Es el dinero que entró hoy en caja. El trabajo del día de arriba se cuenta por la fecha de la cita, así que las dos cifras no tienen por qué coincidir: una cita de otro día cobrada hoy suma aquí y no allí.</p>`);
  } else {
    p.push(`<p style="${S_MUT}">No entró dinero en caja hoy.</p>`);
  }

  // ── 10 · MAÑANA ─────────────────────────────────────
  p.push(`<div style="${S_H2}">Mañana</div>`);
  p.push(`<table style="${S_TBL}">`);
  p.push(filaHtml('Citas', `<strong>${d.manana.citas}</strong>`));
  if (d.manana.primeraHora) {
    p.push(filaHtml('Empieza a las', d.manana.primeraHora));
  }
  p.push(`</table>`);

  if (d.manana.bloqueos.length) {
    p.push(`<div style="margin:12px 0 4px;${S_MUT}">Bloqueos de agenda</div>`);
    p.push(`<table style="${S_TBL}">`);
    for (const b of d.manana.bloqueos) {
      p.push(filaHtml(
        esc(b.staff),
        `${esc(b.desde)}–${esc(b.hasta)}`,
        esc(b.motivo)
      ));
    }
    p.push(`</table>`);
  }

  p.push(`<p style="margin:22px 0 0;${S_MUT}">El detalle completo del día está en Recepción, y el análisis en Estadísticas.</p>`);

  return p.join('\n');
}

// =====================================================
// CONSTRUCCIÓN DEL RESUMEN (datos + HTML, sin enviar)
// =====================================================

export const construirResumenDiario = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO } = {}) => {
    try {
      const dia = fechaISO || hoyMadrid();
      const diaManana = diaMadrid(new Date(new Date(`${dia}T12:00:00.000Z`).getTime() + 24 * 3600000));

      console.log(`${TAG} 🧾 Construyendo resumen de ${dia}`);

      const [informe, ext, reservas, manana] = await Promise.all([
        obtenerDatosCierreExtendidos({ fechaISO: dia }),
        obtenerDatosCierreExternos({ fechaISO: dia }),
        leerReservasCreadas(dia),
        leerManana(diaManana)
      ]);

      if (!informe || !informe.ok) {
        return {
          ok: false, version: VERSION,
          error: { message: `Informe del día no disponible: ${(informe && informe.error) || 'sin respuesta'}` }
        };
      }

      const rend = informe.rendimiento || {};
      const cie = informe.cierre || {};

      const datos = {
        fechaISO: dia,
        fechaLegible: fechaLegible(dia),

        // 1 — trabajo del día
        totalDia: round2(rend.total),
        citas: Array.isArray(rend.clientes) ? rend.clientes.length : 0,
        clientes: Number(rend.clientesTotal) || 0,

        // 2 — por profesional
        staff: (rend.staff || []).map(s => ({
          staffName: s.staffName || 'Sin staff',
          total: round2(s.total),
          citas: Number(s.citas) || 0,
          isExternal: !!s.isExternal
        })),

        // 3 — citas sin cobrar
        pendientes: (rend.pendientes || []).map(x => ({
          hora: x.hora || '',
          cliente: x.cliente || 'Sin nombre',
          staff: x.staff || '',
          importe: round2(x.importe)
        })),
        pendienteTotal: round2(rend.pendientesTotal),

        // 4 — reservas entradas hoy
        reservas,

        // 5 — ventas
        tiendaTotal: round2(cie.productosTotal),
        especiales: (cie.especiales || []).map(e => ({
          cliente: e.cliente || '',
          concepto: e.concepto || '',
          importe: round2(e.importe)
        })),
        especialesTotal: round2(cie.especialesTotal),

        // 6 — top 3 del día. Lo calcula el motor del informe, que es
        // donde están los cobros uno a uno. Con un motor anterior a
        // v1.4.0 no llega la lista y el bloque no se pinta.
        top: Array.isArray(cie.ranking)
          ? cie.ranking.slice(0, 3).map(x => ({
              nombre: x.nombre || '',
              tipo: x.tipo || 'servicio',
              importe: round2(x.importe)
            }))
          : [],

        // 8 y 9 — caja del día. Eje distinto al del trabajo del día:
        // aquí manda la fecha de cobro.
        caja: {
          totalReal: round2(cie.totalReal),
          transacciones: Number(cie.transacciones) || 0,
          porMetodo: (cie.porMetodo || []).map(m => ({
            metodo: m.metodo || '',
            importe: round2(m.importe)
          })),
          iva: {
            vatRate: Number(cie.iva && cie.iva.vatRate) || 0,
            totalPropinas: round2(cie.iva && cie.iva.totalPropinas),
            totalSinPropinas: round2(cie.iva && cie.iva.totalSinPropinas),
            baseImponible: round2(cie.iva && cie.iva.baseImponible),
            cuotaIVA: round2(cie.iva && cie.iva.cuotaIVA)
          }
        },

        // 7 — externos
        externos: (ext && ext.ok && ext.externos)
          ? {
              citas: Number(ext.externos.citas) || 0,
              ventaBruta: round2(ext.externos.ventaBruta),
              comisionTotal: round2(ext.externos.comisionTotal)
            }
          : { citas: 0, ventaBruta: 0, comisionTotal: 0 },

        // 10 — mañana
        manana
      };

      const html = construirHtml(datos);

      return { ok: true, version: VERSION, datos, html };

    } catch (e) {
      console.error(`${TAG} ❌ construirResumenDiario:`, e.message);
      return { ok: false, version: VERSION, error: { message: e.message } };
    }
  }
);

// =====================================================
// ENVÍO
// =====================================================
// Un correo por destinatario. Se hace así —y no un envío con varios
// destinatarios— para no tocar brevoLogic, que hoy está montado para
// una dirección por envío y lo usan todos los emails a cliente.

export const enviarResumenDiario = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO, forzar } = {}) => {
    try {
      const dia = fechaISO || hoyMadrid();
      const cfg = await leerConfigResumen();

      if (!cfg.destinatarios.length) {
        console.log(`${TAG} ⏸️ Sin destinatarios (ni lista ni correo general del salón)`);
        return { ok: false, version: VERSION, skipped: true, reason: 'sin destinatarios', enviados: 0 };
      }

      if (!forzar && await yaEnviadoHoy(dia)) {
        console.log(`${TAG} ⏸️ El resumen de ${dia} ya se envió`);
        return { ok: true, version: VERSION, skipped: true, reason: 'ya enviado hoy', enviados: 0 };
      }

      const construido = await construirResumenDiario({ fechaISO: dia });
      if (!construido.ok) return construido;

      const asunto = `Resumen del día · ${fechaLegible(dia)}`;

      // v1.1.6 — Un envío manual (forzar:true, botón de prueba) se apunta
      // con su propio evento. Antes usaba el mismo que el automático y,
      // aunque el envío salía bien, dejaba en el histórico la marca que
      // la guarda interpreta como "el resumen de hoy ya salió": el correo
      // de la hora configurada se cancelaba esa noche.
      // El automático NUNCA pasa forzar, así que su apunte no cambia.
      const eventoApunte = forzar ? EVENTO_LOG_PRUEBA : EVENTO_LOG;

      let enviados = 0;
      const errores = [];

      for (const destino of cfg.destinatarios) {
        try {
          // El apunte en CommunicationLog lo escribe brevoLogic con este
          // mismo `event`. No registrar aquí: duplicaría la fila.
          const r = await enviarEmailBrevo({
            to: destino,
            subject: asunto,
            bodyHtml: construido.html,
            event: eventoApunte
          });

          if (r && r.ok) {
            enviados++;
            console.log(`${TAG} 📧 Resumen enviado a ${destino} (${r.messageId || ''})`);
          } else {
            errores.push(`${destino}: ${(r && r.error) || 'error desconocido'}`);
            console.error(`${TAG} ⚠️ Fallo enviando a ${destino}: ${(r && r.error) || '?'}`);
          }
        } catch (eEnvio) {
          errores.push(`${destino}: ${eEnvio.message}`);
          console.error(`${TAG} ⚠️ Excepción enviando a ${destino}: ${eEnvio.message}`);
        }
      }

      return {
        ok: enviados > 0,
        version: VERSION,
        fecha: dia,
        destinatarios: cfg.destinatarios.length,
        enviados,
        errores
      };

    } catch (e) {
      console.error(`${TAG} ❌ enviarResumenDiario:`, e.message);
      return { ok: false, version: VERSION, error: { message: e.message } };
    }
  }
);

// =====================================================
// ENTRADA DEL CRON HORARIO
// =====================================================
// Lo llaman las cuatro tareas escalonadas, así que entra cada cuarto de
// hora. Solo envía cuando el momento actual cae dentro del tramo de 15
// minutos que abre la hora configurada.
// Se compara por tramo y no por igualdad exacta porque la tarea no
// entra al segundo: si el cron arranca a las 20:15:04, una comparación
// estricta contra '20:15' fallaría y el correo no saldría nunca.
// Orden deliberado: primero el interruptor y la hora (una sola query),
// y solo entonces el trabajo pesado.
const TRAMO_MIN = 15;

export const ejecutarResumenDiarioProgramado = webMethod(
  Permissions.Admin,
  async () => {
    // v1.1.1 — Huella de vida. Va la PRIMERA, antes de tocar el CMS:
    // si esta línea no aparece en los registros, la tarea no se está
    // ejecutando y el problema está fuera de este archivo.
    console.log(`${TAG} ⏰ Tick del cron · ${minutosATexto(minutosActualesMadrid())} Madrid`);

    const cfg = await leerConfigResumen();

    if (!cfg.activo) {
      console.log(`${TAG} ⏸️ Interruptor APAGADO (dailySummaryActive no está en true). Hora leída: "${cfg.horaTexto}" · destinatarios: ${cfg.destinatarios.length}`);
      return { ok: true, version: VERSION, skipped: true, reason: 'resumen diario desactivado en Salón Config' };
    }

    console.log(`${TAG} ✅ Interruptor encendido · hora configurada "${cfg.horaTexto}" · ${cfg.destinatarios.length} destinatario(s)`);

    if (cfg.minutos === null) {
      console.log(`${TAG} ⏸️ Hora de envío vacía o mal escrita: "${cfg.horaTexto}" (se espera HH:MM)`);
      return { ok: true, version: VERSION, skipped: true, reason: 'hora de envío sin configurar o con formato inválido' };
    }

    const ahora = minutosActualesMadrid();
    if (ahora < 0) {
      console.error(`${TAG} ⚠️ No se pudo leer la hora local (se aborta)`);
      return { ok: true, version: VERSION, skipped: true, reason: 'hora local ilegible' };
    }

    const dentroDelTramo = (ahora >= cfg.minutos) && (ahora - cfg.minutos < TRAMO_MIN);
    if (!dentroDelTramo) {
      return {
        ok: true, version: VERSION, skipped: true,
        reason: `no es la hora (${minutosATexto(ahora)} Madrid, configurada ${minutosATexto(cfg.minutos)})`
      };
    }

    console.log(`${TAG} ▶️ Hora de envío alcanzada (${minutosATexto(cfg.minutos)} Madrid)`);
    return await enviarResumenDiario({ fechaISO: hoyMadrid() });
  }
);
