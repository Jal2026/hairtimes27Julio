// ╔══════════════════════════════════════════════════════════════════╗
// ║  sugerenciasProductosLogic.web.js — Sugerencias de producto     ║
// ║  KAMISUITE · v1.0.1 · 13 Septiembre 2026                        ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// FUNCIÓN: construye el bloque HTML de sugerencias de producto que se
// inserta en el correo de CONFIRMACIÓN y en el de RECORDATORIO de cita,
// en el marcador ${bloqueProductos} de las plantillas del salón.
//
// CRITERIO (decisión de Jal, 13-sep-2026):
//   La cita trae la categoría de su servicio principal
//   (KamisuiteReservations.group). Esa categoría se busca en el
//   `groupCatalog` de las filas de HairSalonServices (N:1, separado por
//   comas). La fila encontrada dice, en `productCollections`, qué
//   colecciones de la tienda alimentan el bloque. Categoría con
//   categoría: no interviene el sexo del cliente ni ningún otro eje.
//
//   Cero hardcoding: ni un nombre de ramal, ni un id de colección, ni
//   un dominio viven en este archivo.
//
// REPARTO POR CUOTA (decisión de Jal): 3 huecos repartidos entre las
//   colecciones marcadas. 1 colección → 3; 2 → 2+1 (sorteando cuál se
//   lleva el par); 3 → 1 cada una; más de 3 → se sortean 3 colecciones,
//   una tarjeta cada una. Si alguna no cubre su cuota, el hueco pasa a
//   las demás antes que quedarse corto.
//
// APAGADO SILENCIOSO (requisito de Jal): cualquier ausencia o fallo
//   devuelve cadena vacía. Sin tienda, sin colecciones marcadas, sin
//   correspondencia, colección borrada, catálogo vacío, error de
//   lectura o tiempo agotado → el correo sale exactamente como salía
//   antes, sin bloque, sin hueco, sin imagen rota y sin mensaje al
//   cliente. Solo queda rastro en el log.
//
//   No se pintan huecos vacíos: con dos productos se pintan DOS
//   tarjetas, no dos y un agujero.
//
// ─────────────────────────────────────────────────────────────────
// AUDITORÍA DE CONEXIONES (obligatoria en cada entrega)
// ─────────────────────────────────────────────────────────────────
//  LEE de:
//    · HairSalonServices → groupCatalog + productCollections.
//    · Stores/Collections → nombre de cada colección (categoría visible).
//    · Stores/Products    → nombre, precio, imagen, enlace, stock.
//    · SalonConfig        → siteUrl (base absoluta del enlace).
//  ESCRIBE en: NADA. Módulo de solo lectura.
//  LE LLAMA:
//    · comunicacionesLogic v1.5.0 → confirmación de cita.
//    · reminderLogic v1.11.0      → recordatorio de cita.
//  LLAMA A: nadie. Sin dependencias de otros backends del proyecto.
//  FLUJO DE PUNTA A PUNTA: verificado.
//
// PATRONES COPIADOS (no inventados):
//   · Lectura de Stores/Products con .include('collections') y
//     paginación por skip → tiendaProductos.web.js v1.5.14
//     (listarProductos).
//   · Lectura de Stores/Collections → tiendaProductos.web.js v1.5.14.
//   · wix:image:// → https → clienteAreaLogic.web.js (wixImageToHttps).
//   · Sanitizado de siteUrl → clienteAreaLogic.web.js v1.6.3.
//   · Comparación group ↔ groupCatalog por clave normalizada →
//     widgetPublicoLogic.web.js v0.9.2 (claveGrupo).
//
// CHANGELOG:
//   v1.0.1 (13-Sep-2026) — Texto fijo y ajuste a las plantillas reales.
//     · Línea fija bajo el título: "Puedes comprarlo ahora o pedir
//       información y adquirirlo en el mismo salón".
//     · Maquetación alineada con layoutBooking / reminderLayout: mismo
//       ancho útil (cuerpo de 600 px con 34 px de margen lateral), misma
//       tipografía, mismo gris de separador (#eeeeee) y mismos colores
//       de texto (#1a1a1a / #6b6b6b / #4a4a4a).
//     · El bloque aporta su propio margen lateral, así que el marcador
//       ${bloqueProductos} va en una celda SIN padding. Cuando no hay
//       sugerencias la celda queda completamente vacía y no deja hueco.
//   v1.0.0 (13-Sep-2026) — Versión inicial.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const VERSION = '1.0.0';
const TAG = `[SugerenciasProductos][${VERSION}]`;

