// =====================================================
// BACKEND estadisticas.web.js — KAMISUITE Estadísticas v2.6.3
// =====================================================
// v2.6.3: MEDIOS DE PAGO — DOS VISTAS + CANJES DE BONO (12 ago 2026)
//   Tres salidas nuevas en obtenerEstadisticas. Ninguna existente cambia.
//
//   1) `porBotonPago` — RECUENTO POR BOTÓN PULSADO.
//      Agrupación en crudo por `tipoPago`, con NÚMERO de pulsaciones
//      además del importe: [{ metodo, n, importe }]. Aquí 'Mixto' SÍ es
//      una cesta propia, porque fue UN botón. Responde a "¿se pulsó el
//      botón correcto en cada cita?". Se acompaña de `botonTotales`
//      { n, importe }. Un cobro sin `tipoPago` sale en su propia línea
//      "Sin método registrado": no se reparte ni se omite.
//
//   2) `porMetodoPago` — IMPORTES REALES POR CANAL (ya existía desde
//      v2.6.1, se mantiene sin cambios). Tarjeta = tarjeta pura + parte
//      tarjeta de los mixtos; ídem Efectivo y Bizum. Responde a
//      "¿cuánto hay en el datáfono, en el cajón y en la cuenta?".
//
//      LAS DOS VISTAS CONVIVEN A PROPÓSITO y no dan la misma cifra por
//      canal cuando hay mixtos. No es un descuadre: son dos preguntas
//      distintas. El TOTAL de ambas sí coincide.
//
//   3) `canjesBono` — { n, valorConsumido, disponible }.
//      Fuente: KamisuiteVoucherRedemptions filtrada por `redeemDate`,
//      sumando `amountSaved`. Patrón de consulta copiado de
//      akiraLogic.web.js → consultarBonos. NO se parsea la descripción
//      del pago: el dato está de primera mano en esa colección.
//      Va SEPARADO de los medios de pago porque un canje no es caja
//      nueva — ese dinero entró el día que se compró el bono — y por
//      tanto NO se suma a ventas ni a ningún canal. Si la colección no
//      existe en el tenant, `disponible:false` y el widget no pinta la
//      sección; nunca se devuelve un 0 inventado.
//
//   NO se toca: totales, IVA, propinas, servicios, staff, externos,
//   productos POS, comparativa ni ninguna otra sección.
//
// v2.6.2: EWCM ELIMINADO (12 ago 2026)
//   - Se retira por completo el modo "Export Without Cash Mode"
//     (parámetro `excludeEfectivo`, introducido en v2.3), que permitía
//     generar el informe de estadísticas ocultando los cobros en
//     efectivo.
//   - Motivo: un informe que omite selectivamente los ingresos en
//     metálico es incompatible con la obligación Verifactu que entra en
//     vigor en enero de 2027, cuyo principio es justamente el contrario:
//     registro íntegro, inalterable y encadenado de TODAS las
//     operaciones. Mantener el interruptor en el producto era un riesgo
//     que no compensa ninguna comodidad de exportación.
//   - Qué se ha quitado: el bloque de filtrado previo al pipeline, la
//     excepción del canal Efectivo en el desglose por método de pago, y
//     los sufijos [EWCM] de los logs.
//   - La firma sigue aceptando `excludeEfectivo` para no romper a un
//     llamante que aún lo envíe, pero NO HACE NADA: se ignora y se
//     registra un console.warn para poder localizar y limpiar al
//     llamante. El informe trabaja SIEMPRE con la totalidad de cobros.
//   - Page code asociado: `Recepción _ Estadísticas _  Hairtimes .et172.js`
//     v2.6 deja de reenviarlo. PENDIENTE: el widget HTML conserva el
//     interruptor en la interfaz — hay que retirarlo también.
//
// v2.6.1: REPARTO POR CANAL FÍSICO en "Por Método de Pago" (12 ago 2026)
//   - El donut agrupaba por `tipoPago` en crudo: la cesta "Tarjeta"
//     contenía SOLO los cobros 100% tarjeta y el importe íntegro de cada
//     Mixto caía en una cesta propia imposible de contrastar contra el
//     datáfono. Igual con Efectivo y Bizum.
//   - Ahora cada cobro se parte en los tres canales contrastables
//     leyendo `desglosemetodopago`. Helper _repartirCanales, copia
//     literal del de cierreLogicExtendido v1.2.0.
//   - Queda OBSOLETO el comentario de v2.3 "Pagos MIXTO se incluyen
//     completos (desglose no disponible en CMS)": el campo existe desde
//     que lo escriben recepcionProLogic, tiendaProductos y
//     servicesPublicSync, y es editable en el Editor de Cobros.
//   - Lo que no se puede repartir sin inventar sale con etiqueta propia
//     y visible (⚠️ Mixto sin desglose / descuadrado / etc.).
//   - NO se toca: totalIngresos, totalVentas, IVA, propinas, servicios,
//     staff, externos, productos POS, ni ninguna otra sección.
//
// v2.6.0: Externos V2 + eje de días continuo + paginación
//
//   1) EXTERNOS — la fuente pasa a ser PagoreservasExternos (ledger V2)
//      · Causa del defecto: el bloque leía SOLO SvExternalRecords, la
//        colección V1 que rellena externosLogic. Desde que el cobro de
//        externos se unificó en Recepción PRO V2
//        (recepcionProLogic v1.0.37, rama isExternal → PagoreservasExternos,
//        bookingId = 'EXT_<reservaId>'), NADIE escribe ya en
//        SvExternalRecords → el bloque salía vacío.
//      · Fuente primaria: PagoreservasExternos filtrada por fechaPago,
//        coherente con el resto del informe (que filtra
//        PaymentReservations.fechaPago).
//      · Cruce de comisión POR EMPLEADO replicado literalmente de
//        cierreExternosLogic v1.1.0 (el backend del Informe del día):
//        ExternalServices.staffResourceId → StaffConfig.wixResourceId
//        → StaffConfig.displayName, comparado contra
//        PagoreservasExternos.staff. Fallback compat por contactPerson
//        para filas legacy. SIN fallback global.
//        Así Estadísticas y el Informe del día dan la MISMA comisión.
//      · Histórico preservado: se siguen leyendo las filas PAGADAS de
//        SvExternalRecords del rango, pero SOLO las que no tienen gemela
//        en PagoreservasExternos (bookingId = 'EXT_' + _id). Esas gemelas
//        existen desde externosLogic v1.1.3 (mar-2026), que escribía en
//        ambas colecciones. Cero duplicados, cero pérdida de histórico
//        anterior a marzo-2026. El cálculo de comisión de las filas
//        legacy se mantiene EXACTAMENTE como en v2.5.3 (por category
//        contra serviceName, con fallback) para no alterar informes ya
//        emitidos.
//
//   2) EJE DE DÍAS CONTINUO — ingresosPorDia (serie cronológica)
//      · Antes la serie se construía con Object.keys(ingresosPorDia): un
//        día sin cobros no generaba punto y DESAPARECÍA del eje
//        (los domingos, p.ej.). Ahora se recorre el rango
//        fechaDesde→fechaHasta completo y los días sin cobros valen 0.
//      · ingresosPorDiaRanking, porDiaSemana y los promedios por día de
//        semana quedan INTACTOS: los días a 0 no se cuentan como días
//        trabajados y no diluyen ninguna media.
//
//   3) PAGINACIÓN de PaymentReservations
//      · La query principal era .limit(1000) sin skip: en rangos largos
//        (trimestre, año) truncaba en silencio. Ahora pagina con el
//        mismo patrón skip/limit que ya usaba obtenerMediaDiaSemanaAnio
//        en este mismo archivo.
//
// v2.5.3: Fix Día de semana con poco histórico + zona Madrid
//   - obtenerMediaDiaSemanaAnio funciona aunque solo haya 1 ocurrencia histórica
//   - Elimina el filtro mínimo cnt < 2
//   - Calcula diaHoy desde fecha Madrid, no desde zona horaria del servidor
//   - Evita descuadres tipo fecha miércoles / día martes
//   - Mantiene media, totalDias y totalImporte para mostrar top ventas
//
// v2.5.1: Fix propinas
//   - Propinas separadas de totalIngresos → nuevo campo totalVentas (sin propinas)
//   - totalPropinas como campo independiente
//   - IVA se calcula sobre totalVentas (venta real), no sobre totalIngresos
//   - tablaDesglose: categoría PROPINAS no lleva columnas Base/IVA
//
// v2.5: IVA desglosado + vatRate desde SalonConfig
//   - Lee vatRate del CMS SalonConfig del site del salón (default 21)
//   - Nuevo KPI: totalBaseImponible, totalImpuesto (cuota IVA)
//   - Desglose base/cuota en: ingresosPorDia, ingresosPorDiaRanking, porServicio, tablaDesglose
//   - SIN IVA: métodoPago, staff, clientes, externos, propinas, ratio ST, productividad
//
// v2.4: FIX externos — solo status PAGADO
//   - Filtro cambiado de excluir BLOQUEADO a incluir solo PAGADO
//   - Citas CONFIRMADA (no cobradas) ya no inflan venta bruta ni comisiones
//
// v2.3: EWCM (Export Without Cash Mode)  — ❌ ELIMINADO EN v2.6.2
//   - Nuevo parámetro excludeEfectivo
//   - Filtra registros con tipoPago === 'EFECTIVO' antes de procesar
//   - Pagos MIXTO se incluyen completos (desglose no disponible en CMS)
//   - Todo el pipeline trabaja con el array ya filtrado
//   >>> Funcionalidad retirada. Ver cabecera v2.6.2.
//
// v2.0: Rewrite completo
//   - Merge variantes nombre ST (Tinte AP + Tinte aplicación → Tinte)
//   - Ingresos por día ranking (mayor a menor) + por día de semana
//   - Top 5 complementos de ST + ratio ST vs complementos asociados
//   - Productividad empleado (minutos desde queryServices)
//   - Subgrupos sin símbolo % en headers
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { services } from 'wix-bookings.v2';
import { orders } from 'wix-ecom-backend';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';


