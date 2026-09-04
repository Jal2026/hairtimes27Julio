// =====================================================
// KAMISUITE - Backend: Resumen Diario por email
// =====================================================
// VERSION: 1.0.0
// FECHA: 4 de septiembre de 2026
// ARCHIVO: backend/resumenDiarioLogic.web.js
//
// v1.0.0: Correo de cierre de jornada. Overview corto para el gerente,
//         NO un informe. El informe completo vive en Recepción PRO y el
//         análisis en Estadísticas; esto es un vistazo desde el móvil.
//
// PROPÓSITO:
//   Enviar, a la hora que cada salón configure, un correo con la
//   actividad productiva y las ventas del día, más lo que hay mañana.
//   Caja, arqueo, IVA y métodos de pago quedan FUERA a propósito
//   (decisión de producto, Jal · 4 sep 2026).
//
// CONTENIDO DEL CORREO (7 bloques):
//   1. Trabajo del día      — total, citas, clientes
//   2. Por profesional      — importe y citas de cada uno
//   3. Citas sin cobrar     — hora, cliente, profesional, importe
//   4. Reservas entradas hoy— total, web / recepción
//   5. Ventas               — tienda (importe) · especiales (línea a línea)
//   6. Externos             — venta bruta y comisión del salón
//   7. Mañana               — citas, hora de inicio y bloqueos de staff
//
// FUENTES (todas V2, sin cálculo nuevo salvo los bloques 4 y 7):
//   · cierreLogicExtendido.obtenerDatosCierreExtendidos → bloques 1,2,3,5
//     (rendimiento.total / .clientes / .clientesTotal / .staff / .pendientes,
//      cierre.productosTotal / .especiales / .especialesTotal)
//   · cierreExternosLogic.obtenerDatosCierreExternos    → bloque 6
//     (externos.ventaBruta / .comisionTotal / .citas)
//   · KamisuiteReservations (query propia)              → bloques 4 y 7
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
//   Evento registrado: 'resumen_diario'.
//
// CAMPOS NUEVOS EN SalonConfig (crear en el CMS antes de usar):
//   · dailySummaryActive     Boolean — interruptor. VACÍO = APAGADO.
//   · dailySummaryHour       Number  — hora de envío en punto (0-23), Madrid.
//   · dailySummaryRecipients Text    — correos separados por comas.
//                                      Vacío → generalEmail del salón.
//   Lectura defensiva: si los campos aún no existen, el módulo se queda
//   apagado y no envía nada. Ningún salón empieza a recibir correos por
//   el hecho de desplegar.
//
// TAREA PROGRAMADA:
//   Wix fija el cron en jobs.config, no por salón. Para que la hora sea
//   configurable, el job se despierta CADA HORA y solo envía cuando la
//   hora Madrid coincide con dailySummaryHour. Efecto lateral bueno:
//   el cambio de horario verano/invierno se resuelve solo, porque la
//   comparación se hace siempre en hora local de Madrid.
//   Guarda anti-duplicado: si ya hay un envío 'resumen_diario' en
//   CommunicationLog de hoy, no se repite.
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

const VERSION = '1.0.0';
const TAG = `[ResumenDiario][${VERSION}]`;

const TIMEZONE_MADRID = 'Europe/Madrid';

const CMS_SALON_CONFIG = 'SalonConfig';
const CMS_RESERVAS     = 'KamisuiteReservations';
const CMS_STAFF        = 'StaffConfig';
const CMS_LOG          = 'CommunicationLog';

const EVENTO_LOG = 'resumen_diario';

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

// Hora Madrid actual (0-23).
// Se normaliza con % 24 porque algunos motores devuelven "24" a las 00:00
// con hour12:false. Defensivo, no cosmético.
function horaActualMadrid() {
  const txt = new Date().toLocaleString('en-GB', {
    timeZone: TIMEZONE_MADRID, hour: '2-digit', hour12: false
  });
  const n = parseInt(String(txt).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? (n % 24) : -1;
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
      return { activo: false, hora: null, destinatarios: [], motivo: 'SalonConfig vacío' };
    }

    const cfg = res.items[0];

    // Interruptor: solo true explícito enciende. Vacío o campo inexistente
    // = apagado (decisión Jal: nadie recibe correos sin pedirlos).
    const activo = cfg.dailySummaryActive === true;

    const horaRaw = cfg.dailySummaryHour;
    const hora = (horaRaw === null || horaRaw === undefined || horaRaw === '')
      ? null
      : Math.trunc(Number(horaRaw));

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

    return { activo, hora, destinatarios, brandName: cfg.brandName || '' };

  } catch (e) {
    console.error(`${TAG} ⚠️ Error leyendo SalonConfig (fail-safe → apagado): ${e.message}`);
    return { activo: false, hora: null, destinatarios: [], motivo: e.message };
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

  // ── 6 · EXTERNOS (solo si hubo) ─────────────────────
  if (d.externos && d.externos.citas > 0) {
    p.push(`<div style="${S_H2}">Servicios externos</div>`);
    p.push(`<table style="${S_TBL}">`);
    p.push(filaHtml('Venta bruta', eur(d.externos.ventaBruta), `${d.externos.citas} cita${d.externos.citas === 1 ? '' : 's'}`));
    p.push(filaHtml('<strong>Comisión del salón</strong>', `<strong>${eur(d.externos.comisionTotal)}</strong>`));
    p.push(`</table>`);
    p.push(`<p style="${S_MUT}">La venta bruta no es dinero del salón: solo entra la comisión.</p>`);
  }

  // ── 7 · MAÑANA ──────────────────────────────────────
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

        // 6 — externos
        externos: (ext && ext.ok && ext.externos)
          ? {
              citas: Number(ext.externos.citas) || 0,
              ventaBruta: round2(ext.externos.ventaBruta),
              comisionTotal: round2(ext.externos.comisionTotal)
            }
          : { citas: 0, ventaBruta: 0, comisionTotal: 0 },

        // 7 — mañana
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
            event: EVENTO_LOG
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
// Se despierta cada hora. Solo envía cuando la hora Madrid coincide con
// la configurada. Orden deliberado: primero el interruptor y la hora
// (una sola query), y solo entonces el trabajo pesado.

export const ejecutarResumenDiarioProgramado = webMethod(
  Permissions.Admin,
  async () => {
    const cfg = await leerConfigResumen();

    if (!cfg.activo) {
      return { ok: true, version: VERSION, skipped: true, reason: 'resumen diario desactivado en Salón Config' };
    }

    if (cfg.hora === null || !Number.isFinite(cfg.hora) || cfg.hora < 0 || cfg.hora > 23) {
      console.log(`${TAG} ⏸️ Hora de envío no configurada o fuera de rango: ${cfg.hora}`);
      return { ok: true, version: VERSION, skipped: true, reason: 'hora de envío sin configurar' };
    }

    const ahora = horaActualMadrid();
    if (ahora !== cfg.hora) {
      return { ok: true, version: VERSION, skipped: true, reason: `no es la hora (${ahora}h Madrid, configurada ${cfg.hora}h)` };
    }

    console.log(`${TAG} ▶️ Hora de envío alcanzada (${cfg.hora}h Madrid)`);
    return await enviarResumenDiario({ fechaISO: hoyMadrid() });
  }
);
