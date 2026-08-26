// =====================================================
// KAMISUITE — Page Code: /reservar/{slug}
// =====================================================
// VERSION: 0.3.6
// FECHA: 26 de agosto de 2026
//
// v0.3.6:
//   + IMAGENES REDIMENSIONADAS EN ORIGEN (rendimiento en movil 4G).
//     Hasta v0.3.5 el page code convertia `wix:image://` a la URL HTTPS
//     desnuda del ORIGINAL. El widget pinta esa imagen en tarjetas de
//     240-380 px (grid, ratio 4/3) y en la miniatura de cabecera (96x96),
//     asi que el navegador bajaba ~1122 px para pintar 240 y recortaba en
//     cliente. Medido en Hair-Times el 26-ago-2026: original 146 kB,
//     version 400x300 servida por Wix 17 kB. Con 12 servicios en una
//     categoria eso son ~1,75 MB frente a ~0,4 MB.
//     Nuevo helper `wixImageResized(url, w, h)` que construye la URL de
//     transformacion de static.wixstatic.com. Se anaden DOS propiedades
//     nuevas a cada servicio del config:
//       · `imageCard` → 600x450 (4:3, el ratio exacto de .kr-svc-card__img)
//       · `imageSq`   → 192x192 (1:1, el ratio exacto de .kr-svc-header__img)
//     Ambas usan `fill` + `al_c`, que reproduce exactamente el recorte que
//     el navegador ya hacia con `object-fit:cover` sin `object-position`
//     (default 50% 50%). Resultado visual identico al actual.
//     `image` se CONSERVA intacta: el bundle v2.0.21 la usa como respaldo
//     si alguna transformacion fallara.
//     La imagen de la CATEGORIA no se toca. La consume el elemento nativo
//     #cabeceraImage de la pagina (hero a tamano grande), donde bajar
//     resolucion si se notaria.
//     Cambio quirurgico: un helper nuevo, dos constantes y un bloque
//     aditivo en montarCustomElement. Cero cambios en los handlers
//     ('pedir-huecos', 'reservar', 'navigate-back'), en imports, en
//     `wixImageToHttps` ni en `resolverImagenesEnObjeto`.
//   ~ TAG corregido: en v0.3.5 la constante seguia diciendo v0.3.4
//     mientras la cabecera decia 0.3.5. Ahora ambas dicen 0.3.6.
//
// v0.3.5:
//   + Reenvía el SEGUNDO PROFESIONAL para los complementos, en los dos
//     handlers. Este page code pasa los campos por lista blanca explícita,
//     así que sin estas líneas el dato muere aquí y no llega al backend.
//       · 'pedir-huecos' → `proExtraId` y `principalSetupUid`
//         (getHuecosDisponibles v0.9.0 los necesita para partir la cita en
//          dos tramos y calcular el punto de corte desde el mapeoFases).
//       · 'reservar'     → `staffExtraId`
//         (crearReservaPublica v0.9.0 estampa staffId en las fases del
//          tramo posterior tras crear la reserva; el motor de packs
//          compartido NO se modifica).
//     Bundle pareja: kamisuite-widget-bundle v2.0.17. Con los campos
//     vacíos, comportamiento v0.3.4 byte a byte. Cambio quirúrgico: tres
//     propiedades añadidas a los objetos ya existentes. Cero cambios en el
//     resto de los handlers, en 'navigate-back', en imports ni en helpers.
//     Se CONSERVAN `varianteSel` (v0.3.3), `durationMin` (v0.3.4) e
//     `idStaffPermitidos` (v0.3.2).
//
// v0.3.4:
//   + Reenvía `durationMin` (duración total de la cita) desde el evento
//     'reservar' del widget al backend crearReservaPublica. El backend
//     v0.7.9 lo usa para resolver 'Cualquiera' comprobando que el
//     profesional esté libre en el bloque continuo COMPLETO que
//     getHuecosDisponibles ya validó (máxima seguridad; el PROCESO no se
//     libera al público en el arranque de V2). Sin este campo, el backend
//     cae a la duración base del principal (riesgo de solape en cascadas
//     con complementos). Cambio quirúrgico: UNA propiedad añadida al
//     objeto pasado a crearReservaPublica. Cero cambios en el resto del
//     handler ni en imports, ni en los otros handlers ('pedir-huecos',
//     'navigate-back'), ni en helpers. Se CONSERVA `varianteSel` de v0.3.3.
//
// v0.3.3:
//   + Reenvía `varianteSel` desde el evento 'reservar' del widget al
//     backend crearReservaPublica. Requerido para el soporte de variantes
//     del servicio PRINCIPAL en el widget público (kamisuite-widget-bundle
//     v2.0.14, widgetPublicoLogic v0.7.5). Sin esta línea, la variante
//     elegida se pierde en el page code y el backend crea la reserva con
//     el precio/duración base del servicio. Cambio quirúrgico: UNA
//     propiedad añadida al objeto pasado a crearReservaPublica. Cero
//     cambios en el resto del handler ni en imports, ni en los otros
//     handlers ('pedir-huecos', 'navigate-back'), ni en helpers.
//
// v0.3.2:
//   + Reenvía `idStaffPermitidos` desde el evento 'pedir-huecos' del
//     widget al backend getHuecosDisponibles. Requerido por filtro de
//     staff por servicio (widgetPublicoLogic v0.6.0).
//
// v0.3.1: fix race condition listeners ANTES de setAttribute(data-config).
// v0.3.0: resolución wix:image:// → HTTPS.
// v0.2.0: Custom Element nativo.
//   El widget se registra en Wix como Custom Element apuntando al JS
//   subido en el menú "Custom Elements". Comunicación directa vía
//   `setAttribute('data-config', JSON.stringify(...))` para pasar datos
//   complejos y `.on('eventName', handler)` para recibir acciones del
//   widget (reservar, pedir-huecos, navigate-back).
//   Quita: handshake, bucle init, complejidad postMessage.
//
// v0.1.0: patrón iframe + postMessage (descartado a petición de Jal).
//
// SUPUESTOS WIX STUDIO:
//   - Página dinámica conectada al dataset de HairSalonServices, o
//     página estática que lee slug desde wixLocation.path.
//   - Un Custom Element en la página con id #widgetReserva apuntando al
//     archivo JS subido (kr-widget.js v2.0) y tag name `kami-reserva`.
//   - Cabecera (imagen + título + descripción) puede pintarse con
//     elementos Wix conectados al dataset (la maneja el dataset) o
//     dentro del widget (la maneja el widget recibiendo `categoria`
//     en el data-config). Este page code soporta ambos: si existen los
//     $w('#cabeceraXxx') los rellena; si no, deja que el widget pinte.
// =====================================================

