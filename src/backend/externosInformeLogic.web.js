// =====================================================
// BACKEND externosInformeLogic.web.js — KAMISUITE
// INFORME DE PERSONAL EXTERNO v1.0.0
// =====================================================
// VERSION: 1.0.0
// FECHA: 18 de agosto de 2026
// ARCHIVO: backend/externosInformeLogic.web.js
//
// QUÉ ES
//   Informe propio para la profesional externa. Es SU informe, no el del
//   salón mirando lo suyo: lleva su facturación completa con base
//   imponible y cuota de IVA porque ella se lo pasa a su gestor. Aparte,
//   y claramente separada, la comisión que se queda el salón.
//
// POR QUÉ EXISTE
//   La externa trabaja en exclusiva y toda su actividad pasa por
//   KAMISUITE, pero hasta ahora no tenía ninguna pantalla propia: sus
//   cifras solo se veían dentro del informe del salón. Además, si ella
//   cancelaba una cita y no registraba el cobro, nadie se enteraba: el
//   salón no tenía forma de contrastar su trazabilidad.
//
// PREPARADO PARA VARIAS PROFESIONALES DESDE EL PRIMER DÍA
//   Devuelve un array `profesionales`, cada una con su bloque completo, y
//   un `consolidado` con la suma. El widget filtra por una o las ve todas.
//   Con una sola externa el selector se oculta y no molesta.
//   OJO: la comisión se pacta POR PROFESIONAL en ExternalServices, así que
//   el consolidado suma comisiones calculadas con porcentajes DISTINTOS.
//   Es correcto, pero por eso cada fila expone su propio `commissionPct`:
//   sin ese dato a la vista, un consolidado de dos externas al 30% y al
//   40% parece un error de cálculo.
//
// FUENTES (todas verificadas contra el código desplegado)
//   · PagoreservasExternos — ledger de cobros de externos. Campos reales
//     escritos por recepcionProLogic v1.0.37+: bookingId ('EXT_<resId>'),
//     descripcion, fechaPago, fechaReserva, importeTotal, nombreCliente,
//     staff, tipoPago.
//   · StaffConfig — quién es externo (isExternal) y su displayName, que es
//     lo que el ledger guarda en `staff`.
//   · ExternalServices — commissionPercentage. Resolución POR EMPLEADO
//     (staffResourceId → StaffConfig.wixResourceId → displayName), el
//     mismo criterio que cierreExternosLogic v1.1.0 y estadisticas v2.7.x.
//     Decisión de producto (Jal, 18-ago-2026): la comisión se pacta con el
//     CONTRATO, no con la persona — si mañana el proveedor es una empresa
//     que manda empleados, la fila de contrato sigue siendo la fuente.
//   · ServiceCatalog — categoría (group) de cada servicio para el
//     desglose. Sin cruce contra Wix Bookings: los servicios externos de
//     un salón V2 no existen allí.
//
// PARSEO DE LÍNEAS
//   `descripcion` tiene el formato "Nombre (Precio€), Nombre2 (Precio€)"
//   y puede incluir un token de descuento "🏷️ Descuento -10% (-8.5€)".
//   Se parten TODAS las líneas —no solo la primera, que fue el defecto
//   corregido en estadisticas v2.7.2— y el importe se reparte
//   PRORRATEADO, de forma que la suma cuadra al céntimo con lo realmente
//   cobrado aunque el ticket llevara descuento.
//   El descuento se expone aparte (`descuentos`) para que su gestor vea de
//   dónde sale la diferencia entre tarifa y cobrado.
//
// IVA — SUPUESTO EXPLÍCITO, PENDIENTE DE CONFIRMACIÓN
//   Se aplica el tipo de SalonConfig.vatRate (21% por defecto), que es el
//   único dato de IVA que existe hoy en el sistema. Si la profesional
//   externa tributa a un tipo distinto, este informe le daría una cuota
//   equivocada y haría falta un campo propio en su ficha. Queda marcado en
//   la respuesta como `vatRateOrigen: 'SalonConfig'` para que el widget
//   pueda advertirlo.
//
// FISCALIDAD — LO QUE ESTE INFORME NO HACE
//   No mezcla nada del salón. El bruto que aparece aquí NO es facturación
//   de CEFFYL: es de la profesional, que es otra entidad fiscal con su
//   propia caja. Lo único del salón en esta pantalla es `comision`.
//
// PERMISOS: SiteMember. Acceso controlado en el page code con la capa PIN
//   existente. Decisión de Jal: de momento solo nivel de dirección; no hay
//   nivel de acceso propio para externos todavía.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const VERSION = '1.0.0';
const TAG = `[ExtInforme v${VERSION}]`;

