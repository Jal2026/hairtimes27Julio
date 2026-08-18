// =====================================================
// BACKEND estadisticas.web.js — KAMISUITE Estadísticas v2.7.2
// =====================================================
// v2.7.2 (18 ago 2026): DESGLOSE DE EXTERNOS, TODAS LAS LÍNEAS.
//   El desglose leía SOLO el primer servicio de cada cobro externo y le
//   imputaba el importe ÍNTEGRO. Un cobro de 76,50€ con pedicura, manicura
//   y depilación aparecía como una única pedicura de 76,50€: en agosto
//   salían 3 manicuras tradicionales cuando en el ledger hay 4.
//   Bruto y comisión TOTALES eran correctos — el fallo era de etiqueta, no
//   de dinero. Ahora se parten todas las líneas y el importe se reparte
//   prorrateado, así que la suma cuadra al céntimo aunque el ticket lleve
//   descuento. Los totales del bloque no cambian.
//
// v2.7.1 (18 ago 2026): SEGREGACIÓN FISCAL EN EL DESGLOSE.
//
//   DEFECTO. Una línea de servicio de familia 'externo' cobrada DENTRO de
//   una cita de personal interno se contabilizaba como facturación del
//   salón. Caso real detectado en el informe de agosto de Hair-Times:
//   "Manicura Tradicional 20€" aparecía bajo MANICURA_&_PEDICURA, sumando
//   al total del periodo y a la base imponible del salón. Ese dinero es de
//   la profesional externa, que es OTRA ENTIDAD FISCAL con su propia caja.
//   En el histórico hay tres casos (65€ en total): Raquel 22-jul 45€,
//   Ricardo 11-ago 20€ (ambos cobrados) y Angela 17-jul 25€ (sin cobrar).
//
//   POR QUÉ PASA. marcarPagadoReserva enruta el cobro por el TITULAR del
//   pack, no línea a línea. Si la línea externa entra en una cita de
//   Ricardo, su importe va al ledger interno y el informe lo lee como
//   ingreso del salón. El informe no estaba mal escrito: estaba mal
//   alimentado.
//
//   FIX. Toda línea cuyo label coincida con un servicio de family='externo'
//   del catálogo se saca del circuito interno: no entra en el desglose por
//   categorías, ni en el ranking de servicios, ni en la productividad, y se
//   DESCUENTA de totalIngresos, del día, del día de semana, del método de
//   pago, del botón y del staff. Deja de inflar la base imponible.
//
//   NO SE OCULTA: cada línea apartada viaja en `externosEnPackInterno`
//   (fecha, servicio, importe, titular del pack, cliente) para que el
//   defecto sea auditable y se pueda corregir el registro en el CMS antes
//   de conectar VERI*FACTU. Queda además traza en el log.
//
//   ESTO SANEA EL HISTÓRICO. Que no vuelva a ocurrir lo garantiza
//   recepcionProLogic v1.0.50, que impide mezclar en el propio motor.
//
//   El bloque de externos (bruto + comisión) NO cambia: esas líneas nunca
//   estuvieron en él, porque su cobro no está en el ledger de la externa.
//   Corregir el registro en el CMS las hará aparecer ahí, que es su sitio.
//
// v2.7.0 (18 ago 2026): EXTERNOS V2 · BONOS · AUDITORÍA DE COBROS ·
//                       CATÁLOGO CMS · SANEAMIENTO
//
//   Consolida en una sola entrega todo lo que el widget v2.6.2 ya espera
//   y los defectos abiertos del informe mensual. Base: v2.5.3 desplegada
//   en Hair-Times y Salón Kami.
//
//   ── 1) EXTERNOS: del registro V1 al ledger vivo ───────────────────
//   El bloque leía SvExternalRecords, colección V1 que dejó de
//   alimentarse cuando Recepción PRO V2 desvió el cobro externo a
//   PagoreservasExternos (recepcionProLogic v1.0.37, rama isExternal,
//   bookingId = 'EXT_<reservaId>'). Resultado: el informe mensual daba
//   CERO en facturación externa y CERO en comisión, mientras el informe
//   del día sí las mostraba. Ese ingreso no viajaba a la gestoría.
//
//   Además la comisión se cruzaba por CATEGORÍA del servicio contra
//   ExternalServices.serviceName. El informe del día la resuelve POR
//   EMPLEADO (cierreExternosLogic v1.1.0). Dos criterios distintos sobre
//   los mismos cobros = dos cifras distintas. Se adopta el del informe
//   del día, replicado literal:
//       ExternalServices.staffResourceId → StaffConfig.wixResourceId
//       → StaffConfig.displayName ←→ PagoreservasExternos.staff
//   Sin fallback global: empleado no encontrado ⇒ 0 % (aplicar la
//   comisión de OTRO externo daría un dato falso).
//   Fallback compat para filas legacy sin staffResourceId: se indexan
//   por contactPerson, igual que hace cierreExternosLogic.
//
//   UNIÓN CON EL HISTÓRICO (decisión de Jal): PagoreservasExternos del
//   rango + las filas PAGADAS de SvExternalRecords cuyo 'EXT_' + _id NO
//   esté ya en el set de bookingId. Dedup EXACTA, no heurística. Así no
//   se pierden los externos anteriores a marzo-2026, que solo viven en
//   la colección V1.
//
//   FECHA DE CORTE: fechaPago, coherente con el resto del informe
//   (el bloque de PaymentReservations ya filtra por fechaPago). Las
//   filas legacy de SvExternalRecords no tienen fechaPago: se usa su
//   campo date, que es lo único que hay.
//
//   BRUTO Y COMISIÓN SEPARADOS: el bruto del externo NO es del salón —
//   el salón se queda la comisión pactada. `externos` devuelve ambos
//   (ventaBruta, comisionTotal) y sigue sumando SOLO la comisión al
//   granTotal, como ya hacía. NUEVO: cada línea del desglose lleva
//   también su ventaBruta, para que el widget pueda mostrar las dos
//   columnas sin recalcular nada.
//
//   ── 2) BONOS CANJEADOS: el trabajo servido que no deja caja ───────
//   Un servicio servido contra bono deja un cobro a 0 € en el ledger.
//   Consecuencia: la profesional que lo ejecutó no lo veía en su
//   productividad, el servicio no aparecía en el ranking, y el mes con
//   muchos canjes parecía flojo sin serlo.
//
//   CRITERIO FISCAL (decisión de producto, Jal 18-ago-2026): el IVA del
//   bono se devengó el día que el cliente lo COMPRÓ — ese cobro ya está
//   en PaymentReservations, ya cuenta en facturación y ya lleva su IVA.
//   El canje NO vuelve a sumar a ningún total de ingresos: hacerlo sería
//   declarar dos veces el mismo dinero.
//
//   Se añaden TRES bloques nuevos, ninguno de los cuales toca
//   totalIngresos, totalVentas, totalBaseImponible, totalImpuesto,
//   porMetodoPago ni granTotal:
//
//     · canjesBono   — nº de canjes y valor de tarifa consumido en el
//                      periodo (KamisuiteVoucherRedemptions.amountSaved,
//                      filtrado por redeemDate). Con desglose por
//                      servicio y por profesional.
//     · trabajoBono  — el mismo trabajo repartido por profesional y por
//                      servicio, para que producción y ranking lo vean.
//                      Marcado como servido-contra-bono. NO facturación.
//     · deudaBonos   — FOTO DE HOY, no del periodo: usos vivos de los
//                      bonos ACTIVOS por su valor unitario. Es servicio
//                      ya cobrado que el salón debe y que ocupará agenda.
//                      Se marca `esFotoActual: true` para que el widget
//                      no lo presente como una cifra del rango elegido.
//
//   El importe de cada canje es el precio de la línea EN EL MOMENTO de
//   servirlo (amountSaved, lo graba recepcionProLogic). Si el catálogo
//   sube de precio después, los canjes viejos conservan el precio viejo.
//   NO se recalculan contra la tarifa actual: sería reescribir historia.
//
//   El nombre del servicio del canje se resuelve cruzando
//   serviceSetupUid contra ServiceCatalog.setupUid. Un canje de un
//   servicio ya retirado del catálogo sale como 'Servicio retirado' en
//   lugar de omitirse — el trabajo se hizo.
//
//   ── 3) COBROS POR BOTÓN PULSADO (widget v2.6.2) ───────────────────
//   Vista de AUDITORÍA paralela a la de canales. Cuenta PULSACIONES, no
//   dinero por canal: 'Mixto' es una fila propia porque fue UN botón, y
//   su importe NO se reparte. `porBotonPago` + `botonTotales`.
//   El widget ya lo pinta desde v2.6.2 y hasta hoy salía vacío.
//
//   ── 4) CATÁLOGO CMS EN LUGAR DE WIX BOOKINGS ──────────────────────
//   Categoría y duración de cada servicio se resolvían con
//   services.queryServices (Wix Bookings). En un salón V2 el catálogo es
//   CMS puro y NINGÚN servicio existe en Bookings: los mapas salían
//   vacíos, todo caía en 'OTROS' y la productividad por minutos daba 0.
//
//   Ahora la fuente primaria es ServiceCatalog (label → group/family +
//   duration). Bookings se mantiene como fuente SECUNDARIA porque el
//   histórico V1 tiene nombres de aquella época ("Tinte (AP)", "Corte de
//   caballero") que no existen en el catálogo actual; sin ella se
//   perderían los minutos del histórico. Orden: CMS → Bookings →
//   palabras clave. Si Bookings no responde (salón V2 puro) no es error.
//
//   ── 5) SANEAMIENTO ────────────────────────────────────────────────
//   · EJE DE DÍAS CONTINUO: se recorre fechaDesde→fechaHasta y se
//     rellenan con 0 los días sin cobros. Antes el eje se construía solo
//     con los días que tenían cobros, así que un domingo cerrado
//     DESAPARECÍA del gráfico en vez de verse a cero.
//   · PAGINACIÓN de PaymentReservations con el bucle skip/limit que ya
//     usa obtenerMediaDiaSemanaAnio. El .limit(1000) seco truncaba en
//     SILENCIO cualquier informe de trimestre o de año.
//   · EWCM RETIRADO. El parámetro excludeEfectivo y su filtro se
//     eliminan: incompatible con la obligación VERI*FACTU (registro
//     íntegro e inalterable de TODAS las operaciones). El widget dejó de
//     enviarlo en v2.6.1; aquí se retira el código muerto.
//   · DÍA EN ZONA MADRID: el día se calculaba con toISOString() (UTC).
//     En verano imputaba al día siguiente los cobros posteriores a las
//     22:00. Pasa a toLocaleDateString('en-CA', Europe/Madrid), como ya
//     hacía el resto del archivo desde v2.5.3.
//
//   NO SE TOCA: KPIs, IVA, tablaDesglose, ratio ST, clientesPorTipo,
//   porDiaSemana, productos, comparativa, ni obtenerMediaDiaSemanaAnio.
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
// v2.3: EWCM (Export Without Cash Mode)
//   - Nuevo parámetro excludeEfectivo
//   - Filtra registros con tipoPago === 'EFECTIVO' antes de procesar
//   - Pagos MIXTO se incluyen completos (desglose no disponible en CMS)
//   - Todo el pipeline trabaja con el array ya filtrado
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

