// =====================================================
// KAMISUITE — Page Code Agenda Móvil (Unificado)
// Custom Element: #kamisuiteMobile (tag: kamisuite-mobile)
// VERSION: 1.7.1 — 01 Mayo 2026
//
// CHANGELOG v1.7.1:
//   - Fix: detectNavegacion fallback atrapaba consultas como
//     "cómo fue el día ayer" y navegaba en vez de enviar a Sonnet.
//     Añadido QUERY_VERBS para excluir frases de consulta del fallback.
//     Patterns explícitos de navegación NO afectados.
//
// CHANGELOG v1.7.0:
//   - Fix BUG 2: enrichment envía fecha real (hoyMadrid) + fecha
//     del calendario. Sonnet distingue "hoy" de "fecha visible".
//   - Fix BUG 3: parseFechaTexto convierte números escritos en
//     español ("veinticinco") a dígitos antes de regex matching.
//
// CHANGELOG v1.6.0:
//   - Fix parseFechaTexto: fechas pasadas recientes (ej "30 de abril"
//     ayer) usan año actual. Solo salta a año siguiente si >6 meses
//   - detectNavegacion robusto: strip prefijos de ruido (ahora, oye,
//     pues, te he pedido...), "vámonos/vamonos" como trigger,
//     fallback para textos cortos con fecha sin verbo de acción
//   - "muéstrame la agenda" sin fecha → navega a hoy
//
// CHANGELOG v1.5.0: Intercepción navegación JS sin Sonnet
// CHANGELOG v1.3.0: servicio en cancelar/mover, buildConfirm mejorado
// CHANGELOG v1.2.0: Smart deduction, safety check confirm/cancel
// CHANGELOG v1.1.2: Pre-check disponibilidad
// =====================================================

import { getCalendarioSettings, saveCalendarioSettings, getStaffResources as getCalStaff, getTodasReservasDia } from 'backend/calendarioVista.web.js';
import { getBookingsAgrupados, cobrarBookings } from 'backend/testCheckout.web';
import { akiraClassify, akiraRespond } from 'backend/consoleIA.web';
import { ejecutarBloqueo, ejecutarReservaSimple, ejecutarReservaColor, ejecutarCancelacion, ejecutarMoverReserva, ejecutarAnadirComplemento, ejecutarEliminarComplemento, ejecutarEliminarBloqueo, ejecutarCambiarServicio, preCheckDisponibilidadSimple } from 'backend/akiraAcciones.web';

const TAG = '[MóvilBridge v1.7.1]';
let _el = null, cachedStaff = [], staffScheduleMap = {}, externalResourceIds = [], _packsData = [], _payingBookingIds = new Set();
const ACTION_CATEGORIES = new Set(['bloqueo','reserva','reserva_color','cancelar','mover','complemento','eliminar_complemento','eliminar_bloqueo','cambiar_servicio']);
let pendingAction = null;
let _currentReservas = [];
let _currentFecha = '';

const CONFIRM_SET = new Set(['confirmar','sí','si','ok','vale','adelante','hazlo','procede','claro','venga','perfecto']);
const CANCEL_SET = new Set(['cancelar','no','anular','dejalo','déjalo','nada','olvida','olvidalo','olvídalo']);

function send(type, data = {}) { try { _el.setAttribute('response', JSON.stringify({ type, ...data, ts: Date.now() })); } catch (e) { console.error(`${TAG} ❌ setAttribute:`, e); } }
function normalizeStaffName(name) { return (name || '').replace(/^[A-Z]_/, '').toLowerCase().trim(); }
function staffNameById(rid) { const s = cachedStaff.find(x => x.id === rid); return s ? s.name : ''; }

// ═══════════════════════════════════════════
// v1.6.0+v1.7.0: NAVEGACIÓN — Parse fecha JS puro
// ═══════════════════════════════════════════
function stripAccents(s) { return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function hoyMadrid() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }); }
function fmtDateISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

