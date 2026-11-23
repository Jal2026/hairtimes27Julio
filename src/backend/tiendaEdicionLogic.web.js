// =====================================================
// KAMISUITE - Edición Catálogo Productos (Backend)
// =====================================================
// Archivo: tiendaEdicionLogic.web.js
// Versión: 1.7.0
// =====================================================
// v1.0.0: Versión inicial — 7 funciones CRUD productos
// v1.0.1: FIX brand minLength + createCollection wix-stores.v2
// v1.0.2: Multi-imagen: agregarImagenesProducto,
//         eliminarImagenesProducto, mediaItems en listado
// v1.0.3: FIX mimeType dinámico via detectMimeType()
// v1.0.4: FIX eliminarImagenesProducto: wix-stores-backend
//         removeProductMedia no aceptaba [{src}] para borrar
//         imágenes específicas (error vacío). Ahora usa
//         storesProducts.removeProductMedia de wix-stores.v2
//         con mediaIds como strings extraídos del wix:image URL.
// v1.0.5: additionalInfoSections — leer y escribir los bloques
//         de información adicional del producto (Descripción corta,
//         Componentes, Usos recomendados, Ventajas del producto).
//
// v1.1.0 (24 Jun 2026): MÓDULO ALTA Y EDICIÓN PRODUCTOS
//         (rebautizado, antes "Tienda Productos · Edición").
//         · FIX OCULTOS: la query a Stores/Products devuelve ahora
//           productos ocultos (visible:false). La query sin
//           suppressAuth omitía silenciosamente los hidden;
//           el editor "podía crearlos pero no editarlos". Patrón
//           confirmado en docs Wix:
//           dev.wix.com/.../wix-stores-products-collection-fields
//           "By default, querying hidden products requires the
//            appropriate permissions. However, you can allow your
//            visitors to temporarily bypass this requirement by
//            setting the suppressAuth property to true."
//
// v1.1.1 (24 Jun 2026): FIX REAL OCULTOS + DIAGNÓSTICO COSTE
//         · suppressAuth NO basta para Stores/Products (probado en
//           producción por Jal: la query seguía devolviendo solo
//           visibles). La sintaxis correcta documentada en
//           "Querying Wix App Collections" (Wix docs) es:
//             .find({ appOptions: { includeHiddenProducts: true } })
//           Aplicada en listarProductosParaEdicion. suppressAuth se
//           mantiene como cinturón y tirantes; no estorba.
//         · obtenerCosteProducto: añadidos LOGS detallados del
//           objeto de respuesta de storesProducts.getProduct para
//           diagnosticar el path real de costAndProfitData. Si el
//           coste sigue sin leerse, el log mostrará la estructura
//           completa de la response y desde ahí ajustamos el path.
//         · Sin cambios en otras funciones.
//
// v1.2.0 (24 Jun 2026): FIX VISIBLE + COSTE en listado masivo.
//         Diagnóstico final (confirmado por docs Wix oficial
//         "Stores/Products Collection Fields"): los campos `visible`
//         y `costAndProfitData` NO están expuestos en el schema de
//         la collection Stores/Products. La query wixData los
//         devolvía como undefined, y mi código `prod.visible !== false`
//         convertía todo undefined en true → TODOS los productos
//         aparecían marcados como "visibles" en el modal, incluso
//         los que estaban ocultos en Wix Dashboard.
//         Producto reportado por Jal: HARMONIA ACONDICIONADOR
//         (oculto en Wix, marcado como visible en el editor).
//
//         Estrategia: query dual cruzada por productId.
//         · Query A (wixData.query Stores/Products) → mediaItems,
//           collections, additionalInfoSections, stock, inStock,
//           trackInventory, mainMedia, sku, ribbon, etc. Sigue
//           devolviendo TODOS los productos gracias a
//           appOptions.includeHiddenProducts:true.
//         · Query B (storesProducts.queryProducts() de wix-stores.v2)
//           → product completo con `visible` y `costAndProfitData`.
//           Es la única vía documentada para acceder a esos campos
//           desde Velo backend.
//         · Se cruzan por productId. Si la query B falla, el
//           producto queda con visible:undefined y se sigue
//           devolviendo desde A para no romper el listado.
//
//         · obtenerCosteProducto: queda como función auxiliar
//           pero ya NO la necesita el widget (el coste viene en
//           el listado). Page code y widget pueden seguir
//           llamándola sin problema.
//         · NEW lectura inventario real: quantityInStock y
//           trackInventory se devuelven en el listado (campos
//           nativos de Stores/Products). Para productos con
//           trackInventory=false se devuelve quantityInStock=null
//           (no aplica). Reemplaza el booleano inStock como única
//           señal de stock.
//         · NEW obtenerCosteProducto(productId): lee el coste
//           real del producto. Necesario porque Stores/Products
//           collection NO expone costAndProfitData en su schema
//           (campo ausente del listado oficial de fields en docs).
//           Usa storesProducts.getProduct() de wix-stores.v2 que
//           sí devuelve el Product completo con costAndProfitData.
//           Lo llama el widget al abrir el modal de edición
//           (una sola call por modal, no por listado).
//         · NEW descontarUnidadProducto(productId): resta 1
//           unidad del stock vía decrementInventory(). Como esta
//           API requiere variantId, se obtiene primero con
//           getProductVariants() (para productos sin variantes
//           devuelve el variant default).
//         · NEW setearStockProducto(productId, nuevaCantidad):
//           ajuste manual del stock (alta de lote / corrección).
//           Lee variantId + stock actual, calcula delta y aplica
//           increment/decrementInventory según el signo. Idempotente.
//         · actualizarProducto: sin cambios funcionales; el ajuste
//           de stock se hace por la función específica nueva.
//         · Compatibilidad: tiendaProductos.web.js (venta) sigue
//           usando su propia listarProductos sin tocar.
//
// v1.2.1 (24 Jun 2026): + activarSeguimientoStock (primera versión).
//         · Usaba updateInventoryVariantFieldsByProductId con
//           { trackQuantity, variants:[{variantId, inStock:true}] }.
//           NO funcionaba: Wix rechazaba con
//           "quantity must be provided and greater than 0 when
//            inventory being tracked. quantity=None".
//
// v1.2.2 (25 Jun 2026): FIX activarSeguimientoStock — quantity.
//         Diagnóstico cerrado con logs de producción + firma real
//         del objeto InventoryItemVariantInfo confirmada en el
//         editor de Velo:
//           updateInventoryVariantFieldsByProductId(productId, {
//             trackQuantity: boolean,
//             variants: [{ variantId, quantity, inStock }]
//           })
//         · Campo de cada variant: variantId (string),
//           quantity (number), inStock (boolean).
//         · trackQuantity=true → Wix EXIGE quantity > 0. inStock se
//           deriva de quantity (lo dice el propio tooltip de Velo:
//           "If trackQuantity is true, inStock is based on the
//            actual tracked quantity").
//         · trackQuantity=false → se usa inStock (modo simple).
//
//         CAMBIO DE FIRMA:
//           activarSeguimientoStock(productId, activar)
//             → activarSeguimientoStock(productId, activar, cantidad)
//         Comportamiento:
//           · activar=true + cantidad>0 → trackQuantity:true,
//             variants:[{variantId, quantity:<cantidad>}]
//           · activar=true + cantidad ausente/0 → quantity:1 por
//             defecto (mínimo técnico: Wix no acepta 0 con tracking).
//           · activar=false → trackQuantity:false,
//             variants:[{variantId, inStock:true}]
//         Esto activa tracking Y fija el stock en UNA sola llamada,
//         eliminando el encadenamiento frágil "activar → setear"
//         que rompía en producción.
//         · setearStockProducto se mantiene intacta para ajustar
//           el stock de productos que YA tienen tracking activo.
//
// v1.2.3 (25 Jun 2026): FIX VISIBILIDAD (filtros) + COSTE por modal.
//         Causa (logs producción 25-jun): storesProducts.queryProducts()
//         de wix-stores.v2 solo devolvía 92 de 231 productos (paginación
//         con cursor frágil) y NUNCA traía el coste (todos los samples
//         cost:null). Los 139 productos restantes quedaban con
//         visible:null → desaparecían de AMBOS filtros del widget.
//         · FIX visible: se elimina el cruce con queryProducts v2. Se
//           deduce la visibilidad con DOBLE QUERY A sobre la collection
//           Stores/Products: una SIN includeHiddenProducts (solo
//           visibles) y otra CON él (todos). El cruce por _id da
//           visible:true/false para los 231, sin paginación frágil.
//         · FIX coste: ya NO se intenta cruzar en el listado masivo.
//           El coste se lee por modal con obtenerCosteProducto(productId).
//           El widget debe llamarlo al abrir el modal (page code v3.x
//           + widget actualizado).
//         · Sin cambios en activarSeguimientoStock, setearStock, etc.
//
// v1.2.4 (25 Jun 2026): FIX COSTE leer + GUARDAR (BUG 1, real).
//         Causa confirmada (log producción + doc): updateProductFields
//         de V1 NO permite escribir el coste (no está en su
//         UpdateProductInfo). Y getProduct devuelve costAndProfitData:
//         null porque, con productos que tienen variantes, el coste
//         vive en la VARIANTE (costAndProfitData.itemCost), no en el
//         producto padre (que solo expone costRange, informativo).
//         · LECTURA (obtenerCosteProducto): ahora lee el coste de la
//           primera variante vía getProductVariants. Fallback a
//           costRange/costAndProfitData del padre.
//         · ESCRITURA (NEW setearCosteProducto): escribe el coste en
//           todas las variantes con updateVariantData(productId,
//           choices, {costAndProfitData:{itemCost}}). Es la única vía
//           V1 para guardar coste. Llamada por el page code cuando el
//           usuario mete coste en el modal.
//         · actualizarProducto: deja de intentar escribir coste (no
//           funcionaba); ignora campos.cost (lo gestiona la función
//           dedicada).
//
// v1.2.7 (28 Ago 2026): FIX SECCIONES DE INFORMACIÓN ADICIONAL
//         (Descripción corta, Componentes, Usos recomendados del
//         producto, Ventajas del producto).
//
//         SÍNTOMA (Hair-Times): al DAR DE ALTA un producto desde el
//         editor, esos cuatro bloques nunca aparecían en el producto
//         de Wix Stores, y no se mostraba ningún error.
//
//         CAUSA 1 — ALTA: crearProductoNuevo montaba productInfo con
//         name, productType, price, visible, brand, sku, ribbon,
//         description y costAndProfitData. additionalInfoSections
//         llegaba desde el widget y el page code, pero NO se incluía
//         en la llamada a createProduct: se descartaba en silencio.
//
//         CAUSA 2 — EDICIÓN: actualizarProducto sí enviaba
//         additionalInfoSections, pero dentro del UpdateProductInfo de
//         wixStoresBackend.updateProductFields (Catalog V1), que no
//         lo contempla entre sus campos escribibles. Mismo patrón ya
//         diagnosticado en v1.2.4 con el coste: la llamada no falla,
//         simplemente ignora el campo.
//
//         SOLUCIÓN: las secciones se escriben ahora por la API v2,
//         storesProducts.updateProduct(_id, { additionalInfoSections }),
//         con elevate() — la misma vía ya usada en este archivo para
//         removeProductMedia, getProduct y createCollection.
//         Doc: dev.wix.com/docs/velo/apis/wix-stores-v2/products/
//         update-product ("Updates specified fields in a product",
//         requiere permisos elevados y solo backend).
//
//         · NEW helper interno escribirInfoAdicional(productId,
//           secciones) — normaliza {title, description} y escribe.
//         · NEW webMethod setearInfoAdicionalProducto(productId,
//           secciones) — expuesta por si el page code necesita
//           escribir los bloques por separado. El page code actual
//           NO necesita llamarla.
//         · actualizarProducto: deja de meter additionalInfoSections
//           en el update V1 y lo escribe con la vía v2 dentro de la
//           misma llamada. El contrato con el page code no cambia.
//         · crearProductoNuevo: tras crear el producto, escribe los
//           bloques con la vía v2. El contrato con el page code no
//           cambia (ya le llegaba additionalInfoSections en `info`).
//         · Ambas funciones devuelven además infoAdicional:{ok,error,
//           count} para que el fallo quede visible en el log en vez
//           de perderse.
//         · Sin cambios en lectura (listarProductosParaEdicion sigue
//           leyendo los bloques desde la collection Stores/Products,
//           que es de solo lectura y por eso nunca se escribe ahí).
//         · Sin cambios en stock, coste, imágenes ni categorías.
// v1.7.0 (24 Nov 2026): + PROCESO EN CURSO VISIBLE.
//         · Colección KamisuiteCampanaProceso (una fila): fase
//           (aplicar/terminar), origen (manual/programada), hechos,
//           total y porcentaje. Su _updatedDate hace de latido: si
//           lleva más de PROCESO_CADUCA_MS sin moverse, el proceso se
//           da por parado.
//         · La tarea programada escribe su avance en cada lote, borra
//           el registro al acabar y no arranca si hay otro proceso vivo.
//         · NEW registrarProcesoCampana(fase, hechos, total, porcentaje)
//           y finalizarProcesoCampana() para la campaña lanzada a mano
//           desde el gestor (page code v3.10).
//         · estadoCampanaDescuento() devuelve también `proceso`.
//         · Si la colección no existe, la campaña funciona igual y
//           simplemente no se ve el proceso en curso.
//         · FIX GRAVE (comprobado en Salón KAMI el 24-nov): el descuento
//           que se escribe como PERCENT 20 Wix lo guarda convertido a
//           AMOUNT (Anti-Frizz 40,56 € → AMOUNT 8,11; All Soft 19,85 € →
//           AMOUNT 3,97). La v1.5.0/v1.6.0 reconocía la campaña solo por
//           PERCENT, así que al terminar habría dado todos los productos
//           por cambiados a mano y no habría devuelto ninguna oferta.
//           Ahora, tras escribir, se guarda en la fila lo que Wix ha
//           guardado de verdad (tipoGuardado, valorGuardado) y al
//           terminar se compara con eso. Filas sin ese dato (campañas
//           aplicadas con la v1.5.0/v1.6.0): se reconoce el PERCENT o su
//           equivalente en euros sobre el precio actual, con medio
//           céntimo de margen.
//
// v1.6.0 (24 Nov 2026): + CAMPAÑA PROGRAMADA POR FECHAS.
//         · NEW programarCampanaDescuento(porcentaje, inicioISO, finISO),
//           quitarProgramacionCampana() y cerrarProgramacionCampana().
//           La programación vive en KamisuiteCampanaProgramada (una
//           sola fila: porcentaje, inicio, fin, estado, resultado).
//         · NEW ejecutarCampanaProgramada() (Permissions.Admin) — la
//           llama la tarea programada campanaDescuentoJob.js: aplica al
//           llegar el inicio y termina al llegar el fin, con un
//           presupuesto de tiempo por ejecución y continuación en la
//           siguiente vuelta.
//         · estadoCampanaDescuento() devuelve también la programación.
//         · La lógica de aplicar y terminar pasa a funciones internas
//           que comparten el gestor y la tarea. Al aplicar se salta el
//           producto que ya tiene la campaña con ese porcentaje.
//         · Los webMethods de la v1.5.0 mantienen nombre, parámetros y
//           respuesta.
//
// v1.5.0 (23 Nov 2026): + CAMPAÑA DE DESCUENTO EN TODA LA TIENDA
//         (botón BLACK FRIDAY del gestor de productos).
//         · NEW prepararCampanaDescuento() — lista los productos que
//           entran en la campaña. Quedan fuera los de uso interno: los
//           que solo están en categorías con el prefijo de almacén.
//         · NEW aplicarCampanaDescuentoLote(porcentaje, ids) — por cada
//           producto guarda la oferta que tenía (una sola vez por
//           campaña) en KamisuiteCampanaDescuento y escribe el
//           descuento PERCENT de la campaña, por la misma vía que
//           activarPromocionProducto.
//         · NEW terminarCampanaDescuentoLote(limite, saltar) — devuelve
//           a cada producto su oferta anterior, solo si sigue con el
//           porcentaje de la campaña: si se le cambió la oferta a mano
//           durante la campaña, se respeta. Borra la fila al acabar.
//         · NEW estadoCampanaDescuento() — si hay campaña, con qué
//           porcentaje y en cuántos productos.
//         · NEW refrescarCorreosTrasCampana() — invalida UNA vez la
//           caché del bloque de productos de los correos al final de la
//           campaña, no producto a producto.
//         · Los lotes los orquesta el page code (v3.8): ninguna llamada
//           carga con el catálogo entero.
//         · Sin cambios en el resto de funciones.
//
// v1.4.3 (13 Sep 2026): el PORCENTAJE que se enseña deja de deducirse
//         de los precios cuando Wix lo tiene guardado.
//         Caso real: precio 19,85 con un 10%. Wix redondea el precio de
//         venta a 17,87, y sobre ese precio la rebaja es del 9,97%, que
//         al truncar sale -9%. El salón pone 10, el panel de Wix dice 10
//         y el cliente leía -9%. Le pasa a todo precio que no divida
//         limpio, o sea a medio catálogo.
//         Ahora: si el descuento está grabado como PERCENT, ese es el
//         número que se enseña. Solo se calcula cuando está grabado en
//         euros, que es cuando no hay porcentaje que leer.
//         El listado devuelve `descuentoPct` ya resuelto, para que la
//         ficha, la tarjeta y los correos digan todos lo mismo.
//
// v1.4.2 (13 Sep 2026): la promoción se puede expresar en PORCENTAJE
//         o en IMPORTE, como en el panel de Wix. Confirmado en el log de
//         producción del 13-sep: Wix devuelve discount {type,value} y
//         recalcula priceData.discountedPrice él solo.
//         · activarPromocionProducto(productId, {tipo, valor}) — tipo es
//           'PERCENT' o 'AMOUNT'. Sigue aceptando un número suelto como
//           precio final de venta, por compatibilidad con page code v3.6.
//         · El listado devuelve ahora `discount` tal y como está guardado,
//           para que la ficha muestre el tipo REAL y no lo deduzca. Una
//           oferta puesta desde el panel de Wix se lee correctamente.
//
// v1.4.1 (13 Sep 2026): activarPromocionProducto y
//         desactivarPromocionProducto pasan a Permissions.SiteMember
//         (Jal, 13-sep-2026: todo KAMISUITE entra como site member).
//         Cambian precios de venta: no deben quedar abiertas a Anyone.
//         El resto de webMethods de este archivo siguen en Anyone, como
//         estaban; cambiarlos es una decisión aparte, no de esta entrega.
//
// v1.4.0 (13 Sep 2026): PRECIO PROMOCIONAL (oferta con precio tachado).
//         NEW activarPromocionProducto(productId, precioPromocional)
//         NEW desactivarPromocionProducto(productId)
//
//         CÓMO FUNCIONA EN CATALOG V1 (este sitio NO es V3):
//         El campo escribible es `discount`, un objeto {type, value}.
//         Doc: "Products" Collection Fields (wix-stores.v2) — el campo
//         Discount es el único de precio con Read-only: No, y su type
//         admite "AMOUNT" (importe), "PERCENT" (porcentaje) y "NONE"
//         (se pasa para QUITAR el descuento).
//         · `price` NO SE TOCA NUNCA: es el precio original y es el que
//           Wix pinta tachado en la tienda.
//         · `discountedPrice` y `formattedDiscountedPrice` son de SOLO
//           LECTURA: los calcula Wix a partir de price y discount.
//         · Por eso desactivar NO necesita guardar el precio original en
//           ninguna parte: basta con type:'NONE'.
//         Confirmado además por la guía de migración V1→V3 de Wix:
//         V1 price → V3 compareAtPrice, V1 discountedPrice → V3
//         actualPrice.
//
//         VÍA DE ESCRITURA: storesProducts.updateProduct (wix-stores.v2)
//         con elevate(), exactamente el mismo patrón que ya usa este
//         archivo en escribirInfoAdicional desde v1.2.7.
//         NO se usa updateProductVariants: en V1 el descuento vive en el
//         PRODUCTO, no en la variante, y los productos del salón son
//         simples (escribir en variantes devuelve "Product variants must
//         be managed", ver v1.2.4).
//
//         · El listado devuelve ahora discountedPrice,
//           formattedDiscountedPrice y enPromocion. Los dos primeros ya
//           venían en la query a Stores/Products: no cuesta ninguna
//           lectura extra, solo no se mapeaban.
//         · Ambas funciones invalidan la caché del catálogo de
//           sugerenciasProductosLogic (v1.1.0+). Sin eso, los correos de
//           confirmación y recordatorio seguirían anunciando el precio
//           viejo mientras la caché estuviera caliente.
//         · La invalidación NUNCA bloquea: si falla, la promoción queda
//           escrita igual y solo se registra un warning.
//
//         ORDEN DE DESPLIEGUE OBLIGATORIO: publicar antes
//         sugerenciasProductosLogic v1.1.0. Este archivo lo importa; si
//         no está, el editor de productos entero deja de funcionar.
//
// v1.3.2 (29 Ago 2026): duplicarProducto — la copia HEREDA la
//         visibilidad del original (Jal, 29 Ago 2026: "si duplicas
//         un producto tienes que duplicarlo con todas sus
//         propiedades"). Antes nacía siempre oculta.
//
//         La visibilidad NO se puede leer de la collection
//         Stores/Products: su schema no expone `visible` (por eso el
//         listado la deduce con la doble query de v1.2.3). Aquí se
//         lee del Product object real con
//         storesProducts.getProduct(), la misma vía que ya se usa
//         para el coste. Si esa lectura fallara, la copia nace
//         visible, como el caso normal.
//
//         CONSECUENCIA: si el original está a la venta, la copia
//         también, con su nombre "(copia)" y 1 unidad de stock,
//         hasta que el salón la remate. Es la decisión tomada.
//
// v1.3.1 (29 Ago 2026): FIX duplicarProducto — Wix limita el nombre
//         de producto a 80 caracteres. Al añadir " (copia)" a un
//         nombre largo se pasaba del límite y Wix rechazaba la
//         creación ("name has size 87, expected 80 or less"). Ahora
//         el nombre original se recorta lo justo para que quepa el
//         sufijo. El salón lo reescribe al cambiar el tamaño.
//
// v1.3.0 (28 Ago 2026): NEW duplicarProducto(productId).
//         Wix Stores no gestiona variantes por Velo, así que la vía
//         para tener el mismo producto en varios tamaños es duplicar
//         y cambiar el tamaño en el nombre. El Dashboard de Wix ya
//         lo permite; ahora también el editor de KAMISUITE.
//
//         Copia: nombre + " (copia)", precio, marca, descripción,
//         ribbon, los cuatro bloques de información adicional, las
//         fotos y las categorías del original.
//
//         Las fotos NO se vuelven a subir. addProductMedia admite
//         rutas de archivos que ya están en el sitio, así que se le
//         pasan las del original tal cual.
//         Doc: dev.wix.com/docs/sdk/backend-modules/stores/products/
//         add-product-media ("Sources of media items already
//         uploaded to the Wix site").
//
//         DECISIONES DE PRODUCTO (Jal, 28 Ago 2026):
//         · La copia nacía OCULTA. Cambiado en v1.3.2: hereda la
//           visibilidad del original.
//         · La copia nace SIN SKU. El SKU es el código de barras del
//           envase y un tamaño distinto tiene código distinto;
//           heredarlo generaría duplicados.
//         · El COSTE no se copia: se gestiona desde Almacén.
//         · La categoría general de Wix no se asigna a mano: Wix mete
//           todos los productos en ella automáticamente.
//
//         LÍMITE DE WIX CON EL STOCK: si el original lleva contador
//         de unidades, la copia también, pero Wix NO acepta activar
//         un contador con 0 unidades (mínimo 1, ver
//         activarSeguimientoStock). La copia queda con 1 unidad. Como
//         nace oculta, no se puede vender hasta que el salón la
//         publique con el stock real.
//
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';
import wixStoresBackend from 'wix-stores-backend';
import { getProductVariants, incrementInventory, decrementInventory, updateInventoryVariantFieldsByProductId } from 'wix-stores-backend';
import { products as storesProducts } from 'wix-stores.v2';
import { mediaManager } from 'wix-media-backend';
// v1.4.0: invalidación de la caché del bloque de productos de los
// correos. Mismo patrón de import que ya usan comunicacionesLogic y
// reminderLogic con este módulo.
import { invalidarCacheCatalogo } from 'backend/sugerenciasProductosLogic.web.js';