// =====================================================
// REPARTO POR CANAL FÃSICO DE COBRO â v2.6.1
// =====================================================
// Copia LITERAL del helper homÃ³nimo de cierreLogicExtendido.web.js
// v1.2.0. Se duplica a propÃ³sito: los imports entre backends .web.js
// devuelven vacÃ­o en silencio, asÃ­ que cada backend lleva el suyo.
// Si se cambia aquÃ­, cambiar tambiÃ©n allÃ­.
//
// Los tres Ãºnicos canales contrastables contra algo fÃ­sico:
//     TARJETA  â liquidaciÃ³n del datÃ¡fono
//     EFECTIVO â cajÃ³n / arqueo de caja
//     BIZUM    â extracto de la cuenta
// No hay cesta "otros" ni cesta "Mixto". Lo que no se puede repartir
// sin inventar se marca como anomalÃ­a visible.
//
// Lectura de `desglosemetodopago`: patrÃ³n copiado de
// cashRegisterLogic.web.js â calcularEfectivoEsperado (en producciÃ³n).
// Formato canÃ³nico: '{"Tarjeta":N,"Efectivo":N,"Bizum":N}' (claves > 0).
//
// Invariante: tarjeta + efectivo + bizum + anomalia === importeTotal.
function _repartirCanales(p) {
  const out = { tarjeta: 0, efectivo: 0, bizum: 0, anomalia: 0, anomaliaLabel: '', canje: false };

  const importe = Number(p.importeTotal) || 0;
  const tipoCrudo = String(p.tipoPago || '').trim();
  const t = tipoCrudo.toLowerCase();

  if (t === 'tarjeta')  { out.tarjeta  = importe; return out; }
  if (t === 'efectivo') { out.efectivo = importe; return out; }
  if (t === 'bizum')    { out.bizum    = importe; return out; }

  if (t === 'canje') {
    if (Math.abs(importe) < 0.005) { out.canje = true; return out; }
    out.anomalia = importe;
    out.anomaliaLabel = '⚠️ Canje con importe';
    return out;
  }

  if (t === 'mixto') {
    let d = null;
    try {
      d = p.desglosemetodopago ? JSON.parse(p.desglosemetodopago) : null;
    } catch (e) {
      d = null;
    }

    if (!d || typeof d !== 'object') {
      out.anomalia = importe;
      out.anomaliaLabel = '⚠️ Mixto sin desglose';
      return out;
    }

    const lower = {};
    for (const k of Object.keys(d)) lower[String(k).trim().toLowerCase()] = Number(d[k]) || 0;
    const ta = lower.tarjeta  || 0;
    const ef = lower.efectivo || 0;
    const bi = lower.bizum    || 0;
    const suma = ta + ef + bi;

    if (suma <= 0) {
      out.anomalia = importe;
      out.anomaliaLabel = '⚠️ Mixto sin desglose';
      return out;
    }

    if (Math.abs(suma - importe) >= 0.01) {
      out.anomalia = importe;
      out.anomaliaLabel = '⚠️ Mixto descuadrado';
      return out;
    }

    out.tarjeta  = ta;
    out.efectivo = ef;
    out.bizum    = bi;
    return out;
  }

  out.anomalia = importe;
  out.anomaliaLabel = '⚠️ ' + (tipoCrudo || 'Sin método');
  return out;
}

const CANALES_FISICOS = ['Tarjeta', 'Efectivo', 'Bizum'];

const TAG = '[Stats v2.6.3]';
const COLECCION_PAGOS = 'PaymentReservations';
const CMS_EXTERNAL_SERVICES = 'ExternalServices';
const CMS_EXTERNAL_RECORDS = 'SvExternalRecords';
const CMS_PAGOS_EXTERNOS = 'PagoreservasExternos';   // v2.6.0 — ledger V2 de cobros externos
const CMS_STAFF = 'StaffConfig';                      // v2.6.0 — puente staffResourceId → displayName
const CMS_SALON_CONFIG = 'SalonConfig';
const CMS_VOUCHER_REDEMPTIONS = 'KamisuiteVoucherRedemptions';   // v2.6.3 - canjes de bono
const TIMEZONE_MADRID = 'Europe/Madrid';
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DEFAULT_VAT_RATE = 21;

