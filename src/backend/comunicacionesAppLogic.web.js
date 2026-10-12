/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — App de Comunicaciones · Backend web module · v1.0.0
 * Ruta: backend/comunicacionesAppLogic.web.js
 * FECHA: 12 Octubre 2026
 *
 * REQUIERE: pagecode_comunicaciones.js v1.6.1 + Comunicaciones v1.7.1 (widget)
 *
 * QUÉ ES: el backend propio de la app de Comunicaciones para dos cosas
 *   que no son envío de campañas:
 *   1. Estado de los canales: la app NO tiene interruptores; lee los que
 *      ya existen en SalonConfig y apaga lo que esté apagado.
 *   2. Pestaña Servicio de Email: los correos automáticos que ya existen
 *      (confirmación, recordatorio, compras, resumen diario), su estado,
 *      su vista previa y un envío de prueba.
 *   No cambia ningún envío existente: solo lee y, para las pruebas, llama
 *   a las mismas funciones de producción que usan los motores.
 *
 * CHANGELOG
 * ---------
 * v1.0.0 (12-Oct-2026) — Versión inicial.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ESTADO DE CADA CORREO = LO QUE HACE SU MOTOR HOY (leído en el código)
 * ───────────────────────────────────────────────────────────────────────────
 *  Canal email/WhatsApp: abierto solo si emailActive / waActive === true
 *    (centralita comunicacionesLogic, reminderLogic, whatsappLogic).
 *  Confirmación: sale si el canal email está abierto (comunicacionesLogic
 *    v1.5.0, `if (!config.emailActive) return`).
 *  Recordatorio: canal abierto Y emailReminder !== false (reminderLogic
 *    v1.10.0+, líneas 457-463).
 *  Compras (bono, tarjeta, PRIME): voucherPublicLogic, bonosPromosPublicLogic
 *    y primePublicLogic NO consultan emailActive antes del correo: hoy sale
 *    aunque el canal email esté cerrado. Se informa tal cual (`ignoraCanal`),
 *    no se maquilla.
 *  Resumen diario: dailySummaryActive === true (resumenDiarioLogic v1.2.0,
 *    "vacío = apagado"). No depende de emailActive.
 *  Proveedor: SalonConfig.emailProvider 'brevo' → plantillas HTML de
 *    SalonConfig; otro valor → plantillas del sistema anterior (sin vista
 *    previa ni prueba desde aquí).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PLANTILLAS Y ASUNTOS (copiados de cada motor)
 * ───────────────────────────────────────────────────────────────────────────
 *  confirmacion → SalonConfig.layoutBooking · asunto subjectBooking ||
 *                 `Confirmación de tu cita · ${brandName}` (comunicacionesLogic)
 *  recordatorio → SalonConfig.reminderLayout · 'Recordatorio de tu cita'
 *                 (reminderLogic)
 *  compras      → SalonConfig.specialpurchaseLayout · `Confirmación de compra
 *                 · ${tituloProducto}` (voucher/bonosPromos/primePublicLogic)
 *  resumen      → HTML construido en código (construirResumenDiario)
 *
 *  Prueba de un correo de plantilla: enviarEmailPlantilla (brevoLogic) con
 *  la misma plantilla. La identidad del salón la pone brevoLogic; los
 *  marcadores del evento (${Nombre}, ${Fecha}…) van como «[Nombre]»,
 *  «[Fecha]»… para que se vea dónde cae cada dato. ${bloqueProductos} va
 *  vacío. Se apunta en CommunicationLog con event 'prueba' (el Monitor ya
 *  lo muestra como «Prueba de email»).
 *  Prueba del resumen: enviarResumenDiario({ forzar:true }), la misma del
 *  botón de prueba existente: va a los destinatarios configurados del
 *  resumen y se apunta como resumen_diario_prueba.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AUDITORÍA DE CONEXIONES
 * ───────────────────────────────────────────────────────────────────────────
 *  LEE de:   SalonConfig (waActive, emailActive, whatsappReminder,
 *            emailReminder, dailySummaryActive, emailProvider, subjectBooking,
 *            brandName, logoUrl, address, phone, siteUrl, layoutBooking,
 *            reminderLayout, specialpurchaseLayout — field IDs ya en
 *            producción en esos motores).
 *  ESCRIBE:  CommunicationLog solo vía registrarComunicacion (pruebas).
 *  LE LLAMA: page code Comunicaciones v1.6.1.
 *  LLAMA A:  brevoLogic.enviarEmailPlantilla · comunicacionesLogic.
 *            registrarComunicacion · resumenDiarioLogic.construirResumenDiario
 *            y enviarResumenDiario. Ninguno se modifica.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { webMethod, Permissions } from 'wix-web-module';
import wixData from 'wix-data';
import { enviarEmailPlantilla } from 'backend/brevoLogic.web.js';
import { registrarComunicacion } from 'backend/comunicacionesLogic.web.js';
import { construirResumenDiario, enviarResumenDiario } from 'backend/resumenDiarioLogic.web.js';