const TAG = '[TiendaEdicion]';
const VERSION = '1.7.0';

// =====================================================
// UTILIDAD: Detectar MIME type del base64 o extensión
// =====================================================
function detectMimeType(base64Data, fileName) {
  // 1. Extraer del prefijo data URI
  if (base64Data && base64Data.startsWith('data:')) {
    const match = base64Data.match(/^data:([^;,]+)/);
    if (match && match[1]) return match[1];
  }
  // 2. Fallback: extensión del archivo
  const ext = (fileName || '').split('.').pop().toLowerCase();
  const mimeMap = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'avif': 'image/avif',
    'svg': 'image/svg+xml'
  };
  return mimeMap[ext] || 'image/jpeg';
}

// =====================================================
// UTILIDAD: Extraer mediaId de un wix:image URL
// =====================================================
// Formato: wix:image://v1/MEDIA_ID/filename.jpg#originWidth=...
// Retorna MEDIA_ID (ej: "abc123~mv2.jpg")
// =====================================================
function extractMediaId(wixImageUrl) {
  if (!wixImageUrl) return null;
  const match = wixImageUrl.match(/wix:image:\/\/v1\/([^\/]+)/);
  return match ? match[1] : wixImageUrl;
}

// =====================================================
// UTILIDAD v1.1.0: obtener la variant default de un producto
// =====================================================
// Wix Stores siempre crea al menos una variant por producto
// (la "default variant") aunque manageVariants=false. Esa variant
// es la que tiene el stock real. Para productos con variantes
// múltiples (250ml/1000ml), el primer elemento NO es la default
// — Jal puede usar este editor solo para productos sin variantes
// gestionadas. Si más adelante se quiere gestionar stock por
// variante en este widget, hay que extender.
// =====================================================
async function obtenerVariantIdDefault(productId) {
  try {
    const elevatedGetVariants = elevate(getProductVariants);
    const vResult = await elevatedGetVariants(productId);
    const arr = Array.isArray(vResult) ? vResult : (vResult?.items || []);
    if (!arr.length) return null;
    // El primer item es la default variant para productos sin
    // gestión de variantes. Para productos con variantes
    // múltiples, devolvemos también el primero (Jal validará
    // caso por caso).
    return arr[0]?._id || arr[0]?.id || null;
  } catch (e) {
    console.warn(`${TAG} obtenerVariantIdDefault FAIL para ${productId}:`, e.message);
    return null;
  }
}

// =====================================================
// UTILIDAD v1.2.7: escribir las SECCIONES DE INFORMACIÓN
// ADICIONAL de un producto (Catalog V1, vía API v2)
// =====================================================
// Los bloques viven DENTRO del producto, en el campo
// additionalInfoSections, como array de {title, description}.
//
// No se pueden escribir con wixData sobre Stores/Products (esa
// collection es de solo lectura), ni con
// wixStoresBackend.updateProductFields (Catalog V1: el campo no
// está entre los escribibles de su UpdateProductInfo — mismo
// caso que el coste, ver v1.2.4).
//
// Vía correcta y única: storesProducts.updateProduct de
// wix-stores.v2, con elevate(). Si el producto no tenía ninguna
// sección, se crean; si ya tenía, se sustituyen por las que
// llegan.
//
// AVISO DE COMPORTAMIENTO: el array se envía COMPLETO, así que
// las secciones con títulos distintos a los que manda el widget
// (por ejemplo "Detalles", heredada de productos antiguos) no se
// conservan al guardar desde el editor. Es el comportamiento
// actual del widget, que solo maneja sus cuatro bloques.
//
// Retorna siempre un objeto {ok, count, error} — nunca lanza,
// para no tumbar el alta ni la edición del resto de campos.
// =====================================================
// v1.3.0: la categoría general de Wix (la que contiene todos los
// productos automáticamente) no se asigna nunca a mano.
function esCollectionGeneral(nombre) {
  const n = String(nombre || '').trim().toLowerCase();
  return n === 'all products' || n === 'todos los productos';
}

