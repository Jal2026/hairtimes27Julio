// =====================================================
// KAMISUITE — Page Code: Alta y Edición Productos
// =====================================================
// Página: Recepción | Tienda Productos (renombrada
// internamente a "Alta y Edición Productos")
// Elemento: #widgetTienda (HtmlComponent)
// Versión: 3.5
// =====================================================
// v1.4: + metodoPago, generarFacturaProducto, obtenerHistorialVentas
// v2.0: + edición productos (tiendaEdicionLogic.web.js)
// v2.1: + multi-imagen (agregarImagenesProducto, eliminarImagenesProducto)
//
// v3.0 (24 Jun 2026): MÓDULO ALTA Y EDICIÓN PRODUCTOS
//      Esta página deja de ser "Tienda" (venta + edición) y pasa
//      a ser SOLO "Alta y Edición". La venta vive en otra pantalla.
//      · QUITADOS imports: registrarVenta, cargarContactosTienda,
//        crearContactoTienda, generarFacturaProducto,
//        obtenerHistorialVentas. tiendaProductos.web.js NO se toca
//        (sigue alimentando la pantalla real de venta).
//      · QUITADOS handlers: 'sell', 'crearContacto',
//        'generateProductInvoice', 'loadHistory'.
//      · QUITADO de la respuesta de cargarDatos: la lista de
//        clientes (`clientes`) ya no se carga.
//      · NUEVOS imports: descontarUnidadProducto, setearStockProducto,
//        obtenerCosteProducto.
//      · NUEVOS handlers:
//          'descontar-unidad'  → resta 1 unidad de stock
//          'setear-stock'      → ajuste manual (alta de lote)
//          'obtener-coste'     → lee el coste real del producto
//            (el listado no lo expone; el widget lo pide al abrir
//             el modal).
//      · guardarProductoHandler: si payload.campos.quantityInStock
//        viene definido, se aplica vía setearStockProducto en lugar
//        de mezclarlo con actualizarProducto (que NO toca inventario).
//
// v3.1 (24 Jun 2026): + activarSeguimientoStock
//      · NUEVO import: activarSeguimientoStock.
//      · guardarProductoHandler y crearProductoHandler: si viene
//        `trackInventory` en campos, se aplica con la función nueva
//        ANTES de tocar stock (la cantidad requiere tracking activo
//        en Wix Stores). Sin esto, KAMISUITE no podía activar el
//        seguimiento — el usuario habría tenido que salir a otra
//        pantalla, cosa inaceptable en un producto comercial.
//
// v3.2 (25 Jun 2026): FIX activación tracking + stock en UNA llamada.
//      Causa raíz (logs producción 24-jun + firma real de la API):
//      activar tracking exige `quantity > 0` en la MISMA llamada.
//      El flujo anterior (activar tracking → setear stock en dos
//      pasos) rompía: el primer paso fallaba por falta de quantity
//      y el segundo por "item no trackable" (efecto dominó).
//
//      Cambio en guardarProductoHandler y crearProductoHandler:
//      · activarSeguimientoStock pasa a recibir la CANTIDAD como
//        tercer argumento. Cuando se ACTIVA tracking, se le entrega
//        el stock del usuario en la misma llamada → tracking + stock
//        en una sola operación.
//      · En ese caso NO se llama luego a setearStockProducto (la
//        activación ya fijó el stock; llamarlo además haría doble
//        operación). setearStockProducto SOLO se usa cuando se
//        ajusta stock SIN cambiar el tracking (producto que ya
//        tenía el contador activo).
//      · Si el usuario activa tracking sin escribir cantidad, el
//        backend aplica 1 unidad por defecto (mínimo técnico Wix).
//      · Desactivar tracking: se pasa cantidad irrelevante; el
//        backend usa el modo inStock.
//
// v3.3 (25 Jun 2026): FIX refresco tras inventario (BUG 3).
//      Tras tocar tracking o stock, Wix tarda ~1s en propagar el
//      cambio a la lectura. cargarDatos() releía el valor viejo y
//      la pantalla no reflejaba el cambio (había que recargar a
//      mano). Se añade un margen de 1.2s antes de releer en
//      guardarProductoHandler y descontarUnidadHandler, solo cuando
//      la operación tocó inventario. (Coste y filtro visible se
//      arreglan en backend v1.2.3 + widget v3.2.0.)
//
// v3.3.1 (25 Jun 2026): FIX sintaxis. La v3.3 quedó con un `try`
//      sin su `catch` en guardarProductoHandler (al insertar el
//      delay se perdió el bloque catch). Wix daba "Missing catch
//      or finally clause (145:5)". Restaurado el catch + cierre.
//
// v3.4 (25 Jun 2026): + coste vía setearCosteProducto.
//      El coste NO se guardaba: V1 no lo acepta en updateProductFields
//      y vive en las VARIANTES. Se separa `cost` de los campos y se
//      aplica con setearCosteProducto (escribe en las variantes con
//      updateVariantData) en edición y creación. Resultado de coste
//      incluido en el reporte de errores parciales.
// =====================================================