const VERSION = '1.0.0';
const TAG = `[ComunicacionesApp][${VERSION}]`;
const AUTH = { suppressAuth: true };
const C_SALON = 'SalonConfig';

const MSG_FALLO = 'No se ha podido completar la operación. Vuelve a intentarlo en unos segundos.';

// Marcadores que inyecta brevoLogic.enviarEmailPlantilla desde SalonConfig.
const MARCADORES_SALON = ['logo', 'salon', 'direccion', 'telefono', 'web'];

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function _txt(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function _emailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')); }

/* wix:image:// → URL pública. Copia literal de brevoLogic.web.js v1.2.0. */
function convertWixImageUrl(wixUrl) {
  if (!wixUrl) return '';
  if (typeof wixUrl !== 'string') return '';
  if (!wixUrl.startsWith('wix:image://')) return wixUrl;
  try {
    const match = wixUrl.match(/wix:image:\/\/v1\/([^\/]+)/);
    if (match && match[1]) return 'https://static.wixstatic.com/media/' + match[1];
  } catch (e) {}
  return '';
}

async function _leerSalon() {
  const res = await wixData.query(C_SALON).limit(1).find(AUTH);
  return (res.items && res.items[0]) || null;
}

/* Estado de los canales con el criterio de cada motor. */
function _canales(s) {
  return {
    whatsapp: {
      abierto:      s.waActive === true,
      recordatorio: s.whatsappReminder !== false
    },
    email: {
      abierto:      s.emailActive === true,
      recordatorio: s.emailReminder !== false,
      proveedor:    _txt(s.emailProvider).toLowerCase() === 'brevo' ? 'brevo' : 'anterior'
    },
    resumenDiario: {
      activo: s.dailySummaryActive === true
    }
  };
}

/* Los correos automáticos que existen hoy, con su estado real. */
function _correos(s, canales) {
  const brand = _txt(s.brandName);
  const e = canales.email;
  const conPlantilla = e.proveedor === 'brevo';

  const motivoCanal = 'Canal email apagado en la configuración del salón';

  return [
    {
      clave: 'confirmacion',
      nombre: 'Confirmación de cita',
      descripcion: 'Sale al crear la cita, desde Recepción o desde la web.',
      encendido: e.abierto,
      motivo: e.abierto ? '' : motivoCanal,
      asunto: _txt(s.subjectBooking) || `Confirmación de tu cita · ${brand}`,
      campo: 'layoutBooking',
      html: conPlantilla ? String(s.layoutBooking || '') : ''
    },
    {
      clave: 'recordatorio',
      nombre: 'Recordatorio de cita',
      descripcion: 'Sale el día antes de la cita.',
      encendido: e.abierto && e.recordatorio,
      motivo: !e.abierto ? motivoCanal : (!e.recordatorio ? 'Recordatorio por email desactivado en la configuración del salón' : ''),
      asunto: 'Recordatorio de tu cita',
      campo: 'reminderLayout',
      html: conPlantilla ? String(s.reminderLayout || '') : ''
    },
    {
      clave: 'compras',
      nombre: 'Compra de bono, tarjeta o PRIME',
      descripcion: 'Sale al pagar una compra en la web.',
      // Hoy sale aunque el canal email esté cerrado: esos motores no lo miran.
      encendido: true,
      ignoraCanal: !e.abierto,
      motivo: '',
      asunto: 'Confirmación de compra · [tituloProducto]',
      campo: 'specialpurchaseLayout',
      html: conPlantilla ? String(s.specialpurchaseLayout || '') : ''
    },
    {
      clave: 'resumen',
      nombre: 'Resumen diario al salón',
      descripcion: 'Sale cada día a la hora configurada, al equipo del salón.',
      encendido: canales.resumenDiario.activo,
      motivo: canales.resumenDiario.activo ? '' : 'Resumen diario desactivado en la configuración del salón',
      asunto: 'Resumen del día',
      campo: '',
      html: ''
    }
  ];
}

/* Marcadores ${clave} de una plantilla, sin repetir. */
function _marcadores(html) {
  const vistos = {};
  const re = /\$\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(String(html || '')))) { vistos[m[1]] = true; }
  return Object.keys(vistos);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. ESTADO DE LOS CANALES  (al arrancar la app)
