// =====================================================
// PAGE CODE — Página Promociones KAMISUITE
// Conecta widget promo_widget_v1.html con CMS PromoColor
// ─────────────────────────────────────────────────────
// CAMBIOS v1.1:
// - FIX: Casting explícito de isActive a boolean (=== true)
//   Evita que valores falsy/undefined pasen al CMS como no-boolean.
// - ADD: Log de diagnóstico de isActive antes de guardar.
// =====================================================

import wixData from 'wix-data';

const COLECCION = 'PromoColor';

$w.onReady(function () {
  const widget = $w('#htmlPromo'); // ID del HTML iframe en la página

  widget.onMessage((event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {

      case 'cargarPromos':
        cargarPromos(widget);
        break;

      case 'guardarPromo':
        guardarPromo(widget, msg.data.promo);
        break;

      case 'crearPromo':
        crearPromo(widget, msg.data.promo);
        break;
    }
  });

  // Carga inicial
  cargarPromos(widget);
});

// ═══ CARGAR PROMOS ═══
async function cargarPromos(widget) {
  try {
    const result = await wixData.query(COLECCION)
      .limit(50)
      .find({ suppressAuth: true });

    const promos = result.items || [];
    console.log(`[Promo Page] Promos cargadas: ${promos.length}`);

    widget.postMessage({
      type: 'promosLoaded',
      data: { promos }
    });

  } catch (err) {
    console.error('[Promo Page] Error cargando promos:', err);
    widget.postMessage({
      type: 'error',
      data: { message: 'Error cargando promociones: ' + err.message }
    });
  }
}

// ═══ GUARDAR PROMO ═══
async function guardarPromo(widget, promo) {
  try {
    if (!promo._id) {
      throw new Error('Promo sin _id, no se puede actualizar');
    }

    // Leer el registro actual para no perder campos
    const actual = await wixData.get(COLECCION, promo._id, { suppressAuth: true });

    // Actualizar solo los campos editables
    actual.colorName = promo.colorName;
    actual.discountPercent = promo.discountPercent;
    actual.discountAmount = promo.discountAmount;

    // ─────────────────────────────────────────────────────────
    // v1.1 FIX: Casting explícito a boolean
    // postMessage puede serializar false como undefined/null.
    // Forzamos comparación estricta para garantizar boolean real.
    // ─────────────────────────────────────────────────────────
    actual.isActive = promo.isActive === true;
    console.log(`[Promo Page] isActive que se va a guardar:`, actual.isActive, typeof actual.isActive);

    // Campos idActivo* dinámicos — también casting explícito
    for (const key of Object.keys(promo)) {
      if (key.startsWith('idActivo')) {
        actual[key] = promo[key] === true;
      }
    }

    await wixData.update(COLECCION, actual, { suppressAuth: true });
    console.log(`[Promo Page] Promo guardada: ${actual.colorName} | isActive=${actual.isActive}`);

    widget.postMessage({ type: 'promoGuardada', data: {} });

  } catch (err) {
    console.error('[Promo Page] Error guardando promo:', err);
    widget.postMessage({
      type: 'error',
      data: { message: 'Error guardando: ' + err.message }
    });
  }
}

// ═══ CREAR PROMO ═══
async function crearPromo(widget, promo) {
  try {
    // Quitar _id si existe para que Wix genere uno nuevo
    delete promo._id;

    const inserted = await wixData.insert(COLECCION, promo, { suppressAuth: true });
    console.log(`[Promo Page] Promo creada: ${inserted._id}`);

    widget.postMessage({ type: 'promoCreada', data: {} });

  } catch (err) {
    console.error('[Promo Page] Error creando promo:', err);
    widget.postMessage({
      type: 'error',
      data: { message: 'Error creando: ' + err.message }
    });
  }
}