// v3.5 (28 Ago 2026): + DUPLICAR PRODUCTO.
//      Wix no gestiona variantes por Velo. Para tener el mismo
//      producto en varios tamaños, el salón duplica y cambia el
//      tamaño en el nombre. Handler duplicarProductoHandler:
//      llama al backend, recarga el listado y devuelve al widget
//      el id de la copia para que abra su ficha directamente.
//      Mismo patrón que eliminarProductoHandler.
// =====================================================

// ── Imports EDICIÓN (tiendaEdicionLogic.web.js v1.4.0) ──
import {
  listarProductosParaEdicion,
  actualizarProducto,
  agregarImagenesProducto,
  eliminarImagenesProducto,
  crearProductoNuevo,
  eliminarProducto,
  crearCategoriaNueva,
  cambiarCategoriasProducto,
  descontarUnidadProducto,
  setearStockProducto,
  obtenerCosteProducto,
  setearCosteProducto,
  activarSeguimientoStock,
  duplicarProducto
} from 'backend/tiendaEdicionLogic.web';

$w.onReady(function () {

  const widget = $w('#widgetTienda');

  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'ready') { cargarDatos(); }

    // ── Handlers EDICIÓN (v2.0 + v2.1) ──
    if (msg.type === 'guardarProducto') { await guardarProductoHandler(msg.payload); }
    if (msg.type === 'crearProducto') { await crearProductoHandler(msg.payload); }
    if (msg.type === 'eliminarProducto') { await eliminarProductoHandler(msg.payload); }
    if (msg.type === 'duplicarProducto') { await duplicarProductoHandler(msg.payload); }
    if (msg.type === 'crearCategoria') { await crearCategoriaHandler(msg.payload); }

    // ── Handlers ALMACÉN (v3.0) ──
    if (msg.type === 'descontar-unidad') { await descontarUnidadHandler(msg.payload); }
    if (msg.type === 'setear-stock') { await setearStockHandler(msg.payload); }
    if (msg.type === 'obtener-coste') { await obtenerCosteHandler(msg.payload); }
  });

  // ══════════════════════════════════════════════════
  // CARGA INICIAL
  // ══════════════════════════════════════════════════

  async function cargarDatos() {
    try {
      const prodResult = await listarProductosParaEdicion();
      if (!prodResult.ok) {
        widget.postMessage({ type: 'error', message: prodResult.error || 'Error cargando productos' });
        return;
      }
      widget.postMessage({
        type: 'data',
        payload: {
          productos: prodResult.productos,
          collections: prodResult.collections || []
        }
      });
    } catch (e) {
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  // ══════════════════════════════════════════════════
  // EDICIÓN PRODUCTO EXISTENTE
  // ══════════════════════════════════════════════════
  // v3.2: tracking + stock se aplican en UNA sola llamada
  // (activarSeguimientoStock recibe la cantidad). setearStockProducto
  // solo se usa para ajustar stock SIN tocar el tracking.
  // ══════════════════════════════════════════════════
  async function guardarProductoHandler(payload) {
    try {
      const { productId, campos, imagenes, categorias } = payload;
      console.log(`[AltaEdicion] Guardando producto: ${productId}`);

      const resultados = { campos: null, imgRemove: null, imgAdd: null, categorias: null, stock: null, track: null, coste: null };

      // 1. Eliminar imágenes marcadas
      if (imagenes?.toRemove?.length) {
        console.log(`[AltaEdicion] Eliminando ${imagenes.toRemove.length} imagen(es)`);
        resultados.imgRemove = await eliminarImagenesProducto(productId, imagenes.toRemove);
        if (!resultados.imgRemove.ok) {
          console.warn(`[AltaEdicion] ⚠️ Eliminar imágenes falló: ${resultados.imgRemove.error}`);
        }
      }

      // 2. Subir imágenes nuevas
      if (imagenes?.toAdd?.length) {
        console.log(`[AltaEdicion] Subiendo ${imagenes.toAdd.length} imagen(es)`);
        resultados.imgAdd = await agregarImagenesProducto(productId, imagenes.toAdd);
        if (!resultados.imgAdd.ok) {
          console.warn(`[AltaEdicion] ⚠️ Subir imágenes falló: ${resultados.imgAdd.error}`);
        }
      }

      // 3. Separar stock y tracking del resto de campos
      let stockPayload = null;
      let trackPayload = null;
      const camposParaActualizar = { ...(campos || {}) };
      if (camposParaActualizar.quantityInStock !== undefined && camposParaActualizar.quantityInStock !== null && camposParaActualizar.quantityInStock !== '') {
        stockPayload = parseInt(camposParaActualizar.quantityInStock, 10);
        delete camposParaActualizar.quantityInStock;
      }
      // v3.1: trackInventory pasa a aplicarse via activarSeguimientoStock
      if (camposParaActualizar.trackInventory !== undefined) {
        trackPayload = !!camposParaActualizar.trackInventory;
        delete camposParaActualizar.trackInventory;
      }
      // v3.4: el coste se escribe en las VARIANTES (setearCosteProducto),
      // NO con actualizarProducto (V1 no lo permite ahí). Lo separamos.
      let costePayload = null;
      if (camposParaActualizar.cost !== undefined && camposParaActualizar.cost !== null && camposParaActualizar.cost !== '') {
        costePayload = parseFloat(camposParaActualizar.cost);
      }
      delete camposParaActualizar.cost;

      // 4. Actualizar campos del producto (sin stock ni tracking)
      if (Object.keys(camposParaActualizar).length > 0) {
        resultados.campos = await actualizarProducto(productId, camposParaActualizar);
        if (!resultados.campos.ok) {
          console.warn(`[AltaEdicion] ⚠️ Campos falló: ${resultados.campos.error}`);
        }
      }

      // 5. v3.2: aplicar tracking + stock.
      //    - Si se cambia el tracking → activarSeguimientoStock recibe
      //      la cantidad y fija tracking + stock en UNA llamada. NO se
      //      llama después a setearStockProducto (sería doble op).
      //    - Si NO se toca el tracking pero sí hay stock → ajuste puro
      //      vía setearStockProducto (producto que ya tenía contador).
      if (trackPayload !== null) {
        // Activar/desactivar tracking. Al activar, pasamos la cantidad
        // del usuario (puede ser null → el backend aplica 1 por defecto).
        resultados.track = await activarSeguimientoStock(productId, trackPayload, stockPayload);
        if (!resultados.track.ok) {
          console.warn(`[AltaEdicion] ⚠️ Seguimiento stock falló: ${resultados.track.error}`);
        }
      } else if (stockPayload !== null && !isNaN(stockPayload)) {
        // Solo ajuste de stock, sin cambiar el tracking.
        resultados.stock = await setearStockProducto(productId, stockPayload);
        if (!resultados.stock.ok) {
          console.warn(`[AltaEdicion] ⚠️ Stock falló: ${resultados.stock.error}`);
        }
      }

      // 6. Cambiar categorías
      if (categorias && (categorias.addIds?.length || categorias.removeIds?.length)) {
        resultados.categorias = await cambiarCategoriasProducto(productId, categorias.addIds || [], categorias.removeIds || []);
        if (!resultados.categorias.ok) {
          console.warn(`[AltaEdicion] ⚠️ Categorías falló: ${resultados.categorias.error}`);
        }
      }

      // v3.4: aplicar coste (escribe en las variantes del producto).
      if (costePayload !== null && !isNaN(costePayload)) {
        resultados.coste = await setearCosteProducto(productId, costePayload);
        if (!resultados.coste.ok) {
          console.warn(`[AltaEdicion] ⚠️ Coste falló: ${resultados.coste.error}`);
        }
      }

      // 7. Resultado global
      const hayErrores = (resultados.campos && !resultados.campos.ok) ||
                         (resultados.imgRemove && !resultados.imgRemove.ok) ||
                         (resultados.imgAdd && !resultados.imgAdd.ok) ||
                         (resultados.categorias && !resultados.categorias.ok) ||
                         (resultados.stock && !resultados.stock.ok) ||
                         (resultados.track && !resultados.track.ok) ||
                         (resultados.coste && !resultados.coste.ok);

      if (hayErrores) {
        const errMsgs = [];
        if (resultados.campos && !resultados.campos.ok) errMsgs.push('Campos: ' + resultados.campos.error);
        if (resultados.imgRemove && !resultados.imgRemove.ok) errMsgs.push('Eliminar img: ' + resultados.imgRemove.error);
        if (resultados.imgAdd && !resultados.imgAdd.ok) errMsgs.push('Subir img: ' + resultados.imgAdd.error);
        if (resultados.categorias && !resultados.categorias.ok) errMsgs.push('Categorías: ' + (resultados.categorias.errores || resultados.categorias.error));
        if (resultados.stock && !resultados.stock.ok) errMsgs.push('Stock: ' + resultados.stock.error);
        if (resultados.track && !resultados.track.ok) errMsgs.push('Seguimiento: ' + resultados.track.error);
        if (resultados.coste && !resultados.coste.ok) errMsgs.push('Coste: ' + resultados.coste.error);
        widget.postMessage({ type: 'productoGuardadoParcial', payload: { productId, errores: errMsgs } });
      } else {
        widget.postMessage({ type: 'productoGuardado', payload: { productId } });
      }

      // v3.3: Wix tarda ~1s en propagar cambios de inventario
      // (tracking/stock) a la lectura. Sin margen, cargarDatos()
      // relee el valor viejo y la pantalla no refleja el cambio
      // (había que recargar la página a mano). Damos 1.2s antes de
      // releer cuando se ha tocado tracking o stock.
      const tocoInventario = (trackPayload !== null) || (stockPayload !== null);
      if (tocoInventario) {
        await new Promise(r => setTimeout(r, 1200));
      }
      await cargarDatos();

    } catch (e) {
      console.error('[AltaEdicion] Error guardando producto:', e);
      widget.postMessage({ type: 'errorEdicion', payload: { productId: payload?.productId, error: e.message || String(e) } });
    }
  }

  // ══════════════════════════════════════════════════
  // CREAR PRODUCTO NUEVO
  // ══════════════════════════════════════════════════
  async function crearProductoHandler(payload) {
    try {
      const { campos, imagenes, categorias } = payload;
      console.log(`[AltaEdicion] Creando producto: ${campos?.name}`);

      // Separar stock y tracking del resto de campos
      const camposParaCrear = { ...(campos || {}) };
      let stockPayload = null;
      let trackPayload = null;
      if (camposParaCrear.quantityInStock !== undefined && camposParaCrear.quantityInStock !== null && camposParaCrear.quantityInStock !== '') {
        stockPayload = parseInt(camposParaCrear.quantityInStock, 10);
        delete camposParaCrear.quantityInStock;
      }
      if (camposParaCrear.trackInventory !== undefined) {
        trackPayload = !!camposParaCrear.trackInventory;
        delete camposParaCrear.trackInventory;
      }
      // v3.4: coste se escribe en variantes tras crear (no en createProduct).
      let costePayload = null;
      if (camposParaCrear.cost !== undefined && camposParaCrear.cost !== null && camposParaCrear.cost !== '') {
        costePayload = parseFloat(camposParaCrear.cost);
      }
      delete camposParaCrear.cost;

      const createResult = await crearProductoNuevo(camposParaCrear);
      if (!createResult.ok) {
        widget.postMessage({ type: 'errorEdicion', payload: { error: 'Error creando producto: ' + createResult.error } });
        return;
      }

      const newProductId = createResult.productId;

      // Subir imágenes (si hay)
      if (imagenes?.toAdd?.length && newProductId) {
        try {
          await agregarImagenesProducto(newProductId, imagenes.toAdd);
        } catch (imgErr) {
          console.warn(`[AltaEdicion] ⚠️ Imagen del nuevo producto falló:`, imgErr.message);
        }
      }

      // v3.2: tracking + stock en una sola llamada (igual que en edición).
      //   - Si se activa tracking → activarSeguimientoStock recibe la
      //     cantidad y fija tracking + stock juntos. NO se llama luego
      //     a setearStockProducto.
      //   - Si NO se toca tracking pero hay stock → setearStockProducto.
      if (trackPayload !== null && newProductId) {
        try {
          await activarSeguimientoStock(newProductId, trackPayload, stockPayload);
        } catch (trackErr) {
          console.warn(`[AltaEdicion] ⚠️ Seguimiento stock del nuevo producto falló:`, trackErr.message);
        }
      } else if (stockPayload !== null && !isNaN(stockPayload) && newProductId) {
        try {
          await setearStockProducto(newProductId, stockPayload);
        } catch (stockErr) {
          console.warn(`[AltaEdicion] ⚠️ Stock del nuevo producto falló:`, stockErr.message);
        }
      }

      // Asignar a categorías (si hay)
      if (categorias && categorias.length > 0 && newProductId) {
        try {
          await cambiarCategoriasProducto(newProductId, categorias, []);
        } catch (catErr) {
          console.warn(`[AltaEdicion] ⚠️ Categorías del nuevo producto falló:`, catErr.message);
        }
      }

      // v3.4: aplicar coste en las variantes del nuevo producto.
      if (costePayload !== null && !isNaN(costePayload) && newProductId) {
        try {
          await setearCosteProducto(newProductId, costePayload);
        } catch (costeErr) {
          console.warn(`[AltaEdicion] ⚠️ Coste del nuevo producto falló:`, costeErr.message);
        }
      }

      widget.postMessage({ type: 'productoCreado', payload: { productId: newProductId, name: campos?.name } });
      await cargarDatos();

    } catch (e) {
      console.error('[AltaEdicion] Error creando producto:', e);
      widget.postMessage({ type: 'errorEdicion', payload: { error: e.message || String(e) } });
    }
  }

  // ══════════════════════════════════════════════════
  // ELIMINAR PRODUCTO
  // ══════════════════════════════════════════════════
  async function eliminarProductoHandler(payload) {
    try {
      const { productId } = payload;
      const result = await eliminarProducto(productId);
      if (!result.ok) {
        widget.postMessage({ type: 'errorEdicion', payload: { productId, error: 'Error eliminando: ' + result.error } });
        return;
      }
      widget.postMessage({ type: 'productoEliminado', payload: { productId } });
      await cargarDatos();
    } catch (e) {
      widget.postMessage({ type: 'errorEdicion', payload: { productId: payload?.productId, error: e.message || String(e) } });
    }
  }

  // ══════════════════════════════════════════════════
  // v3.5 — DUPLICAR PRODUCTO
  // ══════════════════════════════════════════════════
  // La copia nace oculta y con "(copia)" en el nombre. Tras
  // recargar el listado se devuelve su id para que el widget abra
  // su ficha: es donde el salón cambia el tamaño en el nombre.
  async function duplicarProductoHandler(payload) {
    try {
      const { productId } = payload || {};
      if (!productId) {
        widget.postMessage({ type: 'errorEdicion', payload: { error: 'productId requerido' } });
        return;
      }

      const result = await duplicarProducto(productId);
      if (!result.ok) {
        widget.postMessage({ type: 'duplicadoError', payload: { productId, error: result.error } });
        return;
      }

      if (result.avisos) {
        console.warn('[GestionProductos] Duplicado con avisos:', result.avisos);
      }

      await cargarDatos();

      widget.postMessage({
        type: 'productoDuplicado',
        payload: {
          origenId: productId,
          productId: result.productId,
          nombre: result.nombre
        }
      });

    } catch (e) {
      widget.postMessage({ type: 'duplicadoError', payload: { productId: payload?.productId, error: e.message || String(e) } });
    }
  }

  // ══════════════════════════════════════════════════
  // CREAR CATEGORÍA
  // ══════════════════════════════════════════════════
  async function crearCategoriaHandler(payload) {
    try {
      const { nombre } = payload;
      const result = await crearCategoriaNueva(nombre);
      if (!result.ok) {
        widget.postMessage({ type: 'errorEdicion', payload: { error: 'Error creando categoría: ' + result.error } });
        return;
      }
      widget.postMessage({ type: 'categoriaCreada', payload: { id: result.collectionId, name: result.name, yaExistia: result.yaExistia || false } });
      await cargarDatos();
    } catch (e) {
      widget.postMessage({ type: 'errorEdicion', payload: { error: e.message || String(e) } });
    }
  }

  // ══════════════════════════════════════════════════
  // v3.0 — DESCONTAR 1 UNIDAD (botón 🗑️ DESCONTAR)
  // ══════════════════════════════════════════════════
  async function descontarUnidadHandler(payload) {
    try {
      const { productId } = payload;
      if (!productId) {
        widget.postMessage({ type: 'errorEdicion', payload: { error: 'productId requerido' } });
        return;
      }
      const result = await descontarUnidadProducto(productId);
      if (!result.ok) {
        widget.postMessage({ type: 'descuentoError', payload: { productId, error: result.error } });
        return;
      }
      widget.postMessage({ type: 'unidadDescontada', payload: { productId } });
      // v3.3: margen para que Wix propague el decremento antes de releer.
      await new Promise(r => setTimeout(r, 1200));
      await cargarDatos();
    } catch (e) {
      widget.postMessage({ type: 'descuentoError', payload: { productId: payload?.productId, error: e.message || String(e) } });
    }
  }

  // ══════════════════════════════════════════════════
  // v3.0 — SETEAR STOCK (ajuste manual desde el modal)
  // ══════════════════════════════════════════════════
  async function setearStockHandler(payload) {
    try {
      const { productId, cantidad } = payload;
      if (!productId) {
        widget.postMessage({ type: 'errorEdicion', payload: { error: 'productId requerido' } });
        return;
      }
      const result = await setearStockProducto(productId, cantidad);
      if (!result.ok) {
        widget.postMessage({ type: 'stockError', payload: { productId, error: result.error } });
        return;
      }
      widget.postMessage({ type: 'stockActualizado', payload: { productId, nuevaCantidad: result.nuevaCantidad } });
      await cargarDatos();
    } catch (e) {
      widget.postMessage({ type: 'stockError', payload: { productId: payload?.productId, error: e.message || String(e) } });
    }
  }

  // ══════════════════════════════════════════════════
  // v3.0 — OBTENER COSTE REAL (al abrir modal de edición)
  // ══════════════════════════════════════════════════
  async function obtenerCosteHandler(payload) {
    try {
      const { productId } = payload;
      if (!productId) {
        widget.postMessage({ type: 'costeError', payload: { error: 'productId requerido' } });
        return;
      }
      const result = await obtenerCosteProducto(productId);
      if (!result.ok) {
        widget.postMessage({ type: 'costeError', payload: { productId, error: result.error } });
        return;
      }
      widget.postMessage({ type: 'costeCargado', payload: { productId, cost: result.cost } });
    } catch (e) {
      widget.postMessage({ type: 'costeError', payload: { productId: payload?.productId, error: e.message || String(e) } });
    }
  }
});