import wixLocation from 'wix-location';
import { currentMember } from 'wix-members-frontend';
import {
  getServiciosCategoria,
  getProfesionalesPublicos,
  getSalonConfig,
  getHuecosDisponibles,
  crearReservaPublica
} from 'backend/widgetPublicoLogic.web';

const TAG = '[ReservarPage][v0.3.6]';

// v0.3.6 — Tamanos de las variantes redimensionadas de la imagen de servicio.
// Se corresponden con lo que el bundle pinta realmente:
//   · .kr-svc-card__img   → grid minmax(240px,1fr) con aspect-ratio 4/3.
//     600x450 cubre pantallas de densidad 2x sin verse blando.
//   · .kr-svc-header__img → 96x96 fijos. 192 es el doble, para 2x.
const IMG_CARD_W = 600;
const IMG_CARD_H = 450;
const IMG_SQ     = 192;

// Estado de la página
let ctx = {
  slug: '',
  categoria: null,
  servicios: [],
  profesionales: [],
  salonConfig: null,
  memberInfo: null
};

$w.onReady(async () => {
  console.log(`${TAG} 🚀 init`);

  // 1) Slug desde URL
  ctx.slug = (wixLocation.path?.[0] || '').trim();
  if (!ctx.slug) {
    console.warn(`${TAG} ⚠️ No hay slug en la URL`);
    mostrarError('No se ha detectado la categoría.');
    return;
  }
  console.log(`${TAG} 📍 slug=${ctx.slug}`);

  // 2) Miembro logueado (no bloquea si no hay)
  ctx.memberInfo = await leerMiembroLogueado();
  if (ctx.memberInfo) {
    console.log(`${TAG} 👤 miembro logueado: ${ctx.memberInfo.firstName} (${ctx.memberInfo.contactId?.substring(0,8)}…)`);
  }

  // 3) Cargar catálogo + profesionales + salonConfig en paralelo
  try {
    const [resServicios, resPros, resConfig] = await Promise.all([
      getServiciosCategoria({ slug: ctx.slug }),
      getProfesionalesPublicos(),
      getSalonConfig()
    ]);

    if (!resServicios?.ok) {
      mostrarError(resServicios?.error?.message || 'No se ha podido cargar la categoría.');
      return;
    }
    ctx.categoria = resServicios.categoria;
    ctx.servicios = resServicios.servicios || [];
    ctx.profesionales = resPros?.profesionales || [];
    ctx.salonConfig = resConfig?.config || { widgetSkin: 'niebla', salonName: '' };

    console.log(`${TAG} ✅ ${ctx.servicios.length} servicios | ${ctx.profesionales.length} pros | skin=${ctx.salonConfig.widgetSkin}`);

    if (ctx.servicios.length === 0) {
      mostrarError('Esta categoría no tiene servicios disponibles ahora mismo.');
      return;
    }
  } catch (e) {
    console.error(`${TAG} ❌ carga datos:`, e.message);
    mostrarError('Error al cargar la página. Inténtalo más tarde.');
    return;
  }

  // 4) Cabecera nativa (si existe en la página, opcional)
  pintarCabeceraNativaSiExiste();

  // 5) Montar custom element
  montarCustomElement();
});

