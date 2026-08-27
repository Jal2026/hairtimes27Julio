/**
 * ============================================================
 *  brevoLogic.web.js — KAMISUITE Email vía Brevo
 * ============================================================
 *  v1.1.1  ·  27 Agosto 2026
 * ------------------------------------------------------------
 *  Backend de envío de email (transaccional + marketing) vía
 *  Brevo Transactional API (POST /v3/smtp/email).
 *
 *  DISEÑO MULTI-TENANT
 *    - Cuenta Brevo única. Secreto compartido KAMISUITE_BREVO.
 *    - Dominio de envío autenticado una sola vez
 *      (notificaciones.kamisuite.com). Cero DNS por salón.
 *    - Remitente y marca por salón desde SalonConfig:
 *        From email  ← senderEmail  (fallback DEFAULT_SENDER_EMAIL)
 *        From name   ← senderName || brandName
 *        Reply-To    ← generalEmail (respuestas al salón)
 *    - La PLANTILLA del email NO vive en código: vive en un campo de
 *      SalonConfig (p.ej. layoutBooking) y se sustituyen los marcadores.
 *      Alta de un salón nuevo = rellenar SalonConfig.
 *
 *  MARCADORES DE PLANTILLA  (sintaxis ${clave})
 *    - De salón (los inyecta este módulo desde SalonConfig):
 *        ${logo} ${salon} ${direccion} ${telefono} ${web}
 *        (${logo} se convierte de wix:image:// a URL pública)
 *    - Del evento (los pasa el caller en `variables`):
 *        p.ej. ${Fecha} ${Nombre} ${Apellido} ${servicios} ${profesional}
 *              ${horaInicio} ${horaFinal} ${importeTotal} ${origen} ${estadoPago}
 *
 *  AISLAMIENTO
 *    - No modifica ningún backend existente.
 *    - El filtrado de emails ficticios se mantiene en la centralita.
 *    - enviarEmailPlantilla NO escribe en CommunicationLog: el log lo
 *      hace el caller (la centralita) con sus campos ricos.
 *
 *  SECRETO WIX
 *    KAMISUITE_BREVO — API key de Brevo
 *
 *  CMS
 *    SalonConfig → senderEmail, senderName, brandName, generalEmail,
 *                  logoUrl (Image), address, phone, siteUrl, emailProvider,
 *                  layoutBooking (y futuras plantillas por tipo)
 *
 *  CHANGELOG
 *  ---------
 *  v1.1.1 (27-Ago-2026) — Logo a URL pública.
 *    - convertWixImageUrl (patrón "Tienda Productos widget", ya presente
 *      en el repo — calendarioVista/salonPhotoLogic/promoGiftCards):
 *      convierte el wix:image:// de SalonConfig.logoUrl a URL pública
 *      https://static.wixstatic.com/media/... para que ${logo} cargue
 *      en el email (los clientes de email no pintan wix:image://).
 *      URLs ya públicas pasan tal cual.
 *    - Aplicado en enviarEmailPlantilla (${logo}) y en el wrapper de prueba.
 *  v1.1.0 (27-Ago-2026) — Plantilla desde CMS + reply-to.
 *    - enviarEmailPlantilla: envía usando la plantilla HTML guardada en
 *      un campo de SalonConfig (p.ej. layoutBooking) y sustituye los
 *      marcadores ${...}. El HTML del email deja de vivir en código.
 *    - Marcadores de salón inyectados desde SalonConfig; los del evento
 *      los pasa el caller. Reply-To por defecto = SalonConfig.generalEmail.
 *    - Helpers _buildSender y _sustituir.
 *  v1.0.0 (27-Ago-2026) — Módulo inicial aislado.
 *    - enviarEmailBrevo (genérico), enviarPruebaBrevo, getEmailProvider,
 *      wrapper HTML de marca, log no-blocking en CommunicationLog.
 * ============================================================
 */

import { Permissions, webMethod } from 'wix-web-module';
import { getSecret } from 'wix-secrets-backend';
import wixData from 'wix-data';
import { fetch } from 'wix-fetch';

// ── Constantes ──────────────────────────────────────────────
const VERSION = '1.1.1';
const TAG = '[Brevo v1.1.1]';
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const SALON_CONFIG_COLLECTION = 'SalonConfig';
const COMMUNICATION_LOG_COLLECTION = 'CommunicationLog';