// ═══════════════════════════════════════════════════════════════════════════
export const getEstadoCanales = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const s = await _leerSalon();
      if (!s) { return { ok: false, error: 'No se ha podido leer la configuración del salón.' }; }
      return Object.assign({ ok: true }, _canales(s));
    } catch (e) {
      console.error(`${TAG} ❌ getEstadoCanales:`, e.message);
      return { ok: false, error: MSG_FALLO };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 2. SERVICIO DE EMAIL — correos automáticos con su estado y plantilla
// ═══════════════════════════════════════════════════════════════════════════
export const getServicioEmail = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const s = await _leerSalon();
      if (!s) { return { ok: false, error: 'No se ha podido leer la configuración del salón.' }; }
      const canales = _canales(s);
      return {
        ok: true,
        canales,
        identidad: {
          logo:      convertWixImageUrl(s.logoUrl),
          salon:     _txt(s.brandName),
          direccion: _txt(s.address),
          telefono:  _txt(s.phone),
          web:       _txt(s.siteUrl)
        },
        correos: _correos(s, canales)
      };
    } catch (e) {
      console.error(`${TAG} ❌ getServicioEmail:`, e.message);
      return { ok: false, error: MSG_FALLO };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 3. VISTA PREVIA DEL RESUMEN DIARIO (contenido de hoy)
// ═══════════════════════════════════════════════════════════════════════════
export const vistaPreviaResumen = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const r = await construirResumenDiario({});
      if (!r || !r.ok || !r.html) {
        console.error(`${TAG} vista previa del resumen no disponible:`, JSON.stringify(r && r.error));
        return { ok: false, error: 'No se ha podido montar el resumen de hoy. Vuelve a intentarlo en unos minutos.' };
      }
      return { ok: true, html: r.html };
    } catch (e) {
      console.error(`${TAG} ❌ vistaPreviaResumen:`, e.message);
      return { ok: false, error: MSG_FALLO };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 4. PRUEBA DE UN CORREO DE SERVICIO
// ═══════════════════════════════════════════════════════════════════════════
export const enviarPruebaServicioEmail = webMethod(
  Permissions.SiteMember,
  async ({ clave, to }) => {
    try {
      const s = await _leerSalon();
      if (!s) { return { ok: false, error: 'No se ha podido leer la configuración del salón.' }; }
      const canales = _canales(s);
      const correo = _correos(s, canales).find(c => c.clave === clave);
      if (!correo) { return { ok: false, error: 'Correo de servicio no reconocido.' }; }
      if (!correo.encendido) { return { ok: false, error: `${correo.nombre}: está apagado. ${correo.motivo}.` }; }

      // Resumen diario: la misma prueba que ya existe, a sus destinatarios.
      if (clave === 'resumen') {
        const r = await enviarResumenDiario({ forzar: true });
        if (r && r.ok) {
          return { ok: true, clave, enviados: r.enviados || 0, destinatarios: r.destinatarios || 0, aResumen: true };
        }
        if (r && r.reason === 'sin destinatarios') {
          return { ok: false, error: 'El resumen diario no tiene destinatarios ni correo general del salón al que enviarse.' };
        }
        console.error(`${TAG} prueba del resumen fallida:`, JSON.stringify(r));
        return { ok: false, error: 'No se ha podido enviar la prueba del resumen. Vuelve a intentarlo en unos minutos.' };
      }

      if (canales.email.proveedor !== 'brevo') {
        return { ok: false, error: 'Este salón envía estos correos con el sistema anterior: la prueba solo está disponible con el sistema de correo actual.' };
      }
      const destino = _txt(to);
      if (!_emailValido(destino)) { return { ok: false, error: 'Escribe una dirección válida para la prueba.' }; }
      if (!_txt(correo.html)) {
        return { ok: false, error: `${correo.nombre}: la plantilla está vacía en la configuración del salón.` };
      }

      // Marcadores del evento → «[clave]»; la identidad la pone brevoLogic.
      const variables = {};
      _marcadores(correo.html).forEach(k => {
        if (MARCADORES_SALON.indexOf(k) >= 0) { return; }
        variables[k] = (k === 'bloqueProductos') ? '' : `[${k}]`;
      });

      const r = await enviarEmailPlantilla({
        to: destino,
        toName: 'Prueba',
        templateField: correo.campo,
        subject: `[Prueba] ${correo.asunto}`,
        variables,
        event: 'prueba'
      });

      // Apunte no bloqueante: patrón de reminderLogic.registrarEmailRecordatorio.
      try {
        await registrarComunicacion({
          event:       'prueba',
          channel:     'email',
          recipient:   destino,
          clientName:  `Prueba · ${correo.nombre}`,
          result:      (r && r.ok) ? 'ok' : 'error',
          errorDetail: (r && r.ok) ? '' : String((r && r.error) || '')
        });
      } catch (logErr) {
        console.error(`${TAG} apunte de prueba (no bloqueante):`, logErr.message);
      }

      if (!r || !r.ok) {
        console.error(`${TAG} prueba ${clave} fallida:`, r && r.error);
        return { ok: false, error: `No se ha podido enviar la prueba de «${correo.nombre}». Comprueba el correo remitente del salón y vuelve a intentarlo.` };
      }
      return { ok: true, clave, to: destino };

    } catch (e) {
      console.error(`${TAG} ❌ enviarPruebaServicioEmail:`, e.message);
      return { ok: false, error: MSG_FALLO };
    }
  }
);