const MESES_IDX = { enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6, julio:7, agosto:8, septiembre:9, setiembre:9, octubre:10, noviembre:11, diciembre:12 };
const DIAS_IDX = { lunes:1, martes:2, miercoles:3, jueves:4, viernes:5, sabado:6, domingo:0 };

function parseFechaTexto(texto) {
  const t = stripAccents(texto).replace(/[?.!,]+$/g, '').replace(/\s*por\s+favor\s*$/i, '').trim();
  if (!t) return null;

  // v1.7.0: Convertir números escritos en español a dígitos
  const NUMEROS_TEXTO = { uno:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12, trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19, veinte:20, veintiuno:21, veintidos:22, veintitres:23, veinticuatro:24, veinticinco:25, veintiseis:26, veintisiete:27, veintiocho:28, veintinueve:29, treinta:30, treintaiuno:31 };
  let tNum = t;
  for (const [palabra, num] of Object.entries(NUMEROS_TEXTO)) {
    tNum = tNum.replace(new RegExp('\\b' + palabra + '\\b'), String(num));
  }

  const hoyISO = hoyMadrid();
  const [hY, hM, hD] = hoyISO.split('-').map(Number);
  const hoy = new Date(hY, hM - 1, hD);

  // Relativos
  if (t === 'hoy') return hoyISO;
  if (t === 'manana') { const d = new Date(hoy); d.setDate(d.getDate() + 1); return fmtDateISO(d); }
  if (t.includes('pasado manana')) { const d = new Date(hoy); d.setDate(d.getDate() + 2); return fmtDateISO(d); }
  if (t === 'ayer') { const d = new Date(hoy); d.setDate(d.getDate() - 1); return fmtDateISO(d); }

  // Día de semana: "el viernes", "lunes", "viernes que viene"
  for (const [nombre, dow] of Object.entries(DIAS_IDX)) {
    if (t.includes(nombre)) {
      const d = new Date(hoy);
      let diff = dow - d.getDay();
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return fmtDateISO(d);
    }
  }

  // v1.7.0: Usar tNum (con dígitos convertidos) para regex numéricos

  // "9 de junio", "25 mayo", "3 julio"
  const mFull = tNum.match(/(\d{1,2})\s*(?:de\s+)?(\w+)/);
  if (mFull) {
    const dia = parseInt(mFull[1]);
    const mes = MESES_IDX[mFull[2]];
    if (mes && dia >= 1 && dia <= 31) {
      // v1.6.0: Usar año actual. Solo saltar a año siguiente si fecha
      // es más de 6 meses en el pasado (ej: enero cuando estamos en agosto)
      let year = hY;
      const target = new Date(hY, mes - 1, dia);
      const diffDias = (hoy - target) / 86400000;
      if (diffDias > 180) year++;
      return `${year}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
  }

  // Solo número: "día 15", "el 20"
  const mDay = tNum.match(/(\d{1,2})/);
  if (mDay) {
    const dia = parseInt(mDay[1]);
    if (dia >= 1 && dia <= 31) {
      let mes = hM, year = hY;
      // Si el día ya pasó hace más de 15 días, asumir mes siguiente
      if (hD - dia > 15) { mes++; if (mes > 12) { mes = 1; year++; } }
      return `${year}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
  }

  return null;
}

// Verbos de ACCIÓN que indican que NO es navegación
const ACTION_VERBS = /\b(reserv|cancel|borr|muev|cambi|anad|elimin|bloque|cobr|pag)\w*/;

// v1.7.1: Verbos/patrones de CONSULTA que indican que NO es navegación
// sino una pregunta sobre datos → debe ir a Sonnet
const QUERY_VERBS = /\b(como fue|como estuvo|que tal|cuanto|cuantas|cuantos|que paso|se hizo|se facturo|se cobro|se ingreso|fue el dia|fue el salon|hubo|tuvimos|hicimos|facturamos|cobramos|ingresamos|trabajamos|atendimos)\b/;

function detectNavegacion(query) {
  const q = stripAccents(query);

  // Strip "akira" y prefijos de ruido
  const clean = q
    .replace(/^akira\s+/, '')
    .replace(/^(?:ahora|oye|vale|pues|bueno|venga|porfa|a ver)\s+/g, '')
    .replace(/^(?:te he pedido|te pido|quiero ver|necesito ver)\s+/g, '')
    .trim();

  // Regex de triggers de navegación
  const patterns = [
    /^(?:muestra|muestrame)\s+(?:la\s+)?(?:agenda\s+)?(?:de(?:l)?\s+)?(.+)/,
    /^(?:ensena|ensename|ensenname)\s+(?:la\s+)?(?:agenda\s+)?(?:de(?:l)?\s+)?(.+)/,
    /^(?:ve|vete|vamonos|vamos)\s+(?:al?\s+)(.+)/,
    /^(?:pon|ponme)\s+(?:el\s+)?(?:dia\s+)?(?:calendario\s+)?(?:en\s+(?:el\s+)?)?(.+)/,
    /^(?:llevame)\s+(?:al?\s+)(.+)/,
    /^agenda\s+(?:de(?:l)?)\s+(.+)/,
    /^calendario\s+(?:de(?:l)?)\s+(.+)/,
    /^(?:como\s+esta|que\s+hay)\s+(?:el|la|para\s+(?:el|la))?\s*(.+)/
  ];

  for (const pat of patterns) {
    const m = clean.match(pat);
    if (m) {
      const fecha = parseFechaTexto(m[1].trim());
      if (fecha) return fecha;
    }
  }

  // "muéstrame la agenda" / "enséñame la agenda" sin fecha → hoy
  if (/^(?:muestra|muestrame|ensename)\s+(?:la\s+)?agenda\s*$/.test(clean)) {
    return hoyMadrid();
  }

  // v1.7.1: Fallback excluye consultas (QUERY_VERBS) además de acciones
  if (!ACTION_VERBS.test(clean) && !QUERY_VERBS.test(clean) && clean.split(/\s+/).length <= 5) {
    const dateCandidate = clean.replace(/^(?:el|la|del|de|dia|al)\s+/g, '').trim();
    const fecha = parseFechaTexto(dateCandidate);
    if (fecha) return fecha;
  }

  return null;
}

// ── Calendar ──
async function handleGetStaff() { try { const r = await getCalStaff(); if (!r.ok) { send('error', { message: 'Error staff' }); return; } cachedStaff = r.staff; staffScheduleMap = {}; externalResourceIds = []; for (const s of cachedStaff) { if (s.scheduleId) staffScheduleMap[s.scheduleId] = s.id; if (s.isExternal) externalResourceIds.push(s.id); } send('staff-data', { staff: cachedStaff }); } catch (e) { send('error', { message: e.message }); } }
async function handleGetReservas(fecha) { try { if (!fecha) { const d = new Date(); fecha = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; } const [cal, chk] = await Promise.all([getTodasReservasDia({ fecha, staffScheduleMap, externalResourceIds }), getBookingsAgrupados({ fechaISO: fecha })]); if (!cal.ok) { send('error', { message: 'Error reservas' }); return; } _packsData = chk?.ok ? (chk.packs || []) : []; _currentReservas = cal.reservas || []; _currentFecha = fecha; send('reservas-data', { fecha, reservas: cal.reservas, packs: _packsData }); } catch (e) { send('error', { message: e.message }); } }
async function handleGetSettings() { try { const r = await getCalendarioSettings({ source: 'mobile' }); send('settings-data', { settings: r.ok ? r.settings : null }); } catch (e) { send('settings-data', { settings: null }); } }
async function handleSaveSettings(settings) { try { await saveCalendarioSettings({ settings, source: 'mobile' }); } catch (e) { console.error(`${TAG} ❌ saveSettings:`, e); } }

// ── Cobro ──
async function handlePay(msg) { const ids = Array.isArray(msg.bookingIds) ? msg.bookingIds : [], mp = msg.metodoPago; if (!ids.length || !mp) { send('pay-error', { message: 'Faltan datos' }); return; } const key = ids.sort().join(','); if (_payingBookingIds.has(key)) return; _payingBookingIds.add(key); let dp = null; const pk = _packsData.find(p => (p.bookingIdsPendientes || []).some(id => ids.includes(id))); if (pk) { const sv = pk.servicios || []; let desc = sv.map(s => `${s.serviceName} (${s.precioFinal ?? s.precio}€)`).join(', '); if (pk.extra && pk.extra.importe > 0) desc += `, ✏️ ${pk.extra.descripcion || 'Extra'} (${pk.extra.importe}€)`; dp = { fechaReserva: sv[0]?.startDate || null, descripcion: desc, nombreCliente: pk.contactName || '', importeTotal: pk.totalPack || 0, staff: sv[0]?.staffName || '', contactId: pk.contactId || '', desglosemetodopago: msg.desglosemetodopago || '' }; } try { const r = await cobrarBookings({ bookingIds: ids, metodoPago: mp, datosPack: dp }); if (!r?.ok) { _payingBookingIds.delete(key); send('pay-error', { message: r?.error || 'Error' }); return; } send('pay-ok', { payload: r, metodoPago: mp }); } catch (e) { _payingBookingIds.delete(key); send('pay-error', { message: e.message }); } }

// ── AKIRA helpers ──
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fmtF(f) { if (!f) return '?'; const d = new Date(f+'T12:00:00Z'); const [,m,dd] = f.split('-'); return `${DIAS[d.getUTCDay()]} ${parseInt(dd)} de ${MESES[parseInt(m)]}`; }
function fmtErr(e) { if (!e) return null; if (typeof e === 'string') return e; if (e.message) return e.message; try { return JSON.stringify(e); } catch (_) { return 'Error.'; } }
const CHIP_LABELS = { reservar: 'reservar cita', cancelar: 'cancelar cita', modificar: 'modificar cita', consultar: 'consultar información' };

function buildConfirm(c, p) {
  const f = p.fechaISO || p.fecha, cl = p.cliente || p.nombre || '', em = p.empleado || '', hr = p.hora || p.horaHHmm || '';
  if (c === 'bloqueo') { if (!em || !f) return null; const d = new Date(f+'T12:00:00Z'); if (d.getUTCDay() === 0) return `El domingo ${fmtF(f)} el salón está cerrado.`; if (p.horaInicio && p.horaFin) return `¿Bloquear a ${em} el ${fmtF(f)} de ${p.horaInicio} a ${p.horaFin}?`; return `¿Bloquear el ${fmtF(f)} para ${em}? (día completo)`; }
  if (c === 'reserva') { const s = p.servicio || p.serviceName || '?'; if (!em || !f || hr === '?' || !hr) return null; let m = `¿Reservar ${s} con ${em} el ${fmtF(f)} a las ${hr}?`; if (cl) m += ` Cliente: ${cl}.`; return m; }
  if (c === 'reserva_color') { const s = p.servicio || p.serviceName || '?'; if (!em || !f || hr === '?' || !hr) return null; let m = `¿Reservar ${s} con ${em} el ${fmtF(f)} a las ${hr}?`; if (p.longitudPelo && p.longitudPelo !== 'M') m += ` Pelo: ${p.longitudPelo}.`; if (p.corte === true || p.corte === 'si' || p.corte === 'sí') m += ' Con corte.'; if (cl) m += ` Cliente: ${cl}.`; return m; }
  if (c === 'cancelar') { if (!f) return null; if (!cl && !em && !hr) return null; const s = p.servicio || p.serviceName || ''; let m = s ? `¿Cancelar ${s}` : '¿Cancelar la cita'; if (cl) m += ` de ${cl}`; m += ` del ${fmtF(f)}`; if (hr) m += ` a las ${hr}`; if (em) m += ` con ${em}`; m += '?'; return m; }
  if (c === 'mover') { const nf = p.nuevaFechaISO || p.nuevaFecha, nh = p.nuevaHora || p.nuevaHoraHHmm || '', ne = p.nuevoEmpleado || ''; if (!f || (!nf && !nh && !ne)) return null; if (!cl && !em && !hr) return null; const s = p.servicio || p.serviceName || ''; let m = s ? `¿Mover ${s}` : '¿Mover la cita'; if (cl) m += ` de ${cl}`; m += ` del ${fmtF(f)}`; if (nf && nf !== f) m += ` al ${fmtF(nf)}`; if (nh) m += ` a las ${nh}`; if (ne) m += `, con ${ne}`; m += '?'; return m; }
  if (c === 'complemento') { const co = p.complemento || ''; if (!co || !f) return null; if (!cl && !em && !hr) return null; let m = `¿Añadir ${co} a la cita`; if (cl) m += ` de ${cl}`; m += ` del ${fmtF(f)}?`; return m; }
  if (c === 'eliminar_complemento') { const co = p.complemento || ''; if (!co || !f) return null; if (!cl && !em && !hr) return null; let m = `¿Eliminar ${co} de la cita`; if (cl) m += ` de ${cl}`; m += ` del ${fmtF(f)}?`; return m; }
  if (c === 'eliminar_bloqueo') { if (!em || !f) return null; let m = `¿Eliminar bloqueo de ${em} del ${fmtF(f)}`; if (p.horaInicio) m += ` a las ${p.horaInicio}`; m += '?'; return m; }
  if (c === 'cambiar_servicio') { const ns = p.nuevoServicio || p.servicio || ''; if (!f || !ns) return null; if (!cl && !em && !hr) return null; let m = `¿Cambiar servicio`; if (cl) m += ` de ${cl}`; m += ` del ${fmtF(f)} → ${ns}?`; return m; }
  return null;
}

function buildMissing(c, p) {
  const miss = [];
  if (c === 'bloqueo') { if (!p.empleado) miss.push('el empleado'); if (!(p.fechaISO || p.fecha)) miss.push('la fecha'); }
  if (c === 'reserva') { if (!p.empleado) miss.push('el empleado'); if (!(p.fechaISO || p.fecha)) miss.push('la fecha'); if (!(p.hora || p.horaHHmm) || p.hora === '?') miss.push('la hora'); const s = p.servicio || p.serviceName; if (!s || s === '?') miss.push('qué servicio'); }
  if (c === 'reserva_color') { if (!p.empleado) miss.push('el empleado'); if (!(p.fechaISO || p.fecha)) miss.push('la fecha'); if (!(p.hora || p.horaHHmm) || p.hora === '?') miss.push('la hora'); const s = p.servicio || p.serviceName; if (!s || s === '?') miss.push('qué servicio'); }
  if (c === 'cancelar') { if (!(p.fechaISO || p.fecha)) miss.push('la fecha'); if (!(p.cliente || p.nombre) && !p.empleado && !(p.hora || p.horaHHmm)) miss.push('quién tiene la cita'); }
  if (c === 'mover') { if (!(p.fechaISO || p.fecha)) miss.push('la fecha'); if (!(p.cliente || p.nombre) && !p.empleado && !(p.hora || p.horaHHmm)) miss.push('quién tiene la cita'); if (!(p.nuevaFechaISO || p.nuevaFecha) && !(p.nuevaHora || p.nuevaHoraHHmm) && !p.nuevoEmpleado) miss.push('qué quieres cambiar'); }
  if (c === 'complemento') { if (!p.complemento) miss.push('qué complemento'); if (!(p.fechaISO || p.fecha)) miss.push('la fecha'); if (!(p.cliente || p.nombre) && !p.empleado && !(p.hora || p.horaHHmm)) miss.push('a qué cita'); }
  if (c === 'eliminar_complemento') { if (!p.complemento) miss.push('qué complemento'); if (!(p.fechaISO || p.fecha)) miss.push('la fecha'); if (!(p.cliente || p.nombre) && !p.empleado && !(p.hora || p.horaHHmm)) miss.push('a qué cita'); }
  if (c === 'eliminar_bloqueo') { if (!p.empleado) miss.push('el empleado'); if (!(p.fechaISO || p.fecha)) miss.push('la fecha'); }
  if (c === 'cambiar_servicio') { if (!(p.fechaISO || p.fecha)) miss.push('la fecha'); if (!(p.cliente || p.nombre) && !p.empleado && !(p.hora || p.horaHHmm)) miss.push('a qué cita'); if (!p.nuevoServicio && !p.servicio) miss.push('el nuevo servicio'); }
  if (miss.length === 0) return null;
  const L = { 'bloqueo':'hacer el bloqueo','reserva':'hacer la reserva','reserva_color':'reservar coloración','cancelar':'cancelar la cita','mover':'mover la cita','complemento':'añadir complemento','eliminar_complemento':'eliminar complemento','eliminar_bloqueo':'eliminar bloqueo','cambiar_servicio':'cambiar servicio' };
  return `Para ${L[c]||'completar'} necesito que me digas ${miss.length===1?miss[0]:miss.slice(0,-1).join(', ')+' y '+miss[miss.length-1]}.`;
}

function deducirDesdeCalendario(categoria, params) {
  if (!['cancelar','mover','complemento','eliminar_complemento','cambiar_servicio'].includes(categoria)) return;
  if (!_currentReservas.length) return;
  const tieneCliente = !!(params.cliente || params.nombre); const tieneEmpleado = !!params.empleado;
  const tieneHora = !!(params.hora || params.horaHHmm) && (params.hora || params.horaHHmm) !== '?';
  if (tieneCliente && tieneEmpleado && tieneHora) return;
  if (!params.fechaISO && !params.fecha) { params.fechaISO = _currentFecha; params.fecha = _currentFecha; }
  const servicio = (params.servicio || params.serviceName || '').toLowerCase().trim();
  const empleado = (params.empleado || '').toLowerCase().trim();
  const cliente = (params.cliente || params.nombre || '').toLowerCase().trim();
  const hora = (params.hora || params.horaHHmm || '').trim();
  const matches = _currentReservas.filter(r => {
    if (r.tipo !== 'booking' && r.tipo !== 'externo') return false;
    if (servicio) { const rSvc = (r.servicio || '').toLowerCase(); if (!rSvc.includes(servicio) && !servicio.includes(rSvc)) return false; }
    if (empleado) { const sn = normalizeStaffName(staffNameById(r.resourceId)); if (!sn.includes(empleado) && !empleado.includes(sn)) return false; }
    if (cliente) { const rc = (r.cliente || '').toLowerCase(); if (!rc.includes(cliente) && !cliente.includes(rc)) return false; }
    if (hora && hora !== '?') { if (r.startTime !== hora) return false; }
    return true;
  });
  if (matches.length === 1) {
    const m = matches[0];
    if (!tieneEmpleado) params.empleado = normalizeStaffName(staffNameById(m.resourceId));
    if (!tieneHora) { params.hora = m.startTime; params.horaHHmm = m.startTime; }
    if (!tieneCliente && m.cliente) { params.cliente = m.cliente; params.nombre = m.cliente; }
    console.log(`${TAG} ⚡ Deducido: emp=${params.empleado}, hora=${params.hora}, cli=${params.cliente}`);
  }
}

// ── AKIRA handlers ──
async function handleAkiraQuery(msg) {
  const query = (msg.query || '').trim(), messageId = msg.messageId || null, history = Array.isArray(msg.history) ? msg.history : [];
  if (!query) { send('akira-response', { ok: false, messageId, error: 'Consulta vacía.' }); return; }

  if (pendingAction) {
    const qLow = query.toLowerCase().replace(/[.!¡¿?]/g, '').trim();
    if (CONFIRM_SET.has(qLow)) { return handleAkiraExecute({ messageId }); }
    if (CANCEL_SET.has(qLow)) { return handleAkiraCancel({ messageId }); }
  }

  // v1.5.0+v1.6.0: Interceptar navegación en JS — sin Sonnet
  const navFecha = detectNavegacion(query);
  if (navFecha) {
    console.log(`${TAG} 📅 Navegación directa → ${navFecha}`);
    send('navigate-date', { fecha: navFecha, respuesta: `Aquí tienes la agenda del ${fmtF(navFecha)}.` });
    return;
  }

  const fechaCal = msg.fechaCalendario || null;
  const chipActivo = msg.chipActivo || null;
  let enrichedQuery = query;
  const ctx = [];
  // v1.7.0: Enviar fecha real ANTES de la fecha del calendario
  ctx.push(`Hoy es: ${fmtF(hoyMadrid())} (${hoyMadrid()})`);
  if (fechaCal) ctx.push(`Fecha del calendario: ${fmtF(fechaCal)} (${fechaCal})`);
  if (chipActivo && CHIP_LABELS[chipActivo]) ctx.push(`Acción solicitada: ${CHIP_LABELS[chipActivo]}`);
  if (ctx.length) enrichedQuery = `[${ctx.join('] [')}] ${query}`;

  console.log(`${TAG} ← akira: "${enrichedQuery}"`);
  try {
    const cl = await akiraClassify({ query: enrichedQuery, history });
    if (!cl?.ok) { send('akira-response', { ok: false, messageId, error: fmtErr(cl?.error) || 'No pude clasificar.' }); return; }
    const { categoria, params } = cl;

    if (categoria === 'ver_agenda') {
      const fecha = params.fechaISO || params.fecha;
      if (fecha) { send('navigate-date', { fecha, respuesta: `Aquí tienes la agenda del ${fmtF(fecha)}.` }); }
      else { send('akira-response', { ok: true, messageId, respuesta: '¿A qué fecha quieres ir?' }); }
      return;
    }

    if (ACTION_CATEGORIES.has(categoria)) {
      deducirDesdeCalendario(categoria, params);
      const cm = buildConfirm(categoria, params);
      if (cm) {
        if (categoria === 'reserva') {
          try { const pc = await preCheckDisponibilidadSimple({ servicio: params.servicio || params.serviceName || '', empleado: params.empleado || '', fecha: params.fechaISO || params.fecha || '', hora: params.hora || params.horaHHmm || '' }); if (pc && !pc.ok) { send('akira-response', { ok: true, messageId, respuesta: pc.error }); return; } } catch (e) {}
        }
        pendingAction = { categoria, params };
        send('akira-action-confirm', { messageId, message: cm });
        return;
      }
      send('akira-response', { ok: true, messageId, respuesta: buildMissing(categoria, params) || 'Necesito más datos.' }); return;
    }
    const resp = await akiraRespond({ query: enrichedQuery, categoria, datos: cl.datos, history });
    if (!resp?.ok) { const fb = resp?.respuesta; send('akira-response', { ok: !!fb, messageId, respuesta: fb || null, error: fb ? null : fmtErr(resp?.error) }); return; }
    send('akira-response', { ok: true, messageId, respuesta: resp.respuesta });
  } catch (e) { console.error(`${TAG} ❌ akira:`, e); send('akira-response', { ok: false, messageId, error: e?.message || 'Error.' }); }
}

async function handleAkiraExecute(msg) {
  const messageId = msg.messageId || null;
  if (!pendingAction) { send('akira-response', { ok: false, messageId, error: 'No hay acción pendiente.' }); return; }
  const { categoria, params: p } = pendingAction; pendingAction = null;
  console.log(`${TAG} → Ejecutando: ${categoria}`);
  try {
    let r;
    if (categoria === 'bloqueo') r = await ejecutarBloqueo({ empleado: p.empleado, fecha: p.fechaISO || p.fecha, horaInicio: p.horaInicio || '', horaFin: p.horaFin || '' });
    else if (categoria === 'reserva') r = await ejecutarReservaSimple({ servicio: p.servicio || p.serviceName || '', empleado: p.empleado, fecha: p.fechaISO || p.fecha, hora: p.hora || p.horaHHmm || '', cliente: p.cliente || p.nombre || '' });
    else if (categoria === 'reserva_color') r = await ejecutarReservaColor({ servicio: p.servicio || p.serviceName || '', empleado: p.empleado, fecha: p.fechaISO || p.fecha, hora: p.hora || p.horaHHmm || '', longitudPelo: p.longitudPelo || 'M', corte: p.corte || false, totalChecked: p.totalChecked || false, peinadoValue: p.peinadoValue || null, tratamientoValue: p.tratamientoValue || null, cliente: p.cliente || p.nombre || '' });
    else if (categoria === 'cancelar') r = await ejecutarCancelacion({ cliente: p.cliente || p.nombre || '', empleado: p.empleado || '', fechaISO: p.fechaISO || p.fecha, hora: p.hora || p.horaHHmm || '', servicio: p.servicio || p.serviceName || '' });
    else if (categoria === 'mover') r = await ejecutarMoverReserva({ cliente: p.cliente || p.nombre || '', empleado: p.empleado || '', fechaISO: p.fechaISO || p.fecha, hora: p.hora || p.horaHHmm || '', nuevaFechaISO: p.nuevaFechaISO || p.nuevaFecha || '', nuevaHora: p.nuevaHora || p.nuevaHoraHHmm || '', nuevoEmpleado: p.nuevoEmpleado || '', servicio: p.servicio || p.serviceName || '' });
    else if (categoria === 'complemento') r = await ejecutarAnadirComplemento({ complemento: p.complemento || '', cliente: p.cliente || p.nombre || '', fechaISO: p.fechaISO || p.fecha, empleado: p.empleado || '', hora: p.hora || p.horaHHmm || '' });
    else if (categoria === 'eliminar_complemento') r = await ejecutarEliminarComplemento({ complemento: p.complemento || '', cliente: p.cliente || p.nombre || '', fechaISO: p.fechaISO || p.fecha, empleado: p.empleado || '', hora: p.hora || p.horaHHmm || '' });
    else if (categoria === 'eliminar_bloqueo') r = await ejecutarEliminarBloqueo({ empleado: p.empleado || '', fechaISO: p.fechaISO || p.fecha, horaInicio: p.horaInicio || '' });
    else if (categoria === 'cambiar_servicio') r = await ejecutarCambiarServicio({ nuevoServicio: p.nuevoServicio || p.servicio || '', familiaServicio: p.familiaServicio || 'coloracion', cliente: p.cliente || p.nombre || '', fechaISO: p.fechaISO || p.fecha, empleado: p.empleado || '', hora: p.hora || p.horaHHmm || '', corte: p.corte, totalChecked: p.totalChecked, peinadoValue: p.peinadoValue || null, tratamientoValue: p.tratamientoValue || null, longitudPelo: p.longitudPelo || null });
    else r = { ok: false, error: `"${categoria}" no implementada` };
    if (r?.ok) send('akira-action-done', { ok: true, messageId, respuesta: r.mensaje, refreshCalendar: true });
    else send('akira-response', { ok: true, messageId, respuesta: fmtErr(r?.error) || 'No se pudo completar.' });
  } catch (e) { console.error(`${TAG} ❌ ejecutar:`, e); send('akira-response', { ok: false, messageId, error: 'Error ejecutando.' }); }
}

function handleAkiraCancel(msg) { pendingAction = null; send('akira-response', { ok: true, messageId: msg.messageId || null, respuesta: 'Acción cancelada.' }); }

$w.onReady(function () {
  _el = $w('#kamisuiteMobile');
  if (!_el) { console.error(`${TAG} ❌ #kamisuiteMobile no encontrado`); return; }
  console.log(`${TAG} ✅ Iniciado`);
  handleGetStaff();
  _el.on('mobile-message', (event) => {
    const msg = event.detail || {};
    switch (msg.type) {
      case 'ready': break;
      case 'get-staff': handleGetStaff(); break;
      case 'get-reservas': handleGetReservas(msg.fecha); break;
      case 'get-settings': handleGetSettings(); break;
      case 'save-settings': handleSaveSettings(msg.settings); break;
      case 'pay': handlePay(msg); break;
      case 'akira-query': handleAkiraQuery(msg); break;
      case 'akira-execute': handleAkiraExecute(msg); break;
      case 'akira-cancel': handleAkiraCancel(msg); break;
    }
  });
  setInterval(() => send('tick', {}), 30000);
});