// Remitente por defecto (dominio ya autenticado en Brevo). Solo se usa
// si SalonConfig.senderEmail está vacío. NO es dato de salón: es el
// dominio de envío de la plataforma, compartido por todos los salones.
const DEFAULT_SENDER_EMAIL = 'noreply@notificaciones.kamisuite.com';

// ── Caché SalonConfig ───────────────────────────────────────
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 min
let _configCache = null;
let _configCacheTs = 0;

async function _getSalonConfig() {
    const now = Date.now();
    if (_configCache && (now - _configCacheTs) < CONFIG_CACHE_TTL) {
        return _configCache;
    }
    try {
        const result = await wixData.query(SALON_CONFIG_COLLECTION)
            .limit(1)
            .find({ suppressAuth: true });
        if (!result.items || result.items.length === 0) {
            console.error(TAG, 'SalonConfig vacío — no se puede enviar email');
            return null;
        }
        _configCache = result.items[0];
        _configCacheTs = now;
        return _configCache;
    } catch (err) {
        console.error(TAG, 'Error leyendo SalonConfig:', err.message);
        return null;
    }
}

// ── Caché API key ───────────────────────────────────────────
const KEY_CACHE_TTL = 30 * 60 * 1000; // 30 min
let _keyCache = null;
let _keyCacheTs = 0;

async function _getBrevoKey() {
    const now = Date.now();
    if (_keyCache && (now - _keyCacheTs) < KEY_CACHE_TTL) {
        return _keyCache;
    }
    try {
        _keyCache = await getSecret('KAMISUITE_BREVO');
        _keyCacheTs = now;
        return _keyCache;
    } catch (err) {
        console.error(TAG, 'Error obteniendo KAMISUITE_BREVO:', err.message);
        return null;
    }
}

// ── wix:image:// → URL pública ──────────────────────────────
// Patrón "Tienda Productos widget" (idéntico al de calendarioVista /
// salonPhotoLogic / promoGiftCards en este mismo repo). Los clientes
// de email no cargan wix:image://; hay que darles la URL https pública.
// Si ya es http(s) o no reconoce el formato, devuelve el valor tal cual.
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

// ── Escape HTML para valores dinámicos ──────────────────────
function _esc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Remitente (From) desde SalonConfig ──────────────────────
// From email: senderEmail del salón o, si vacío, el remitente fijo
// autenticado. From name: senderName o, si vacío, brandName.
function _buildSender(salon) {
    const email = (salon.senderEmail || '').trim() || DEFAULT_SENDER_EMAIL;
    const name = (salon.senderName || salon.brandName || '').trim() || email;
    return { name, email };
}

// ── Sustitución de marcadores ${clave} en una plantilla ─────
// Los valores se escapan para HTML (seguro en texto y en atributos
// src/href). Cualquier marcador ${...} sin valor se elimina.
function _sustituir(plantilla, vars) {
    let out = String(plantilla || '');
    const keys = Object.keys(vars || {});
    for (const k of keys) {
        out = out.split('${' + k + '}').join(_esc(vars[k]));
    }
    out = out.replace(/\$\{[^}]*\}/g, '');
    return out;
}