async function escribirInfoAdicional(productId, secciones) {
  try {
    if (!productId) return { ok: false, error: 'productId vacío' };
    if (!Array.isArray(secciones)) return { ok: true, count: 0, skipped: true };

    const limpias = secciones
      .filter(s => s && typeof s === 'object')
      .map(s => ({
        title: String(s.title || '').trim(),
        description: String(s.description || '').trim()
      }))
      .filter(s => s.title !== '');

    const elevatedUpdate = elevate(storesProducts.updateProduct);
    await elevatedUpdate(productId, { additionalInfoSections: limpias });

    console.log(`${TAG} 📋 Info adicional escrita en ${productId}: ${limpias.length} sección(es) — ${limpias.map(s => s.title).join(' | ')}`);
    return { ok: true, count: limpias.length };

  } catch (e) {
    console.error(`${TAG} ❌ escribirInfoAdicional FAIL para ${productId}:`, e.message);
    return { ok: false, error: e.message };
  }
}

// =====================================================
// 1. LISTAR PRODUCTOS PARA EDICIÓN
// =====================================================
// v1.1.0: + suppressAuth (ve ocultos) + quantityInStock + trackInventory
// =====================================================
export const listarProductosParaEdicion = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 📦 Leyendo productos para edición...`);

      let items = [];
      let skip = 0;
      const PAGE = 100;
      let hasMore = true;

      while (hasMore) {
        // v1.1.1: la sintaxis correcta para incluir ocultos en
        // Stores/Products es `appOptions.includeHiddenProducts:true`.
        // suppressAuth se mantiene como cinturón y tirantes pero NO
        // basta por sí solo (probado en producción 24-jun).
        const result = await wixData.query("Stores/Products")
          .include("collections")
          .limit(PAGE)
          .skip(skip)
          .find({
            suppressAuth: true,
            appOptions: { includeHiddenProducts: true }
          });

        const page = result.items || [];
        items = items.concat(page);
        hasMore = page.length === PAGE;
        skip += PAGE;
      }

      let allCollections = [];
      try {
        const colResult = await wixData.query("Stores/Collections")
          .limit(100)
          .find({ suppressAuth: true });
        allCollections = (colResult.items || []).map(c => ({
          id: c._id,
          name: c.name || ''
        }));
      } catch (colErr) {
        console.warn(`${TAG} ⚠️ No se pudieron leer Stores/Collections:`, colErr.message);
      }

      // v1.2.3: VISIBILIDAD ROBUSTA por DOBLE QUERY A.
      // ---------------------------------------------------------------
      // Antes (v1.2.0–v1.2.2) se cruzaba con storesProducts.queryProducts()
      // de wix-stores.v2 para obtener `visible`. PROBLEMA confirmado en
      // logs de producción (25-jun): esa query solo devolvía 92 de 231
      // productos (paginación con cursor frágil que no completaba todas
      // las páginas), dejando 139 productos con visible:null. Un producto
      // con visible:null desaparece de AMBOS filtros del widget
      // ("Solo VISIBLES" y "Solo OCULTOS"), porque el widget compara
      // estrictamente con true/false. Resultado: filtros rotos.
      //
      // SOLUCIÓN: no depender de queryProducts v2 para la visibilidad.
      // La collection Stores/Products (wixData) no expone el campo
      // `visible` en su schema, PERO sí respeta el flag de visibilidad
      // vía appOptions.includeHiddenProducts:
      //   · Query SIN includeHiddenProducts → SOLO productos visibles.
      //   · Query CON includeHiddenProducts → TODOS (visibles + ocultos).
      // Cruzando ambos conjuntos por _id deducimos la visibilidad real
      // de los 231 productos sin paginación frágil:
      //   visible = (el producto aparece en el set "solo visibles").
      //
      // Esto es robusto, determinista y cubre el 100% del catálogo.
      // El COSTE (cost) ya NO se intenta cruzar aquí (queryProducts v2
      // tampoco lo traía: todos los samples salían cost:null en el log).
      // El coste se lee por modal con obtenerCosteProducto(productId).
      const visibleIdSet = new Set();
      try {
        let visItems = [];
        let visSkip = 0;
        let visHasMore = true;
        while (visHasMore) {
          // SIN appOptions.includeHiddenProducts → solo visibles.
          const visResult = await wixData.query("Stores/Products")
            .limit(PAGE)
            .skip(visSkip)
            .find({ suppressAuth: true });
          const visPage = visResult.items || [];
          for (const v of visPage) {
            if (v && v._id) visibleIdSet.add(v._id);
          }
          visItems = visItems.concat(visPage);
          visHasMore = visPage.length === PAGE;
          visSkip += PAGE;
        }
        console.log(`${TAG} 🔍 Visibilidad: ${visibleIdSet.size} visibles de ${items.length} totales`);
      } catch (visErr) {
        console.warn(`${TAG} ⚠️ Query de visibilidad falló (visible quedará null):`, visErr.message);
      }

      const lista = items.map(prod => {
        let prodCollections = [];
        if (Array.isArray(prod.collections)) {
          prodCollections = prod.collections.map(c => ({
            id: c._id || '',
            name: c.name || ''
          }));
        }

        let mediaItems = [];
        if (Array.isArray(prod.mediaItems)) {
          mediaItems = prod.mediaItems.map(m => ({
            src: m.src || m.url || '',
            type: m.type || 'image'
          })).filter(m => m.src);
        }

        // v1.0.5: leer additionalInfoSections
        let additionalInfoSections = [];
        if (Array.isArray(prod.additionalInfoSections)) {
          additionalInfoSections = prod.additionalInfoSections.map(s => ({
            title: s.title || '',
            description: s.description || ''
          }));
        }

        // v1.1.0: lectura nativa de inventario desde Stores/Products
        // - trackInventory: bool — indica si Wix lleva el contador
        // - quantityInStock: number — cantidad real. Solo relevante
        //   cuando trackInventory=true (docs Wix). Si false → null.
        const trackInventory = prod.trackInventory === true;
        const quantityInStock = trackInventory
          ? (typeof prod.quantityInStock === 'number' ? prod.quantityInStock : null)
          : null;

        // v1.2.3: visible deducido por DOBLE QUERY A (robusto, 231/231).
        // Si el producto está en el set de "solo visibles" → visible:true.
        // Si NO está pero sí en el listado total → visible:false (oculto).
        // visibleIdSet vacío (query de visibilidad falló) → null (el
        // widget mostrará "?" en lugar de mentir, y el filtro lo trata
        // aparte). Garantiza true/false para los 231 cuando la query OK.
        const visibleReal = visibleIdSet.size > 0
          ? visibleIdSet.has(prod._id)
          : null;
        // v1.2.3: cost ya NO se cruza en el listado (queryProducts v2 no
        // lo traía). Se lee por modal con obtenerCosteProducto. Aquí
        // siempre null; el widget pedirá el coste real al abrir el modal.
        const costReal = null;

        return {
          id: prod._id,
          name: prod.name || '',
          price: prod.price,
          formattedPrice: prod.formattedPrice || '',
          // v1.4.0: precio promocional. Los dos campos ya venían en la
          // query a Stores/Products (doc "Products" Collection Fields);
          // simplemente no se mapeaban. Cero lecturas extra.
          discountedPrice: (prod.discountedPrice === undefined || prod.discountedPrice === null)
            ? null
            : Number(prod.discountedPrice),
          formattedDiscountedPrice: prod.formattedDiscountedPrice || '',
          // v1.4.2: el descuento tal y como Wix lo tiene guardado
          // ({type:'PERCENT'|'AMOUNT'|'NONE', value}). La ficha lo usa
          // para abrir con el tipo real, venga de donde venga la oferta.
          discount: prod.discount || null,
          enPromocion: enPromocionReal(prod.price, prod.discountedPrice),
          // v1.4.3: porcentaje ya resuelto. Nadie lo recalcula aguas abajo.
          descuentoPct: porcentajeDescuento(prod.price, prod.discountedPrice, prod.discount),
          mainMedia: prod.mainMedia || '',
          sku: prod.sku || '',
          inStock: prod.inStock !== false,
          productType: prod.productType || 'physical',
          description: prod.description || '',
          ribbon: prod.ribbon || '',
          collections: prodCollections,
          productPageUrl: prod.productPageUrl || '',
          brand: prod.brand || '',
          // v1.2.0: cost y visible vienen del Product object real
          // (wix-stores.v2), no del schema parcial de la collection.
          cost: costReal,
          visible: visibleReal,
          currency: prod.currency || 'EUR',
          mediaItems: mediaItems,
          additionalInfoSections: additionalInfoSections,
          // v1.1.0: inventario real
          trackInventory,
          quantityInStock
        };
      });

      console.log(`${TAG} ✅ ${lista.length} productos cargados para edición`);

      return {
        ok: true,
        total: lista.length,
        productos: lista,
        collections: allCollections,
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ listarProductosParaEdicion FAIL:`, e);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 1b. OBTENER COSTE REAL DE UN PRODUCTO (v1.1.0)
// =====================================================
// El listado masivo (listarProductosParaEdicion) usa wixData.query
// sobre Stores/Products, pero ese collection schema NO expone
// costAndProfitData (campo ausente del schema oficial Wix).
// Para leer el coste real hay que pedir el Product completo via
// wix-stores.v2.products.getProduct(), que sí incluye el campo.
//
// Se llama una sola vez por modal abierto, NO en cada producto
// del listado (evita N llamadas).
// =====================================================
export const obtenerCosteProducto = webMethod(
  Permissions.Anyone,
  async (productId) => {
    try {
      if (!productId) {
        return { ok: false, error: 'productId es requerido' };
      }

      const elevatedGetProduct = elevate(storesProducts.getProduct);
      const result = await elevatedGetProduct(productId);

      // v1.1.1: LOGS DIAGNÓSTICO — la docs oficial dice que el
      // Product object incluye `costAndProfitData.itemCost`, pero
      // si la respuesta de wix-stores.v2.getProduct viene en otro
      // path, lo veremos aquí.
      try {
        console.log(`${TAG} 💰 getProduct response top-level keys: ${Object.keys(result || {}).join(', ')}`);
        if (result?.product) {
          console.log(`${TAG} 💰 result.product keys: ${Object.keys(result.product).join(', ')}`);
          console.log(`${TAG} 💰 result.product.costAndProfitData: ${JSON.stringify(result.product.costAndProfitData || null)}`);
        } else {
          console.log(`${TAG} 💰 result.costAndProfitData: ${JSON.stringify(result?.costAndProfitData || null)}`);
        }
      } catch (logErr) {
        console.warn(`${TAG} ⚠️ log diagnóstico falló:`, logErr.message);
      }

      // v1.2.4: LOG estructura de costRange (campo real del objeto,
      // confirmado en logs producción: el objeto trae `costRange`,
      // NO `costAndProfitData`, que siempre venía null).
      try {
        const prodForLog = result?.product || result;
        console.log(`${TAG} 💰 result.product.costRange: ${JSON.stringify(prodForLog?.costRange || null)}`);
      } catch (_) {}

      // v1.2.4: en productos con variantes (manageVariants), el coste
      // del producto padre viene null y el coste real vive en cada
      // VARIANTE (costAndProfitData.itemCost). Leemos de la variante.
      let cost = null;
      try {
        const elevatedGetVariants = elevate(getProductVariants);
        const vRes = await elevatedGetVariants(productId);
        const vArr = Array.isArray(vRes) ? vRes : (vRes?.items || []);
        if (vArr.length) {
          const v0 = vArr[0];
          console.log(`${TAG} 💰 variant[0] para coste: ${JSON.stringify(v0).substring(0, 400)}`);
          cost = v0?.variant?.costAndProfitData?.itemCost
            ?? v0?.costAndProfitData?.itemCost
            ?? null;
        }
      } catch (vErr) {
        console.warn(`${TAG} ⚠️ lectura de coste por variante falló:`, vErr.message);
      }

      // Fallback: paths del producto padre (por si algún producto
      // simple sin variantes los expusiera).
      const prod = result?.product || result;
      if (cost === null || cost === undefined) {
        cost = prod?.costRange?.minValue
          ?? prod?.costRange?.maxValue
          ?? prod?.costAndProfitData?.itemCost
          ?? null;
      }

      console.log(`${TAG} 💰 Coste leído para ${productId}: ${cost ?? '(sin definir)'}`);

      return {
        ok: true,
        productId,
        cost,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ obtenerCosteProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2. ACTUALIZAR PRODUCTO
// =====================================================
// v1.0.5: + additionalInfoSections en updateInfo
// v1.1.0: SIN CAMBIOS funcionales. El campo quantityInStock NO se
//         actualiza desde aquí — usar setearStockProducto. Razón:
//         updateProductFields no toca el inventario nativamente
//         (eso vive en Stores/InventoryItems).
// =====================================================
export const actualizarProducto = webMethod(
  Permissions.Anyone,
  async (productId, campos) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      if (!campos || typeof campos !== 'object') throw new Error('campos es requerido');

      console.log(`${TAG} ✏️ Actualizando producto ${productId}:`, Object.keys(campos).join(', '));

      const updateInfo = {};

      if (campos.name !== undefined && String(campos.name).trim()) {
        updateInfo.name = String(campos.name).trim();
      }
      if (campos.price !== undefined) {
        updateInfo.price = parseFloat(campos.price) || 0;
      }
      if (campos.visible !== undefined) {
        updateInfo.visible = Boolean(campos.visible);
      }
      if (campos.brand !== undefined && String(campos.brand).trim()) {
        updateInfo.brand = String(campos.brand).trim();
      }
      if (campos.sku !== undefined) {
        updateInfo.sku = String(campos.sku || '').trim();
      }
      if (campos.description !== undefined) {
        updateInfo.description = String(campos.description || '').trim();
      }
      if (campos.ribbon !== undefined) {
        updateInfo.ribbon = String(campos.ribbon || '').trim();
      }
      // v1.2.4: el COSTE ya NO se escribe aquí. updateProductFields
      // de V1 NO acepta el coste en su UpdateProductInfo (doc oficial:
      // los campos escribibles son name, description, media, sku,
      // currency, price, discountedPrice, ribbon — coste ausente).
      // En productos con variantes, el coste vive en la VARIANTE
      // (campo costAndProfitData.itemCost) y se escribe con
      // updateVariantData(). Lo hace setearCosteProducto (función
      // dedicada nueva), llamada por separado desde el page code.
      // Aquí se ignora campos.cost para no romper el resto del update.

      // v1.2.7: additionalInfoSections YA NO va dentro del update V1.
      // updateProductFields lo ignoraba en silencio (mismo caso que el
      // coste en v1.2.4). Se escribe aparte con la vía v2.
      const hayInfoAdicional = Array.isArray(campos.additionalInfoSections);

      if (Object.keys(updateInfo).length === 0 && !hayInfoAdicional) {
        console.log(`${TAG} ℹ️ Sin campos que actualizar`);
        return { ok: true, productId, noChanges: true };
      }

      if (Object.keys(updateInfo).length > 0) {
        const elevatedUpdate = elevate(wixStoresBackend.updateProductFields);
        await elevatedUpdate(productId, updateInfo);
        console.log(`${TAG} ✅ Producto actualizado: ${productId} — campos: ${Object.keys(updateInfo).join(', ')}`);
      }

      // v1.2.7: secciones de información adicional (vía v2)
      let infoAdicional = null;
      if (hayInfoAdicional) {
        infoAdicional = await escribirInfoAdicional(productId, campos.additionalInfoSections);
      }

      return {
        ok: true,
        productId,
        updatedFields: Object.keys(updateInfo),
        infoAdicional,
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ actualizarProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2a. SECCIONES DE INFORMACIÓN ADICIONAL (v1.2.7)
// =====================================================
// Escribe SOLO los bloques de información adicional de un
// producto, sin tocar ningún otro campo. El page code actual no
// necesita llamarla: actualizarProducto y crearProductoNuevo ya
// los escriben por su cuenta. Queda expuesta para poder repararlos
// en lote o desde otra pantalla sin arrastrar el resto del update.
//
// secciones: [{ title, description }, ...]
// =====================================================
export const setearInfoAdicionalProducto = webMethod(
  Permissions.Anyone,
  async (productId, secciones) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      if (!Array.isArray(secciones)) throw new Error('secciones debe ser un array');

      const res = await escribirInfoAdicional(productId, secciones);
      if (!res.ok) return { ok: false, error: res.error, version: VERSION };

      return { ok: true, productId, count: res.count, version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ setearInfoAdicionalProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2c. PRECIO PROMOCIONAL (v1.4.0)
// =====================================================
// Wix solo considera que hay oferta cuando discountedPrice es un número
// mayor que 0 y MENOR que price. Mismo criterio en el editor, en el TPV
// y en el bloque de los correos: un único guardarraíl replicado.
function enPromocionReal(precio, precioDescontado) {
  const p = Number(precio);
  const d = Number(precioDescontado);
  return Number.isFinite(p) && Number.isFinite(d) && d > 0 && d < p;
}

// v1.4.3 — Porcentaje que se ENSEÑA al cliente.
// Si Wix tiene guardado el descuento como PERCENT, se usa ese número tal
// cual: es lo que escribió el salón y lo que muestra el panel de Wix.
// Solo se deduce de los precios cuando el descuento está en euros, y ahí
// se trunca (nunca prometer más rebaja de la que hay) con una tolerancia
// para el error de coma flotante: 23,00 a 20,70 da 9,999999999999998 y
// sin ella se pintaría -9% en vez de -10%.
function porcentajeDescuento(precio, precioDescontado, discount) {
  const tipo = (discount && discount.type) ? String(discount.type).toUpperCase() : '';
  if (tipo === 'PERCENT') {
    const v = Number(discount.value);
    if (Number.isFinite(v) && v > 0 && v < 100) return Math.round(v * 100) / 100;
  }
  const p = Number(precio);
  const d = Number(precioDescontado);
  if (!Number.isFinite(p) || !Number.isFinite(d) || p <= 0 || d <= 0 || d >= p) return 0;
  return Math.floor(((1 - (d / p)) * 100) + 1e-9);
}

// Redondeo a dos decimales sin arrastrar el error del binario.
function dosDecimales(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Precio base (el original, el que Wix tacha) leído de la collection
// Stores/Products, donde `price` es un Number plano (doc "Products"
// Collection Fields). Se usa includeHiddenProducts para que también
// funcione con productos ocultos, igual que el listado desde v1.1.1.
async function leerPrecioBase(productId) {
  const r = await wixData.query('Stores/Products')
    .eq('_id', productId)
    .limit(1)
    .find({ suppressAuth: true, appOptions: { includeHiddenProducts: true } });
  const prod = (r.items || [])[0];
  if (!prod) return { ok: false, error: 'Producto no encontrado en Stores/Products' };
  const base = Number(prod.price);
  if (!Number.isFinite(base) || base <= 0) {
    return { ok: false, error: `El producto no tiene un precio base válido (${prod.price})` };
  }
  return { ok: true, base, nombre: prod.name || '' };
}

// Tirar la caché del bloque de productos de los correos. NUNCA bloquea:
// si falla, la promoción ya está escrita y solo se pierde frescura.
async function invalidarCacheCorreos(motivo) {
  try {
    await invalidarCacheCatalogo();
    console.log(`${TAG} ♻️ Caché de sugerencias invalidada (${motivo})`);
    return true;
  } catch (e) {
    console.warn(`${TAG} ⚠️ No se pudo invalidar la caché de sugerencias (${motivo}): ${e.message}`);
    return false;
  }
}

/**
 * ACTIVAR PROMOCIÓN
 *
 * El precio original nunca se toca: Wix lo conserva, lo pinta tachado y
 * calcula él mismo el precio de venta a partir del descuento.
 *
 * @param {string} productId
 * @param {object|number} opciones
 *        · {tipo:'PERCENT', valor:15}  → 15% de rebaja.
 *        · {tipo:'AMOUNT',  valor:3}   → 3 € de rebaja.
 *        · un número suelto → se interpreta como precio final de venta y
 *          se traduce a AMOUNT (compatibilidad con page code v3.6).
 */
export const activarPromocionProducto = webMethod(
  Permissions.SiteMember,
  async (productId, opciones) => {
    try {
      if (!productId) throw new Error('productId es requerido');

      const lectura = await leerPrecioBase(productId);
      if (!lectura.ok) throw new Error(lectura.error);
      const base = dosDecimales(lectura.base);

      let tipo;
      let valor;

      if (opciones !== null && typeof opciones === 'object') {
        tipo = String(opciones.tipo || '').toUpperCase();
        valor = dosDecimales(opciones.valor);
      } else {
        // Forma antigua: llega el precio final de venta.
        const promo = dosDecimales(opciones);
        if (!Number.isFinite(promo) || promo <= 0) {
          throw new Error('El precio promocional debe ser un número mayor que 0');
        }
        if (promo >= base) {
          throw new Error(`El precio promocional (${promo}) debe ser menor que el precio actual (${base})`);
        }
        tipo = 'AMOUNT';
        valor = dosDecimales(base - promo);
      }

      if (tipo !== 'PERCENT' && tipo !== 'AMOUNT') {
        throw new Error(`Tipo de descuento no válido: ${tipo}`);
      }
      if (!Number.isFinite(valor) || valor <= 0) {
        throw new Error('El descuento debe ser mayor que 0');
      }
      if (tipo === 'PERCENT' && valor >= 100) {
        throw new Error('El porcentaje de descuento debe ser menor que 100');
      }
      if (tipo === 'AMOUNT' && valor >= base) {
        throw new Error(`La rebaja (${valor}) debe ser menor que el precio actual (${base})`);
      }

      console.log(`${TAG} 🏷 Promoción ${lectura.nombre || productId}: base ${base} · ${tipo} ${valor}`);

      const elevatedUpdate = elevate(storesProducts.updateProduct);
      const res = await elevatedUpdate(productId, {
        discount: { type: tipo, value: valor }
      });

      // El precio de venta lo calcula Wix, no nosotros: se lee de su
      // respuesta. Confirmado en el log de producción del 13-sep.
      let precioPromocional = null;
      try {
        const prodRes = res?.product || res;
        console.log(`${TAG} 🏷 respuesta discount: ${JSON.stringify(prodRes?.discount || null)} | priceData: ${JSON.stringify(prodRes?.priceData || null)}`);
        const d = Number(prodRes?.priceData?.discountedPrice);
        if (Number.isFinite(d)) precioPromocional = d;
      } catch (_) {}

      await invalidarCacheCorreos('activar promoción');

      return {
        ok: true,
        productId,
        precioAnterior: base,
        tipo,
        valor,
        precioPromocional,
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ activarPromocionProducto FAIL:`, e.message);
      return { ok: false, error: e.message, version: VERSION };
    }
  }
);

/**
 * DESACTIVAR PROMOCIÓN
 *
 * type:'NONE' es el valor que la doc de Wix indica pasar para quitar el
 * descuento. No hay que restaurar nada: `price` nunca se modificó.
 */
export const desactivarPromocionProducto = webMethod(
  Permissions.SiteMember,
  async (productId) => {
    try {
      if (!productId) throw new Error('productId es requerido');

      console.log(`${TAG} 🏷 Quitando promoción de ${productId}`);

      const elevatedUpdate = elevate(storesProducts.updateProduct);
      const res = await elevatedUpdate(productId, {
        discount: { type: 'NONE', value: 0 }
      });

      try {
        const prodRes = res?.product || res;
        console.log(`${TAG} 🏷 respuesta discount: ${JSON.stringify(prodRes?.discount || null)} | priceData: ${JSON.stringify(prodRes?.priceData || null)}`);
      } catch (_) {}

      await invalidarCacheCorreos('desactivar promoción');

      return { ok: true, productId, version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ desactivarPromocionProducto FAIL:`, e.message);
      return { ok: false, error: e.message, version: VERSION };
    }
  }
);

// =====================================================
// 2d. CAMPAÑA DE DESCUENTO EN TODA LA TIENDA (v1.5.0 · v1.6.0)
// =====================================================
// Pone el mismo porcentaje a todos los productos de la tienda (botón
// BLACK FRIDAY del gestor) y, al terminar, devuelve a cada producto la
// oferta que tenía antes.
//
// · Cada producto admite UN solo descuento (`discount`). Antes de
//   escribir el de la campaña se guarda el que tenía en la colección
//   KamisuiteCampanaDescuento, una fila por producto.
// · Se escribe por la misma vía que activarPromocionProducto:
//   storesProducts.updateProduct con elevate(), discount PERCENT. El
//   precio original no se toca nunca.
// · Al terminar, un producto solo se restaura si sigue con el
//   porcentaje de la campaña. Si alguien le cambió la oferta a mano
//   durante la campaña, se respeta ese cambio.
// · Quedan fuera los productos de uso interno: los que SOLO están en
//   categorías con el prefijo de almacén. Un producto que además está
//   en una categoría de venta entra en la campaña (mismo criterio de
//   doble categoría que almacenLogic).
// · Desde el gestor, el trabajo va por lotes que orquesta el page code.
//
// v1.6.0 — CAMPAÑA PROGRAMADA POR FECHAS
// · La programación vive en KamisuiteCampanaProgramada (una sola fila):
//   porcentaje, inicio, fin, estado (PROGRAMADA → ACTIVA → TERMINADA)
//   y resultado (texto para el panel).
// · La ejecuta la tarea programada campanaDescuentoJob.js con cuatro
//   ticks por hora. Al llegar el inicio aplica la campaña y al llegar
//   el fin la termina.
// · Cada ejecución trabaja como mucho PRESUPUESTO_TAREA_MS. La
//   documentación de la plataforma no fija la duración máxima de una
//   tarea programada: si una ejecución se corta o se queda sin tiempo,
//   la siguiente continúa donde se quedó, porque aplicar y terminar se
//   pueden repetir sin efectos dobles.
// =====================================================
const COL_CAMPANA = 'KamisuiteCampanaDescuento';
const COL_CAMPANA_PROGRAMADA = 'KamisuiteCampanaProgramada';
// v1.7.0: proceso en curso (una fila) y tiempo sin latido para darlo por parado.
const COL_CAMPANA_PROCESO = 'KamisuiteCampanaProceso';
const PROCESO_CADUCA_MS = 3 * 60 * 1000;

// Mismo prefijo que PREFIJO_ALMACEN de almacenLogic.web.js. Si allí
// cambia, hay que cambiarlo también aquí.
const PREFIJO_USO_INTERNO = 'USO SALON-';

// Tope de productos por llamada, por si llega un lote mayor del previsto.
const MAX_LOTE_CAMPANA = 25;

// v1.6.0: tarea programada — tiempo máximo de trabajo por ejecución y
// productos por lote.
const PRESUPUESTO_TAREA_MS = 4 * 60 * 1000;
const LOTE_TAREA = 10;

function esSoloUsoInterno(prod) {
  const cols = Array.isArray(prod?.collections) ? prod.collections : [];
  const reales = cols.filter(c => c && typeof c.name === 'string' && !esCollectionGeneral(c.name));
  if (reales.length === 0) return false;
  const pref = PREFIJO_USO_INTERNO.toUpperCase();
  return reales.every(c => c.name.toUpperCase().startsWith(pref));
}

// Descuento guardado en el producto, normalizado a {type, value}.
function descuentoNormalizado(discount) {
  const type = (discount && discount.type) ? String(discount.type).toUpperCase() : 'NONE';
  const value = Number(discount?.value);
  return { type, value: Number.isFinite(value) ? value : 0 };
}

// ¿El producto sigue con el descuento de la campaña?
// v1.7.0: Wix guarda el PERCENT convertido a AMOUNT. Se reconoce:
//  1) por lo que Wix guardó al escribirlo (tipoGuardado/valorGuardado);
//  2) si la fila no lo tiene, por el PERCENT o por su equivalente en
//     euros sobre el precio actual, con medio céntimo de margen.
function tieneDescuentoCampana(discount, fila, precio) {
  const d = descuentoNormalizado(discount);
  const tipoG = String(fila?.tipoGuardado || '').toUpperCase();
  const valorG = Number(fila?.valorGuardado);
  if ((tipoG === 'PERCENT' || tipoG === 'AMOUNT') && Number.isFinite(valorG)) {
    return d.type === tipoG && Math.abs(d.value - valorG) < 0.001;
  }
  const pct = Number(fila?.valorCampana);
  if (!Number.isFinite(pct)) return false;
  if (d.type === 'PERCENT') return Math.abs(d.value - pct) < 0.001;
  if (d.type === 'AMOUNT') {
    const p = Number(precio);
    if (!Number.isFinite(p) || p <= 0) return false;
    return Math.abs(d.value - (p * pct / 100)) <= 0.0051;
  }
  return false;
}

function porcentajeCampana(valor) {
  const p = dosDecimales(valor);
  if (!Number.isFinite(p) || p <= 0 || p >= 100) return null;
  return p;
}

// Nombre y descuento actual de un producto. Misma query que
// leerPrecioBase: incluye los productos ocultos.
async function leerProductoCampana(productId) {
  const r = await wixData.query('Stores/Products')
    .eq('_id', productId)
    .limit(1)
    .find({ suppressAuth: true, appOptions: { includeHiddenProducts: true } });
  const prod = (r.items || [])[0];
  if (!prod) return null;
  return { nombre: prod.name || '', discount: prod.discount || null, precio: Number(prod.price) };
}

async function filaCampana(productId) {
  const r = await wixData.query(COL_CAMPANA)
    .eq('productId', productId)
    .limit(1)
    .find({ suppressAuth: true });
  return (r.items || [])[0] || null;
}

// v1.6.0: lógica común del gestor y de la tarea programada.
// Ids de los productos que entran en la campaña. Misma lectura
// paginada que listarProductosParaEdicion (con ocultos y categorías).
async function idsCampanaInterno() {
  let items = [];
  let skip = 0;
  const PAGE = 100;
  let hasMore = true;

  while (hasMore) {
    const result = await wixData.query("Stores/Products")
      .include("collections")
      .limit(PAGE)
      .skip(skip)
      .find({
        suppressAuth: true,
        appOptions: { includeHiddenProducts: true }
      });
    const page = result.items || [];
    items = items.concat(page);
    hasMore = page.length === PAGE;
    skip += PAGE;
  }

  const ids = [];
  let excluidos = 0;
  for (const prod of items) {
    if (!prod || !prod._id) continue;
    if (esSoloUsoInterno(prod)) { excluidos++; continue; }
    ids.push(prod._id);
  }

  console.log(`${TAG} 🏷 Campaña: entran ${ids.length} productos, ${excluidos} de uso interno quedan fuera (de ${items.length})`);
  return { ids, excluidos };
}

// Por producto: 1) guarda su oferta anterior si aún no está guardada;
// 2) escribe el descuento de la campaña. Si el paso 2 falla, la fila
// queda guardada y el producto sin tocar: al terminar la campaña se ve
// que no tiene el porcentaje de la campaña y se deja como está.
// v1.6.0: si el producto ya tiene la campaña con este porcentaje, se
// salta (reintentos y reanudaciones de la tarea programada).
async function aplicarLoteCampanaInterno(pct, lote) {
  const elevatedUpdate = elevate(storesProducts.updateProduct);
  let actualizados = 0;
  let yaEstaban = 0;
  const errores = [];

  for (const productId of lote) {
    let nombre = '';
    try {
      const prod = await leerProductoCampana(productId);
      if (!prod) throw new Error('Producto no encontrado en Stores/Products');
      nombre = prod.nombre;

      const fila = await filaCampana(productId);
      if (fila && Number(fila.valorCampana) === pct && tieneDescuentoCampana(prod.discount, fila, prod.precio)) {
        yaEstaban++;
        actualizados++;
        continue;
      }

      // 1) Guardar la oferta que tenía, una sola vez por campaña.
      let filaGuardada = fila;
      if (!fila) {
        const previo = descuentoNormalizado(prod.discount);
        filaGuardada = await wixData.insert(COL_CAMPANA, {
          productId,
          tipoAnterior: previo.type,
          valorAnterior: previo.value,
          valorCampana: pct
        }, { suppressAuth: true });
      } else if (Number(fila.valorCampana) !== pct) {
        // Campaña ya en marcha con otro porcentaje: la oferta
        // original guardada se conserva y solo cambia el de la
        // campaña. READ-MERGE-UPDATE. Lo guardado por Wix para el
        // porcentaje anterior deja de valer.
        const merged = { ...fila, valorCampana: pct, tipoGuardado: '', valorGuardado: null };
        filaGuardada = await wixData.update(COL_CAMPANA, merged, { suppressAuth: true });
      }

      // 2) Escribir el descuento de la campaña.
      const res = await elevatedUpdate(productId, {
        discount: { type: 'PERCENT', value: pct }
      });
      actualizados++;

      // 3) v1.7.0: apuntar lo que Wix ha guardado de verdad (convierte el
      //    PERCENT en AMOUNT). Si falla, el descuento ya está puesto: al
      //    terminar se reconoce por el equivalente en euros.
      try {
        let guardado = descuentoNormalizado((res?.product || res)?.discount);
        if (guardado.type === 'NONE') {
          const releido = await leerProductoCampana(productId);
          if (releido) guardado = descuentoNormalizado(releido.discount);
        }
        if (guardado.type !== 'NONE' && filaGuardada && filaGuardada._id) {
          const conGuardado = { ...filaGuardada, tipoGuardado: guardado.type, valorGuardado: guardado.value };
          await wixData.update(COL_CAMPANA, conGuardado, { suppressAuth: true });
        }
      } catch (eGuardado) {
        console.warn(`${TAG} ⚠️ Campaña: no se pudo apuntar lo guardado de ${nombre || productId}: ${eGuardado.message}`);
      }

    } catch (err) {
      console.error(`${TAG} ❌ Campaña: no se pudo aplicar a ${nombre || productId}:`, err.message);
      errores.push({ productId, nombre, error: 'No se pudo poner el descuento' });
    }
  }

  console.log(`${TAG} 🏷 Campaña -${pct}%: lote de ${lote.length} → ${actualizados} con la campaña (${yaEstaban} ya estaban), ${errores.length} con error`);
  return { procesados: lote.length, actualizados, yaEstaban, errores };
}

// Por fila: si el producto sigue con el porcentaje de la campaña, se le
// devuelve la oferta anterior (o se le quita si no tenía); si no, se
// deja como está. En los dos casos se borra la fila. Si algo falla, la
// fila se queda para poder reintentarlo. Se lee por orden de creación,
// así que las filas que fallan van delante y se saltan con `saltar`.
async function terminarLoteCampanaInterno(limite, saltar) {
  const r = await wixData.query(COL_CAMPANA)
    .ascending('_createdDate')
    .skip(saltar)
    .limit(limite)
    .find({ suppressAuth: true });
  const filas = r.items || [];

  const elevatedUpdate = elevate(storesProducts.updateProduct);
  let restaurados = 0;
  let respetados = 0;
  let sinProducto = 0;
  const errores = [];

  for (const fila of filas) {
    let nombre = '';
    try {
      const prod = await leerProductoCampana(fila.productId);
      if (!prod) {
        // El producto se eliminó durante la campaña.
        sinProducto++;
      } else {
        nombre = prod.nombre;
        if (tieneDescuentoCampana(prod.discount, fila, prod.precio)) {
          const tipo = String(fila.tipoAnterior || 'NONE').toUpperCase();
          const valor = Number(fila.valorAnterior);
          const discount = ((tipo === 'PERCENT' || tipo === 'AMOUNT') && Number.isFinite(valor) && valor > 0)
            ? { type: tipo, value: valor }
            : { type: 'NONE', value: 0 };
          await elevatedUpdate(fila.productId, { discount });
          restaurados++;
        } else {
          respetados++;
        }
      }
      await wixData.remove(COL_CAMPANA, fila._id, { suppressAuth: true });

    } catch (err) {
      console.error(`${TAG} ❌ Campaña: no se pudo devolver la oferta de ${nombre || fila.productId}:`, err.message);
      errores.push({ productId: fila.productId, nombre, error: 'No se pudo devolver su oferta' });
    }
  }

  console.log(`${TAG} 🏷 Fin de campaña: lote de ${filas.length} → ${restaurados} restaurados, ${respetados} respetados, ${sinProducto} sin producto, ${errores.length} con error`);
  return { procesados: filas.length, restaurados, respetados, sinProducto, errores };
}

// v1.6.0: la fila de la programación (o null).
async function leerProgramacion() {
  const r = await wixData.query(COL_CAMPANA_PROGRAMADA)
    .limit(1)
    .find({ suppressAuth: true });
  return (r.items || [])[0] || null;
}

function fechaISO(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function programacionParaWidget(p) {
  if (!p) return null;
  return {
    porcentaje: Number(p.porcentaje) || null,
    inicio: fechaISO(p.inicio),
    fin: fechaISO(p.fin),
    estado: String(p.estado || '').toUpperCase(),
    resultado: p.resultado || ''
  };
}

// La tarea programada solo escribe si la programación sigue siendo la
// misma con la que empezó (el salón podría haberla cambiado mientras
// tanto). READ-MERGE-UPDATE sobre la fila recién leída.
async function guardarResultadoProgramacion(original, cambios) {
  const fresca = await leerProgramacion();
  if (!fresca || fresca._id !== original._id) return false;
  const misma = fechaISO(fresca.inicio) === fechaISO(original.inicio)
    && fechaISO(fresca.fin) === fechaISO(original.fin)
    && Number(fresca.porcentaje) === Number(original.porcentaje)
    && String(fresca.estado || '') === String(original.estado || '');
  if (!misma) return false;
  const merged = { ...fresca, ...cambios };
  await wixData.update(COL_CAMPANA_PROGRAMADA, merged, { suppressAuth: true });
  return true;
}

// v1.7.0: registro del proceso en curso. Nunca bloquea la campaña: si
// la colección no existe o falla, solo se pierde el aviso en el panel.
async function escribirProceso(datos) {
  try {
    const r = await wixData.query(COL_CAMPANA_PROCESO)
      .limit(1)
      .find({ suppressAuth: true });
    const fila = (r.items || [])[0] || null;
    if (fila) {
      const merged = { ...fila, ...datos };
      await wixData.update(COL_CAMPANA_PROCESO, merged, { suppressAuth: true });
    } else {
      await wixData.insert(COL_CAMPANA_PROCESO, datos, { suppressAuth: true });
    }
    return true;
  } catch (e) {
    console.warn(`${TAG} ⚠️ No se pudo escribir el proceso de la campaña: ${e.message}`);
    return false;
  }
}

async function borrarProceso() {
  try {
    const r = await wixData.query(COL_CAMPANA_PROCESO)
      .limit(10)
      .find({ suppressAuth: true });
    for (const fila of (r.items || [])) {
      await wixData.remove(COL_CAMPANA_PROCESO, fila._id, { suppressAuth: true });
    }
    return true;
  } catch (e) {
    console.warn(`${TAG} ⚠️ No se pudo borrar el proceso de la campaña: ${e.message}`);
    return false;
  }
}

// Proceso vivo (con latido reciente) o null. Lanza si la colección no
// se puede leer: cada llamador decide qué hacer.
async function leerProcesoVivo() {
  const r = await wixData.query(COL_CAMPANA_PROCESO)
    .limit(1)
    .find({ suppressAuth: true });
  const fila = (r.items || [])[0] || null;
  if (!fila) return null;
  const latido = new Date(fila._updatedDate).getTime();
  if (!Number.isFinite(latido) || (Date.now() - latido) > PROCESO_CADUCA_MS) return null;
  return {
    fase: fila.fase === 'terminar' ? 'terminar' : 'aplicar',
    origen: fila.origen === 'programada' ? 'programada' : 'manual',
    hechos: Number(fila.hechos) || 0,
    total: Number(fila.total) || 0,
    porcentaje: Number(fila.porcentaje) || null
  };
}

/**
 * ESTADO DE LA CAMPAÑA
 * Hay campaña mientras quede alguna fila en KamisuiteCampanaDescuento.
 * v1.6.0: devuelve también la programación por fechas, si la hay. Si la
 * colección de la programación no se puede leer, la campaña manual
 * sigue funcionando y `programacionOk` va a false.
 */
export const estadoCampanaDescuento = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const r = await wixData.query(COL_CAMPANA)
        .limit(1)
        .find({ suppressAuth: true });
      const filas = r.items || [];
      const total = r.totalCount || filas.length;
      const primera = filas[0] || null;

      let programada = null;
      let programacionOk = true;
      try {
        programada = programacionParaWidget(await leerProgramacion());
      } catch (eProg) {
        programacionOk = false;
        console.error(`${TAG} ❌ estadoCampanaDescuento (programación) FAIL:`, eProg.message);
      }

      // v1.7.0: proceso en curso, si lo hay.
      let proceso = null;
      try {
        proceso = await leerProcesoVivo();
      } catch (eProc) {
        console.error(`${TAG} ❌ estadoCampanaDescuento (proceso) FAIL:`, eProc.message);
      }

      return {
        ok: true,
        activa: total > 0,
        productos: total,
        porcentaje: primera ? (Number(primera.valorCampana) || null) : null,
        programada,
        programacionOk,
        proceso,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ estadoCampanaDescuento FAIL:`, e.message);
      return { ok: false, error: 'No se pudo comprobar si hay una campaña activa.', version: VERSION };
    }
  }
);

/**
 * PREPARAR CAMPAÑA
 * Devuelve los ids de los productos que entran.
 */
export const prepararCampanaDescuento = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const { ids, excluidos } = await idsCampanaInterno();
      return { ok: true, ids, total: ids.length, excluidos, version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ prepararCampanaDescuento FAIL:`, e.message);
      return { ok: false, error: 'No se pudo leer el catálogo para preparar la campaña.', version: VERSION };
    }
  }
);

/**
 * APLICAR CAMPAÑA — un lote de productos
 *
 * @param {number} porcentaje  Mayor que 0 y menor que 100.
 * @param {string[]} ids       Ids de producto (máx. MAX_LOTE_CAMPANA).
 */
export const aplicarCampanaDescuentoLote = webMethod(
  Permissions.SiteMember,
  async (porcentaje, ids) => {
    try {
      const pct = porcentajeCampana(porcentaje);
      if (pct === null) {
        return { ok: false, error: 'El porcentaje debe ser mayor que 0 y menor que 100.', version: VERSION };
      }
      const lote = (Array.isArray(ids) ? ids : []).filter(Boolean).slice(0, MAX_LOTE_CAMPANA);
      const r = await aplicarLoteCampanaInterno(pct, lote);
      return { ok: true, procesados: r.procesados, actualizados: r.actualizados, errores: r.errores, version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ aplicarCampanaDescuentoLote FAIL:`, e.message);
      return { ok: false, error: 'No se pudo aplicar el descuento a este grupo de productos.', version: VERSION };
    }
  }
);

/**
 * TERMINAR CAMPAÑA — un lote de filas
 *
 * @param {number} limite  Filas a procesar (máx. MAX_LOTE_CAMPANA).
 * @param {number} saltar  Filas que fallaron en lotes anteriores.
 */
export const terminarCampanaDescuentoLote = webMethod(
  Permissions.SiteMember,
  async (limite, saltar) => {
    try {
      const lim = Math.min(Math.max(parseInt(limite, 10) || 10, 1), MAX_LOTE_CAMPANA);
      const sk = Math.max(parseInt(saltar, 10) || 0, 0);
      const r = await terminarLoteCampanaInterno(lim, sk);
      return { ok: true, ...r, version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ terminarCampanaDescuentoLote FAIL:`, e.message);
      return { ok: false, error: 'No se pudo terminar la campaña en este grupo de productos.', version: VERSION };
    }
  }
);

/**
 * Al acabar de aplicar o de terminar la campaña: tirar UNA vez la caché
 * del bloque de productos de los correos.
 */
export const refrescarCorreosTrasCampana = webMethod(
  Permissions.SiteMember,
  async () => {
    const ok = await invalidarCacheCorreos('campaña de descuento');
    return { ok: true, cacheInvalidada: ok, version: VERSION };
  }
);

/**
 * v1.6.0 — PROGRAMAR CAMPAÑA POR FECHAS
 *
 * @param {number} porcentaje  Mayor que 0 y menor que 100.
 * @param {string} inicioISO   Fecha y hora de inicio (ISO).
 * @param {string} finISO      Fecha y hora de fin (ISO), posterior al
 *                             inicio y a ahora.
 *
 * Una sola programación: si ya hay una, se sustituye y vuelve a
 * PROGRAMADA. Si el inicio ya pasó, la tarea programada la aplica en su
 * siguiente vuelta.
 */
export const programarCampanaDescuento = webMethod(
  Permissions.SiteMember,
  async (porcentaje, inicioISO, finISO) => {
    try {
      const pct = porcentajeCampana(porcentaje);
      if (pct === null) {
        return { ok: false, error: 'El porcentaje debe ser mayor que 0 y menor que 100.', version: VERSION };
      }
      const inicio = new Date(inicioISO);
      const fin = new Date(finISO);
      if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
        return { ok: false, error: 'Indica el día y la hora de inicio y de fin.', version: VERSION };
      }
      if (fin <= inicio) {
        return { ok: false, error: 'El fin tiene que ser posterior al inicio.', version: VERSION };
      }
      if (fin <= new Date()) {
        return { ok: false, error: 'El fin ya ha pasado. Elige una fecha de fin futura.', version: VERSION };
      }

      const datos = { porcentaje: pct, inicio, fin, estado: 'PROGRAMADA', resultado: '' };
      const existente = await leerProgramacion();
      let guardada;
      if (existente) {
        const merged = { ...existente, ...datos };
        guardada = await wixData.update(COL_CAMPANA_PROGRAMADA, merged, { suppressAuth: true });
      } else {
        guardada = await wixData.insert(COL_CAMPANA_PROGRAMADA, datos, { suppressAuth: true });
      }

      console.log(`${TAG} 🗓 Campaña programada: -${pct}% del ${inicio.toISOString()} al ${fin.toISOString()}`);
      return { ok: true, programada: programacionParaWidget(guardada), version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ programarCampanaDescuento FAIL:`, e.message);
      return { ok: false, error: 'No se pudo guardar la programación.', version: VERSION };
    }
  }
);

/**
 * v1.6.0 — QUITAR PROGRAMACIÓN
 * Borra las fechas. No toca los productos: si la campaña ya está en
 * marcha, sigue hasta que se pulse TERMINAR CAMPAÑA.
 */
export const quitarProgramacionCampana = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const existente = await leerProgramacion();
      if (existente) {
        await wixData.remove(COL_CAMPANA_PROGRAMADA, existente._id, { suppressAuth: true });
      }
      return { ok: true, version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ quitarProgramacionCampana FAIL:`, e.message);
      return { ok: false, error: 'No se pudo quitar la programación.', version: VERSION };
    }
  }
);

/**
 * v1.6.0 — Tras TERMINAR CAMPAÑA a mano: si la programación ya había
 * empezado, se da por terminada para que la tarea programada no la
 * vuelva a aplicar. Una programación con el inicio aún por llegar se
 * conserva.
 */
export const cerrarProgramacionCampana = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const existente = await leerProgramacion();
      if (!existente) return { ok: true, cerrada: false, version: VERSION };
      const estado = String(existente.estado || '').toUpperCase();
      const inicio = new Date(existente.inicio);
      if (estado === 'TERMINADA' || isNaN(inicio.getTime()) || inicio > new Date()) {
        return { ok: true, cerrada: false, version: VERSION };
      }
      const merged = { ...existente, estado: 'TERMINADA', resultado: 'Se terminó a mano desde el gestor.' };
      await wixData.update(COL_CAMPANA_PROGRAMADA, merged, { suppressAuth: true });
      return { ok: true, cerrada: true, version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ cerrarProgramacionCampana FAIL:`, e.message);
      return { ok: false, error: 'No se pudo cerrar la programación.', version: VERSION };
    }
  }
);

/**
 * v1.7.0 — PROCESO EN CURSO de una campaña lanzada a mano desde el
 * gestor. El page code lo registra al empezar y en cada lote, y lo
 * finaliza al acabar.
 */
export const registrarProcesoCampana = webMethod(
  Permissions.SiteMember,
  async (fase, hechos, total, porcentaje) => {
    const ok = await escribirProceso({
      fase: fase === 'terminar' ? 'terminar' : 'aplicar',
      origen: 'manual',
      hechos: Number(hechos) || 0,
      total: Number(total) || 0,
      porcentaje: Number(porcentaje) || null
    });
    return { ok: true, registrado: ok, version: VERSION };
  }
);

export const finalizarProcesoCampana = webMethod(
  Permissions.SiteMember,
  async () => {
    const ok = await borrarProceso();
    return { ok: true, borrado: ok, version: VERSION };
  }
);

/**
 * v1.6.0 — TAREA PROGRAMADA (campanaDescuentoJob.js)
 *
 * Permissions.Admin, como ejecutarResumenDiarioProgramado: la llama la
 * tarea programada, no el gestor.
 *
 * · Fin alcanzado → termina la campaña (aunque no se llegara a aplicar
 *   entera) y deja la programación en TERMINADA.
 * · Inicio alcanzado y estado PROGRAMADA → aplica la campaña y la deja
 *   en ACTIVA. Si se queda sin tiempo, sigue en PROGRAMADA y la
 *   siguiente vuelta continúa saltándose lo ya hecho.
 * · En cualquier otro caso no hace nada.
 */
export const ejecutarCampanaProgramada = webMethod(
  Permissions.Admin,
  async () => {
    const t0 = Date.now();
    const quedaTiempo = () => (Date.now() - t0) < PRESUPUESTO_TAREA_MS;
    try {
      const prog = await leerProgramacion();
      if (!prog) return { ok: true, accion: 'sin programación', version: VERSION };

      const estado = String(prog.estado || '').toUpperCase();
      if (estado === 'TERMINADA') return { ok: true, accion: 'terminada', version: VERSION };

      const ahora = new Date();
      const inicio = new Date(prog.inicio);
      const fin = new Date(prog.fin);
      if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
        console.error(`${TAG} ❌ Campaña programada con fechas no válidas`);
        return { ok: false, accion: 'fechas no válidas', version: VERSION };
      }

      // v1.7.0: si hay una campaña en proceso (por ejemplo, lanzada a mano
      // desde el gestor), esta vuelta no hace nada y lo intenta la siguiente.
      if (ahora >= inicio) {
        let vivo = null;
        try {
          vivo = await leerProcesoVivo();
        } catch (eProc) {
          console.warn(`${TAG} ⚠️ No se pudo comprobar el proceso en curso: ${eProc.message}`);
        }
        if (vivo) {
          console.log(`${TAG} 🗓 Tarea: hay una campaña en proceso (${vivo.origen}, ${vivo.fase}); se espera a la siguiente vuelta`);
          return { ok: true, accion: 'proceso en curso', version: VERSION };
        }
      }

      // 1) Fin alcanzado: terminar.
      if (ahora >= fin) {
        let saltar = 0;
        let restaurados = 0;
        let respetados = 0;
        let fallidos = 0;
        let hechos = 0;
        let completo = false;
        const cuenta = await wixData.query(COL_CAMPANA)
          .limit(1)
          .find({ suppressAuth: true });
        const totalFilas = cuenta.totalCount || (cuenta.items || []).length;
        const pctProg = Number(prog.porcentaje) || null;
        try {
          await escribirProceso({ fase: 'terminar', origen: 'programada', hechos: 0, total: totalFilas, porcentaje: pctProg });
          while (quedaTiempo()) {
            const r = await terminarLoteCampanaInterno(LOTE_TAREA, saltar);
            if (!r.procesados) { completo = true; break; }
            restaurados += r.restaurados;
            respetados += r.respetados;
            fallidos += r.errores.length;
            saltar += r.errores.length;
            hechos += r.procesados;
            await escribirProceso({ fase: 'terminar', origen: 'programada', hechos: Math.min(hechos, totalFilas), total: totalFilas, porcentaje: pctProg });
          }
        } finally {
          await borrarProceso();
        }
        await invalidarCacheCorreos('campaña programada: fin');

        if (completo) {
          const resultado = fallidos
            ? `${fallidos} producto(s) no pudieron recuperar su oferta: pulsa TERMINAR CAMPAÑA para reintentarlo.`
            : 'Cada producto ha recuperado la oferta que tenía antes.';
          await guardarResultadoProgramacion(prog, { estado: 'TERMINADA', resultado });
        } else {
          await guardarResultadoProgramacion(prog, { resultado: 'Terminando la campaña. Continúa en la siguiente vuelta.' });
        }
        console.log(`${TAG} 🗓 Tarea: fin de campaña → ${restaurados} restaurados, ${respetados} respetados, ${fallidos} con error, completo=${completo}`);
        return { ok: true, accion: 'terminar', completo, version: VERSION };
      }

      // 2) Inicio alcanzado y aún sin aplicar entera: aplicar.
      if (estado === 'PROGRAMADA' && ahora >= inicio) {
        const pct = porcentajeCampana(prog.porcentaje);
        if (pct === null) {
          await guardarResultadoProgramacion(prog, { resultado: 'El porcentaje programado no es válido. Vuelve a programar la campaña.' });
          return { ok: false, accion: 'porcentaje no válido', version: VERSION };
        }

        const { ids } = await idsCampanaInterno();
        let actualizados = 0;
        let fallidos = 0;
        let i = 0;
        try {
          await escribirProceso({ fase: 'aplicar', origen: 'programada', hechos: 0, total: ids.length, porcentaje: pct });
          for (; i < ids.length && quedaTiempo(); i += LOTE_TAREA) {
            const r = await aplicarLoteCampanaInterno(pct, ids.slice(i, i + LOTE_TAREA));
            actualizados += r.actualizados;
            fallidos += r.errores.length;
            await escribirProceso({ fase: 'aplicar', origen: 'programada', hechos: Math.min(i + LOTE_TAREA, ids.length), total: ids.length, porcentaje: pct });
          }
        } finally {
          await borrarProceso();
        }
        const completo = i >= ids.length;
        await invalidarCacheCorreos('campaña programada: inicio');

        if (completo) {
          const resultado = `Aplicada a ${actualizados} de ${ids.length} productos` + (fallidos ? `; ${fallidos} con error.` : '.');
          await guardarResultadoProgramacion(prog, { estado: 'ACTIVA', resultado });
        } else {
          await guardarResultadoProgramacion(prog, { resultado: `Aplicando: ${Math.min(i, ids.length)} de ${ids.length} productos. Continúa en la siguiente vuelta.` });
        }
        console.log(`${TAG} 🗓 Tarea: inicio de campaña -${pct}% → ${actualizados} de ${ids.length}, ${fallidos} con error, completo=${completo}`);
        return { ok: true, accion: 'aplicar', completo, version: VERSION };
      }

      return { ok: true, accion: 'esperando', version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ ejecutarCampanaProgramada FAIL:`, e.message);
      return { ok: false, error: e.message, version: VERSION };
    }
  }
);

// =====================================================
// 2b. DESCONTAR 1 UNIDAD DE STOCK (v1.1.0)
// =====================================================
// Llamada por el botón 🗑️ DESCONTAR del widget. Resta 1 unidad
// del producto. Si el stock ya estaba en 0 (o trackInventory=false),
// Wix devolverá error.
//
// v1.2.0: FIX error "InventoryId and ProductId can't be both empty".
//   decrementInventory requiere productId (o inventoryId) en el
//   payload, no solo variantId. Pasamos productId + variantId.
// =====================================================
export const descontarUnidadProducto = webMethod(
  Permissions.Anyone,
  async (productId) => {
    try {
      if (!productId) throw new Error('productId es requerido');

      console.log(`${TAG} 🗑️ Descontar 1 unidad del producto: ${productId}`);

      const variantId = await obtenerVariantIdDefault(productId);
      // v1.2.0: variantId opcional. La API requiere productId
      // (o inventoryId). Si conseguimos el variantId lo añadimos
      // para apuntar a la default variant; si no, productId solo.
      const payload = { productId, decrementBy: 1 };
      if (variantId) payload.variantId = variantId;

      console.log(`${TAG} 🗑️ Payload decrementInventory: ${JSON.stringify(payload)}`);

      const elevatedDecrement = elevate(decrementInventory);
      await elevatedDecrement([payload]);

      console.log(`${TAG} ✅ 1 unidad descontada de ${productId}`);

      return {
        ok: true,
        productId,
        variantId: variantId || null,
        decrementBy: 1,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ descontarUnidadProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2c. SETEAR STOCK CONCRETO (v1.1.0)
// =====================================================
// Para alta de lote / corrección manual. El widget envía la
// cantidad nueva total (no el delta). Esta función calcula el
// delta vs el stock actual y aplica increment o decrement según
// el signo.
//
// Nota: Wix no expone un endpoint "set quantity to X" para Velo
// backend (lo tiene la REST API V2 pero requiere auth de app).
// Por eso usamos increment/decrement con el delta calculado.
//
// v1.2.2: SIN CAMBIOS funcionales. Esta función se mantiene para
//   AJUSTAR el stock de productos que YA tienen tracking activo.
//   La activación inicial de tracking + cantidad la hace ahora
//   activarSeguimientoStock en una sola llamada (ver más abajo).
// =====================================================
export const setearStockProducto = webMethod(
  Permissions.Anyone,
  async (productId, nuevaCantidad) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      const objetivo = parseInt(nuevaCantidad, 10);
      if (isNaN(objetivo) || objetivo < 0) {
        throw new Error('nuevaCantidad debe ser un entero >= 0');
      }

      console.log(`${TAG} 📦 Setear stock de ${productId} → ${objetivo}`);

      // Leer variant default + stock actual
      const elevatedGetVariants = elevate(getProductVariants);
      const vResult = await elevatedGetVariants(productId);
      const arr = Array.isArray(vResult) ? vResult : (vResult?.items || []);
      if (!arr.length) {
        return { ok: false, error: 'No se encontraron variantes para el producto' };
      }

      const first = arr[0];
      const variantId = first?._id || first?.id;
      if (!variantId) {
        return { ok: false, error: 'variantId default no encontrado' };
      }

      // Stock actual: en getProductVariants la cantidad vive en
      // variant.inventoryStatus.quantity (Wix V1). Si trackInventory
      // está apagado, la cantidad puede venir como null o 0.
      const stockActual = Number(
        first?.variant?.inventoryStatus?.quantity
        ?? first?.variant?.quantity
        ?? 0
      ) || 0;

      const delta = objetivo - stockActual;
      console.log(`${TAG} 📦 stockActual=${stockActual} objetivo=${objetivo} delta=${delta}`);

      if (delta === 0) {
        return { ok: true, productId, variantId, stockActual, nuevaCantidad: objetivo, noChange: true, version: VERSION };
      }

      if (delta > 0) {
        const elevatedIncrement = elevate(incrementInventory);
        const payloadInc = { productId, incrementBy: delta };
        if (variantId) payloadInc.variantId = variantId;
        console.log(`${TAG} 📦 Payload incrementInventory: ${JSON.stringify(payloadInc)}`);
        await elevatedIncrement([payloadInc]);
      } else {
        const elevatedDecrement = elevate(decrementInventory);
        const payloadDec = { productId, decrementBy: -delta };
        if (variantId) payloadDec.variantId = variantId;
        console.log(`${TAG} 📦 Payload decrementInventory: ${JSON.stringify(payloadDec)}`);
        await elevatedDecrement([payloadDec]);
      }

      console.log(`${TAG} ✅ Stock actualizado: ${productId} → ${objetivo}`);

      return {
        ok: true,
        productId,
        variantId,
        stockAnterior: stockActual,
        nuevaCantidad: objetivo,
        delta,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ setearStockProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2d. ACTIVAR / DESACTIVAR SEGUIMIENTO DE STOCK (v1.2.2)
// =====================================================
// Activa o desactiva el `trackQuantity` del producto sin salir del
// editor de KAMISUITE. Usa updateInventoryVariantFieldsByProductId,
// la API documentada de wix-stores-backend para tocar el inventario
// por productId.
//
// FIRMA REAL DEL OBJETO (confirmada en el editor de Velo):
//   updateInventoryVariantFieldsByProductId(productId, {
//     trackQuantity: boolean,
//     variants: [{ variantId, quantity, inStock }]
//   })
//   · quantity (number)  → cantidad real de la variante.
//   · inStock (boolean)  → disponibilidad simple. Solo se usa
//                          cuando trackQuantity=false. Cuando
//                          trackQuantity=true, inStock se deriva
//                          de quantity (tooltip oficial Velo).
//
// REGLA WIX (vista en log producción 24-jun):
//   trackQuantity=true EXIGE quantity > 0. Si no se manda, Wix
//   rechaza: "quantity must be provided and greater than 0 when
//   inventory being tracked".
//
// COMPORTAMIENTO v1.2.2:
//   · activar=true  + cantidad>0  → trackQuantity:true,
//        variants:[{variantId, quantity:<cantidad>}]
//   · activar=true  + sin cantidad/0 → quantity:1 por defecto
//        (mínimo técnico: Wix no acepta 0 con tracking activo).
//   · activar=false → trackQuantity:false,
//        variants:[{variantId, inStock:true}]
//
// Esto activa tracking Y fija el stock en UNA sola llamada,
// eliminando el encadenamiento frágil "activar → setear stock"
// que rompía en producción (efecto dominó del BUG 4).
// =====================================================
export const activarSeguimientoStock = webMethod(
  Permissions.Anyone,
  async (productId, activar, cantidad) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      const track = !!activar;

      console.log(`${TAG} 🎚️ Cambiar seguimiento de stock de ${productId} → ${track} (cantidad recibida: ${cantidad})`);

      // Obtener variant default para componer el payload de la API.
      // updateInventoryVariantFieldsByProductId requiere identificar
      // al menos una variante.
      const variantId = await obtenerVariantIdDefault(productId);

      const inventoryInfo = { trackQuantity: track };

      if (track) {
        // Tracking ON → Wix EXIGE quantity > 0.
        // Si el usuario no indicó cantidad (o indicó 0), aplicamos
        // el mínimo técnico de 1 unidad para que Wix acepte activar
        // el contador. El usuario podrá ajustar después.
        let qty = parseInt(cantidad, 10);
        if (isNaN(qty) || qty < 1) {
          qty = 1;
          console.log(`${TAG} 🎚️ Sin cantidad válida → quantity:1 por defecto (mínimo técnico Wix)`);
        }
        const variantEntry = { quantity: qty };
        if (variantId) variantEntry.variantId = variantId;
        inventoryInfo.variants = [variantEntry];
      } else {
        // Tracking OFF → modo disponibilidad simple (inStock).
        const variantEntry = { inStock: true };
        if (variantId) variantEntry.variantId = variantId;
        inventoryInfo.variants = [variantEntry];
      }

      console.log(`${TAG} 🎚️ Payload updateInventoryVariantFieldsByProductId:`, JSON.stringify(inventoryInfo));

      const elevatedUpdate = elevate(updateInventoryVariantFieldsByProductId);
      await elevatedUpdate(productId, inventoryInfo);

      console.log(`${TAG} ✅ Seguimiento de stock para ${productId} ahora: ${track}`);

      return {
        ok: true,
        productId,
        trackInventory: track,
        quantityAplicada: track ? (inventoryInfo.variants[0].quantity ?? null) : null,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ activarSeguimientoStock FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2e. SETEAR COSTE DEL PRODUCTO (v1.2.4)
// =====================================================
// El coste (costAndProfitData.itemCost) NO se puede escribir con
// updateProductFields (no está en su UpdateProductInfo). En V1, con
// productos que tienen variantes (manageVariants), el coste vive en
// CADA variante. Se escribe con updateVariantData(productId, choices,
// variantInfo), donde variantInfo lleva costAndProfitData.itemCost.
//
// Estrategia: leer las variantes con getProductVariants (devuelve
// cada variante con sus `choices`), y por cada una escribir el coste
// con updateVariantData usando esas mismas choices.
//
// Confirmado: campo costAndProfitData.itemCost (Wix V1, por variante).
// =====================================================
export const setearCosteProducto = webMethod(
  Permissions.Anyone,
  async (productId, coste) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      const valor = parseFloat(coste);
      if (isNaN(valor) || valor < 0) {
        throw new Error('coste debe ser un número >= 0');
      }

      console.log(`${TAG} 💰 Setear coste de ${productId} → ${valor}`);

      // Leer todas las variantes (cada una con sus choices)
      const elevatedGetVariants = elevate(getProductVariants);
      const vResult = await elevatedGetVariants(productId);
      const arr = Array.isArray(vResult) ? vResult : (vResult?.items || []);
      if (!arr.length) {
        return { ok: false, error: 'No se encontraron variantes para el producto' };
      }

      console.log(`${TAG} 💰 ${arr.length} variante(s) a actualizar con coste ${valor}`);
      console.log(`${TAG} 💰 sample variant estructura: ${JSON.stringify(arr[0]).substring(0, 400)}`);

      const elevatedUpdateVariant = elevate(wixStoresBackend.updateVariantData);
      let updated = 0;
      const errores = [];

      // v1.2.6: la firma real es updateVariantData(productId,
      // variantInfo: VariantInfo[]) — el 2º argumento ES el array
      // directamente, NO un objeto {variants:[...]} (eso daba
      // "Expected an array for field variants"). Cada entrada lleva
      // las choices de la variante + costAndProfitData.itemCost.
      const variantsPayload = arr.map(v => ({
        choices: v?.choices || {},
        costAndProfitData: { itemCost: valor }
      }));

      console.log(`${TAG} 💰 Payload updateVariantData (array): ${JSON.stringify(variantsPayload)}`);

      try {
        await elevatedUpdateVariant(productId, variantsPayload);
        updated = variantsPayload.length;
      } catch (vErr) {
        console.warn(`${TAG} ⚠️ updateVariantData falló:`, vErr.message);
        errores.push(vErr.message);
      }

      if (updated === 0) {
        return { ok: false, error: 'No se pudo actualizar el coste en ninguna variante: ' + (errores[0] || 'desconocido') };
      }

      console.log(`${TAG} ✅ Coste ${valor} aplicado a ${updated}/${arr.length} variante(s) de ${productId}`);

      return {
        ok: true,
        productId,
        coste: valor,
        variantesActualizadas: updated,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ setearCosteProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 3. SUBIR Y ASIGNAR IMAGEN (reemplaza todas)
// =====================================================
export const subirYAsignarImagenProducto = webMethod(
  Permissions.Anyone,
  async (productId, base64Data, fileName) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      if (!base64Data) throw new Error('base64Data es requerido');

      console.log(`${TAG} 📷 Subiendo imagen (reemplazo) para producto ${productId}`);

      const mimeType = detectMimeType(base64Data, fileName);
      console.log(`${TAG} 📷 MIME detectado: ${mimeType}`);

      let cleanBase64 = base64Data;
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
      }

      const buffer = Buffer.from(cleanBase64, 'base64');
      const safeName = (fileName || `producto_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');

      const elevatedUpload = elevate(mediaManager.upload);
      const uploadResult = await elevatedUpload(
        '/kamisuite/productos',
        buffer,
        safeName,
        {
          mediaOptions: { mimeType: mimeType, mediaType: 'image' },
          metadataOptions: { isPrivate: false, isVisitorUpload: false }
        }
      );

      const fileUrl = uploadResult?.fileUrl;
      if (!fileUrl) throw new Error('Upload devolvió sin fileUrl');

      console.log(`${TAG} ✅ Imagen subida: ${fileUrl.substring(0, 60)}...`);

      try {
        const elevatedRemove = elevate(wixStoresBackend.removeProductMedia);
        await elevatedRemove(productId);
      } catch (removeErr) {
        console.warn(`${TAG} ⚠️ removeProductMedia falló:`, removeErr.message);
      }

      const elevatedAdd = elevate(wixStoresBackend.addProductMedia);
      await elevatedAdd(productId, [{ src: fileUrl }]);

      console.log(`${TAG} ✅ Imagen asignada al producto ${productId}`);

      return { ok: true, productId, fileUrl, version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ subirYAsignarImagenProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 3b. AGREGAR IMÁGENES (multi-imagen)
// =====================================================
export const agregarImagenesProducto = webMethod(
  Permissions.Anyone,
  async (productId, images) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      if (!Array.isArray(images) || images.length === 0) {
        throw new Error('images[] es requerido (al menos una imagen)');
      }

      console.log(`${TAG} 📷 Subiendo ${images.length} imagen(es) para producto ${productId}`);

      const uploadedSrcs = [];

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img.base64) continue;

        const mimeType = detectMimeType(img.base64, img.fileName);
        console.log(`${TAG} 📷 Imagen ${i + 1}: ${img.fileName || 'sin nombre'} → ${mimeType}`);

        let cleanBase64 = img.base64;
        if (cleanBase64.includes(',')) {
          cleanBase64 = cleanBase64.split(',')[1];
        }

        const buffer = Buffer.from(cleanBase64, 'base64');
        const safeName = (img.fileName || `producto_${Date.now()}_${i}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');

        const elevatedUpload = elevate(mediaManager.upload);
        const uploadResult = await elevatedUpload(
          '/kamisuite/productos',
          buffer,
          safeName,
          {
            mediaOptions: { mimeType: mimeType, mediaType: 'image' },
            metadataOptions: { isPrivate: false, isVisitorUpload: false }
          }
        );

        if (uploadResult?.fileUrl) {
          uploadedSrcs.push({ src: uploadResult.fileUrl });
          console.log(`${TAG} ✅ Imagen ${i + 1}/${images.length} subida`);
        } else {
          console.warn(`${TAG} ⚠️ Imagen ${i + 1} sin fileUrl`);
        }
      }

      if (uploadedSrcs.length === 0) {
        throw new Error('Ninguna imagen se pudo subir');
      }

      const elevatedAdd = elevate(wixStoresBackend.addProductMedia);
      await elevatedAdd(productId, uploadedSrcs);

      console.log(`${TAG} ✅ ${uploadedSrcs.length} imagen(es) asignadas al producto ${productId}`);

      return {
        ok: true,
        productId,
        count: uploadedSrcs.length,
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ agregarImagenesProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 3c. ELIMINAR IMÁGENES ESPECÍFICAS
// =====================================================
// v1.0.4: Usa storesProducts.removeProductMedia de
//   wix-stores.v2 con mediaIds como strings.
//   wix-stores-backend.removeProductMedia no aceptaba
//   [{src}] para borrado selectivo (error vacío).
//   El mediaId se extrae del wix:image URL con
//   extractMediaId().
// =====================================================
export const eliminarImagenesProducto = webMethod(
  Permissions.Anyone,
  async (productId, srcs) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      if (!Array.isArray(srcs) || srcs.length === 0) {
        throw new Error('srcs[] es requerido');
      }

      console.log(`${TAG} 🗑️ Eliminando ${srcs.length} imagen(es) del producto ${productId}`);

      // v1.0.4: extraer mediaIds del wix:image URL
      const mediaIds = srcs
        .filter(Boolean)
        .map(src => extractMediaId(src))
        .filter(Boolean);

      console.log(`${TAG} 🗑️ mediaIds: ${mediaIds.join(', ')}`);

      // v1.0.4: usar wix-stores.v2 en vez de wix-stores-backend
      const elevatedRemove = elevate(storesProducts.removeProductMedia);
      await elevatedRemove(productId, mediaIds);

      console.log(`${TAG} ✅ ${mediaIds.length} imagen(es) eliminadas del producto ${productId}`);

      return {
        ok: true,
        productId,
        removed: mediaIds.length,
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ eliminarImagenesProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 4. CREAR PRODUCTO NUEVO
// =====================================================
export const crearProductoNuevo = webMethod(
  Permissions.Anyone,
  async (info) => {
    try {
      if (!info?.name || !String(info.name).trim()) throw new Error('name es requerido');

      console.log(`${TAG} ➕ Creando producto: ${info.name}`);

      const productInfo = {
        name: String(info.name).trim(),
        productType: info.productType || 'physical',
        price: parseFloat(info.price) || 0,
        visible: info.visible !== false
      };

      const brand = String(info.brand || '').trim();
      if (brand) productInfo.brand = brand;

      const sku = String(info.sku || '').trim();
      if (sku) productInfo.sku = sku;

      const ribbon = String(info.ribbon || '').trim();
      if (ribbon) productInfo.ribbon = ribbon;

      const description = String(info.description || '').trim();
      if (description) productInfo.description = description;

      if (info.cost !== undefined && info.cost !== null && info.cost !== '') {
        productInfo.costAndProfitData = {
          itemCost: parseFloat(info.cost) || 0
        };
      }

      console.log(`${TAG} ➕ productInfo keys: ${Object.keys(productInfo).join(', ')}`);

      const elevatedCreate = elevate(wixStoresBackend.createProduct);
      const result = await elevatedCreate(productInfo);

      const newId = result?._id || result?.id || null;
      console.log(`${TAG} ✅ Producto creado: ${newId} — ${info.name}`);

      // v1.2.7: SECCIONES DE INFORMACIÓN ADICIONAL.
      // createProduct (V1) no las acepta en productInfo — antes se
      // perdían aquí sin aviso. Se escriben inmediatamente después,
      // sobre el producto ya creado, con la vía v2. Mismo criterio que
      // el coste, las imágenes, el stock y las categorías, que también
      // se aplican después de crear.
      let infoAdicional = null;
      if (newId && Array.isArray(info.additionalInfoSections)) {
        infoAdicional = await escribirInfoAdicional(newId, info.additionalInfoSections);
      }

      return { ok: true, productId: newId, product: result, infoAdicional, version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ crearProductoNuevo FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 5. ELIMINAR PRODUCTO
// =====================================================
// =====================================================
// 11b. DUPLICAR PRODUCTO (v1.3.0)
// =====================================================
// Lee el original de la collection Stores/Products (misma fuente que
// el listado del editor, así se copia exactamente lo que el salón ve)
// y monta un producto nuevo con esos datos.
//
// Devuelve el id de la copia para que el editor abra su ficha.
// =====================================================
export const duplicarProducto = webMethod(
  Permissions.Anyone,
  async (productId) => {
    try {
      if (!productId) throw new Error('productId es requerido');

      console.log(`${TAG} ⧉ Duplicando producto: ${productId}`);

      // 1) Leer el original. includeHiddenProducts para poder duplicar
      //    también un producto que esté oculto.
      const res = await wixData.query('Stores/Products')
        .eq('_id', productId)
        .limit(1)
        .find({
          suppressAuth: true,
          appOptions: { includeHiddenProducts: true }
        });

      const orig = (res.items || [])[0];
      if (!orig) throw new Error('Producto original no encontrado');

      // 2) Crear la copia. Oculta y sin SKU (ver cabecera v1.3.0).
      // Wix rechaza nombres de más de 80 caracteres. Si al añadir el
      // sufijo se pasa, se recorta el nombre original lo justo.
      const SUFIJO_COPIA = ' (copia)';
      const MAX_NOMBRE = 80;
      let nombreBase = String(orig.name || 'Producto').trim();
      if (nombreBase.length + SUFIJO_COPIA.length > MAX_NOMBRE) {
        nombreBase = nombreBase.slice(0, MAX_NOMBRE - SUFIJO_COPIA.length).trim();
        console.log(`${TAG} ⧉ Nombre recortado para que quepa el sufijo de copia`);
      }

      // Visibilidad del original. La collection no la expone, así que
      // se lee del Product object real (misma vía que el coste).
      let visibleOriginal = true;
      try {
        const elevatedGetProduct = elevate(storesProducts.getProduct);
        const prodReal = await elevatedGetProduct(productId);
        const objeto = prodReal?.product || prodReal;
        if (objeto && typeof objeto.visible === 'boolean') {
          visibleOriginal = objeto.visible;
        }
        console.log(`${TAG} ⧉ Visibilidad heredada del original: ${visibleOriginal}`);
      } catch (visErr) {
        console.warn(`${TAG} ⚠️ No se pudo leer la visibilidad del original, la copia nace visible:`, visErr.message);
      }

      const productInfo = {
        name: nombreBase + SUFIJO_COPIA,
        productType: orig.productType || 'physical',
        price: parseFloat(orig.price) || 0,
        visible: visibleOriginal
      };

      const brand = String(orig.brand || '').trim();
      if (brand) productInfo.brand = brand;

      const ribbon = String(orig.ribbon || '').trim();
      if (ribbon) productInfo.ribbon = ribbon;

      const description = String(orig.description || '').trim();
      if (description) productInfo.description = description;

      const elevatedCreate = elevate(wixStoresBackend.createProduct);
      const creado = await elevatedCreate(productInfo);

      const newId = creado?._id || creado?.id || null;
      if (!newId) throw new Error('La copia se creó sin id');

      console.log(`${TAG} ⧉ Copia creada: ${newId} — ${productInfo.name}`);

      const avisos = [];

      // 3) Bloques de información adicional
      let infoAdicional = null;
      if (Array.isArray(orig.additionalInfoSections)) {
        infoAdicional = await escribirInfoAdicional(newId, orig.additionalInfoSections);
        if (infoAdicional && !infoAdicional.ok) avisos.push('info adicional: ' + infoAdicional.error);
      }

      // 4) Fotos: se reutilizan las del original, sin volver a subirlas.
      let fotos = 0;
      try {
        const srcs = (Array.isArray(orig.mediaItems) ? orig.mediaItems : [])
          .map(m => ({ src: m.src || m.url || '' }))
          .filter(m => m.src);

        if (srcs.length > 0) {
          const elevatedAddMedia = elevate(wixStoresBackend.addProductMedia);
          await elevatedAddMedia(newId, srcs);
          fotos = srcs.length;
          console.log(`${TAG} ⧉ ${fotos} foto(s) reutilizadas del original`);
        }
      } catch (mediaErr) {
        console.warn(`${TAG} ⚠️ Fotos no copiadas:`, mediaErr.message);
        avisos.push('fotos: ' + mediaErr.message);
      }

      // 5) Categorías. Se omite la general de Wix: los productos entran
      //    en ella solos y asignarla a mano da error.
      let categorias = 0;
      try {
        const colIds = (Array.isArray(orig.collections) ? orig.collections : [])
          .filter(c => c && c._id && !esCollectionGeneral(c.name))
          .map(c => c._id);

        for (const colId of colIds) {
          try {
            const elevatedAddCol = elevate(wixStoresBackend.addProductsToCollection);
            await elevatedAddCol(colId, [newId]);
            categorias++;
          } catch (colErr) {
            console.warn(`${TAG} ⚠️ Categoría ${colId} no asignada:`, colErr.message);
            avisos.push('categoría ' + colId + ': ' + colErr.message);
          }
        }
        console.log(`${TAG} ⧉ ${categorias} categoría(s) asignadas a la copia`);
      } catch (catErr) {
        console.warn(`${TAG} ⚠️ Categorías no copiadas:`, catErr.message);
        avisos.push('categorías: ' + catErr.message);
      }

      // 6) Contador de unidades. Wix exige mínimo 1 al activarlo.
      let stockAvisado = false;
      try {
        if (orig.trackInventory === true) {
          const variantId = await obtenerVariantIdDefault(newId);
          const inventoryInfo = { trackQuantity: true, variants: [{ quantity: 1 }] };
          if (variantId) inventoryInfo.variants[0].variantId = variantId;

          const elevatedInv = elevate(updateInventoryVariantFieldsByProductId);
          await elevatedInv(newId, inventoryInfo);
          stockAvisado = true;
          console.log(`${TAG} ⧉ Contador de unidades activado en la copia con 1 unidad`);
        }
      } catch (invErr) {
        console.warn(`${TAG} ⚠️ Contador de unidades no aplicado:`, invErr.message);
        avisos.push('stock: ' + invErr.message);
      }

      return {
        ok: true,
        productId: newId,
        origenId: productId,
        nombre: productInfo.name,
        fotos,
        categorias,
        stockEnUno: stockAvisado,
        avisos: avisos.length > 0 ? avisos : undefined,
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ duplicarProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

export const eliminarProducto = webMethod(
  Permissions.Anyone,
  async (productId) => {
    try {
      if (!productId) throw new Error('productId es requerido');

      console.log(`${TAG} 🗑️ Eliminando producto: ${productId}`);

      const elevatedDelete = elevate(wixStoresBackend.deleteProduct);
      await elevatedDelete(productId);

      console.log(`${TAG} ✅ Producto eliminado: ${productId}`);

      return { ok: true, productId, version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ eliminarProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 6. CREAR CATEGORÍA
// =====================================================
export const crearCategoriaNueva = webMethod(
  Permissions.Anyone,
  async (nombre) => {
    try {
      if (!nombre || !String(nombre).trim()) throw new Error('nombre es requerido');

      const nombreLimpio = String(nombre).trim();
      console.log(`${TAG} 📂 Creando categoría: ${nombreLimpio}`);

      const existente = await wixData.query("Stores/Collections")
        .eq('name', nombreLimpio)
        .limit(1)
        .find({ suppressAuth: true });

      if ((existente.items || []).length > 0) {
        const col = existente.items[0];
        console.log(`${TAG} ℹ️ Categoría ya existe: ${col._id} — ${col.name}`);
        return { ok: true, yaExistia: true, collectionId: col._id, name: col.name };
      }

      const elevatedCreateCollection = elevate(storesProducts.createCollection);
      const result = await elevatedCreateCollection({ name: nombreLimpio });

      const newCol = result?.collection || result;
      const colId = newCol?._id || newCol?.id || null;

      console.log(`${TAG} ✅ Categoría creada: ${colId} — ${nombreLimpio}`);

      return { ok: true, collectionId: colId, name: nombreLimpio, version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ crearCategoriaNueva FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 7. CAMBIAR CATEGORÍAS
// =====================================================
export const cambiarCategoriasProducto = webMethod(
  Permissions.Anyone,
  async (productId, addIds, removeIds) => {
    try {
      if (!productId) throw new Error('productId es requerido');

      const adds = Array.isArray(addIds) ? addIds.filter(Boolean) : [];
      const removes = Array.isArray(removeIds) ? removeIds.filter(Boolean) : [];

      console.log(`${TAG} 🏷️ Categorías producto ${productId}: +${adds.length} -${removes.length}`);

      const errores = [];

      for (const colId of adds) {
        try {
          const elevatedAdd = elevate(wixStoresBackend.addProductsToCollection);
          await elevatedAdd(colId, [productId]);
          console.log(`${TAG} ✅ Añadido a colección ${colId}`);
        } catch (addErr) {
          console.warn(`${TAG} ⚠️ Error añadiendo a ${colId}:`, addErr.message);
          errores.push(`add:${colId}:${addErr.message}`);
        }
      }

      for (const colId of removes) {
        try {
          const elevatedRemove = elevate(wixStoresBackend.removeProductsFromCollection);
          await elevatedRemove(colId, [productId]);
          console.log(`${TAG} ✅ Quitado de colección ${colId}`);
        } catch (remErr) {
          console.warn(`${TAG} ⚠️ Error quitando de ${colId}:`, remErr.message);
          errores.push(`remove:${colId}:${remErr.message}`);
        }
      }

      return {
        ok: errores.length === 0,
        productId,
        added: adds.length,
        removed: removes.length,
        errores: errores.length > 0 ? errores : undefined,
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ cambiarCategoriasProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);