// ═══════════════════════════════════════════════════════════════════════════
// v2.6.0 — HELPER replicado LITERALMENTE de cierreExternosLogic v1.1.0
// Extrae el nombre de servicio del primer token de `descripcion`.
// Formato que escribe marcarPagadoReserva:
//   "Corte (12€), Peinado (8€)"  →  "Corte"
//   "Manicura completa (25€)"    →  "Manicura completa"
// ═══════════════════════════════════════════════════════════════════════════
function nombreServicioDesdeDescripcion(descripcion) {
  const primerToken = String(descripcion || '').split(',')[0].trim();
  if (!primerToken) return '';
  const idxParen = primerToken.lastIndexOf('(');
  const nombre = idxParen > 0 ? primerToken.slice(0, idxParen).trim() : primerToken;
  return nombre;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export const obtenerEstadisticas = webMethod(
  Permissions.Anyone,
  async ({ fechaDesde, fechaHasta, excludeEfectivo }) => {
    try {
      console.log(`${TAG} Estadísticas: ${fechaDesde} → ${fechaHasta}`);

      // v2.6.2 — El parámetro se sigue aceptando en la firma para no
      // romper a un llamante que aún lo envíe, pero NO HACE NADA. Se
      // avisa por consola para poder localizar y limpiar al llamante.
      if (excludeEfectivo) {
        console.warn(`${TAG} ⚠️ Recibido excludeEfectivo=true. El modo EWCM fue ELIMINADO en v2.6.2: el parámetro se IGNORA y el informe incluye todos los cobros, efectivo incluido. Revisar el llamante y quitar el envío.`);
      }

      // ── Helpers ──
      const normCat = (c) => (c || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

      const canonCat = (c) => {
        const n = normCat(c);
        if (n.includes('SERVICIO') && n.includes('TECNICO')) return 'SERVICIOS TÉCNICOS';
        if (n.includes('COLORACION') || (n.includes('TINTE') && n.includes('MECHA'))) return 'SERVICIOS TÉCNICOS';
        return (c || '').toUpperCase();
      };

      const normalizarNombreST = (nombre) => {
        const sinParen = nombre.replace(/\s*\(.*?\)\s*/g, ' ').trim();
        const upper = sinParen.toUpperCase();
        if (upper.includes('MECHA') && upper.includes('PERSONALIZADA')) return 'Mechas Personalizadas';
        if (upper.includes('TINTE VEGETAL')) return 'Tinte Vegetal';
        if (upper.includes('TINTE')) return 'Tinte';
        return sinParen;
      };

      // v2.1: Normalizar nombre de staff
      const normalizarStaff = (nombre) => {
        let n = (nombre || '').trim();
        n = n.replace(/^[A-Z]_/i, '');
        n = n.replace(/\s+HT$/i, '').trim();
        if (n.length > 0) n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
        return n || 'Sin asignar';
      };

      // v2.2: Clasificar tipo de cliente por servicios
      const KW_CABALLERO = ['CABALLERO', 'BARBA', 'HOMBRE'];
      const KW_NINOS = ['NIÑO', 'NIÑA', 'NIÑOS'];
      const KW_SENORA = ['MUJER', 'MECHAS', 'TINTE', 'PEINADO', 'RECOGIDO', 'VEGETAL', 'BOTOX', 'TRATAMIENTO', 'KERASTASE', 'SPA CAPILAR', 'FUSIO', 'MECHA'];

      const clasificarCliente = (descripcion) => {
        if (!descripcion) return 'Sin clasificar';
        const items = descripcion.split(/,\s*(?=[^)]*(?:\(|$))/);
        let tipoCab = 0, tipoSen = 0, tipoNin = 0;
        let precCab = 0, precSen = 0, precNin = 0;
        for (const item of items) {
          const upper = item.toUpperCase();
          if (upper.startsWith('✏️')) continue;
          const precioMatch = item.match(/\(([\d.]+)€\)\s*$/);
          const precio = precioMatch ? parseFloat(precioMatch[1]) : 0;
          for (const kw of KW_NINOS) {
            if (upper.includes(kw)) { tipoNin++; precNin += precio; break; }
          }
          for (const kw of KW_CABALLERO) {
            if (upper.includes(kw)) { tipoCab++; precCab += precio; break; }
          }
          for (const kw of KW_SENORA) {
            if (upper.includes(kw)) { tipoSen++; precSen += precio; break; }
          }
        }
        const max = Math.max(precCab, precSen, precNin);
        if (max === 0) return 'Sin clasificar';
        if (precNin === max && tipoNin > 0) return 'Niños/as';
        if (precCab === max && tipoCab > 0) return 'Caballero';
        if (precSen === max && tipoSen > 0) return 'Señora';
        return 'Sin clasificar';
      };

      // v2.5: Helper IVA — desglosar un importe con IVA incluido
      const desglosarIVA = (importeConIVA, rate) => {
        if (!importeConIVA || importeConIVA === 0) return { base: 0, cuota: 0 };
        const base = Math.round((importeConIVA / (1 + rate / 100)) * 100) / 100;
        const cuota = Math.round((importeConIVA - base) * 100) / 100;
        return { base, cuota };
      };

      // ══════════════════════════════════════════════════════════════
      // 0. LEER vatRate DE SALONCONFIG
      // ══════════════════════════════════════════════════════════════
      let vatRate = DEFAULT_VAT_RATE;
      try {
        const configResult = await wixData.query(CMS_SALON_CONFIG).limit(1).find({ suppressAuth: true });
        if (configResult.items.length > 0 && configResult.items[0].vatRate != null) {
          vatRate = Number(configResult.items[0].vatRate);
        }
        console.log(`${TAG} vatRate: ${vatRate}%`);
      } catch (configErr) {
        console.warn(`${TAG} Error leyendo vatRate de SalonConfig, usando default ${DEFAULT_VAT_RATE}%: ${configErr.message}`);
      }

      // ══════════════════════════════════════════════════════════════
      // 1. LEER PAYMENTRESERVATIONS
      // ══════════════════════════════════════════════════════════════
      // v2.6.0: paginación (antes .limit(1000) sin skip → truncaba en
      // silencio los rangos largos). Mismo patrón que
      // obtenerMediaDiaSemanaAnio más abajo en este archivo.
      let pagos = [];
      let pagosOffset = 0;
      let pagosHasMore = true;

      while (pagosHasMore) {
        let query = wixData.query(COLECCION_PAGOS);
        if (fechaDesde) query = query.ge('fechaPago', new Date(fechaDesde));
        if (fechaHasta) {
          const hasta = new Date(fechaHasta);
          hasta.setDate(hasta.getDate() + 1);
          query = query.lt('fechaPago', hasta);
        }
        const result = await query.skip(pagosOffset).limit(1000).find();
        const items = result.items || [];
        pagos = pagos.concat(items);

        pagosHasMore = items.length === 1000;
        pagosOffset += 1000;

        if (pagosOffset > 50000) break;
      }

      console.log(`${TAG} Registros brutos: ${pagos.length}`);

      // ══════════════════════════════════════════════════════════════
      // v2.6.2 — EWCM ELIMINADO. Aquí vivía el filtro que sacaba los
      // cobros en efectivo del informe. No se sustituye por nada: el
      // informe trabaja SIEMPRE con la totalidad de los cobros.
      // ══════════════════════════════════════════════════════════════

      // ══════════════════════════════════════════════════════════════
      // 2. MAPAS desde queryServices: categoría + duración
      // ══════════════════════════════════════════════════════════════
      const mapaNombreCategoria = {};
      const mapaNombreCategoriaLower = {};
      const mapaNombreDuracion = {};

      try {
        const elevatedQuery = elevate(services.queryServices);
        const svcResult = await elevatedQuery().limit(200).find();
        for (const svc of (svcResult?.items || [])) {
          const nombre = (svc.name || '').trim();
          const cat = svc.category?.name || 'SIN CATEGORÍA';
          if (nombre) {
            const catFinal = canonCat(cat);
            mapaNombreCategoria[nombre] = catFinal;
            mapaNombreCategoriaLower[nombre.toLowerCase()] = catFinal;
            const duraciones = svc.schedule?.availabilityConstraints?.sessionDurations || [];
            mapaNombreDuracion[nombre] = duraciones.length > 0 ? duraciones[0] : 0;
            mapaNombreDuracion[nombre.toLowerCase()] = mapaNombreDuracion[nombre];
          }
        }
        console.log(`${TAG} ${Object.keys(mapaNombreCategoria).length} servicios, duraciones cargadas`);
      } catch (catErr) {
        console.warn(`${TAG} queryServices: ${catErr.message}`);
      }

      const buscarCategoria = (nombre) => {
        if (mapaNombreCategoria[nombre]) return mapaNombreCategoria[nombre];
        if (mapaNombreCategoriaLower[nombre.toLowerCase()]) return mapaNombreCategoriaLower[nombre.toLowerCase()];
        if (nombre.includes(' + ')) {
          const base = nombre.split(' + ')[0].trim();
          if (mapaNombreCategoria[base]) return mapaNombreCategoria[base];
          if (mapaNombreCategoriaLower[base.toLowerCase()]) return mapaNombreCategoriaLower[base.toLowerCase()];
        }
        const limpio = nombre.replace(/\s*\(AP\)\s*/gi, '').replace(/\s*\(Aplicaci[oó]n\)\s*/gi, '').replace(/\s*\(Complemento\)\s*/gi, '').trim();
        if (limpio !== nombre) {
          if (mapaNombreCategoria[limpio]) return mapaNombreCategoria[limpio];
          if (mapaNombreCategoriaLower[limpio.toLowerCase()]) return mapaNombreCategoriaLower[limpio.toLowerCase()];
        }
        return null;
      };

      const buscarDuracion = (nombre) => {
        if (mapaNombreDuracion[nombre]) return mapaNombreDuracion[nombre];
        if (mapaNombreDuracion[nombre.toLowerCase()]) return mapaNombreDuracion[nombre.toLowerCase()];
        const limpio = nombre.replace(/\s*\(AP\)\s*/gi, '').replace(/\s*\(Aplicaci[oó]n\)\s*/gi, '').replace(/\s*\(Complemento\)\s*/gi, '').trim();
        if (mapaNombreDuracion[limpio]) return mapaNombreDuracion[limpio];
        if (mapaNombreDuracion[limpio.toLowerCase()]) return mapaNombreDuracion[limpio.toLowerCase()];
        return 0;
      };

      const findNaturalCategory = (keyword) => {
        const kw = keyword.toUpperCase();
        for (const [svcName, cat] of Object.entries(mapaNombreCategoria)) {
          const cn = normCat(cat);
          if (cn.includes('SERVICIOS TECNICOS')) continue;
          if (cn.includes('GAP') || cn.includes('PROCESO')) continue;
          if (svcName.toUpperCase().includes(kw)) return cat;
        }
        return null;
      };

      const reclasificarServicio = (nombre, categoriaOriginal) => {
        const cn = normCat(categoriaOriginal);
        const nombreLimpio = nombre.replace(/\s*\(.*?\)\s*/g, ' ').trim().toUpperCase();
        if (cn.includes('GAP') || cn.includes('PROCESO')) {
          if (nombreLimpio.includes('TRATAMIENTO') || nombreLimpio.includes('BOTOX') || nombreLimpio.includes('KERASTASE')) {
            return { categoria: findNaturalCategory('TRATAMIENTO') || 'TRATAMIENTOS', subgrupo: null };
          }
          return { categoria: categoriaOriginal, subgrupo: null };
        }
        if (!cn.includes('SERVICIOS TECNICOS')) return { categoria: categoriaOriginal, subgrupo: null };
        if (nombreLimpio.includes('TINTE') || nombreLimpio.includes('MECHA')) {
          return { categoria: 'SERVICIOS TÉCNICOS', subgrupo: null };
        }
        if (nombreLimpio.includes('TRATAMIENTO') || nombreLimpio.includes('BOTOX')) {
          return { categoria: findNaturalCategory('TRATAMIENTO') || 'TRATAMIENTOS', subgrupo: null };
        }
        if (nombreLimpio.includes('CORTE')) {
          return { categoria: findNaturalCategory('CORTE') || 'CORTES', subgrupo: 'COMPLEMENTOS' };
        }
        if (nombreLimpio.includes('PEINADO')) {
          return { categoria: findNaturalCategory('PEINADO') || 'PEINADOS Y RECOGIDOS', subgrupo: 'COMPLEMENTOS' };
        }
        if (nombreLimpio === 'SECADO' || nombreLimpio === 'LAVADO') {
          return { categoria: 'LAVADO Y SECADO', subgrupo: 'COMPLEMENTOS' };
        }
        return { categoria: 'OTROS', subgrupo: null };
      };

      const clasificarExtra = (nombreExtra) => {
        const n = nombreExtra.toUpperCase();
        if (n.includes('PEINADO')) return { categoria: findNaturalCategory('PEINADO') || 'PEINADOS Y RECOGIDOS', subgrupo: 'EXTRAS' };
        if (n.includes('AMPOLLA') || n.includes('TRATAMIENTO') || n.includes('KERASTASE') || n.includes('FUSIO')) return { categoria: findNaturalCategory('TRATAMIENTO') || 'TRATAMIENTOS', subgrupo: 'EXTRAS' };
        if (n.includes('COLOR') || n.includes('TINTE') || n.includes('MECHAS') || n.includes('MATIZ')) return { categoria: 'SERVICIOS TÉCNICOS', subgrupo: 'EXTRAS' };
        if (n.includes('CORTE') || n.includes('PUNTAS')) return { categoria: findNaturalCategory('CORTE') || 'CORTES', subgrupo: 'EXTRAS' };
        if (n.includes('PRODUCTO')) return { categoria: 'PRODUCTOS', subgrupo: 'EXTRAS' };
        if (n.includes('PROPINA')) return { categoria: 'PROPINAS', subgrupo: null };
        return { categoria: 'EXTRAS', subgrupo: null };
      };

      // ══════════════════════════════════════════════════════════════
      // 3. PROCESAR PAGOS
      // ══════════════════════════════════════════════════════════════
      let totalIngresos = 0;
      const ingresosPorDia = {};
      const ingresosPorDiaSemana = {};
      const diasUnicosPorDiaSemana = {};
      const porMetodo = {};
      const porBoton = {};        // v2.6.3 - pulsaciones de boton (tipoPago en crudo)
      const porStaff = {};
      const porServicioTop = {};
      const desglosePorCat = {};
      let totalExtras = 0;
      let countExtras = 0;
      let totalPropinas = 0;
      let countPropinas = 0;
      const productosPOS = {};
      const clientesPorTipo = { 'Señora': 0, 'Caballero': 0, 'Niños/as': 0, 'Sin clasificar': 0 };
      const complementosSTMap = {};
      let ingresosSTPrincipal = 0;
      let ingresosComplementosST = 0;
      const productividadPorStaff = {};

      const addToDesglose = (categoria, nombre, precio, subgrupo) => {
        const catNorm = normCat(categoria);
        if (catNorm.includes('GAP') || catNorm.includes('PROCESO')) return;
        const catKey = canonCat(categoria);
        let nombreFinal = nombre;
        if (catKey === 'SERVICIOS TÉCNICOS' && !subgrupo) {
          nombreFinal = normalizarNombreST(nombre);
        }
        if (!desglosePorCat[catKey]) desglosePorCat[catKey] = {};
        const key = `${nombreFinal}||${subgrupo || ''}`;
        if (!desglosePorCat[catKey][key]) {
          desglosePorCat[catKey][key] = { nombre: nombreFinal, cantidad: 0, importe: 0, subgrupo: subgrupo || null };
        }
        desglosePorCat[catKey][key].cantidad++;
        desglosePorCat[catKey][key].importe += precio;
      };

      for (const p of pagos) {
        const importe = Number(p.importeTotal || 0);
        totalIngresos += importe;

        const tipoCliente = clasificarCliente(p.descripcion);
        clientesPorTipo[tipoCliente] = (clientesPorTipo[tipoCliente] || 0) + 1;

        if (p.fechaPago) {
          const dia = new Date(p.fechaPago).toISOString().split('T')[0];
          ingresosPorDia[dia] = (ingresosPorDia[dia] || 0) + importe;
          const diaSemana = DIAS_SEMANA[new Date(p.fechaPago).getDay()];
          ingresosPorDiaSemana[diaSemana] = (ingresosPorDiaSemana[diaSemana] || 0) + importe;
          if (!diasUnicosPorDiaSemana[diaSemana]) diasUnicosPorDiaSemana[diaSemana] = new Set();
          diasUnicosPorDiaSemana[diaSemana].add(dia);
        }

        // v2.6.3 — RECUENTO POR BOTÓN PULSADO. Agrupación en crudo por
        // `tipoPago`, con número de pulsaciones además del importe. Aquí
        // 'Mixto' SÍ es una cesta propia: fue UN botón. Responde a
        // "¿se pulsó el botón correcto?", no a "¿cuánto hay en el
        // datáfono?". Es la vista de auditoría, paralela y distinta al
        // reparto por canal de más abajo. Las dos conviven a propósito.
        const _boton = String(p.tipoPago || '').trim() || 'Sin método registrado';
        if (!porBoton[_boton]) porBoton[_boton] = { metodo: _boton, n: 0, importe: 0 };
        porBoton[_boton].n += 1;
        porBoton[_boton].importe += importe;

        // v2.6.1 — reparto por canal físico. La parte tarjeta / efectivo /
        // bizum de un cobro Mixto suma en su canal; ya no hay cesta "Mixto"
        // ni cesta "Sin especificar" como cajón de sastre.
        // v2.6.2 — sin excepción por EWCM: el efectivo suma siempre.
        const rep = _repartirCanales(p);
        if (rep.tarjeta) porMetodo['Tarjeta'] = (porMetodo['Tarjeta'] || 0) + rep.tarjeta;
        if (rep.efectivo) porMetodo['Efectivo'] = (porMetodo['Efectivo'] || 0) + rep.efectivo;
        if (rep.bizum) porMetodo['Bizum'] = (porMetodo['Bizum'] || 0) + rep.bizum;
        if (Math.abs(rep.anomalia) >= 0.005) {
          porMetodo[rep.anomaliaLabel] = (porMetodo[rep.anomaliaLabel] || 0) + rep.anomalia;
        }

        const staffRaw = (p.staff || '').toUpperCase();
        if (staffRaw === 'TIENDA_POS') {
          const desc = (p.descripcion || '').trim();
          let nombreProd = desc.replace(/^🛒\s*/, '').replace(/\s*\([\d.,]+€?\)\s*$/, '').trim();
          if (!nombreProd) nombreProd = 'Producto Tienda POS';
          if (!productosPOS[nombreProd]) productosPOS[nombreProd] = { nombre: nombreProd, count: 0, total: 0 };
          productosPOS[nombreProd].count++;
          productosPOS[nombreProd].total += importe;
          continue;
        }

        const staff = normalizarStaff(p.staff);
        porStaff[staff] = (porStaff[staff] || 0) + importe;

        if (!productividadPorStaff[staff]) {
          productividadPorStaff[staff] = { ingresos: 0, minutos: 0, servicios: 0 };
        }
        productividadPorStaff[staff].ingresos += importe;

        const desc = p.descripcion || '';
        if (!desc) continue;

        const items = desc.split(/,\s*(?=[^)]*(?:\(|$))/);
        for (const item of items) {
          const trimmed = item.trim();
          if (!trimmed) continue;

          const precioMatch = trimmed.match(/\(([\d.]+)€\)\s*$/);
          const precio = precioMatch ? parseFloat(precioMatch[1]) : 0;
          let nombre = trimmed;
          if (precioMatch) {
            nombre = trimmed.substring(0, trimmed.lastIndexOf('(' + precioMatch[1])).trim();
          }
          nombre = nombre.replace(/,\s*$/, '').trim();
          if (!nombre) continue;

          const esExtra = nombre.startsWith('✏️');
          if (esExtra) {
            const nombreExtra = nombre.replace('✏️', '').trim();
            if (precio > 0) {
              const { categoria, subgrupo } = clasificarExtra(nombreExtra);
              porServicioTop['✏️ ' + nombreExtra] = (porServicioTop['✏️ ' + nombreExtra] || 0) + precio;
              addToDesglose(categoria, nombreExtra, precio, subgrupo);

              if (normCat(categoria).includes('PROPINA')) {
                totalPropinas += precio;
                countPropinas++;
              } else {
                totalExtras += precio;
                countExtras++;
              }
            }
          } else {
            const duracion = buscarDuracion(nombre);
            if (duracion > 0) {
              productividadPorStaff[staff].minutos += duracion;
              productividadPorStaff[staff].servicios++;
            }

            if (precio > 0) {
              const categoriaWix = buscarCategoria(nombre) || 'OTROS';
              const { categoria, subgrupo } = reclasificarServicio(nombre, categoriaWix);
              const catFinal = canonCat(categoria);

              let nombreTop = nombre;
              if (catFinal === 'SERVICIOS TÉCNICOS' && !subgrupo) {
                nombreTop = normalizarNombreST(nombre);
              }
              porServicioTop[nombreTop] = (porServicioTop[nombreTop] || 0) + precio;
              addToDesglose(categoria, nombre, precio, subgrupo);

              if (catFinal === 'SERVICIOS TÉCNICOS' && !subgrupo) {
                ingresosSTPrincipal += precio;
              }

              if (subgrupo === 'COMPLEMENTOS') {
                const catOriginal = buscarCategoria(nombre) || 'OTROS';
                if (normCat(catOriginal).includes('SERVICIOS TECNICOS')) {
                  ingresosComplementosST += precio;
                  const nTop = nombre.replace(/\s*\(.*?\)\s*/g, ' ').trim();
                  if (!complementosSTMap[nTop]) complementosSTMap[nTop] = { nombre: nTop, cantidad: 0, importe: 0 };
                  complementosSTMap[nTop].cantidad++;
                  complementosSTMap[nTop].importe += precio;
                }
              }
            } else {
              const duracion0 = buscarDuracion(nombre);
              if (duracion0 > 0) {
                productividadPorStaff[staff].minutos += duracion0;
                productividadPorStaff[staff].servicios++;
              }
            }
          }
        }
      }

      // ══════════════════════════════════════════════════════════════
      // 4. EXTERNOS
      //   v2.6.0 — 4.A fuente V2 (PagoreservasExternos, por fechaPago)
      //          + 4.B histórico V1 (SvExternalRecords) sin duplicar
      //   v2.4   — legacy: solo status PAGADO
      // ══════════════════════════════════════════════════════════════
      // ════════════════════════════════════════════════════════════
      // v2.6.3 — CANJES DE BONO DEL PERIODO
      // ════════════════════════════════════════════════════════════
      // Fuente: KamisuiteVoucherRedemptions, filtrada por `redeemDate`.
      // Es el registro que escribe recepcionProLogic → confirmarCanjeProducto
      // en el momento del canje, con el `amountSaved` ya calculado. No se
      // parsea la descripción del pago: el dato está aquí de primera mano.
      // Patrón de consulta copiado de akiraLogic.web.js → consultarBonos.
      //
      // POR QUÉ VA APARTE Y NO EN LOS MÉTODOS DE PAGO. Un canje NO es caja
      // nueva: ese dinero entró el día que el cliente compró el bono.
      // `valorConsumido` es valor de tarifa consumido en el periodo, y por
      // eso NO debe sumarse a las ventas ni a ningún canal de cobro.
      let canjesBono = { n: 0, valorConsumido: 0, disponible: true };
      try {
        let canjes = [];
        let canjesOffset = 0;
        let canjesHasMore = true;
        while (canjesHasMore) {
          let qc = wixData.query(CMS_VOUCHER_REDEMPTIONS);
          if (fechaDesde) qc = qc.ge('redeemDate', new Date(fechaDesde));
          if (fechaHasta) {
            const hastaC = new Date(fechaHasta);
            hastaC.setDate(hastaC.getDate() + 1);
            qc = qc.lt('redeemDate', hastaC);
          }
          const rc = await qc.skip(canjesOffset).limit(1000).find({ suppressAuth: true });
          const itemsC = rc.items || [];
          canjes = canjes.concat(itemsC);
          canjesHasMore = itemsC.length === 1000;
          canjesOffset += 1000;
          if (canjesOffset > 50000) break;
        }
        canjesBono = {
          n: canjes.length,
          valorConsumido: Math.round(canjes.reduce((a, r) => a + (Number(r.amountSaved) || 0), 0) * 100) / 100,
          disponible: true
        };
        console.log(`${TAG} Canjes de bono: ${canjesBono.n} | valor consumido ${canjesBono.valorConsumido}€`);
      } catch (eCanjes) {
        // Si la colección no existe en este tenant, no se inventa un 0:
        // se marca como no disponible y el widget no pinta la sección.
        canjesBono = { n: 0, valorConsumido: 0, disponible: false };
        console.warn(`${TAG} Canjes de bono no disponibles: ${eCanjes.message}`);
      }

      let externosResult = { citas: 0, ventaBruta: 0, comisionTotal: 0, desglose: [] };

      // Acumuladores comunes a las dos fuentes.
      let extCitas = 0;
      let extVentaBruta = 0;
      let extComisionTotal = 0;
      const extDesglose = {};

      const acumularExterno = (nombreServicio, precio, comision) => {
        extCitas++;
        extVentaBruta += precio;
        extComisionTotal += comision;
        if (!extDesglose[nombreServicio]) {
          extDesglose[nombreServicio] = { nombre: nombreServicio, count: 0, ventaBruta: 0, comision: 0 };
        }
        extDesglose[nombreServicio].count++;
        extDesglose[nombreServicio].ventaBruta += precio;
        extDesglose[nombreServicio].comision += comision;
      };

      // bookingIds de PagoreservasExternos vistos en el rango — sirven para
      // no volver a contar por 4.B una cita que ya se contó por 4.A.
      const bookingIdsV2 = new Set();

      // ──────────────────────────────────────────────────────────────
      // 4.A — FUENTE V2: PagoreservasExternos (filtrada por fechaPago)
      //   Cruce de comisión POR EMPLEADO, replicado literalmente de
      //   cierreExternosLogic v1.1.0 (backend del Informe del día).
      // ──────────────────────────────────────────────────────────────
      try {
        // Mapa displayName(UPPER) → % comisión.
        let mapaComisionesPorEmpleado = {};

        try {
          const extCatResult = await wixData.query(CMS_EXTERNAL_SERVICES)
            .eq('activeStatus', true)
            .limit(100)
            .find({ suppressAuth: true });

          const catalogoExt = extCatResult.items || [];

          const resourceIds = [];
          for (const it of catalogoExt) {
            const rid = it.staffResourceId;
            if (typeof rid === 'string' && rid.length > 0) resourceIds.push(rid);
          }

          let displayNamePorResourceId = {};
          if (resourceIds.length) {
            try {
              const staffResult = await wixData.query(CMS_STAFF)
                .hasSome('wixResourceId', resourceIds)
                .limit(100)
                .find({ suppressAuth: true });

              for (const s of (staffResult.items || [])) {
                const rid = s.wixResourceId;
                if (typeof rid === 'string' && rid.length > 0) {
                  const dn = s.displayName || s.canonicalName || '';
                  if (dn) displayNamePorResourceId[rid] = dn;
                }
              }
            } catch (stErr) {
              console.warn(`${TAG} Error leyendo StaffConfig: ${stErr.message}`);
            }
          }

          for (const item of catalogoExt) {
            const pct = Number(item.commissionPercentage || 0);
            const rid = item.staffResourceId;
            const displayName = (typeof rid === 'string' && rid.length > 0)
              ? (displayNamePorResourceId[rid] || '')
              : '';

            if (displayName) {
              const key = displayName.trim().toUpperCase();
              if (key) mapaComisionesPorEmpleado[key] = pct;
            } else {
              const contact = String(item.contactPerson || '').trim().toUpperCase();
              if (contact) mapaComisionesPorEmpleado[contact] = pct;
            }
          }
        } catch (catErr) {
          console.warn(`${TAG} Error leyendo ExternalServices (V2): ${catErr.message}`);
        }

        // Cobros externos del rango. Mismo criterio de fecha que el resto
        // del informe: fechaPago. Margen ±3h + filtro fino Madrid.
        const startRangeV2 = new Date(new Date(`${fechaDesde}T00:00:00`).getTime() - 3 * 3600000);
        const endRangeV2 = new Date(new Date(`${fechaHasta}T23:59:59`).getTime() + 3 * 3600000);

        let allPagosExt = [];
        let pgOffset = 0;
        let pgHasMore = true;
        while (pgHasMore) {
          const pgResult = await wixData.query(CMS_PAGOS_EXTERNOS)
            .ge('fechaPago', startRangeV2)
            .le('fechaPago', endRangeV2)
            .ascending('fechaPago')
            .skip(pgOffset)
            .limit(500)
            .find({ suppressAuth: true });

          const items = pgResult.items || [];
          allPagosExt = allPagosExt.concat(items);
          pgHasMore = items.length === 500;
          pgOffset += 500;
          if (pgOffset > 50000) break;
        }

        const pagosExtRango = allPagosExt.filter(p => {
          if (!p.fechaPago) return false;
          const madridDate = new Date(p.fechaPago).toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
          return madridDate >= fechaDesde && madridDate <= fechaHasta;
        });

        for (const pago of pagosExtRango) {
          const bid = String(pago.bookingId || '');
          if (bid) bookingIdsV2.add(bid);

          const precio = Number(pago.importeTotal || 0);
          const nombreServicio = nombreServicioDesdeDescripcion(pago.descripcion) || 'Servicio externo';

          const staffUpper = String(pago.staff || '').trim().toUpperCase();
          const pctComision = (staffUpper && mapaComisionesPorEmpleado[staffUpper] !== undefined)
            ? mapaComisionesPorEmpleado[staffUpper]
            : 0;

          const comision = Math.round((precio * pctComision / 100) * 100) / 100;
          acumularExterno(nombreServicio, precio, comision);
        }

        console.log(`${TAG} Externos V2 (PagoreservasExternos): ${pagosExtRango.length} cobros, bruta=${Math.round(extVentaBruta * 100) / 100}€`);
      } catch (extV2Err) {
        console.warn(`${TAG} Error externos V2: ${extV2Err.message}`);
      }

      // ──────────────────────────────────────────────────────────────
      // 4.B — HISTÓRICO V1: SvExternalRecords
      //   Solo las filas SIN gemela en PagoreservasExternos
      //   (bookingId = 'EXT_' + _id). Cálculo de comisión INTACTO
      //   respecto a v2.5.3.
      // ──────────────────────────────────────────────────────────────
      try {
        let mapaComisiones = {};
        let comisionFallback = 0;
        const catResult = await wixData.query(CMS_EXTERNAL_SERVICES).eq('activeStatus', true).limit(100).find();
        for (const item of (catResult.items || [])) {
          const nombre = (item.serviceName || '').trim().toUpperCase();
          const pct = Number(item.commissionPercentage || 0);
          if (nombre) mapaComisiones[nombre] = pct;
          if (comisionFallback === 0 && pct > 0) comisionFallback = pct;
        }

        const startRange = new Date(new Date(`${fechaDesde}T00:00:00`).getTime() - 3 * 3600000);
        const endRange = new Date(new Date(`${fechaHasta}T23:59:59`).getTime() + 3 * 3600000);
        let allExtRecords = [];
        let extOffset = 0;
        let extHasMore = true;
        while (extHasMore) {
          const extResult = await wixData.query(CMS_EXTERNAL_RECORDS)
            .eq('status', 'PAGADO')
            .ge('date', startRange).le('date', endRange)
            .ascending('date').skip(extOffset).limit(100).find();
          allExtRecords = allExtRecords.concat(extResult.items || []);
          extHasMore = (extResult.items || []).length === 100;
          extOffset += 100;
        }

        const citasEnRango = allExtRecords.filter(item => {
          if (!item.date) return false;
          const d = new Date(item.date);
          const madridDate = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
          if (madridDate < fechaDesde || madridDate > fechaHasta) return false;
          return true;
        });

        // ── Dedup v2.6.0 ──
        // Paso 1: descartar las que ya se contaron en 4.A (gemela dentro
        //         del rango).
        let candidatas = citasEnRango.filter(item => !bookingIdsV2.has(`EXT_${item._id}`));

        // Paso 2: descartar las que tienen gemela FUERA del rango. Ese
        //         cobro pertenece a su fecha de pago y se contará en el
        //         informe de ese periodo; contarlo aquí lo duplicaría
        //         entre informes. Consulta en bloques de 50 ids.
        if (candidatas.length) {
          const idsPendientes = candidatas.map(it => `EXT_${it._id}`);
          const conGemela = new Set();
          for (let i = 0; i < idsPendientes.length; i += 50) {
            const bloque = idsPendientes.slice(i, i + 50);
            try {
              const gemResult = await wixData.query(CMS_PAGOS_EXTERNOS)
                .hasSome('bookingId', bloque)
                .limit(500)
                .find({ suppressAuth: true });
              for (const g of (gemResult.items || [])) {
                const bid = String(g.bookingId || '');
                if (bid) conGemela.add(bid);
              }
            } catch (gemErr) {
              console.warn(`${TAG} Error comprobando gemelas V2: ${gemErr.message}`);
            }
          }
          if (conGemela.size) {
            candidatas = candidatas.filter(it => !conGemela.has(`EXT_${it._id}`));
          }
        }

        for (const cita of candidatas) {
          const precio = Number(cita.totalPrice || 0);
          const catUpper = (cita.category || '').trim().toUpperCase();
          let pctComision = mapaComisiones[catUpper] !== undefined ? mapaComisiones[catUpper] : 0;
          if (pctComision === 0) {
            for (const parte of catUpper.split('+').map(p => p.trim())) {
              if (mapaComisiones[parte] !== undefined) { pctComision = mapaComisiones[parte]; break; }
            }
            if (pctComision === 0 && comisionFallback > 0) pctComision = comisionFallback;
          }
          const comision = Math.round((precio * pctComision / 100) * 100) / 100;
          const nombreServicio = cita.modality || cita.category || 'Servicio externo';
          acumularExterno(nombreServicio, precio, comision);
        }

        console.log(`${TAG} Externos V1 (SvExternalRecords): ${citasEnRango.length} en rango, ${candidatas.length} sin gemela V2`);
      } catch (extErr) { console.warn(`${TAG} Error externos V1: ${extErr.message}`); }

      // ── Consolidación de las dos fuentes ──
      externosResult = {
        citas: extCitas,
        ventaBruta: Math.round(extVentaBruta * 100) / 100,
        comisionTotal: Math.round(extComisionTotal * 100) / 100,
        desglose: Object.values(extDesglose)
          .map(it => ({
            nombre: it.nombre,
            count: it.count,
            ventaBruta: Math.round(it.ventaBruta * 100) / 100,
            comision: Math.round(it.comision * 100) / 100
          }))
          .sort((a, b) => b.ventaBruta - a.ventaBruta)
      };
      console.log(`${TAG} Externos TOTAL: ${externosResult.citas} cobros, bruta=${externosResult.ventaBruta}€, comisión=${externosResult.comisionTotal}€`);

      // ══════════════════════════════════════════════════════════════
      // 5. PRODUCTOS
      // ══════════════════════════════════════════════════════════════
      let productosResult = { pedidos: 0, totalProductos: 0, desglose: [] };
      try {
        const elevatedSearchOrders = elevate(orders.searchOrders);
        const ordersResult = await elevatedSearchOrders({
          search: {
            filter: {
              "createdDate": {
                "$gte": new Date(`${fechaDesde}T00:00:00.000Z`).toISOString(),
                "$lte": new Date(`${fechaHasta}T23:59:59.999Z`).toISOString()
              }
            }
          }
        });
        const pedidos = ordersResult?.orders || [];
        let totalProductos = 0;
        const desgloseProd = {};

        for (const pedido of pedidos) {
          if (pedido.paymentStatus === 'NOT_PAID' || pedido.paymentStatus === 'REFUNDED') continue;
          for (const li of (pedido.lineItems || [])) {
            const nombre = li.productName?.translated || li.productName?.original || li.name || 'Producto';
            const cantidad = Number(li.quantity || 1);
            const precioUnit = Number(li.price?.amount || li.priceBeforeDiscounts?.amount || 0);
            const subtotal = precioUnit * cantidad;
            totalProductos += subtotal;
            if (!desgloseProd[nombre]) desgloseProd[nombre] = { nombre, count: 0, total: 0, precioUnit };
            desgloseProd[nombre].count += cantidad;
            desgloseProd[nombre].total += subtotal;
          }
        }
        productosResult = {
          pedidos: pedidos.length,
          totalProductos: Math.round(totalProductos * 100) / 100,
          desglose: Object.values(desgloseProd)
        };
      } catch (prodErr) { console.warn(`${TAG} Error productos: ${prodErr.message}`); }

      // v2.5.1: Fusionar productos vendidos desde Tienda POS (staff=TIENDA_POS en PaymentReservations)
      const posList = Object.values(productosPOS);
      if (posList.length > 0) {
        let totalPOS = 0;
        for (const prod of posList) {
          prod.total = Math.round(prod.total * 100) / 100;
          totalPOS += prod.total;
          productosResult.desglose.push(prod);
        }
        productosResult.totalProductos = Math.round((productosResult.totalProductos + totalPOS) * 100) / 100;
        productosResult.pedidos += posList.reduce((s, p) => s + p.count, 0);
        console.log(`${TAG} Productos POS añadidos: ${posList.length} productos, ${totalPOS}€`);
      }

      // ══════════════════════════════════════════════════════════════
      // 6. CONSTRUIR RESPUESTA
      // ══════════════════════════════════════════════════════════════
      if (pagos.length === 0 && externosResult.citas === 0 && productosResult.pedidos === 0) {
        return { ok: true, hayDatos: false };
      }

      // ── Mapa de promedios por día de semana ──
      const promedioPorDiaSemana = {};
      for (const [ds, total] of Object.entries(ingresosPorDiaSemana)) {
        const count = diasUnicosPorDiaSemana[ds] ? diasUnicosPorDiaSemana[ds].size : 0;
        promedioPorDiaSemana[ds] = count > 0 ? Math.round((total / count) * 100) / 100 : 0;
      }

      // ── Ingresos por día (cronológico) — con IVA + día semana + promedio ──
      // v2.6.0: eje CONTINUO. Antes se construía solo con los días que
      // tenían cobros, así que un día sin actividad desaparecía del eje.
      // Ahora se recorre el rango completo y los días sin cobros valen 0.
      // ingresosPorDia (el objeto de datos reales) NO se toca: el ranking
      // y los promedios por día de semana siguen calculados solo sobre
      // días con actividad.
      const diasConDatos = Object.keys(ingresosPorDia).sort();
      let diasOrdenados = diasConDatos;

      if (fechaDesde && fechaHasta) {
        const diasSet = new Set(diasConDatos);
        let cursor = new Date(`${fechaDesde}T00:00:00.000Z`);
        const finRango = new Date(`${fechaHasta}T00:00:00.000Z`);
        let guardDias = 0;
        while (cursor.getTime() <= finRango.getTime() && guardDias < 1100) {
          diasSet.add(cursor.toISOString().split('T')[0]);
          cursor = new Date(cursor.getTime() + 86400000);
          guardDias++;
        }
        diasOrdenados = Array.from(diasSet).sort();
      }

      const datosIngresosDia = {
        labels: diasOrdenados.map(d => { const f = new Date(d); return `${f.getDate()}/${f.getMonth() + 1}`; }),
        valores: diasOrdenados.map(d => ingresosPorDia[d] || 0),
        diasSemana: diasOrdenados.map(d => DIAS_SEMANA[new Date(d).getDay()]),
        promediosDiaSemana: diasOrdenados.map(d => promedioPorDiaSemana[DIAS_SEMANA[new Date(d).getDay()]] || 0),
        valoresBase: diasOrdenados.map(d => desglosarIVA(ingresosPorDia[d] || 0, vatRate).base),
        valoresIva: diasOrdenados.map(d => desglosarIVA(ingresosPorDia[d] || 0, vatRate).cuota)
      };

      // ── Ingresos por día (ranking) — con IVA + día semana + promedio ──
      const diasRanking = Object.entries(ingresosPorDia).sort((a, b) => b[1] - a[1]);
      const datosIngresosDiaRanking = {
        labels: diasRanking.map(([d]) => { const f = new Date(d); return `${f.getDate()}/${f.getMonth() + 1}`; }),
        valores: diasRanking.map(([, v]) => v),
        diasSemana: diasRanking.map(([d]) => DIAS_SEMANA[new Date(d).getDay()]),
        promediosDiaSemana: diasRanking.map(([d]) => promedioPorDiaSemana[DIAS_SEMANA[new Date(d).getDay()]] || 0),
        valoresBase: diasRanking.map(([, v]) => desglosarIVA(v, vatRate).base),
        valoresIva: diasRanking.map(([, v]) => desglosarIVA(v, vatRate).cuota)
      };

      // ── Día de semana (sin IVA, con conteo y promedio) ──
      const diaSemanaRanking = Object.entries(ingresosPorDiaSemana).sort((a, b) => b[1] - a[1]);
      const datosDiaSemana = {
        labels: diaSemanaRanking.map(([d]) => d),
        valores: diaSemanaRanking.map(([, v]) => v),
        conteos: diaSemanaRanking.map(([d]) => diasUnicosPorDiaSemana[d] ? diasUnicosPorDiaSemana[d].size : 0),
        promedios: diaSemanaRanking.map(([d, v]) => {
          const count = diasUnicosPorDiaSemana[d] ? diasUnicosPorDiaSemana[d].size : 0;
          return count > 0 ? Math.round((v / count) * 100) / 100 : 0;
        })
      };

      // ── Método de pago (sin IVA) ──
      // v2.6.1 — orden fijo: canales físicos primero, anomalías después.
      const _labelsMetodo = [];
      for (const c of CANALES_FISICOS) if (porMetodo[c]) _labelsMetodo.push(c);
      for (const k of Object.keys(porMetodo)) if (!CANALES_FISICOS.includes(k)) _labelsMetodo.push(k);
      const datosMetodoPago = {
        labels: _labelsMetodo,
        valores: _labelsMetodo.map(k => Math.round(porMetodo[k] * 100) / 100)
      };

      // v2.6.3 — recuento por botón pulsado, en orden fijo de presentación.
      const ORDEN_BOTONES = ['Tarjeta', 'Efectivo', 'Bizum', 'Mixto', 'Canje'];
      const _clavesBoton = ORDEN_BOTONES.filter(k => porBoton[k])
        .concat(Object.keys(porBoton).filter(k => !ORDEN_BOTONES.includes(k)));
      const datosBotonPago = _clavesBoton.map(k => ({
        metodo: k,
        n: porBoton[k].n,
        importe: Math.round(porBoton[k].importe * 100) / 100
      }));
      const datosBotonTotales = {
        n: datosBotonPago.reduce((a, b) => a + b.n, 0),
        importe: Math.round(datosBotonPago.reduce((a, b) => a + b.importe, 0) * 100) / 100
      };

      // ── Staff (sin IVA) ──
      const staffOrdenado = Object.entries(porStaff).sort((a, b) => b[1] - a[1]);
      const datosStaff = { labels: staffOrdenado.map(s => s[0]), valores: staffOrdenado.map(s => s[1]) };

      // ── Top 10 servicios — con IVA ──
      const serviciosTop10 = Object.entries(porServicioTop).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const datosServicios = {
        labels: serviciosTop10.map(s => s[0]),
        valores: serviciosTop10.map(s => s[1]),
        valoresBase: serviciosTop10.map(s => desglosarIVA(s[1], vatRate).base),
        valoresIva: serviciosTop10.map(s => desglosarIVA(s[1], vatRate).cuota)
      };

      // ── Desglose por categoría — con IVA ──
      const grandTotalServicios = Object.values(desglosePorCat).reduce((s, cat) => s + Object.values(cat).reduce((ss, i) => ss + i.importe, 0), 0);
      const grandTotalCantidad = Object.values(desglosePorCat).reduce((s, cat) => s + Object.values(cat).reduce((ss, i) => ss + i.cantidad, 0), 0);

      const tablaDesglose = Object.entries(desglosePorCat)
        .sort((a, b) => {
          const getPrio = (cat) => { if (cat === 'OTROS') return 90; if (cat === 'EXTRAS') return 91; if (cat === 'PROPINAS') return 92; return 0; };
          const prioA = getPrio(a[0]), prioB = getPrio(b[0]);
          if (prioA !== prioB) return prioA - prioB;
          const impA = Object.values(a[1]).reduce((s, i) => s + i.importe, 0);
          const impB = Object.values(b[1]).reduce((s, i) => s + i.importe, 0);
          return impB - impA;
        })
        .map(([categoria, itemsMap]) => {
          const allItems = Object.values(itemsMap);
          const esPropinaCat = normCat(categoria).includes('PROPINA');
          const subgrupoPrio = (sg) => { if (!sg) return 0; if (sg === 'COMPLEMENTOS') return 1; if (sg === 'EXTRAS') return 2; return 3; };
          const items = allItems
            .sort((a, b) => {
              const sgA = subgrupoPrio(a.subgrupo), sgB = subgrupoPrio(b.subgrupo);
              if (sgA !== sgB) return sgA - sgB;
              return b.importe - a.importe;
            })
            .map(data => {
              const importeRound = Math.round(data.importe * 100) / 100;
              const iva = esPropinaCat ? { base: 0, cuota: 0 } : desglosarIVA(importeRound, vatRate);
              return {
                nombre: data.nombre,
                cantidad: data.cantidad,
                importe: importeRound,
                importeBase: iva.base,
                importeIva: iva.cuota,
                ticketMedio: data.cantidad > 0 ? Math.round((data.importe / data.cantidad) * 100) / 100 : 0,
                pctImporte: grandTotalServicios > 0 ? Math.round((data.importe / grandTotalServicios) * 10000) / 100 : 0,
                pctCantidad: grandTotalCantidad > 0 ? Math.round((data.cantidad / grandTotalCantidad) * 10000) / 100 : 0,
                subgrupo: data.subgrupo || null
              };
            });

          const totalCatImporte = items.reduce((s, i) => s + i.importe, 0);
          const totalCatCantidad = items.reduce((s, i) => s + i.cantidad, 0);
          const totalCatRound = Math.round(totalCatImporte * 100) / 100;
          const ivaCat = esPropinaCat ? { base: 0, cuota: 0 } : desglosarIVA(totalCatRound, vatRate);

          return {
            categoria, items,
            totalImporte: totalCatRound,
            totalImporteBase: ivaCat.base,
            totalImporteIva: ivaCat.cuota,
            totalCantidad: totalCatCantidad,
            ticketMedio: totalCatCantidad > 0 ? Math.round((totalCatImporte / totalCatCantidad) * 100) / 100 : 0,
            pctImporte: grandTotalServicios > 0 ? Math.round((totalCatImporte / grandTotalServicios) * 10000) / 100 : 0,
            pctCantidad: grandTotalCantidad > 0 ? Math.round((totalCatCantidad / grandTotalCantidad) * 10000) / 100 : 0
          };
        });

      // ── ST vs Complementos (sin IVA) ──
      const top5ComplementosST = Object.values(complementosSTMap)
        .sort((a, b) => b.importe - a.importe)
        .slice(0, 5);
      const ratioSTvsComplementos = {
        ingresosST: Math.round(ingresosSTPrincipal * 100) / 100,
        ingresosComplementos: Math.round(ingresosComplementosST * 100) / 100,
        ratio: ingresosSTPrincipal > 0 ? Math.round((ingresosComplementosST / ingresosSTPrincipal) * 10000) / 100 : 0,
        top5: top5ComplementosST
      };

      // ── Productividad (sin IVA) ──
      const productividadStaff = Object.entries(productividadPorStaff)
        .sort((a, b) => b[1].ingresos - a[1].ingresos)
        .map(([nombre, data]) => ({
          nombre,
          ingresos: Math.round(data.ingresos * 100) / 100,
          minutos: data.minutos,
          horas: Math.round((data.minutos / 60) * 100) / 100,
          servicios: data.servicios,
          eurosPorHora: data.minutos > 0 ? Math.round((data.ingresos / (data.minutos / 60)) * 100) / 100 : 0,
          minutosPorServicio: data.servicios > 0 ? Math.round((data.minutos / data.servicios) * 100) / 100 : 0
        }));

      // ── Extras (sin propinas, que van aparte) ──
      const extrasData = {
        cantidad: countExtras,
        importe: Math.round(totalExtras * 100) / 100,
        ticketMedio: countExtras > 0 ? Math.round((totalExtras / countExtras) * 100) / 100 : 0
      };

      // ── Propinas ──
      const propinasData = {
        cantidad: countPropinas,
        importe: Math.round(totalPropinas * 100) / 100
      };

      // ── v2.5.1: totalVentas = recaudación sin propinas ──
      const totalVentas = Math.round((totalIngresos - totalPropinas) * 100) / 100;
      const ivaGlobal = desglosarIVA(totalVentas, vatRate);

      // ── Gran Total ──
      const granTotal = {
        ventas: totalVentas,
        propinas: propinasData.importe,
        recaudacion: Math.round(totalIngresos * 100) / 100,
        extras: extrasData.importe,
        comisionExternos: externosResult.comisionTotal,
        productos: productosResult.totalProductos,
        total: Math.round((totalVentas + externosResult.comisionTotal + productosResult.totalProductos) * 100) / 100
      };

      // ── Clientes (sin IVA) ──
      const totalClientes = Object.values(clientesPorTipo).reduce((s, v) => s + v, 0);
      const datosClientes = {
        total: totalClientes,
        tipos: Object.entries(clientesPorTipo)
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([tipo, cantidad]) => ({
            tipo,
            cantidad,
            pct: totalClientes > 0 ? Math.round((cantidad / totalClientes) * 10000) / 100 : 0
          }))
      };

      console.log(`${TAG} OK: ${pagos.length} pagos, ventas=${totalVentas}€ (base=${ivaGlobal.base}€, IVA=${ivaGlobal.cuota}€ @${vatRate}%), propinas=${totalPropinas}€, ext=${externosResult.citas} PAGADAS/${externosResult.ventaBruta}€`);

      return {
        ok: true, hayDatos: true,
        vatRate,
        totalIngresos,
        totalVentas,
        totalPropinas,
        totalBaseImponible: ivaGlobal.base,
        totalImpuesto: ivaGlobal.cuota,
        totalTransacciones: pagos.length,
        ingresosPorDia: datosIngresosDia,
        ingresosPorDiaRanking: datosIngresosDiaRanking,
        porServicio: datosServicios,
        tablaDesglose,
        porDiaSemana: datosDiaSemana,
        porMetodoPago: datosMetodoPago,
        porBotonPago: datosBotonPago,               // v2.6.3
        botonTotales: datosBotonTotales,            // v2.6.3
        canjesBono,                                 // v2.6.3
        porStaff: datosStaff,
        extras: extrasData,
        propinas: propinasData,
        externos: externosResult,
        productos: productosResult,
        granTotal,
        ratioSTvsComplementos,
        productividadStaff,
        clientesPorTipo: datosClientes
      };
    } catch (error) {
      console.error(`${TAG} Error:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v2.5.3: Medias por día de semana del año en curso
// Devuelve la media de cada día de la semana del año actual.
// Excluye el día de hoy del histórico.
// Funciona aunque haya solo 1 ocurrencia histórica.
// Calcula el día actual usando Europe/Madrid.
// ═══════════════════════════════════════════════════════════════════════════
export const obtenerMediaDiaSemanaAnio = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      const ahora = new Date();

      // Fecha real de Madrid en formato YYYY-MM-DD
      const hoyStr = ahora.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
      const [hy, hm, hd] = hoyStr.split('-').map(Number);

      // Fecha local construida desde hoyStr para que getDay() coincida con Madrid
      const hoyMadridLocal = new Date(hy, hm - 1, hd);
      const inicioAnio = new Date(hy, 0, 1);
      const finAnio = new Date(hy + 1, 0, 1);

      const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const diaHoy = DIAS[hoyMadridLocal.getDay()];

      console.log(`${TAG} obtenerMediaDiaSemanaAnio v2.5.3: ${toISO(inicioAnio)} → ${hoyStr} (${diaHoy})`);

      // Paginar PaymentReservations del año en curso
      let allPagos = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const r = await wixData.query(COLECCION_PAGOS)
          .ge('fechaPago', inicioAnio)
          .lt('fechaPago', finAnio)
          .skip(offset)
          .limit(1000)
          .find();

        const items = r.items || [];
        allPagos = allPagos.concat(items);

        hasMore = items.length === 1000;
        offset += 1000;

        if (offset > 50000) break;
      }

      // Acumular por fecha real Madrid: YYYY-MM-DD
      const porFecha = {};

      for (const p of allPagos) {
        if (!p.fechaPago) continue;

        const fechaISO = new Date(p.fechaPago).toLocaleDateString('en-CA', {
          timeZone: TIMEZONE_MADRID
        });

        // Excluir hoy del histórico para comparar contra días ya cerrados
        if (fechaISO === hoyStr) continue;

        porFecha[fechaISO] = (porFecha[fechaISO] || 0) + Number(p.importeTotal || 0);
      }

      // Agrupar histórico por día de semana
      const acumPorDia = {};
      const contPorDia = {};

      for (const [fechaISO, total] of Object.entries(porFecha)) {
        const [y, m, d] = fechaISO.split('-').map(Number);

        // Parseo local desde YYYY-MM-DD para evitar offsets UTC
        const dt = new Date(y, m - 1, d);
        const ds = DIAS[dt.getDay()];

        acumPorDia[ds] = (acumPorDia[ds] || 0) + total;
        contPorDia[ds] = (contPorDia[ds] || 0) + 1;
      }

      // Medias por día.
      // v2.5.3: incluir cualquier día con al menos 1 ocurrencia.
      const mediasPorDia = {};

      for (const ds of DIAS) {
        const cnt = contPorDia[ds] || 0;
        const total = acumPorDia[ds] || 0;

        if (cnt <= 0) continue;

        mediasPorDia[ds] = {
          media: Math.round((total / cnt) * 100) / 100,
          totalDias: cnt,
          totalImporte: Math.round(total * 100) / 100
        };
      }

      // Ventas de hoy.
      // Se hace una búsqueda amplia y luego se filtra por fecha Madrid para evitar desfases de zona horaria.
      const inicioBusquedaHoy = new Date(Date.UTC(hy, hm - 1, hd - 1, 0, 0, 0));
      const finBusquedaHoy = new Date(Date.UTC(hy, hm - 1, hd + 2, 0, 0, 0));

      let pagosHoy = [];
      let hoyOffset = 0;
      let hoyHasMore = true;

      while (hoyHasMore) {
        const rHoy = await wixData.query(COLECCION_PAGOS)
          .ge('fechaPago', inicioBusquedaHoy)
          .lt('fechaPago', finBusquedaHoy)
          .skip(hoyOffset)
          .limit(1000)
          .find();

        const itemsHoy = rHoy.items || [];
        pagosHoy = pagosHoy.concat(itemsHoy);

        hoyHasMore = itemsHoy.length === 1000;
        hoyOffset += 1000;

        if (hoyOffset > 10000) break;
      }

      const ventasHoy = pagosHoy
        .filter(p => {
          if (!p.fechaPago) return false;
          const fechaISO = new Date(p.fechaPago).toLocaleDateString('en-CA', {
            timeZone: TIMEZONE_MADRID
          });
          return fechaISO === hoyStr;
        })
        .reduce((s, p) => s + Number(p.importeTotal || 0), 0);

      const ventasHoyRound = Math.round(ventasHoy * 100) / 100;

      const mediaInfoHoy = mediasPorDia[diaHoy] || {
        media: 0,
        totalDias: 0,
        totalImporte: 0
      };

      const mediaHoy = Number(mediaInfoHoy.media || 0);
      const totalDiasHistorico = Number(mediaInfoHoy.totalDias || 0);

      const delta = mediaHoy > 0
        ? Math.round(((ventasHoyRound - mediaHoy) / mediaHoy) * 10000) / 100
        : 0;

      if (!mediasPorDia[diaHoy]) {
        console.warn(
          `${TAG} obtenerMediaDiaSemanaAnio: sin histórico previo para ${diaHoy}. ` +
          `Se devuelve media=0, pero el widget no rompe.`
        );
      }

      console.log(
        `${TAG} Hoy=${diaHoy} fecha=${hoyStr} ventas=${ventasHoyRound}€ vs media=${mediaHoy}€ ` +
        `(${delta}%) histórico=${totalDiasHistorico} días`
      );

      return {
        ok: true,
        anio: hy,
        fechaHoy: hoyStr,
        diaSemanaHoy: diaHoy,
        ventasHoy: ventasHoyRound,
        mediaDiaHoy: mediaHoy,
        deltaPct: delta,
        totalDiasHistorico,
        historicoSuficienteHoy: totalDiasHistorico > 0,
        mediasPorDia
      };
    } catch (err) {
      console.error(`${TAG} obtenerMediaDiaSemanaAnio:`, err);
      return {
        ok: false,
        error: err?.message || 'Error obteniendo media día semana'
      };
    }
  }
);

// Helper local para logging de fechas
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