// ── Wrapper HTML de marca (solo para envíos genéricos/prueba) ──
// Los emails a cliente usan plantilla de CMS (ver enviarEmailPlantilla).
// Este wrapper solo se usa en enviarEmailBrevo/enviarPruebaBrevo.
function _buildEmailHtml(salon, bodyHtml) {
    const brand = _esc(salon.brandName || '');
    const logo = convertWixImageUrl(salon.logoUrl);   // v1.1.1: URL pública
    const address = _esc(salon.address || '');
    const phone = _esc(salon.phone || '');
    const site = (salon.siteUrl || '').trim();

    const header = logo
        ? `<img src="${_esc(logo)}" alt="${brand}" style="max-height:56px;max-width:220px;display:block;margin:0 auto;">`
        : `<div style="font-size:22px;font-weight:700;color:#1a1a1a;text-align:center;">${brand}</div>`;

    const siteLine = site
        ? `<a href="${_esc(site)}" style="color:#6b6b6b;text-decoration:underline;">${_esc(site.replace(/^https?:\/\//, ''))}</a>`
        : '';

    const footerBits = [address, phone, siteLine].filter(Boolean).join(' &middot; ');

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #eeeeee;">${header}</td></tr>
      <tr><td style="padding:28px 32px;color:#2b2b2b;font-size:15px;line-height:1.55;">${bodyHtml}</td></tr>
      <tr><td style="padding:20px 32px 28px;border-top:1px solid #eeeeee;color:#8a8a8a;font-size:12px;line-height:1.5;text-align:center;">
        ${brand ? `<div style="font-weight:600;color:#6b6b6b;margin-bottom:4px;">${brand}</div>` : ''}
        ${footerBits}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Llamada a la API de Brevo (mismo patrón fetch que whatsappLogic) ──
async function _callBrevoAPI(payload) {
    const key = await _getBrevoKey();
    if (!key) {
        return { ok: false, status: 0, data: { error: 'API key Brevo no disponible' } };
    }
    try {
        const response = await fetch(BREVO_API_URL, {
            method: 'POST',
            headers: {
                'api-key': key,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
            console.error(TAG, `API Error ${response.status}:`, JSON.stringify(data));
            return { ok: false, status: response.status, data };
        }
        console.log(TAG, `Email enviado OK → ${payload.to && payload.to[0] ? payload.to[0].email : '?'}`, data.messageId || '');
        return { ok: true, status: response.status, data };
    } catch (err) {
        console.error(TAG, 'Error en fetch a Brevo:', err.message);
        return { ok: false, status: 0, data: { error: err.message } };
    }
}

// ── Log no-blocking en CommunicationLog (solo envíos genéricos/prueba) ──
async function _registrarLog({ event, recipient, clientName, result, errorDetail, messageId }) {
    try {
        await wixData.insert(COMMUNICATION_LOG_COLLECTION, {
            event:          event || '',
            channel:        'email',
            recipient:      recipient || '',
            clientName:     clientName || '',
            result:         result || '',
            errorDetail:    errorDetail || '',
            messageId:      messageId || '',
            deliveryStatus: result === 'ok' ? 'sent' : ''
        }, { suppressAuth: true });
    } catch (logErr) {
        console.error(TAG, 'Error escribiendo CommunicationLog (no-blocking):', logErr.message);
    }
}

// ── Reply-to: override explícito o generalEmail del salón ───
function _replyTo(salon, replyTo) {
    const rt = (replyTo && String(replyTo).trim())
        ? String(replyTo).trim()
        : (salon.generalEmail || '').trim();
    return rt ? { email: rt } : null;
}

// ── Core interno de envío (envíos genéricos/prueba, CON log) ──
async function _enviarEmail({ to, toName, subject, bodyHtml, event, replyTo }) {
    if (!to || !String(to).trim()) {
        return { ok: false, error: 'Falta destinatario (to)' };
    }
    if (!subject) {
        return { ok: false, error: 'Falta asunto (subject)' };
    }

    const salon = await _getSalonConfig();
    if (!salon) {
        return { ok: false, error: 'SalonConfig no disponible' };
    }

    const payload = {
        sender:      _buildSender(salon),
        to:          [ toName ? { email: String(to).trim(), name: toName } : { email: String(to).trim() } ],
        subject:     subject,
        htmlContent: _buildEmailHtml(salon, bodyHtml || '')
    };
    const rt = _replyTo(salon, replyTo);
    if (rt) payload.replyTo = rt;

    const res = await _callBrevoAPI(payload);
    const messageId = (res.data && res.data.messageId) ? res.data.messageId : '';

    await _registrarLog({
        event:       event || 'email',
        recipient:   to,
        clientName:  toName || '',
        result:      res.ok ? 'ok' : 'error',
        errorDetail: res.ok ? '' : JSON.stringify(res.data),
        messageId
    });

    return res.ok
        ? { ok: true, messageId }
        : { ok: false, error: (res.data && (res.data.message || res.data.error)) || `HTTP ${res.status}` };
}

// ═════════════════════════════════════════════════════════════
//  FUNCIONES EXPORTADAS
// ═════════════════════════════════════════════════════════════

/**
 * Envío por PLANTILLA de CMS. Lee la plantilla HTML de un campo de
 * SalonConfig (p.ej. 'layoutBooking'), inyecta la identidad del salón
 * y las variables del evento, sustituye los marcadores ${...} y envía.
 *
 * NO escribe en CommunicationLog: el log lo hace el caller (la centralita)
 * con sus campos ricos (services, staffName, etc.). Devuelve el resultado.
 *
 * @param {object} p
 * @param {string} p.to            — email destinatario (obligatorio)
 * @param {string} [p.toName]      — nombre destinatario
 * @param {string} p.templateField — nombre del campo de SalonConfig con la plantilla
 * @param {string} [p.subject]     — asunto
 * @param {object} [p.variables]   — marcadores del evento (${Fecha}, ${Nombre}, ...)
 * @param {string} [p.replyTo]     — reply-to (por defecto generalEmail)
 * @param {string} [p.event]       — etiqueta informativa
 * @returns {object} { ok, messageId? } | { ok:false, error }
 */
export const enviarEmailPlantilla = webMethod(
    Permissions.SiteMember,
    async ({ to, toName, templateField, subject, variables, replyTo, event }) => {
        if (!to || !String(to).trim()) {
            return { ok: false, error: 'Falta destinatario (to)' };
        }
        if (!templateField) {
            return { ok: false, error: 'Falta templateField' };
        }

        const salon = await _getSalonConfig();
        if (!salon) {
            return { ok: false, error: 'SalonConfig no disponible' };
        }

        const plantilla = (salon[templateField] || '').trim();
        if (!plantilla) {
            return { ok: false, error: `Plantilla vacía en SalonConfig.${templateField}` };
        }

        // Identidad del salón (marcadores comunes) + variables del evento.
        // Las del evento tienen prioridad si colisionan.
        // v1.1.1: ${logo} se convierte de wix:image:// a URL pública.
        const vars = Object.assign({
            logo:      convertWixImageUrl(salon.logoUrl),
            salon:     salon.brandName || '',
            direccion: salon.address || '',
            telefono:  salon.phone || '',
            web:       salon.siteUrl || ''
        }, variables || {});

        const payload = {
            sender:      _buildSender(salon),
            to:          [ toName ? { email: String(to).trim(), name: toName } : { email: String(to).trim() } ],
            subject:     subject || `Notificación · ${salon.brandName || ''}`,
            htmlContent: _sustituir(plantilla, vars)
        };
        const rt = _replyTo(salon, replyTo);
        if (rt) payload.replyTo = rt;

        const res = await _callBrevoAPI(payload);
        const messageId = (res.data && res.data.messageId) ? res.data.messageId : '';

        return res.ok
            ? { ok: true, messageId }
            : { ok: false, error: (res.data && (res.data.message || res.data.error)) || `HTTP ${res.status}` };
    }
);

/**
 * Envío genérico de email por Brevo (wrapper de marca en código).
 * Para usos internos/diagnóstico. Los emails a cliente usan plantilla CMS.
 *
 * @param {object} p  — { to, toName?, subject, bodyHtml, event?, replyTo? }
 * @returns {object} { ok, messageId? } | { ok:false, error }
 */
export const enviarEmailBrevo = webMethod(
    Permissions.SiteMember,
    async (p) => _enviarEmail(p || {})
);

/**
 * Envío de PRUEBA. Manda un email de muestra a la dirección indicada
 * con la identidad del salón actual. Valida el pipeline (DNS, key,
 * remitente, entrega).
 *
 * @param {string} email — destinatario de la prueba
 */
export const enviarPruebaBrevo = webMethod(
    Permissions.SiteMember,
    async (email) => {
        const salon = await _getSalonConfig();
        const brand = salon ? (salon.brandName || 'tu salón') : 'tu salón';
        const bodyHtml = `
      <p style="margin:0 0 14px;">Hola,</p>
      <p style="margin:0 0 14px;">Este es un <strong>email de prueba</strong> enviado por Brevo desde ${_esc(brand)}.</p>
      <p style="margin:0 0 14px;">Si lo ves con la cabecera, el logo y el pie correctos, la integración funciona.</p>
      <p style="margin:0;">— Sistema KAMISUITE</p>`;
        return _enviarEmail({
            to: email,
            subject: `Prueba de envío · ${brand}`,
            bodyHtml,
            event: 'prueba'
        });
    }
);

/**
 * Helper para el enrutado: devuelve el proveedor de email configurado
 * en SalonConfig ('wix' | 'brevo'). Fallback: 'wix'.
 */
export const getEmailProvider = webMethod(
    Permissions.SiteMember,
    async () => {
        const salon = await _getSalonConfig();
        const p = (salon && salon.emailProvider) ? String(salon.emailProvider).toLowerCase().trim() : '';
        return (p === 'brevo') ? 'brevo' : 'wix';
    }
);