const CMS_PAGOS_EXTERNOS = 'PagoreservasExternos';
const CMS_STAFF = 'StaffConfig';
const CMS_EXTERNAL_SERVICES = 'ExternalServices';
const CMS_SERVICE_CATALOG = 'ServiceCatalog';
const CMS_SALON_CONFIG = 'SalonConfig';

const TIMEZONE_MADRID = 'Europe/Madrid';
const DEFAULT_VAT_RATE = 21;
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function diaMadrid(fecha) {
  return new Date(fecha).toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
}

// Parte "Nombre (12€), Otro (5€), 🏷️ Descuento -10% (-1.7€)" respetando
// los paréntesis. Mismo patrón de split que estadisticas v2.7.2.
function parsearLineas(descripcion) {
  const servicios = [];
  let descuento = 0;

  for (const item of String(descripcion || '').split(/,\s*(?=[^)]*(?:\(|$))/)) {
    const t = item.trim();
    if (!t) continue;

    const m = t.match(/\(\s*(-?[\d.,]+)\s*€\s*\)\s*$/);
    const precio = m ? parseFloat(String(m[1]).replace(',', '.')) : 0;
    let nombre = m ? t.slice(0, t.lastIndexOf('(')).trim() : t;
    nombre = nombre.replace(/,\s*$/, '').trim();
    if (!nombre) continue;

    // Token de descuento: no es un servicio, es un ajuste del ticket.
    if (t.startsWith('🏷️') || /descuento/i.test(nombre) || precio < 0) {
      descuento += Math.abs(precio);
      continue;
    }
    servicios.push({ nombre, precio: precio > 0 ? precio : 0 });
  }
  return { servicios, descuento: round2(descuento) };
}

// Mapa displayName(UPPER) → { pct, resourceId }. Replica literal la
// resolución de cierreExternosLogic v1.1.0.
async function cargarComisiones() {
  const mapa = {};
  try {
    const cat = await wixData.query(CMS_EXTERNAL_SERVICES)
      .eq('activeStatus', true).limit(100).find({ suppressAuth: true });
    const filas = cat.items || [];

    const resourceIds = [];
    for (const it of filas) {
      const rid = it.staffResourceId;
      if (typeof rid === 'string' && rid.length > 0) resourceIds.push(rid);
    }

    const nombrePorResourceId = {};
    if (resourceIds.length) {
      const st = await wixData.query(CMS_STAFF)
        .hasSome('wixResourceId', resourceIds).limit(100).find({ suppressAuth: true });
      for (const s of (st.items || [])) {
        const rid = s.wixResourceId;
        if (typeof rid === 'string' && rid.length > 0) {
          const dn = s.displayName || s.canonicalName || '';
          if (dn) nombrePorResourceId[rid] = dn;
        }
      }
    }

    for (const it of filas) {
      const pct = Number(it.commissionPercentage || 0);
      const rid = it.staffResourceId;
      const dn = (typeof rid === 'string' && rid.length > 0) ? (nombrePorResourceId[rid] || '') : '';
      if (dn) {
        mapa[dn.trim().toUpperCase()] = pct;
      } else {
        // Fila legacy sin staffResourceId: se indexa por contactPerson,
        // igual que hace cierreExternosLogic. Se auto-migra cuando el
        // operador abre Gestión Externos.
        const contact = String(it.contactPerson || '').trim().toUpperCase();
        if (contact) mapa[contact] = pct;
      }
    }
  } catch (e) {
    console.warn(`${TAG} Comisiones: ${e.message}`);
  }
  return mapa;
}