// =====================================================
// MIEMBRO LOGUEADO (idéntico patrón a V1)
// =====================================================
async function leerMiembroLogueado() {
  try {
    const member = await currentMember.getMember();
    if (!member?.contactId) return null;
    const cd = member.contactDetails || {};
    const firstPhone = (Array.isArray(cd.phones) && cd.phones[0]) || '';
    return {
      contactId: member.contactId,
      firstName: cd.firstName || '',
      lastName: cd.lastName || '',
      email: member.loginEmail || cd.email || '',
      phone: firstPhone
    };
  } catch (e) {
    // Wix lanza si no hay miembro autenticado; visitante anónimo.
    return null;
  }
}

// =====================================================
// CABECERA NATIVA (opcional)
// =====================================================
// Si la página tiene Image/Text conectados al dataset, se pintan solos.
// Esta función rellena $w('#cabeceraXxx') si existen, ignora silencio-
// samente si no.
function pintarCabeceraNativaSiExiste() {
  const cat = ctx.categoria;
  if (!cat) return;
  const safe = (id, prop, value) => {
    try {
      const el = $w(id);
      if (el && value) {
        if (prop === 'text') el.text = value;
        else if (prop === 'src') el.src = value;
      }
    } catch (e) { /* el elemento no existe: ok */ }
  };
  safe('#cabeceraTitle', 'text', cat.title);
  safe('#cabeceraSubtitle', 'text', cat.subtitle);
  safe('#cabeceraDescription', 'text', cat.description);
  safe('#cabeceraImage', 'src', cat.image);
}

// =====================================================
// MONTAR CUSTOM ELEMENT
// =====================================================
// Patrón Wix Velo Custom Element:
//   1. setAttribute('data-config', JSON.stringify(...)) — datos complejos.
//   2. .on('eventName', handler) — eventos custom que emite el widget.
//
// El custom element observa 'data-config' en attributeChangedCallback y
// se monta/repinta cuando cambia. Si se monta antes de que asignemos,
// también lo leerá en su connectedCallback.