const VERSION = '2.7.2';
const TAG = `[Stats v${VERSION}]`;
const COLECCION_PAGOS = 'PaymentReservations';
const CMS_EXTERNAL_SERVICES = 'ExternalServices';
const CMS_EXTERNAL_RECORDS = 'SvExternalRecords';
const CMS_PAGOS_EXTERNOS = 'PagoreservasExternos';
const CMS_STAFF = 'StaffConfig';
const CMS_SERVICE_CATALOG = 'ServiceCatalog';
const CMS_VOUCHER_REDEMPTIONS = 'KamisuiteVoucherRedemptions';
const CMS_VOUCHERS = 'KamisuiteVouchers';
const CMS_SALON_CONFIG = 'SalonConfig';
const PREFIJO_PAGO_EXT = 'EXT_';
const TIMEZONE_MADRID = 'Europe/Madrid';
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DEFAULT_VAT_RATE = 21;

// ═══════════════════════════════════════════════════════════════════════════
// v2.7.0 — HELPERS DE MÓDULO
// ═══════════════════════════════════════════════════════════════════════════

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Normaliza el tipoPago del ledger al nombre de BOTÓN que el operador
// pulsó en Recepción. El widget v2.6.2 espera exactamente estas etiquetas:
// Tarjeta / Efectivo / Bizum / Mixto / Canje. Cualquier otra cosa se
// devuelve tal cual (capitalizada) en vez de descartarse: un método
// desconocido debe VERSE en una vista de auditoría, no desaparecer.
function normalizarBoton(tipoPago) {
  const t = String(tipoPago || '').trim();
  if (!t) return 'Sin especificar';
  const u = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (u.includes('TARJETA')) return 'Tarjeta';
  if (u.includes('EFECTIVO')) return 'Efectivo';
  if (u.includes('BIZUM')) return 'Bizum';
  if (u.includes('MIXTO')) return 'Mixto';
  if (u.includes('CANJE')) return 'Canje';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export const obtenerEstadisticas = webMethod(
  Permissions.Anyone,
  async ({ fechaDesde, fechaHasta }) => {
    try {
      console.log(`${TAG} Estadísticas: ${fechaDesde} → ${fechaHasta}`);

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
      // v2.7.0 — PAGINADO. El .limit(1000) seco truncaba en silencio los
      // informes de trimestre y de año. Mismo bucle skip/limit que ya usa
      // obtenerMediaDiaSemanaAnio en este archivo.
      let pagos = [];
      {
        let offset = 0;
        let hayMas = true;
        while (hayMas) {
          let query = wixData.query(COLECCION_PAGOS);
          if (fechaDesde) query = query.ge('fechaPago', new Date(fechaDesde));
          if (fechaHasta) {
            const hasta = new Date(fechaHasta);
            hasta.setDate(hasta.getDate() + 1);
            query = query.lt('fechaPago', hasta);
          }
          const result = await query.ascending('fechaPago').skip(offset).limit(500).find();
          const lote = result.items || [];
          pagos = pagos.concat(lote);
          hayMas = lote.length === 500;
          offset += 500;
        }
      }
      console.log(`${TAG} Registros brutos: ${pagos.length}`);

      // v2.7.0 — EWCM RETIRADO. Incompatible con VERI*FACTU (registro
      // íntegro de TODAS las operaciones). El widget dejó de enviar
      // excludeEfectivo en v2.6.1; aquí desaparece el filtro.

      // ══════════════════════════════════════════════════════════════
      // 2. MAPAS de categoría + duración
      //    v2.7.0 — FUENTE PRIMARIA: ServiceCatalog (CMS).
      //    En un salón V2 el catálogo es CMS puro y NINGÚN servicio existe
      //    en Wix Bookings: queryServices devolvía vacío, todo caía en
      //    'OTROS' y la productividad por minutos salía a 0.
      //    Bookings se mantiene DESPUÉS como fuente secundaria porque el
      //    histórico V1 tiene nombres de aquella época que no están en el
      //    catálogo actual. El catálogo NO pisa lo ya cargado.
      // ══════════════════════════════════════════════════════════════
      const mapaNombreCategoria = {};
      const mapaNombreCategoriaLower = {};
      const mapaNombreDuracion = {};
      // setupUid → label, para nombrar los canjes de bono (§ bloque 4bis).
      const mapaSetupUidLabel = {};
      // v2.7.1 — labels (minúsculas) de los servicios de familia 'externo'.
      const labelsExternos = new Set();

      try {
        let catalogo = [];
        let offCat = 0;
        let masCat = true;
        while (masCat) {
          const r = await wixData.query(CMS_SERVICE_CATALOG)
            .skip(offCat).limit(200).find({ suppressAuth: true });
          const lote = r.items || [];
          catalogo = catalogo.concat(lote);
          masCat = lote.length === 200;
          offCat += 200;
        }
        for (const it of catalogo) {
          const nombre = String(it.label || '').trim();
          if (!nombre) continue;
          // group es la categoría comercial del catálogo V2; family es el
          // motor (coloracion/simple/tratamiento/comun/externo). Para el
          // informe manda group; family solo si no hay group.
          const cat = String(it.group || it.family || '').trim() || 'SIN CATEGORÍA';
          const catFinal = canonCat(cat);
          mapaNombreCategoria[nombre] = catFinal;
          mapaNombreCategoriaLower[nombre.toLowerCase()] = catFinal;
          const dur = (typeof it.duration === 'number') ? it.duration : 0;
          if (dur > 0) {
            mapaNombreDuracion[nombre] = dur;
            mapaNombreDuracion[nombre.toLowerCase()] = dur;
          }
          const uid = String(it.setupUid || '').trim();
          if (uid) mapaSetupUidLabel[uid] = nombre;
          // v2.7.1 — Etiquetas de servicios de familia EXTERNA. Sirven para
          // sacarlos del circuito interno aunque el cobro haya ido al ledger
          // del salón (ver bloque 3).
          if (String(it.family || '').trim().toLowerCase() === 'externo') {
            labelsExternos.add(nombre.toLowerCase());
          }
        }
        console.log(`${TAG} ServiceCatalog: ${catalogo.length} servicios, ${Object.keys(mapaSetupUidLabel).length} con setupUid`);
      } catch (catCmsErr) {
        console.warn(`${TAG} ServiceCatalog: ${catCmsErr.message}`);
      }

      try {
        const elevatedQuery = elevate(services.queryServices);
        const svcResult = await elevatedQuery().limit(200).find();
        for (const svc of (svcResult?.items || [])) {
          const nombre = (svc.name || '').trim();
          const cat = svc.category?.name || 'SIN CATEGORÍA';
          if (nombre) {
            const catFinal = canonCat(cat);
            // v2.7.0 — NO pisar lo que ya vino del catálogo CMS.
            if (!mapaNombreCategoria[nombre]) {
              mapaNombreCategoria[nombre] = catFinal;
              mapaNombreCategoriaLower[nombre.toLowerCase()] = catFinal;
            }
            const duraciones = svc.schedule?.availabilityConstraints?.sessionDurations || [];
            const dur = duraciones.length > 0 ? duraciones[0] : 0;
            if (dur > 0 && !mapaNombreDuracion[nombre]) {
              mapaNombreDuracion[nombre] = dur;
              mapaNombreDuracion[nombre.toLowerCase()] = dur;
            }
          }
        }
        console.log(`${TAG} Mapas tras Bookings: ${Object.keys(mapaNombreCategoria).length} servicios`);
      } catch (catErr) {
        // Salón V2 puro: Bookings vacío o sin permisos. NO es un error —
        // el catálogo CMS ya cubrió los servicios vivos.
        console.warn(`${TAG} queryServices (secundaria, no bloqueante): ${catErr.message}`);
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
      const porBoton = {};   // v2.7.0 — auditoría por botón pulsado
      const externosEnPackInterno = [];  // v2.7.1 — líneas de externo mal enrutadas

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
          // v2.7.0 — día en Europe/Madrid. Con toISOString() (UTC) los
          // cobros posteriores a las 22:00 en verano caían al día siguiente.
          const dia = new Date(p.fechaPago).toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
          ingresosPorDia[dia] = (ingresosPorDia[dia] || 0) + importe;
          const diaSemana = DIAS_SEMANA[new Date(p.fechaPago).getDay()];
          ingresosPorDiaSemana[diaSemana] = (ingresosPorDiaSemana[diaSemana] || 0) + importe;
          if (!diasUnicosPorDiaSemana[diaSemana]) diasUnicosPorDiaSemana[diaSemana] = new Set();
          diasUnicosPorDiaSemana[diaSemana].add(dia);
        }

        const metodo = p.tipoPago || 'Sin especificar';
        porMetodo[metodo] = (porMetodo[metodo] || 0) + importe;

        // v2.7.0 — AUDITORÍA POR BOTÓN. Cuenta PULSACIONES, no canales:
        // 'Mixto' es fila propia (fue UN botón) y su importe NO se reparte.
        const botonKey = normalizarBoton(p.tipoPago);
        if (!porBoton[botonKey]) porBoton[botonKey] = { metodo: botonKey, n: 0, importe: 0 };
        porBoton[botonKey].n++;
        porBoton[botonKey].importe += importe;

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

          // ── v2.7.1 · SEGREGACIÓN FISCAL EN EL INFORME ────────────────
          //    Una línea de servicio de familia 'externo' NO es facturación
          //    del salón aunque su cobro haya ido al ledger interno: el
          //    dinero es de la profesional externa, que es otra entidad
          //    fiscal con su propia caja.
          //    Caso real (18-ago-2026): Manicura Tradicional 20€ dentro de
          //    la cita de Ricardo del 11-ago. Aparecía en el desglose bajo
          //    MANICURA_&_PEDICURA sumando a la base imponible del salón.
          //    Se descuenta del total y se aparta a `externosEnPackInterno`
          //    para que el defecto sea VISIBLE y auditable, no silencioso.
          //    El motor ya impide que vuelva a ocurrir (recepcionProLogic
          //    v1.0.50); esto sanea lo que ya está en el histórico.
          const nombreLimpioExt = nombre.replace(/^[^\p{L}\d]+/u, '').trim().toLowerCase();
          if (labelsExternos.has(nombreLimpioExt)) {
            if (precio > 0) {
              totalIngresos -= precio;                  // no es ingreso del salón
              porStaff[staff] = (porStaff[staff] || 0) - precio;
              if (productividadPorStaff[staff]) {
                productividadPorStaff[staff].ingresos -= precio;
              }
              if (p.fechaPago) {
                const diaExt = new Date(p.fechaPago).toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
                if (ingresosPorDia[diaExt] !== undefined) ingresosPorDia[diaExt] -= precio;
                const dsExt = DIAS_SEMANA[new Date(p.fechaPago).getDay()];
                if (ingresosPorDiaSemana[dsExt] !== undefined) ingresosPorDiaSemana[dsExt] -= precio;
              }
              const metodoExt = p.tipoPago || 'Sin especificar';
              if (porMetodo[metodoExt] !== undefined) porMetodo[metodoExt] -= precio;
              const botonExt = normalizarBoton(p.tipoPago);
              if (porBoton[botonExt]) porBoton[botonExt].importe -= precio;

              externosEnPackInterno.push({
                fecha: p.fechaPago ? new Date(p.fechaPago).toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID }) : '',
                servicio: nombre,
                importe: precio,
                staffPack: staff,
                cliente: (p.nombreCliente || '').trim()
              });
              console.warn(`${TAG} ⚠️ Línea EXTERNA en pack interno: "${nombre}" ${precio}€ (titular ${staff}, cliente ${(p.nombreCliente || '').trim()}) — descontada de la facturación del salón`);
            }
            continue;   // fuera del desglose, del ranking y de la productividad
          }

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
      // 4. EXTERNOS — v2.7.0: ledger vivo + comisión POR EMPLEADO
      //
      //    Fuente primaria : PagoreservasExternos (V2, fechaPago)
      //    Fuente histórica: SvExternalRecords PAGADO (V1, date), solo
      //                      las filas cuyo 'EXT_'+_id NO esté ya en el
      //                      set de bookingId. Dedup exacta.
      //    Comisión        : por empleado, replicando literal
      //                      cierreExternosLogic v1.1.0. Sin fallback
      //                      global: empleado desconocido ⇒ 0 %.
      // ══════════════════════════════════════════════════════════════
      let externosResult = { citas: 0, ventaBruta: 0, comisionTotal: 0, desglose: [] };
      try {
        // ── 4.1 Mapa displayName(UPPER) → % ────────────────────────────
        //    ExternalServices.staffResourceId → StaffConfig.wixResourceId
        //    → StaffConfig.displayName, que es lo que Recepción PRO graba
        //    en PagoreservasExternos.staff.
        const mapaComisiones = {};
        try {
          const catResult = await wixData.query(CMS_EXTERNAL_SERVICES)
            .eq('activeStatus', true).limit(100).find({ suppressAuth: true });
          const catalogoExt = catResult.items || [];

          const resourceIds = [];
          for (const it of catalogoExt) {
            const rid = it.staffResourceId;
            if (typeof rid === 'string' && rid.length > 0) resourceIds.push(rid);
          }

          const displayNamePorResourceId = {};
          if (resourceIds.length) {
            try {
              const staffResult = await wixData.query(CMS_STAFF)
                .hasSome('wixResourceId', resourceIds).limit(100).find({ suppressAuth: true });
              for (const st of (staffResult.items || [])) {
                const rid = st.wixResourceId;
                if (typeof rid === 'string' && rid.length > 0) {
                  const dn = st.displayName || st.canonicalName || '';
                  if (dn) displayNamePorResourceId[rid] = dn;
                }
              }
            } catch (stErr) {
              console.warn(`${TAG} Externos — StaffConfig: ${stErr.message}`);
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
              if (key) mapaComisiones[key] = pct;
            } else {
              // Fila legacy sin staffResourceId: se indexa por contactPerson,
              // igual que hace cierreExternosLogic. Se auto-migra sola en
              // cuanto el operador abre Gestión Externos.
              const contact = String(item.contactPerson || '').trim().toUpperCase();
              if (contact) mapaComisiones[contact] = pct;
            }
          }
        } catch (catErr) {
          console.warn(`${TAG} Externos — ExternalServices: ${catErr.message}`);
        }

        // ── 4.2 Ledger V2: PagoreservasExternos por fechaPago ──────────
        const desdeD = new Date(`${fechaDesde}T00:00:00`);
        const hastaD = new Date(`${fechaHasta}T23:59:59.999`);

        let pagosExt = [];
        {
          let offExt = 0;
          let masExt = true;
          while (masExt) {
            const r = await wixData.query(CMS_PAGOS_EXTERNOS)
              .ge('fechaPago', desdeD).le('fechaPago', hastaD)
              .ascending('fechaPago').skip(offExt).limit(200)
              .find({ suppressAuth: true });
            const lote = r.items || [];
            pagosExt = pagosExt.concat(lote);
            masExt = lote.length === 200;
            offExt += 200;
          }
        }

        // Filtro fino por fecha Madrid (mismo patrón que el informe del día).
        pagosExt = pagosExt.filter(pe => {
          if (!pe.fechaPago) return false;
          const d = new Date(pe.fechaPago).toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
          return d >= fechaDesde && d <= fechaHasta;
        });

        const bookingIdsV2 = new Set();
        for (const pe of pagosExt) {
          const bid = String(pe.bookingId || '').trim();
          if (bid) bookingIdsV2.add(bid);
        }

        // ── 4.3 Histórico V1: solo lo que NO esté ya en V2 ─────────────
        //    Necesario para no perder los externos anteriores a marzo-2026,
        //    que solo viven en SvExternalRecords.
        let legacyExt = [];
        try {
          const startRange = new Date(desdeD.getTime() - 3 * 3600000);
          const endRange = new Date(hastaD.getTime() + 3 * 3600000);
          let allExtRecords = [];
          let extOffset = 0;
          let extHasMore = true;
          while (extHasMore) {
            const extResult = await wixData.query(CMS_EXTERNAL_RECORDS)
              .eq('status', 'PAGADO')
              .ge('date', startRange).le('date', endRange)
              .ascending('date').skip(extOffset).limit(100).find();
            const lote = extResult.items || [];
            allExtRecords = allExtRecords.concat(lote);
            extHasMore = lote.length === 100;
            extOffset += 100;
          }
          legacyExt = allExtRecords.filter(item => {
            if (!item.date) return false;
            const madridDate = new Date(item.date).toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
            if (madridDate < fechaDesde || madridDate > fechaHasta) return false;
            // Dedup EXACTA por la clave que escribe Recepción PRO V2.
            return !bookingIdsV2.has(PREFIJO_PAGO_EXT + item._id);
          });
        } catch (legErr) {
          console.warn(`${TAG} Externos — histórico V1: ${legErr.message}`);
        }

        // ── 4.4 Agregación ────────────────────────────────────────────
        let ventaBruta = 0, comisionTotal = 0;
        const desglosePorServicio = {};

        const acumular = (nombreServicio, staffNombre, precio) => {
          const staffUpper = String(staffNombre || '').trim().toUpperCase();
          const pct = (staffUpper && mapaComisiones[staffUpper] !== undefined)
            ? mapaComisiones[staffUpper]
            : 0;
          const comision = round2(precio * pct / 100);
          ventaBruta += precio;
          comisionTotal += comision;
          const key = nombreServicio || 'Servicio externo';
          if (!desglosePorServicio[key]) {
            desglosePorServicio[key] = { nombre: key, count: 0, ventaBruta: 0, comision: 0 };
          }
          desglosePorServicio[key].count++;
          desglosePorServicio[key].ventaBruta += precio;
          desglosePorServicio[key].comision += comision;
        };

        // V2: el servicio viaja dentro de `descripcion` con el formato
        // "Nombre (Precio€), Nombre2 (Precio€)" que escribe
        // marcarPagadoReserva. Se toma el primer token sin su sufijo.
        // v2.7.2 — TODAS las líneas del cobro, no solo la primera.
        //   Antes se tomaba el primer token de `descripcion` y se le
        //   imputaba el importe ÍNTEGRO del cobro. Con un cobro de varias
        //   líneas —"Pedicura Spa (45€), Manicura Tradicional (20€),
        //   Depilación (20€), Descuento -10%"— el desglose mostraba solo la
        //   pedicura cargando los 76,50€ de las tres. Bruto y comisión
        //   totales eran correctos; el detalle por servicio, falso.
        //   Ahora se parte por comas respetando los paréntesis (mismo
        //   patrón de split que el parseo de PaymentReservations de este
        //   archivo) y el importe se reparte PRORRATEADO, de modo que la
        //   suma de las líneas cuadra al céntimo con el importe cobrado
        //   aunque el ticket llevara descuento.
        for (const pe of pagosExt) {
          const importeCobro = Number(pe.importeTotal || 0);
          const desc = String(pe.descripcion || '');
          const lineas = [];
          for (const item of desc.split(/,\s*(?=[^)]*(?:\(|$))/)) {
            const t = item.trim();
            if (!t) continue;
            // Descuentos y tokens de anotación no son servicios.
            if (t.startsWith('🏷️') || t.startsWith('🛒') || t.startsWith('✏️')) continue;
            const m = t.match(/\(\s*(-?[\d.,]+)\s*€\s*\)\s*$/);
            const precio = m ? parseFloat(String(m[1]).replace(',', '.')) : 0;
            let nombre = m ? t.slice(0, t.lastIndexOf('(')).trim() : t;
            nombre = nombre.replace(/,\s*$/, '').trim();
            if (!nombre) continue;
            lineas.push({ nombre, precio: precio > 0 ? precio : 0 });
          }

          if (!lineas.length) {
            acumular('Servicio externo', pe.staff, importeCobro);
            continue;
          }

          const brutoLineas = lineas.reduce((acc, l) => acc + l.precio, 0);
          if (brutoLineas <= 0) {
            // Ninguna línea trae precio: no hay forma de repartir. Todo a la
            // primera, que es el comportamiento anterior.
            acumular(lineas[0].nombre, pe.staff, importeCobro);
            continue;
          }

          // Prorrateo. El último recibe el resto para que no se pierda ni
          // se invente un céntimo por redondeo.
          let repartido = 0;
          for (let i = 0; i < lineas.length; i++) {
            const esUltima = (i === lineas.length - 1);
            const parte = esUltima
              ? round2(importeCobro - repartido)
              : round2(importeCobro * (lineas[i].precio / brutoLineas));
            repartido = round2(repartido + parte);
            acumular(lineas[i].nombre, pe.staff, parte);
          }
        }

        // V1: la fila legacy trae modality/category y no lleva staff, así
        // que el % se resuelve por el nombre de la externa configurada.
        for (const cita of legacyExt) {
          const nombre = cita.modality || cita.category || '';
          acumular(nombre, cita.staff || cita.contactPerson || '', Number(cita.totalPrice || 0));
        }

        externosResult = {
          citas: pagosExt.length + legacyExt.length,
          ventaBruta: round2(ventaBruta),
          comisionTotal: round2(comisionTotal),
          desglose: Object.values(desglosePorServicio).map(it => ({
            nombre: it.nombre,
            count: it.count,
            ventaBruta: round2(it.ventaBruta),
            comision: round2(it.comision)
          }))
        };
        console.log(`${TAG} Externos: ${pagosExt.length} V2 + ${legacyExt.length} V1 = ${externosResult.citas} citas, bruta=${externosResult.ventaBruta}€, comisión=${externosResult.comisionTotal}€`);
      } catch (extErr) { console.warn(`${TAG} Error externos: ${extErr.message}`); }

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
      // 5bis. BONOS — v2.7.0
      //
      //   CRITERIO FISCAL (decisión de producto): el IVA del bono se
      //   devengó al COMPRARLO. Ese cobro ya está en PaymentReservations,
      //   ya cuenta en facturación y ya lleva su IVA. El canje NO vuelve a
      //   sumar a ningún total de ingresos — sería declarar dos veces el
      //   mismo dinero.
      //
      //   Pero el TRABAJO sí se hizo: un servicio servido contra bono deja
      //   un cobro a 0 € y hasta ahora desaparecía de la productividad y
      //   del ranking. Estos tres bloques lo hacen visible SIN tocar
      //   ninguna cifra de facturación.
      // ══════════════════════════════════════════════════════════════
      let canjesBono = { disponible: false, n: 0, valorConsumido: 0, porServicio: [], porStaff: [] };
      let trabajoBono = { disponible: false, n: 0, valorTarifa: 0, porServicio: [], porStaff: [] };
      let deudaBonos = { disponible: false, esFotoActual: true, bonosVivos: 0, usosPendientes: 0, valorPendiente: 0 };

      try {
        const desdeD = new Date(`${fechaDesde}T00:00:00`);
        const hastaD = new Date(`${fechaHasta}T23:59:59.999`);

        let canjes = [];
        let offC = 0;
        let masC = true;
        while (masC) {
          const r = await wixData.query(CMS_VOUCHER_REDEMPTIONS)
            .ge('redeemDate', desdeD).le('redeemDate', hastaD)
            .ascending('redeemDate').skip(offC).limit(200)
            .find({ suppressAuth: true });
          const lote = r.items || [];
          canjes = canjes.concat(lote);
          masC = lote.length === 200;
          offC += 200;
        }

        // Filtro fino por fecha Madrid, coherente con el resto del informe.
        canjes = canjes.filter(c => {
          if (!c.redeemDate) return false;
          const d = new Date(c.redeemDate).toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
          return d >= fechaDesde && d <= fechaHasta;
        });

        let valorConsumido = 0;
        const porServicioCanje = {};
        const porStaffCanje = {};

        for (const c of canjes) {
          // amountSaved = precio de la línea EN EL MOMENTO de servirla.
          // Si el catálogo sube después, el canje viejo conserva su precio
          // viejo. NO se recalcula contra la tarifa actual.
          const valor = Number(c.amountSaved || 0);
          valorConsumido += valor;

          const uid = String(c.serviceSetupUid || '').trim();
          // Servicio retirado del catálogo: el trabajo se hizo igual, así
          // que se muestra en vez de omitirse.
          const nombreSvc = (uid && mapaSetupUidLabel[uid]) || (uid ? 'Servicio retirado' : 'Sin servicio');
          if (!porServicioCanje[nombreSvc]) porServicioCanje[nombreSvc] = { nombre: nombreSvc, cantidad: 0, valor: 0 };
          porServicioCanje[nombreSvc].cantidad++;
          porServicioCanje[nombreSvc].valor += valor;

          const staffCanje = normalizarStaff(c.staff) || 'Sin staff';
          if (!porStaffCanje[staffCanje]) porStaffCanje[staffCanje] = { nombre: staffCanje, cantidad: 0, valor: 0 };
          porStaffCanje[staffCanje].cantidad++;
          porStaffCanje[staffCanje].valor += valor;
        }

        const svcArr = Object.values(porServicioCanje)
          .map(it => ({ nombre: it.nombre, cantidad: it.cantidad, valor: round2(it.valor) }))
          .sort((a, b) => b.valor - a.valor);
        const staffArr = Object.values(porStaffCanje)
          .map(it => ({ nombre: it.nombre, cantidad: it.cantidad, valor: round2(it.valor) }))
          .sort((a, b) => b.valor - a.valor);

        canjesBono = {
          disponible: true,
          n: canjes.length,
          valorConsumido: round2(valorConsumido),
          porServicio: svcArr,
          porStaff: staffArr
        };

        // trabajoBono expone lo MISMO desde la óptica de producción, para
        // que el widget pueda sumarlo al ranking de servicios y a la
        // productividad marcándolo como servido-contra-bono. Va aparte a
        // propósito: quien pinte facturación NO debe tocar esto.
        trabajoBono = {
          disponible: true,
          n: canjes.length,
          valorTarifa: round2(valorConsumido),
          porServicio: svcArr,
          porStaff: staffArr
        };

        console.log(`${TAG} Canjes de bono: ${canjes.length}, valor de tarifa consumido=${canjesBono.valorConsumido}€ (NO suma a facturación)`);
      } catch (canjeErr) {
        console.warn(`${TAG} Error canjes de bono: ${canjeErr.message}`);
      }

      try {
        // DEUDA PENDIENTE — FOTO DE HOY, no del periodo consultado.
        // Servicio ya cobrado que el salón debe y que ocupará agenda.
        // Valor unitario = paidPrice / totalUses (lo que el cliente pagó
        // realmente por uso, no la tarifa). Si faltan datos, cae a
        // retailPrice / totalUses.
        let vivos = [];
        let offV = 0;
        let masV = true;
        while (masV) {
          const r = await wixData.query(CMS_VOUCHERS)
            .skip(offV).limit(200).find({ suppressAuth: true });
          const lote = r.items || [];
          vivos = vivos.concat(lote);
          masV = lote.length === 200;
          offV += 200;
        }

        const ahora = Date.now();
        // Booleanos y estados se filtran en JS, no con .eq (regla del
        // proyecto: .eq sobre Boolean no es fiable en Wix Data).
        const activos = vivos.filter(v => {
          if (String(v.status || '').toUpperCase() !== 'ACTIVO') return false;
          const rest = Number(v.remainingUses || 0);
          if (rest <= 0) return false;
          if (v.expirationDate && new Date(v.expirationDate).getTime() < ahora) return false;
          return true;
        });

        let usosPendientes = 0;
        let valorPendiente = 0;
        for (const v of activos) {
          const rest = Number(v.remainingUses || 0);
          const total = Number(v.totalUses || 0);
          const pagado = Number(v.paidPrice || 0);
          const tarifa = Number(v.retailPrice || 0);
          const unitario = total > 0
            ? (pagado > 0 ? pagado / total : tarifa / total)
            : 0;
          usosPendientes += rest;
          valorPendiente += rest * unitario;
        }

        deudaBonos = {
          disponible: true,
          esFotoActual: true,
          bonosVivos: activos.length,
          usosPendientes,
          valorPendiente: round2(valorPendiente)
        };
        console.log(`${TAG} Deuda de bonos (foto de hoy): ${activos.length} bonos vivos, ${usosPendientes} usos, ${deudaBonos.valorPendiente}€`);
      } catch (deudaErr) {
        console.warn(`${TAG} Error deuda de bonos: ${deudaErr.message}`);
      }

      // ══════════════════════════════════════════════════════════════
      // 6. CONSTRUIR RESPUESTA
      // ══════════════════════════════════════════════════════════════
      // v2.7.0 — los canjes de bono cuentan como actividad: un periodo con
      // solo canjes tuvo trabajo real aunque no entrara caja.
      if (pagos.length === 0 && externosResult.citas === 0 && productosResult.pedidos === 0 && canjesBono.n === 0) {
        return { ok: true, hayDatos: false };
      }

      // ── Mapa de promedios por día de semana ──
      const promedioPorDiaSemana = {};
      for (const [ds, total] of Object.entries(ingresosPorDiaSemana)) {
        const count = diasUnicosPorDiaSemana[ds] ? diasUnicosPorDiaSemana[ds].size : 0;
        promedioPorDiaSemana[ds] = count > 0 ? Math.round((total / count) * 100) / 100 : 0;
      }

      // v2.7.1 — Redondeo tras los descuentos de líneas externas: restar
      // flotantes deja colas de céntimo (20.000000000000004).
      totalIngresos = round2(totalIngresos);
      for (const k of Object.keys(ingresosPorDia)) ingresosPorDia[k] = round2(ingresosPorDia[k]);
      for (const k of Object.keys(ingresosPorDiaSemana)) ingresosPorDiaSemana[k] = round2(ingresosPorDiaSemana[k]);
      for (const k of Object.keys(porMetodo)) porMetodo[k] = round2(porMetodo[k]);
      for (const k of Object.keys(porStaff)) porStaff[k] = round2(porStaff[k]);
      for (const k of Object.keys(porBoton)) porBoton[k].importe = round2(porBoton[k].importe);
      for (const k of Object.keys(productividadPorStaff)) {
        productividadPorStaff[k].ingresos = round2(productividadPorStaff[k].ingresos);
      }

      // ── v2.7.0: EJE DE DÍAS CONTINUO ──────────────────────────────
      //    Antes el eje se construía SOLO con los días que tenían cobros,
      //    así que un domingo cerrado DESAPARECÍA del gráfico en vez de
      //    verse a cero, y la serie mentía sobre la forma del mes.
      //    Ahora se recorre fechaDesde→fechaHasta y se rellena con 0.
      //    El ranking por importe NO se rellena: un listado de "los días
      //    que más facturaron" con veinte ceros al final no aporta nada.
      if (fechaDesde && fechaHasta) {
        const cursor = new Date(`${fechaDesde}T12:00:00`);
        const finEje = new Date(`${fechaHasta}T12:00:00`);
        let guarda = 0;
        while (cursor <= finEje && guarda < 1000) {
          const clave = cursor.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
          if (ingresosPorDia[clave] === undefined) ingresosPorDia[clave] = 0;
          cursor.setDate(cursor.getDate() + 1);
          guarda++;
        }
      }

      // ── Ingresos por día (cronológico) — con IVA + día semana + promedio ──
      const diasOrdenados = Object.keys(ingresosPorDia).sort();
      const datosIngresosDia = {
        labels: diasOrdenados.map(d => { const f = new Date(d); return `${f.getDate()}/${f.getMonth() + 1}`; }),
        valores: diasOrdenados.map(d => ingresosPorDia[d]),
        diasSemana: diasOrdenados.map(d => DIAS_SEMANA[new Date(d).getDay()]),
        promediosDiaSemana: diasOrdenados.map(d => promedioPorDiaSemana[DIAS_SEMANA[new Date(d).getDay()]] || 0),
        valoresBase: diasOrdenados.map(d => desglosarIVA(ingresosPorDia[d], vatRate).base),
        valoresIva: diasOrdenados.map(d => desglosarIVA(ingresosPorDia[d], vatRate).cuota)
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
      const datosMetodoPago = { labels: Object.keys(porMetodo), valores: Object.values(porMetodo) };

      // ── v2.7.0: Cobros por BOTÓN pulsado (auditoría) ──────────────
      //    Orden fijo para que la tabla no baile entre periodos. Lo que
      //    no encaje en el orden conocido va al final, pero se muestra.
      const ORDEN_BOTONES = ['Tarjeta', 'Efectivo', 'Bizum', 'Mixto', 'Canje'];
      const datosBoton = Object.values(porBoton)
        .map(b => ({ metodo: b.metodo, n: b.n, importe: round2(b.importe) }))
        .sort((a, b) => {
          const ia = ORDEN_BOTONES.indexOf(a.metodo);
          const ib = ORDEN_BOTONES.indexOf(b.metodo);
          if (ia === -1 && ib === -1) return b.importe - a.importe;
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        });
      const botonTotales = {
        n: datosBoton.reduce((acc, b) => acc + b.n, 0),
        importe: round2(datosBoton.reduce((acc, b) => acc + b.importe, 0))
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

      console.log(`${TAG} OK: ${pagos.length} pagos, ventas=${totalVentas}€ (base=${ivaGlobal.base}€, IVA=${ivaGlobal.cuota}€ @${vatRate}%), propinas=${totalPropinas}€, ext=${externosResult.citas} citas bruta=${externosResult.ventaBruta}€ comisión=${externosResult.comisionTotal}€, canjes=${canjesBono.n}/${canjesBono.valorConsumido}€ (fuera de facturación)`);

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
        porStaff: datosStaff,
        extras: extrasData,
        propinas: propinasData,
        externos: externosResult,
        productos: productosResult,
        granTotal,
        ratioSTvsComplementos,
        productividadStaff,
        clientesPorTipo: datosClientes,
        // v2.7.0 — auditoría por botón pulsado (widget v2.6.2)
        porBotonPago: datosBoton,
        botonTotales,
        // v2.7.0 — bonos. NINGUNO suma a facturación: el IVA del bono se
        // devengó al comprarlo. Ver cabecera del archivo.
        canjesBono,
        trabajoBono,
        deudaBonos,
        // v2.7.1 — INCIDENCIAS: líneas de servicio externo cobradas dentro
        // de una cita del salón. Ya descontadas de la facturación, pero se
        // exponen para que el defecto sea auditable y se pueda corregir el
        // registro en el CMS antes de conectar VERI*FACTU.
        externosEnPackInterno: {
          n: externosEnPackInterno.length,
          importe: round2(externosEnPackInterno.reduce((acc, x) => acc + x.importe, 0)),
          lineas: externosEnPackInterno
        }
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