// label(lower) → categoría, desde el catálogo CMS.
async function cargarCategorias() {
  const mapa = {};
  try {
    let items = [];
    let off = 0;
    let mas = true;
    while (mas) {
      const r = await wixData.query(CMS_SERVICE_CATALOG)
        .skip(off).limit(200).find({ suppressAuth: true });
      const lote = r.items || [];
      items = items.concat(lote);
      mas = lote.length === 200;
      off += 200;
    }
    for (const it of items) {
      const nombre = String(it.label || '').trim();
      if (!nombre) continue;
      const cat = String(it.group || it.family || '').trim().toUpperCase() || 'SIN CATEGORÍA';
      mapa[nombre.toLowerCase()] = cat;
    }
  } catch (e) {
    console.warn(`${TAG} Catálogo: ${e.message}`);
  }
  return mapa;
}

async function cargarVatRate() {
  try {
    const r = await wixData.query(CMS_SALON_CONFIG).limit(1).find({ suppressAuth: true });
    const v = Number(r.items?.[0]?.vatRate);
    return (v > 0 && v < 100) ? v : DEFAULT_VAT_RATE;
  } catch (e) {
    console.warn(`${TAG} vatRate: ${e.message}`);
    return DEFAULT_VAT_RATE;
  }
}

// Estructura vacía de acumulación por profesional.
function nuevoBloque(nombre, pct) {
  return {
    nombre,
    commissionPct: pct,
    citas: 0,
    bruto: 0,
    descuentos: 0,
    comision: 0,
    _dias: {},
    _diaSemana: {},
    _servicios: {},
    _categorias: {},
    _metodos: {},
    _clientes: {},
    _detalle: []
  };
}

// Convierte los acumuladores internos en la forma que consume el widget.
function cerrarBloque(b, vatRate) {
  const divisor = 1 + (vatRate / 100);
  const base = round2(b.bruto / divisor);
  const cuota = round2(b.bruto - base);

  const servicios = Object.values(b._servicios)
    .map(s => ({
      nombre: s.nombre,
      categoria: s.categoria,
      cantidad: s.cantidad,
      importe: round2(s.importe),
      importeBase: round2(s.importe / divisor),
      importeIva: round2(s.importe - s.importe / divisor),
      ticketMedio: s.cantidad > 0 ? round2(s.importe / s.cantidad) : 0
    }))
    .sort((a, b2) => b2.importe - a.importe);

  // Desglose por categoría con sus subtotales, mismo formato que el
  // desglose de Estadísticas para que el widget lo pinte igual.
  const porCategoria = Object.keys(b._categorias).sort().map(cat => {
    const items = servicios.filter(s => s.categoria === cat);
    return {
      categoria: cat,
      items,
      totalCantidad: items.reduce((a, s) => a + s.cantidad, 0),
      totalImporte: round2(items.reduce((a, s) => a + s.importe, 0)),
      totalImporteBase: round2(items.reduce((a, s) => a + s.importeBase, 0)),
      totalImporteIva: round2(items.reduce((a, s) => a + s.importeIva, 0))
    };
  });

  const diasOrdenados = Object.keys(b._dias).sort();
  const clientesArr = Object.values(b._clientes)
    .map(c => ({ nombre: c.nombre, visitas: c.visitas, importe: round2(c.importe) }))
    .sort((a, b2) => b2.importe - a.importe);

  return {
    nombre: b.nombre,
    commissionPct: b.commissionPct,
    citas: b.citas,
    bruto: round2(b.bruto),
    descuentos: round2(b.descuentos),
    baseImponible: base,
    cuotaIva: cuota,
    comision: round2(b.comision),
    netoProfesional: round2(b.bruto - b.comision),
    ticketMedio: b.citas > 0 ? round2(b.bruto / b.citas) : 0,
    ingresosPorDia: {
      labels: diasOrdenados,
      valores: diasOrdenados.map(d => round2(b._dias[d])),
      valoresBase: diasOrdenados.map(d => round2(b._dias[d] / divisor)),
      valoresIva: diasOrdenados.map(d => round2(b._dias[d] - b._dias[d] / divisor)),
      diasSemana: diasOrdenados.map(d => DIAS_SEMANA[new Date(`${d}T12:00:00`).getDay()])
    },
    porDiaSemana: {
      labels: DIAS_SEMANA.filter(d => b._diaSemana[d] !== undefined),
      valores: DIAS_SEMANA.filter(d => b._diaSemana[d] !== undefined).map(d => round2(b._diaSemana[d]))
    },
    porServicio: servicios,
    porCategoria,
    porMetodoPago: {
      labels: Object.keys(b._metodos),
      valores: Object.values(b._metodos).map(v => round2(v))
    },
    clientes: {
      total: clientesArr.length,
      recurrentes: clientesArr.filter(c => c.visitas > 1).length,
      lista: clientesArr
    },
    detalle: b._detalle
  };
}