function montarCustomElement() {
  let widget;
  try {
    widget = $w('#widgetReserva');
  } catch (e) {
    console.error(`${TAG} ❌ No existe #widgetReserva en la página`);
    return;
  }
  if (!widget) {
    console.error(`${TAG} ❌ #widgetReserva no resuelto`);
    return;
  }

  // Config completo pasado como JSON serializado en data-config.
  // El widget v2.0 parsea esto en attributeChangedCallback('data-config').
  const config = {
    categoria: ctx.categoria,
    servicios: ctx.servicios,
    profesionales: ctx.profesionales,
    salonConfig: ctx.salonConfig,
    memberInfo: ctx.memberInfo,
    hoyISO: nuevoHoyMadridISO()
  };

  // v0.3.6 — Variantes redimensionadas de la imagen de cada SERVICIO.
  // Se calculan AQUI, antes de resolverImagenesEnObjeto, porque parten del
  // valor crudo `wix:image://` que llega del CMS. `image` se conserva tal
  // cual para que el widget tenga respaldo.
  // La imagen de la CATEGORIA (config.categoria.image) NO se toca: la
  // consume el elemento nativo #cabeceraImage de la pagina, que la pinta
  // grande.
  if (Array.isArray(config.servicios)) {
    let conVariantes = 0;
    config.servicios.forEach(svc => {
      if (!svc || !svc.image) return;
      const card = wixImageResized(svc.image, IMG_CARD_W, IMG_CARD_H);
      const sq   = wixImageResized(svc.image, IMG_SQ, IMG_SQ);
      if (card) svc.imageCard = card;
      if (sq)   svc.imageSq   = sq;
      if (card || sq) conVariantes++;
    });
    console.log(`${TAG} 🖼️ ${conVariantes}/${config.servicios.length} servicios con imagen redimensionada`);
  }

  // v0.3.0 — convertir TODAS las URLs `wix:image://...` a HTTPS antes
  // de inyectar al widget. Sin esto, las imágenes salen rotas en el
  // navegador (ERR_UNKNOWN_URL_SCHEME).
  resolverImagenesEnObjeto(config);

  // v0.3.1 — REGISTRAR LISTENERS ANTES del setAttribute('data-config').
  // El widget al recibir data-config se monta inmediatamente y dispara
  // su primer 'pedir-huecos'. Si los listeners se registran DESPUÉS,
  // ese primer evento se PIERDE (race condition) y el widget queda
  // colgado en "Calculando…" esperando una respuesta que nunca llega.
  // El bug estaba latente desde v0.2.0; la primera prueba funcionó
  // por pura suerte de timing del navegador.

  widget.on('pedir-huecos', async (event) => {
    const d = event?.detail || {};
    try {
      const res = await getHuecosDisponibles({
        fecha: d.fecha,
        proId: d.proId,
        durationMin: d.durationMin,
        idStaffPermitidos: Array.isArray(d.idStaffPermitidos) ? d.idStaffPermitidos : [],
        // v0.3.5 — Segundo profesional para los complementos. Cuando llega
        // informado, el backend v0.9.0 parte la cita en dos tramos y valida
        // cada uno contra su profesional. Vacío → motor mono-profesional,
        // comportamiento v0.3.4 idéntico. `principalSetupUid` es necesario
        // para que el backend calcule el punto de corte a partir del
        // mapeoFases del servicio.
        proExtraId: d.proExtraId || '',
        principalSetupUid: d.principalSetupUid || ''
      });
      // Devolver al widget vía atributo dedicado.
      // Patrón: cada respuesta tiene un requestId que el widget genera
      // para correlacionar. Se serializa en data-huecos-response.
      widget.setAttribute('data-huecos-response', JSON.stringify({
        requestId: d.requestId,
        fecha: d.fecha,
        proId: d.proId,
        huecos: res?.huecos || [],
        ok: !!res?.ok,
        ts: Date.now()   // fuerza re-trigger del attributeChangedCallback
      }));
    } catch (e) {
      widget.setAttribute('data-huecos-response', JSON.stringify({
        requestId: d.requestId,
        fecha: d.fecha,
        proId: d.proId,
        huecos: [],
        ok: false,
        error: e.message,
        ts: Date.now()
      }));
    }
  });

  widget.on('reservar', async (event) => {
    const d = event?.detail || {};
    try {
      const res = await crearReservaPublica({
        fecha: d.fecha,
        horaHHmm: d.horaHHmm,
        principalSetupUid: d.principalSetupUid,
        complementosSetupUid: d.complementosSetupUid || [],
        // v0.3.3 — Variante del servicio principal (si el servicio tiene
        // hasVariants=true en ServiceCatalog). El widget bundle v2.0.14
        // la construye a partir del chip elegido con el patrón
        // {idx, label, price, duration} — copia literal del formato que
        // usa recepcionProCMS_widget v1.1.54 líneas 3817-3831. Si no hay
        // variante (servicio simple sin variantes), viaja null y el
        // backend crearPackReserva usa el precio/duración base del
        // ServiceCatalog. Retrocompatibilidad total.
        varianteSel: d.varianteSel || null,
        // v0.3.4 — Duración TOTAL de la cita (la misma que el widget envía
        // a getHuecosDisponibles). El backend v0.7.9 la usa para resolver
        // 'Cualquiera' comprobando el bloque continuo completo. Si no
        // llega (bundle antiguo), el backend cae a la duración base.
        durationMin: d.durationMin,
        staffId: d.staffId,
        staffName: d.staffName || '',
        // v0.3.5 — Segundo profesional para los complementos (recuperación
        // del `empleado2Id` de V1). Vacío cuando no hay reparto → el
        // backend crea la reserva con toda la cita al profesional
        // principal, comportamiento v0.3.4 idéntico.
        staffExtraId: d.staffExtraId || '',
        contactDetails: d.contactDetails || {},
        memberContactId: d.memberContactId || ctx.memberInfo?.contactId || '',
        notas: d.notas || ''
      });
      widget.setAttribute('data-reserva-response', JSON.stringify({
        requestId: d.requestId,
        ok: !!res?.ok,
        reservaId: res?.reservaId || null,
        precioTotal: res?.precioTotal || 0,
        fases: res?.fases || [],
        error: res?.ok ? null : (res?.error?.message || 'Error creando reserva'),
        ts: Date.now()
      }));
    } catch (e) {
      widget.setAttribute('data-reserva-response', JSON.stringify({
        requestId: d.requestId,
        ok: false,
        error: e.message,
        ts: Date.now()
      }));
    }
  });

  widget.on('navigate-back', () => {
    wixLocation.to('/servicios');
  });

  // Ahora SÍ inyectamos el config — listeners ya están escuchando.
  try {
    widget.setAttribute('data-config', JSON.stringify(config));
    console.log(`${TAG} ✅ data-config inyectado al custom element`);
  } catch (e) {
    console.error(`${TAG} ❌ Error inyectando config:`, e.message);
    return;
  }
}