const CMS_CATEGORIAS   = 'HairSalonServices';
const CMS_SALON_CONFIG = 'SalonConfig';
const CMS_PRODUCTOS    = 'Stores/Products';
const CMS_COLECCIONES  = 'Stores/Collections';

// Huecos del bloque. Tres tarjetas.
const MAX_TARJETAS = 3;

// Techo de tiempo del módulo entero. Si se agota, el correo sale sin
// bloque. Un correo de confirmación NUNCA puede esperar por esto.
const TIMEOUT_MS = 6000;

// Caché corta: el cron de recordatorios dispara decenas de correos
// seguidos y no tiene sentido releer el catálogo en cada uno.
const CACHE_TTL_MS = 5 * 60 * 1000;

let _cache = null;
let _cacheTs = 0;

// =====================================================
// HELPERS
// =====================================================

// Escape HTML para todo valor que venga de la tienda.
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Clave normalizada de categoría. Copiado de widgetPublicoLogic v0.9.2:
// el group del servicio y el groupCatalog de la categoría los teclean
// personas en dos pantallas distintas.
function claveGrupo(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// wix:image:// → URL pública https. Copiado de clienteAreaLogic.
function wixImageToHttps(wixUrl) {
  if (!wixUrl || typeof wixUrl !== 'string') return '';
  if (wixUrl.startsWith('http://') || wixUrl.startsWith('https://')) return wixUrl;
  if (!wixUrl.startsWith('wix:image://')) return '';
  const m = wixUrl.match(/^wix:image:\/\/v1\/([^/]+)/);
  return m && m[1] ? `https://static.wixstatic.com/media/${m[1]}` : '';
}

// Sanitizador de siteUrl. Copiado de clienteAreaLogic v1.6.3.
function sanitizarSiteUrl(rawUrl) {
  let s = String(rawUrl || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const patronMalformado = /^(https?:\/\/)www([^.\/][^\/]*?)(\.[^\.\/]+)(\/|$|\?|#)/i;
  if (patronMalformado.test(s)) s = s.replace(patronMalformado, '$1www.$2$3$4');
  return s.replace(/\/+$/, '');
}

// Ruta de la ficha del producto.
//
// Verificado sobre el catálogo real (92 filas, 13-sep-2026):
// `productPageUrl` guarda una ruta relativa '/product-page/<slug>' y
// coincide con el campo `slug` en las 92 sin excepción. Si en ejecución
// el campo no llegase como texto usable, se cae al slug, que da el
// mismo resultado. NO se construye nada a partir del nombre.
function rutaProducto(prod) {
  const raw = prod && prod.productPageUrl;
  if (typeof raw === 'string' && raw.trim()) {
    const r = raw.trim();
    if (r.startsWith('http://') || r.startsWith('https://') || r.startsWith('/')) return r;
  }
  const slug = String((prod && prod.slug) || '').trim();
  return slug ? `/product-page/${slug}` : '';
}

// Enlace absoluto y codificado. 21 de los 92 productos llevan tildes en
// la ruta ("artemisa-champú"); sin codificar, algunos clientes de correo
// rompen el enlace.
function enlaceAbsoluto(base, ruta) {
  if (!ruta) return '';
  if (ruta.startsWith('http://') || ruta.startsWith('https://')) {
    try { return encodeURI(ruta); } catch (_) { return ruta; }
  }
  if (!base) return '';
  try { return encodeURI(base + ruta); } catch (_) { return base + ruta; }
}

function precioVisible(prod) {
  const fmtDesc = String(prod.formattedDiscountedPrice || '').trim();
  const fmt = String(prod.formattedPrice || '').trim();
  const p = Number(prod.price);
  const d = Number(prod.discountedPrice);
  if (fmtDesc && Number.isFinite(d) && Number.isFinite(p) && d > 0 && d < p) return fmtDesc;
  if (fmt) return fmt;
  if (Number.isFinite(p) && p > 0) return `${p} ${String(prod.currency || '').trim()}`.trim();
  return '';
}

// Baraja in-place (Fisher-Yates).
function barajar(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function conTimeout(promesa, ms, etiqueta) {
  return Promise.race([
    promesa,
    new Promise((resolve) => setTimeout(() => {
      console.warn(`${TAG} ⏱ ${etiqueta}: tiempo agotado (${ms}ms). Correo sin bloque.`);
      resolve(null);
    }, ms))
  ]);
}

// =====================================================
// LECTURAS
// =====================================================

async function leerSiteUrl() {
  try {
    const r = await wixData.query(CMS_SALON_CONFIG).limit(1).find({ suppressAuth: true });
    const fila = (r.items || [])[0];
    return fila ? sanitizarSiteUrl(fila.siteUrl) : '';
  } catch (e) {
    console.warn(`${TAG} ⚠️ SalonConfig no legible: ${e.message}`);
    return '';
  }
}

async function leerCategorias() {
  try {
    const r = await wixData.query(CMS_CATEGORIAS).limit(200).find({ suppressAuth: true });
    return r.items || [];
  } catch (e) {
    console.warn(`${TAG} ⚠️ HairSalonServices no legible: ${e.message}`);
    return [];
  }
}

async function leerColecciones() {
  try {
    const r = await wixData.query(CMS_COLECCIONES).limit(100).find({ suppressAuth: true });
    const mapa = {};
    for (const c of (r.items || [])) {
      if (c && c._id) mapa[c._id] = c.name || '';
    }
    return mapa;
  } catch (e) {
    // Sin tienda instalada esta lectura falla. Es el apagado silencioso.
    console.warn(`${TAG} ⚠️ Stores/Collections no legible (¿sitio sin tienda?): ${e.message}`);
    return null;
  }
}

// Patrón literal de tiendaProductos.listarProductos v1.5.14.
async function leerProductos() {
  try {
    let items = [];
    let skip = 0;
    const PAGE = 100;
    let hasMore = true;
    while (hasMore && skip < 2000) {
      const r = await wixData.query(CMS_PRODUCTOS)
        .include('collections')
        .limit(PAGE)
        .skip(skip)
        .find({ suppressAuth: true });
      const page = r.items || [];
      items = items.concat(page);
      hasMore = page.length === PAGE;
      skip += PAGE;
    }
    return items;
  } catch (e) {
    console.warn(`${TAG} ⚠️ Stores/Products no legible (¿sitio sin tienda?): ${e.message}`);
    return null;
  }
}

// Catálogo cacheado: colecciones + productos ya normalizados.
async function getCatalogo() {
  const ahora = Date.now();
  if (_cache && (ahora - _cacheTs) < CACHE_TTL_MS) return _cache;

  const [nombresColeccion, productos, siteUrl] = await Promise.all([
    leerColecciones(),
    leerProductos(),
    leerSiteUrl()
  ]);

  if (!nombresColeccion || !productos) return null;

  const porColeccion = {};
  let utiles = 0;

  for (const prod of productos) {
    if (prod.inStock === false) continue;

    const imagen = wixImageToHttps(prod.mainMedia || '');
    if (!imagen) continue;                       // sin foto no hay tarjeta

    const url = enlaceAbsoluto(siteUrl, rutaProducto(prod));
    if (!url) continue;                          // sin enlace no hay tarjeta

    const nombre = String(prod.name || '').trim();
    if (!nombre) continue;

    const ids = Array.isArray(prod.collections)
      ? prod.collections.map(c => (c && c._id) || '').filter(Boolean)
      : [];
    if (!ids.length) continue;

    const ficha = { nombre, imagen, url, precio: precioVisible(prod) };
    utiles++;

    for (const cid of ids) {
      if (!porColeccion[cid]) porColeccion[cid] = [];
      porColeccion[cid].push(ficha);
    }
  }

  _cache = { porColeccion, nombresColeccion, siteUrl };
  _cacheTs = ahora;
  console.log(`${TAG} 📦 Catálogo cacheado: ${productos.length} productos, ${utiles} utilizables, ${Object.keys(nombresColeccion).length} colecciones`);
  return _cache;
}

// =====================================================
// SELECCIÓN POR CUOTA
// =====================================================

// Devuelve hasta MAX_TARJETAS fichas repartidas entre las colecciones.
function seleccionarPorCuota(idsColeccion, porColeccion, nombresColeccion) {
  const pools = [];
  for (const cid of idsColeccion) {
    const lista = porColeccion[cid];
    if (lista && lista.length) {
      pools.push({
        cid,
        nombre: nombresColeccion[cid] || '',
        productos: barajar(lista.slice())
      });
    }
  }
  if (!pools.length) return [];

  barajar(pools);   // sortea qué colección se lleva el hueco de más

  const n = pools.length;
  const base = Math.floor(MAX_TARJETAS / n);
  const resto = MAX_TARJETAS % n;

  const elegidas = [];
  const yaPuestos = new Set();

  // Primera pasada: cada colección aporta su cuota.
  pools.forEach((pool, i) => {
    const cuota = base + (i < resto ? 1 : 0);
    let puestos = 0;
    for (const ficha of pool.productos) {
      if (puestos >= cuota) break;
      if (yaPuestos.has(ficha.url)) continue;    // sin repetir producto
      elegidas.push({ ...ficha, categoria: pool.nombre });
      yaPuestos.add(ficha.url);
      puestos++;
    }
  });

  // Segunda pasada: los huecos que alguna colección no pudo cubrir
  // pasan a las demás antes que quedarse corto.
  if (elegidas.length < MAX_TARJETAS) {
    for (const pool of pools) {
      for (const ficha of pool.productos) {
        if (elegidas.length >= MAX_TARJETAS) break;
        if (yaPuestos.has(ficha.url)) continue;
        elegidas.push({ ...ficha, categoria: pool.nombre });
        yaPuestos.add(ficha.url);
      }
      if (elegidas.length >= MAX_TARJETAS) break;
    }
  }

  return barajar(elegidas);
}

// =====================================================
// MAQUETACIÓN
// =====================================================
//
// HTML de correo: tablas y estilos en línea. Nada de flex, grid ni
// hojas aparte — Gmail y Outlook los descartan.
//
// Medidas tomadas de las plantillas reales (layoutBooking /
// reminderLayout): cuerpo de 600 px con 34 px de margen a cada lado,
// es decir 532 px útiles. Con tres tarjetas y 6 px de separación,
// cada imagen dispone de ~165 px; por eso el tope es 170 px.
//
// El margen lateral lo pone ESTE bloque, no la plantilla. Así el
// marcador puede ir en una celda sin padding y, cuando no hay
// sugerencias, esa celda queda vacía del todo y no deja hueco.

const FUENTE = '-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
const TITULO_BLOQUE = 'También te puede interesar';
const TEXTO_FIJO = 'Puedes comprarlo ahora o pedir información y adquirirlo en el mismo salón';

function tarjeta(f, anchoPct) {
  const precio = f.precio
    ? `<div style="font-size:15px;font-weight:600;color:#1a1a1a;padding-top:4px;">${esc(f.precio)}</div>`
    : '';
  const categoria = f.categoria
    ? `<div style="font-size:11px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.4px;padding-bottom:3px;">${esc(f.categoria)}</div>`
    : '';
  return `<td width="${anchoPct}%" valign="top" align="center" style="padding:0 6px;">
  <a href="${esc(f.url)}" target="_blank" style="text-decoration:none;color:#1a1a1a;">
    <img src="${esc(f.imagen)}" alt="${esc(f.nombre)}" width="170" style="display:block;width:100%;max-width:170px;height:auto;border:0;border-radius:8px;margin:0 auto 10px auto;">
    ${categoria}
    <div style="font-size:13px;line-height:1.4;color:#2b2b2b;">${esc(f.nombre)}</div>
    ${precio}
    <div style="font-size:12px;color:#6b6b6b;text-decoration:underline;padding-top:6px;">Ver producto</div>
  </a>
</td>`;
}

function maquetarBloque(fichas) {
  if (!fichas.length) return '';
  const ancho = Math.floor(100 / fichas.length);
  const celdas = fichas.map(f => tarjeta(f, ancho)).join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${FUENTE};">
<tr><td style="padding:14px 34px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #eeeeee;">
<tr><td style="padding:20px 0 4px;font-size:16px;font-weight:600;color:#1a1a1a;">${TITULO_BLOQUE}</td></tr>
<tr><td style="padding:0 0 16px;font-size:14px;color:#4a4a4a;line-height:1.6;">${TEXTO_FIJO}</td></tr>
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${celdas}
</tr></table>
</td></tr>
</table>
</td></tr>
</table>`;
}

// =====================================================
// FUNCIÓN PÚBLICA
// =====================================================
/**
 * Construye el bloque de sugerencias para una cita.
 *
 * @param {object} p
 * @param {string} p.group — KamisuiteReservations.group (categoría del
 *                           servicio PRINCIPAL de la cita).
 * @returns {Promise<string>} HTML del bloque, o '' si no procede.
 *                            NUNCA lanza. NUNCA devuelve huecos.
 */
export const construirBloqueProductos = webMethod(
  Permissions.SiteMember,
  async ({ group } = {}) => {
    const resultado = await conTimeout(_construir(group), TIMEOUT_MS, 'construirBloqueProductos');
    return resultado || '';
  }
);

async function _construir(group) {
  try {
    const clave = claveGrupo(group);
    if (!clave) {
      console.log(`${TAG} Sin categoría en la cita. Correo sin bloque.`);
      return '';
    }

    // 1) Categorías del Tour cuyo groupCatalog contiene esta categoría.
    const categorias = await leerCategorias();
    const idsColeccion = [];
    for (const cat of categorias) {
      const grupos = String(cat.groupCatalog || '')
        .split(',').map(s => claveGrupo(s)).filter(Boolean);
      if (!grupos.includes(clave)) continue;

      const cols = String(cat.productCollections || '')
        .split(',').map(s => s.trim()).filter(Boolean);
      for (const cid of cols) {
        if (!idsColeccion.includes(cid)) idsColeccion.push(cid);
      }
    }

    if (!idsColeccion.length) {
      console.log(`${TAG} "${group}" sin colecciones marcadas. Correo sin bloque.`);
      return '';
    }

    // 2) Catálogo de la tienda.
    const catalogo = await getCatalogo();
    if (!catalogo) {
      console.log(`${TAG} Sin tienda legible. Correo sin bloque.`);
      return '';
    }

    // 3) Reparto por cuota.
    const fichas = seleccionarPorCuota(idsColeccion, catalogo.porColeccion, catalogo.nombresColeccion);
    if (!fichas.length) {
      console.log(`${TAG} "${group}" → ${idsColeccion.length} colección(es) sin producto utilizable. Correo sin bloque.`);
      return '';
    }

    console.log(`${TAG} "${group}" → ${fichas.length} tarjeta(s): ${fichas.map(f => f.nombre).join(' | ')}`);
    return maquetarBloque(fichas);

  } catch (e) {
    // Apagado silencioso: el correo sale igual, sin bloque.
    console.warn(`${TAG} ⚠️ Bloque descartado por excepción: ${e.message}`);
    return '';
  }
}
