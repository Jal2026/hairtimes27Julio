// =====================================================
// KAMISUITE — MONITOR DE MARCA (consulta del comercial)
// Backend: brandMonitorLogic.web.js
// VERSION: 1.0.1
// FECHA:   19 de noviembre de 2026
// =====================================================
//
// QUÉ ES
// ------
// Vista de SOLO LECTURA del almacén de uso en salón (Almacén V2) para
// el comercial de una marca. El comercial ve únicamente los productos
// de las marcas que tiene asignadas, cómo se están consumiendo y qué
// habría que reponer. Este backend NO escribe en ninguna colección.
//
// QUIÉN ENTRA
// -----------
// Doble nivel:
//   1. La página está restringida a miembros con rol (permiso de
//      página, se configura en el editor; no se replica en código).
//   2. El miembro tiene que tener una fila en KamisuiteBrandUsers con
//      el mismo email con el que inicia sesión. Sin fila o sin marcas,
//      no se devuelve ningún producto.
//
// EL FILTRO DE MARCAS SE APLICA AQUÍ
// ----------------------------------
// Las marcas se leen de la fila del miembro en el servidor. El widget
// y el page code NO envían marcas en ningún mensaje: no hay forma de
// pedir productos de otra marca desde el navegador.
// Comparación de marca: sin distinguir mayúsculas ni acentos, sin
// espacios en los extremos y con los espacios interiores repetidos
// reducidos a uno. La marca tiene que estar escrita igual en la ficha
// del almacén y en la fila del comercial. En pantalla y en los Excel
// la marca se muestra tal y como está escrita en la fila del
// comercial, para que no salgan grupos duplicados por variantes de
// escritura en las fichas.
//
// QUÉ DEVUELVE Y QUÉ NO
// ---------------------
// Devuelve por producto: nombre, marca, categoría, SKU, unidad, botes
// cerrados, abiertos y total, mínimo y máximo, consumo del periodo,
// media semanal, días hasta el mínimo, estado y cantidad sugerida.
// NO devuelve: coste, PVP, proveedor, notas, imagen ni quién del
// equipo ha consumido cada bote. Los productos inactivos no salen.
//
// UMBRALES: LOS FIJA EL SALÓN
// ---------------------------
// Las alertas y el pedido salen SOLO de los dos umbrales que el salón
// configura en la ficha de cada producto del Almacén: stock mínimo
// (minStock) y stock máximo (maxStock). Este panel no añade umbrales
// propios.
//
// CÁLCULOS
// --------
// Periodo: últimos PERIODO_DIAS días (móvil, desde este momento).
// Consumo: suma de quantity de los movimientos SALIDA /
//   CONSUMO_SERVICIO del periodo (los clics de la papelera). Roturas,
//   caducidades y demás salidas no cuentan como consumo.
// Bajo mínimo: misma regla que stockLogic v1.0.2 (adaptarProducto):
//   solo si minStock > 0 y total <= minStock.
// Días hasta el mínimo (solo informativo, no genera alerta):
//   (total − mínimo) / consumo diario, por defecto. 0 si ya está
//   agotado o bajo mínimo; null si no hay consumo en el periodo.
// Estado: AGOTADO · REPONER (bajo mínimo) · OK.
// Cantidad sugerida (solo AGOTADO y REPONER):
//   · con máximo del salón (maxStock > minStock) → hasta el máximo
//     (máximo − total);
//   · sin máximo, o con un máximo que no supera al mínimo → lo justo
//     para volver a superar el mínimo (mínimo + 1 − total). Se marca
//     con tieneMaximo = false para que el widget lo indique.
//
// COLECCIONES
// -----------
// KamisuiteBrandUsers (nueva, solo lectura aquí):
//   userName, email, company, brands (marcas separadas por comas)
// KamisuiteStock (solo lectura) — field IDs de stockLogic v1.0.2
// KamisuiteStockMoves (solo lectura) — field IDs de stockLogic v1.0.2
// SalonConfig (solo lectura): nombre del salón para cabeceras.
//
// PATRONES REUTILIZADOS (literales, de código en producción)
// ----------------------------------------------------------
//   · currentMember.getMember({ fieldsets: ['FULL'] }) → loginEmail,
//     con contactDetails.emails[0] de respaldo → b2b.web.js v1.1.1
//     (getCurrentUserEmail). Mismo esquema que B2BProfiles: una fila
//     de CMS enlazada al miembro por su email.
//   · leerTodo, num, str → stockLogic.web.js v1.0.2.
//   · Lectura de SalonConfig con limit(1) y salonName || name →
//     primePublicLogic.web.js (getPrimeSalonInfo).
//   · .ge() sobre campo DateTime → memberAreaLogic.web.js
//     (.ge('date', now)).
//   · Excel: import * as XLSX from 'xlsx' + aoa_to_sheet /
//     json_to_sheet / book_new / book_append_sheet / ws['!cols'] +
//     XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) →
//     stockLogic.exportarExcel v1.0.2. Mismo contrato de respuesta:
//     { ok, archivo, nombreArchivo, mimeType, totalRegistros }.
//
// CERO HARDCODING: ni un id de salón, ni un nombre de marca, ni un
// email. Multi-tenant por construcción.
//
// CHANGELOG
// v1.0.1 (19 nov 2026): umbrales SOLO del salón.
//         · Se retira el estado PRONTO (aviso a PERIODO_DIAS días) y su
//           contador en el resumen: no era un umbral del salón. Los
//           días hasta el mínimo se mantienen como dato informativo.
//         · El pedido sugerido incluye solo AGOTADO y REPONER.
//           Cantidad: hasta el máximo del salón; sin máximo válido,
//           mínimo + 1 − total. Se retira el cálculo por consumo.
//         · Nuevos campos por producto: maxStock y tieneMaximo.
//         · Excel: columna Máximo en pedido e informe; columna Cálculo
//           en el pedido; fuera la fila de «llegan al mínimo».
// v1.0.0 (19 nov 2026): versión inicial. obtenerMonitorMarca y
//         exportarMonitorMarca (pedido sugerido e informe de consumo).
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';
import wixData from 'wix-data';
import * as XLSX from 'xlsx';