// =====================================================
// HELPERS
// =====================================================

// Hoy en formato YYYY-MM-DD en horario Madrid. El sistema puede estar
// en otro TZ (servidor Wix), por eso lo formateamos explícitamente.
function nuevoHoyMadridISO() {
  const ahora = new Date();
  const madridStr = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  return madridStr; // 'YYYY-MM-DD'
}

// Convierte una URL Wix interna en HTTPS pública.
// Wix CMS guarda imágenes como `wix:image://v1/<mediaId>/<filename>#<params>`.
// El navegador no entiende ese esquema (ERR_UNKNOWN_URL_SCHEME). Hay que
// extraer el mediaId y reconstruir una URL HTTPS a static.wixstatic.com.
//
// Patrón confirmado en la captura del log:
//   wix:image://v1/fb4d18_e0161d67addd461bb129274851e530cf~mv2.jpg/cejascolor.jpg#originWidth=1122&originHeight=1402
//   → https://static.wixstatic.com/media/fb4d18_e0161d67addd461bb129274851e530cf~mv2.jpg
function wixImageToHttps(wixImageStr) {
  if (!wixImageStr || typeof wixImageStr !== 'string') return wixImageStr;
  // Si ya es URL HTTPS (futuro: si Wix decide convertir antes), no tocar.
  if (wixImageStr.startsWith('http://') || wixImageStr.startsWith('https://')) {
    return wixImageStr;
  }
  // Patrón Wix: wix:image://v1/<mediaId>/<filename>#<params>
  const match = wixImageStr.match(/^wix:image:\/\/v1\/([^/]+)\//);
  if (!match) return wixImageStr; // no es Wix image: devolver tal cual
  const mediaId = match[1];
  return `https://static.wixstatic.com/media/${mediaId}`;
}

// v0.3.6 — Devuelve la URL de la imagen YA REDIMENSIONADA por el servidor
// de Wix, para no bajar el original y recortarlo en el navegador.
//
// Formato:
//   https://static.wixstatic.com/media/<mediaId>/v1/fill/w_<W>,h_<H>,al_c,q_80/imagen.<ext>
//
//   · fill → recorta al ratio exacto pedido. Es el mismo comportamiento que
//            el `object-fit: cover` que el bundle ya aplica hoy en el CSS.
//   · al_c → recorte centrado. Equivale al `object-position` por defecto
//            (50% 50%), que el bundle no sobreescribe en ninguna de las dos
//            imagenes. Por eso el encuadre resultante es el mismo de ahora.
//   · q_80 → calidad.
//
// Verificado empiricamente en Hair-Times el 26-ago-2026 sobre una imagen
// real del CMS: el original devuelve 146 kB, la version 400x300 devuelve
// 17 kB con el recorte correcto.
//
// Acepta el valor crudo `wix:image://v1/<mediaId>/...` del CMS y tambien una
// URL HTTPS de static.wixstatic.com ya resuelta. Si no reconoce el formato
// devuelve cadena vacia: el llamante NO asigna la propiedad y el widget se
// queda con `image`, el comportamiento de v0.3.5.
//
// La extension de salida se toma del propio mediaId (`~mv2.png` → png, resto
// → jpg) para no forzar a Wix a cambiar de formato.
function wixImageResized(wixImageStr, w, h) {
  if (!wixImageStr || typeof wixImageStr !== 'string') return '';

  let mediaId = '';
  const mWix = wixImageStr.match(/^wix:image:\/\/v1\/([^/]+)\//);
  if (mWix) {
    mediaId = mWix[1];
  } else {
    const mHttps = wixImageStr.match(/^https:\/\/static\.wixstatic\.com\/media\/([^/?#]+)/);
    if (mHttps) mediaId = mHttps[1];
  }
  if (!mediaId) return '';

  const ext = /\.png$/i.test(mediaId) ? 'png' : 'jpg';
  return `https://static.wixstatic.com/media/${mediaId}/v1/fill/w_${w},h_${h},al_c,q_80/imagen.${ext}`;
}

// Recorre un objeto resolviendo TODAS las propiedades `image` que
// contengan URLs Wix internas. Funciona recursivamente sobre arrays
// y objetos anidados. Devuelve el objeto modificado en su lugar
// (también devuelto explícitamente para encadenado).
function resolverImagenesEnObjeto(obj) {
  if (!obj) return obj;
  if (Array.isArray(obj)) {
    obj.forEach(it => resolverImagenesEnObjeto(it));
    return obj;
  }
  if (typeof obj !== 'object') return obj;
  Object.keys(obj).forEach(k => {
    const v = obj[k];
    if (k === 'image' && typeof v === 'string') {
      obj[k] = wixImageToHttps(v);
    } else if (v && typeof v === 'object') {
      resolverImagenesEnObjeto(v);
    }
  });
  return obj;
}

function mostrarError(mensaje) {
  console.warn(`${TAG} ⚠️ ${mensaje}`);
  try {
    const box = $w('#errorBox');
    if (box) {
      box.text = mensaje;
      box.show?.();
    }
  } catch (e) { /* ok */ }
}