// ═══════════════════════════════════════════════════════════════════════
// MÉTODO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

export const obtenerInformeExternos = webMethod(
  Permissions.SiteMember,
  async ({ fechaDesde, fechaHasta }) => {
    try {
      console.log(`${TAG} Informe: ${fechaDesde} → ${fechaHasta}`);

      if (!fechaDesde || !fechaHasta) {
        return { ok: false, error: 'Faltan las fechas del periodo' };
      }

      const vatRate = await cargarVatRate();
      const [mapaComisiones, mapaCategorias] = await Promise.all([
        cargarComisiones(),
        cargarCategorias()
      ]);

      // ── Cobros del periodo, paginados ──
      const desdeD = new Date(`${fechaDesde}T00:00:00`);
      const hastaD = new Date(`${fechaHasta}T23:59:59.999`);

      let pagos = [];
      let off = 0;
      let mas = true;
      while (mas) {
        const r = await wixData.query(CMS_PAGOS_EXTERNOS)
          .ge('fechaPago', desdeD).le('fechaPago', hastaD)
          .ascending('fechaPago').skip(off).limit(200)
          .find({ suppressAuth: true });
        const lote = r.items || [];
        pagos = pagos.concat(lote);
        mas = lote.length === 200;
        off += 200;
      }

      // Filtro fino en zona Madrid.
      pagos = pagos.filter(p => p.fechaPago &&
        diaMadrid(p.fechaPago) >= fechaDesde && diaMadrid(p.fechaPago) <= fechaHasta);

      console.log(`${TAG} ${pagos.length} cobros en el periodo`);

      if (pagos.length === 0) {
        return {
          ok: true, hayDatos: false, version: VERSION,
          vatRate, vatRateOrigen: 'SalonConfig',
          profesionales: [], consolidado: null
        };
      }

      // ── Acumulación por profesional ──
      const bloques = {};

      for (const p of pagos) {
        const staffNombre = String(p.staff || '').trim() || 'Sin asignar';
        const key = staffNombre.toUpperCase();
        const pct = mapaComisiones[key] !== undefined ? mapaComisiones[key] : 0;

        if (!bloques[key]) bloques[key] = nuevoBloque(staffNombre, pct);
        const b = bloques[key];

        const importeCobro = Number(p.importeTotal || 0);
        const { servicios, descuento } = parsearLineas(p.descripcion);

        b.citas++;
        b.bruto += importeCobro;
        b.descuentos += descuento;
        b.comision += importeCobro * pct / 100;

        const dia = diaMadrid(p.fechaPago);
        b._dias[dia] = (b._dias[dia] || 0) + importeCobro;

        const ds = DIAS_SEMANA[new Date(p.fechaPago).getDay()];
        b._diaSemana[ds] = (b._diaSemana[ds] || 0) + importeCobro;

        const metodo = p.tipoPago || 'Sin especificar';
        b._metodos[metodo] = (b._metodos[metodo] || 0) + importeCobro;

        const cliente = String(p.nombreCliente || '').trim() || 'Sin nombre';
        const ck = cliente.toUpperCase();
        if (!b._clientes[ck]) b._clientes[ck] = { nombre: cliente, visitas: 0, importe: 0 };
        b._clientes[ck].visitas++;
        b._clientes[ck].importe += importeCobro;

        // Reparto prorrateado de las líneas. El último recibe el resto para
        // que la suma cuadre al céntimo con lo cobrado.
        const brutoLineas = servicios.reduce((a, s) => a + s.precio, 0);
        if (servicios.length && brutoLineas > 0) {
          let repartido = 0;
          for (let i = 0; i < servicios.length; i++) {
            const ultima = (i === servicios.length - 1);
            const parte = ultima
              ? round2(importeCobro - repartido)
              : round2(importeCobro * (servicios[i].precio / brutoLineas));
            repartido = round2(repartido + parte);

            const nom = servicios[i].nombre;
            const cat = mapaCategorias[nom.toLowerCase()] || 'SIN CATEGORÍA';
            const sk = nom.toLowerCase();
            if (!b._servicios[sk]) {
              b._servicios[sk] = { nombre: nom, categoria: cat, cantidad: 0, importe: 0 };
            }
            b._servicios[sk].cantidad++;
            b._servicios[sk].importe += parte;
            b._categorias[cat] = true;
          }
        }

        b._detalle.push({
          fecha: dia,
          cliente,
          servicios: servicios.map(s => s.nombre).join(' · ') || '—',
          importe: round2(importeCobro),
          descuento: round2(descuento),
          metodo,
          comision: round2(importeCobro * pct / 100)
        });
      }

      // ── Cierre ──
      const profesionales = Object.values(bloques)
        .map(b => cerrarBloque(b, vatRate))
        .sort((a, b2) => b2.bruto - a.bruto);

      const divisor = 1 + (vatRate / 100);
      const brutoTotal = round2(profesionales.reduce((a, p) => a + p.bruto, 0));
      const comisionTotal = round2(profesionales.reduce((a, p) => a + p.comision, 0));

      const consolidado = {
        profesionales: profesionales.length,
        citas: profesionales.reduce((a, p) => a + p.citas, 0),
        bruto: brutoTotal,
        descuentos: round2(profesionales.reduce((a, p) => a + p.descuentos, 0)),
        baseImponible: round2(brutoTotal / divisor),
        cuotaIva: round2(brutoTotal - brutoTotal / divisor),
        comision: comisionTotal,
        netoProfesional: round2(brutoTotal - comisionTotal),
        // Con varias profesionales a porcentajes distintos, este medio
        // ponderado es lo único que tiene sentido: la media aritmética de
        // los porcentajes mentiría si una factura mucho más que otra.
        comisionPctMedio: brutoTotal > 0 ? round2(comisionTotal / brutoTotal * 100) : 0
      };

      console.log(`${TAG} OK: ${profesionales.length} profesional(es), ${consolidado.citas} citas, bruto=${brutoTotal}€, comisión=${comisionTotal}€`);

      return {
        ok: true,
        hayDatos: true,
        version: VERSION,
        fechaDesde,
        fechaHasta,
        vatRate,
        vatRateOrigen: 'SalonConfig',
        profesionales,
        consolidado
      };

    } catch (err) {
      console.error(`${TAG} ERROR:`, err);
      return { ok: false, error: err.message, version: VERSION };
    }
  }
);