const VERSION = '1.0.1';
const TAG = `[BrandMonitor][${VERSION}]`;

const CMS_BRAND_USERS = 'KamisuiteBrandUsers';
const CMS_STOCK = 'KamisuiteStock';
const CMS_MOVES = 'KamisuiteStockMoves';
const CMS_SALON = 'SalonConfig';

const AUTH = { suppressAuth: true };
const PAGE = 100;

// Periodo de cálculo del consumo, en días.
const PERIODO_DIAS = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

// Único motivo que cuenta como consumo (papelera de Recepción PRO y
// del Almacén). Mismos valores que stockLogic v1.0.2.
const MOVE_TYPE_SALIDA = 'SALIDA';
const REASON_CONSUMO = 'CONSUMO_SERVICIO';

const ORDEN_ESTADO = { AGOTADO: 0, REPONER: 1, OK: 2 };

// =====================================================
// HELPERS
// =====================================================

// Número seguro: null/''/undefined/NaN → valor por defecto.
// Copiado literal de stockLogic v1.0.2.
function num(v, def = 0) {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// Copiado literal de stockLogic v1.0.2.
function str(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

// Clave de comparación de marca: sin acentos, en mayúsculas, sin
// espacios en los extremos y con los interiores reducidos a uno.
function claveMarca(v) {
  return str(v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function claveEmail(v) {
  return str(v).toLowerCase();
}

// Texto apto para nombre de fichero.
function slug(v) {
  return str(v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function r1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

// Lectura paginada completa de una colección propia.
// Copiado literal de stockLogic v1.0.2.
async function leerTodo(coleccion, filtroFn) {
  let items = [];
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    let q = wixData.query(coleccion).limit(PAGE).skip(skip);
    if (typeof filtroFn === 'function') q = filtroFn(q);
    const res = await q.find(AUTH);
    const page = res.items || [];
    items = items.concat(page);
    hasMore = page.length === PAGE;
    skip += PAGE;
  }
  return items;
}

// Email del miembro que hace la llamada. Patrón de b2b.web.js v1.1.1.
async function emailMiembroActual() {
  try {
    const member = await currentMember.getMember({ fieldsets: ['FULL'] });
    return claveEmail(member?.loginEmail || member?.contactDetails?.emails?.[0] || '');
  } catch (e) {
    console.error(`${TAG} ⚠️ No se pudo leer el miembro actual:`, e.message);
    return '';
  }
}

// Fila del comercial y sus marcas. La colección es pequeña (una fila
// por comercial): se lee entera y el email se compara sin distinguir
// mayúsculas, para no depender de cómo se escribió al dar de alta.
async function accesoMiembro() {
  const email = await emailMiembroActual();
  if (!email) return { ok: false, code: 'SIN_SESION' };

  const filas = await leerTodo(CMS_BRAND_USERS);
  const suyas = filas.filter(f => claveEmail(f.email) === email);
  if (!suyas.length) return { ok: false, code: 'SIN_ACCESO' };
  if (suyas.length > 1) {
    console.warn(`${TAG} ⚠️ ${suyas.length} filas con el mismo email; se usa la primera`);
  }
  const fila = suyas[0];

  // clave normalizada → marca tal y como está escrita en la fila del
  // comercial. Es el nombre que se muestra y por el que se agrupa,
  // aunque en las fichas del almacén esté escrita con otras
  // mayúsculas, acentos o espacios.
  const marcas = [];
  const claves = new Map();
  for (const parte of str(fila.brands).split(',')) {
    const texto = str(parte).replace(/\s+/g, ' ');
    const k = claveMarca(texto);
    if (k && !claves.has(k)) {
      claves.set(k, texto);
      marcas.push(texto);
    }
  }
  if (!marcas.length) return { ok: false, code: 'SIN_MARCAS' };

  return {
    ok: true,
    claves,
    perfil: {
      userName: str(fila.userName),
      company: str(fila.company),
      brands: marcas
    }
  };
}

// Nombre del salón para cabeceras. Patrón de primePublicLogic
// (getPrimeSalonInfo). Un fallo aquí no bloquea el monitor.
async function nombreSalon() {
  try {
    const r = await wixData.query(CMS_SALON).limit(1).find(AUTH);
    const c = (r.items || [])[0] || {};
    return str(c.salonName || c.name || '');
  } catch (e) {
    console.error(`${TAG} ⚠️ SalonConfig no disponible:`, e.message);
    return '';
  }
}

// Ficha de KamisuiteStock + consumo del periodo → objeto para el
// comercial. Solo los campos autorizados. `marca` es el nombre de la
// marca tal y como figura en la fila del comercial.
function adaptarProducto(row, consumo, marca) {
  const stored = num(row.stockStored, 0);
  const inUse = num(row.stockInUse, 0);
  const minStock = num(row.minStock, 0);
  const maxStock = num(row.maxStock, 0);
  const total = stored + inUse;

  // Misma regla que stockLogic v1.0.2 (adaptarProducto).
  const needsRestock = minStock > 0 && total <= minStock;
  const outOfStock = total <= 0;

  const diario = consumo > 0 ? consumo / PERIODO_DIAS : 0;
  let diasHastaMinimo = null;
  if (outOfStock || needsRestock) diasHastaMinimo = 0;
  else if (diario > 0) diasHastaMinimo = Math.max(0, Math.floor((total - minStock) / diario));

  const estado = outOfStock ? 'AGOTADO'
    : needsRestock ? 'REPONER'
    : 'OK';

  // Umbrales del salón: hasta el máximo; sin máximo válido, lo justo
  // para volver a superar el mínimo.
  const tieneMaximo = maxStock > minStock;
  let pedido = 0;
  if (estado !== 'OK') {
    pedido = tieneMaximo
      ? Math.max(1, Math.ceil(maxStock - total))
      : Math.max(1, Math.ceil(minStock + 1 - total));
  }

  return {
    id: row._id,
    productName: str(row.productName),
    brand: marca,
    category: str(row.category),
    sku: str(row.sku),
    unit: str(row.unit),
    stockStored: stored,
    stockInUse: inUse,
    total,
    minStock,
    maxStock,
    tieneMaximo,
    consumo: r1(consumo),
    mediaSemanal: r1(diario * 7),
    diasHastaMinimo,
    estado,
    pedido
  };
}

function ordenarProductos(a, b) {
  return (ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado])
    || a.productName.localeCompare(b.productName, 'es');
}

function etiquetaEstado(p) {
  if (p.estado === 'AGOTADO') return 'AGOTADO';
  if (p.estado === 'REPONER') return 'BAJO MÍNIMO';
  return 'OK';
}

function fechaES(d) {
  return d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
}

// Monta todo el monitor del miembro que llama. Lo usan la vista y
// las exportaciones: el Excel refleja exactamente lo que se ve.
async function construirMonitor() {
  const acceso = await accesoMiembro();
  if (!acceso.ok) return acceso;

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - PERIODO_DIAS * MS_DIA);

  const [rowsStock, salonName] = await Promise.all([
    leerTodo(CMS_STOCK),
    nombreSalon()
  ]);

  const propias = rowsStock.filter(r =>
    r.active !== false && acceso.claves.has(claveMarca(r.brand))
  );
  const ids = new Set(propias.map(r => r._id));

  const consumoPorId = {};
  if (ids.size) {
    const movs = await leerTodo(CMS_MOVES, q => q
      .eq('moveType', MOVE_TYPE_SALIDA)
      .eq('reason', REASON_CONSUMO)
      .ge('date', desde));
    for (const m of movs) {
      const pid = str(m.productId);
      if (!ids.has(pid)) continue;
      consumoPorId[pid] = (consumoPorId[pid] || 0) + num(m.quantity, 0);
    }
  }

  const productos = propias
    .map(r => adaptarProducto(r, consumoPorId[r._id] || 0, acceso.claves.get(claveMarca(r.brand))))
    .sort(ordenarProductos);

  // Consumo por marca, con el nombre de marca de la fila del comercial.
  const grupos = {};
  for (const p of productos) {
    const k = p.brand;
    if (!grupos[k]) grupos[k] = { brand: p.brand, referencias: 0, consumo: 0 };
    grupos[k].referencias += 1;
    grupos[k].consumo += p.consumo;
  }
  const porMarca = Object.values(grupos)
    .map(g => ({ ...g, consumo: r1(g.consumo) }))
    .sort((a, b) => b.consumo - a.consumo || a.brand.localeCompare(b.brand, 'es'));

  const lineasPedido = productos.filter(p => p.pedido > 0);

  const resumen = {
    referencias: productos.length,
    unidadesConsumidas: r1(productos.reduce((acc, p) => acc + p.consumo, 0)),
    agotadas: productos.filter(p => p.estado === 'AGOTADO').length,
    bajoMinimo: productos.filter(p => p.estado === 'REPONER').length,
    lineasPedido: lineasPedido.length,
    unidadesPedido: lineasPedido.reduce((acc, p) => acc + p.pedido, 0),
    porMarca
  };

  return {
    ok: true,
    perfil: acceso.perfil,
    salonName,
    periodoDias: PERIODO_DIAS,
    desde,
    hasta,
    productos,
    resumen
  };
}

// =====================================================
// 1. MONITOR (vista del widget)
// =====================================================
export const obtenerMonitorMarca = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const res = await construirMonitor();
      if (!res.ok) {
        console.warn(`${TAG} 🔒 Sin datos: ${res.code}`);
        return { ok: false, code: res.code, version: VERSION };
      }

      console.log(`${TAG} 📦 ${res.productos.length} referencias · ${res.perfil.brands.length} marcas · ${res.resumen.lineasPedido} líneas de pedido`);

      return {
        ok: true,
        perfil: res.perfil,
        salonName: res.salonName,
        periodoDias: res.periodoDias,
        desde: res.desde.toISOString(),
        hasta: res.hasta.toISOString(),
        productos: res.productos,
        resumen: res.resumen,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ obtenerMonitorMarca:`, e.message);
      return { ok: false, code: 'ERROR', error: e.message, version: VERSION };
    }
  }
);

// =====================================================
// 2. EXPORTAR A EXCEL (pedido sugerido · informe de consumo)
// =====================================================
// datos.tipo: 'pedido' | 'informe' (cualquier otro valor → 'informe').
// Se recalcula todo aquí: el widget no manda productos ni cantidades.
export const exportarMonitorMarca = webMethod(
  Permissions.SiteMember,
  async (datos) => {
    try {
      const tipo = datos?.tipo === 'pedido' ? 'pedido' : 'informe';
      const res = await construirMonitor();
      if (!res.ok) return { ok: false, code: res.code, version: VERSION };

      const periodoTxt = `Últimos ${res.periodoDias} días (${fechaES(res.desde)} – ${fechaES(res.hasta)})`;
      const marcasTxt = res.perfil.brands.join(', ');
      const wb = XLSX.utils.book_new();
      let totalRegistros = 0;

      if (tipo === 'pedido') {
        const lineas = res.productos
          .filter(p => p.pedido > 0)
          .sort((a, b) => a.brand.localeCompare(b.brand, 'es') || a.productName.localeCompare(b.productName, 'es'));
        if (!lineas.length) return { ok: false, code: 'PEDIDO_VACIO', version: VERSION };

        const aoa = [
          ['PEDIDO SUGERIDO', fechaES(res.hasta)],
          ['Salón', res.salonName],
          ['Empresa', res.perfil.company],
          ['Comercial', res.perfil.userName],
          ['Marcas', marcasTxt],
          ['Consumo calculado sobre', periodoTxt],
          [],
          ['Producto', 'Marca', 'Categoría', 'SKU', 'Unidad', 'Stock actual', 'Mínimo', 'Máximo',
            `Consumo ${res.periodoDias} días`, 'Estado', 'Cálculo', 'Cantidad sugerida'],
          ...lineas.map(p => [
            p.productName, p.brand, p.category, p.sku, p.unit,
            p.total, p.minStock, p.maxStock > 0 ? p.maxStock : '', p.consumo, etiquetaEstado(p),
            p.tieneMaximo ? 'Hasta el máximo' : 'Sin máximo: mínimo + 1',
            p.pedido
          ]),
          [],
          ['TOTAL', `${lineas.length} referencias`, '', '', '', '', '', '', '', '', '',
            lineas.reduce((acc, p) => acc + p.pedido, 0)],
          [],
          ['Mínimo y máximo: los fija el salón en la ficha de cada producto.']
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [
          { wch: 40 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 10 },
          { wch: 12 }, { wch: 9 }, { wch: 9 }, { wch: 16 }, { wch: 14 },
          { wch: 24 }, { wch: 17 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Pedido');
        totalRegistros = lineas.length;
      } else {
        const r = res.resumen;

        // ── Hoja 1: Resumen ──
        const resumenAoa = [
          ['INFORME DE CONSUMO', fechaES(res.hasta)],
          ['Salón', res.salonName],
          ['Empresa', res.perfil.company],
          ['Comercial', res.perfil.userName],
          ['Marcas', marcasTxt],
          ['Periodo', periodoTxt],
          [],
          ['ESTADO', ''],
          ['Referencias', r.referencias],
          ['Unidades consumidas en el periodo', r.unidadesConsumidas],
          ['Referencias agotadas', r.agotadas],
          ['Referencias bajo mínimo', r.bajoMinimo],
          ['Líneas del pedido sugerido', r.lineasPedido],
          ['Unidades del pedido sugerido', r.unidadesPedido],
          [],
          ['CONSUMO POR MARCA', ''],
          ['Marca', 'Referencias', 'Unidades consumidas'],
          ...r.porMarca.map(g => [g.brand, g.referencias, g.consumo]),
          [],
          ['Mínimo y máximo: los fija el salón en la ficha de cada producto.']
        ];
        const wsRes = XLSX.utils.aoa_to_sheet(resumenAoa);
        wsRes['!cols'] = [{ wch: 44 }, { wch: 30 }, { wch: 20 }];

        // ── Hoja 2: Por producto ──
        const porProducto = res.productos
          .slice()
          .sort((a, b) => b.consumo - a.consumo || a.productName.localeCompare(b.productName, 'es'))
          .map(p => ({
            'Producto': p.productName,
            'Marca': p.brand,
            'Categoría': p.category,
            'SKU': p.sku,
            'Unidad': p.unit,
            [`Consumo ${res.periodoDias} días`]: p.consumo,
            'Media semanal': p.mediaSemanal,
            'Cerrados': p.stockStored,
            'Abiertos': p.stockInUse,
            'Total': p.total,
            'Mínimo': p.minStock,
            'Máximo': p.maxStock > 0 ? p.maxStock : '',
            'Días hasta el mínimo': p.diasHastaMinimo === null ? 'Sin consumo' : p.diasHastaMinimo,
            'Estado': etiquetaEstado(p),
            'Cantidad sugerida': p.pedido
          }));
        const wsProd = XLSX.utils.json_to_sheet(porProducto);
        wsProd['!cols'] = [
          { wch: 40 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 10 },
          { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
          { wch: 9 }, { wch: 9 }, { wch: 20 }, { wch: 14 }, { wch: 17 }
        ];

        XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen');
        XLSX.utils.book_append_sheet(wb, wsProd, 'Por producto');
        totalRegistros = res.productos.length;
      }

      const archivo = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fechaFichero = res.hasta.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
      const base = slug(res.salonName);
      const nombreArchivo = `${tipo === 'pedido' ? 'pedido' : 'consumo'}${base ? '_' + base : ''}_${fechaFichero}.xlsx`;

      console.log(`${TAG} 📊 Excel ${tipo}: ${totalRegistros} filas`);

      return {
        ok: true,
        tipo,
        archivo,
        nombreArchivo,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        totalRegistros,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ exportarMonitorMarca:`, e.message);
      return { ok: false, code: 'ERROR', error: e.message, version: VERSION };
    }
  }
);
