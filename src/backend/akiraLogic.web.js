/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — AKIRA Backend (Wix Velo)
 * Archivo:  backend/akiraLogic.web.js
 * VERSION:  1.12.0
 * FECHA:    24 Noviembre 2026
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.11.0 → v1.12.0 — NO CONTESTAR SIN LEER Y MEMORIA DE LO ÚLTIMO
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   PRUEBA DE JAL EN HAIR-TIMES (24-Nov-2026), comprobada contra AkiraLog y
 *   el CMS:
 *   · «¿Quiénes han firmado la LOPD?» → 6 de 7 nombres inventados, con
 *     consultas: 0. En ClientLopdSignatures hay 2 clientes reales y 5 filas
 *     de ejemplo de Wix (C001–C005).
 *   · «¿Qué smart pricing está vigente?» → «lunes a miércoles 10-14», con
 *     consultas: 0. No existe en ninguna versión.
 *   · Discutida una respuesta correcta («Martes completo -10 %», 738 citas,
 *     todo en la versión vigente), confesó haberla inventado.
 *   · Desde la pregunta 11 negó haber hablado de smart pricing: _getHistorial
 *     devolvía los 10 PRIMEROS turnos (ascending + limit).
 *   · Dijo que el smart pricing se aplica a todos los servicios: solo a los
 *     que tienen smartPricing = true (en Hair-Times, la Nanoplastia).
 *
 *   EL CAMBIO:
 *   · _getHistorial: los 10 ÚLTIMOS turnos (descending + reverse) y la
 *     conversación siempre empieza por el usuario.
 *   · ASESOR: tool_choice {type:'any'} en la primera vuelta. Ninguna
 *     respuesta sale sin haber leído datos. Coste: en un saludo o una
 *     pregunta de criterio hace una lectura de más. ASISTENTE no se toca
 *     (sus herramientas incluyen acciones).
 *   · Regla 1c: si se discute un dato, volver a leerlo antes de mantenerlo o
 *     corregirlo; decir de dónde sale; para datos de una pregunta anterior,
 *     volver a leerlos (el historial guarda texto, no datos).
 *   · Descripción de la fuente smartPricing: dónde se aplica de verdad.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.10.1 → v1.11.0 — ACCESO TOTAL A LA INFORMACIÓN DE KAMISUITE
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   EL FALLO (24-Nov-2026): «¿los productos tienen algún
 *   descuento?» → contestó con servicios y, al insistir, «ninguno de los 6
 *   productos del almacén tiene descuento». Falso: AKIRA no tenía ninguna
 *   lectura de la tienda. Su única fuente «productos» era KamisuiteWarehouse,
 *   el almacén que stockLogic.web.js abandonó en agosto (el almacén vivo es
 *   KamisuiteStock). Y en vez de decir que no lo veía, afirmó que no había.
 *
 *   PETICIÓN DE JAL (24-Nov): acceso total de AKIRA a toda la información
 *   que reside en KAMISUITE.
 *
 *   EL CAMBIO (solo registro de fuentes, motor de configuración, descripción
 *   de la herramienta y una regla del prompt; consultar_datos_salon, las
 *   acciones y el resto del archivo no se tocan):
 *   · Inventario de las colecciones del código de los repos de Hair-Times y
 *     Salón KAMI. Fuentes nuevas: tienda, almacén vivo (KamisuiteStock) y
 *     sus movimientos, ficha completa del CRM, notas y fichas técnicas,
 *     cuidado y salud, LOPD, bonos y canjes, PRIME, tarjetas, campañas,
 *     smart pricing, campaña de tienda, B2B, reservas y cobros registro a
 *     registro, cobros de externos, histórico de externos, ventas del TPV,
 *     Estadísticas, facturas, caja y movimientos, fichajes, accesos a
 *     Recepción, comunicaciones, recordatorios, cambios del catálogo e
 *     histórico del programa anterior.
 *   · Fuente `coleccion`: cualquier otra colección del sitio, también las
 *     que se creen mañana (listado en tiempo real, patrón de
 *     cmsFieldReader.listarColeccionesV2).
 *   · `campos: null` = todos los campos del registro (decisión del
 *     19-Jul-2026 para el catálogo). Fuera solo PIN, tokens, secretos,
 *     contraseñas y claves de API, por regla estructural, y `_owner`.
 *   · `desde`/`hasta` sobre el campo de fecha que ya usa el backend de cada
 *     colección; `incluirInactivos`; techo de tamaño con modo compacto y
 *     AVISO cuando el resultado no es completo.
 *   · Regla 1c: antes de afirmar que algo no existe, leer la fuente que lo
 *     guarda; nunca contestar con otra fuente; si no está, decirlo.
 *   · clientes: el contactId viaja al modelo para encadenar consultas.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.10.0 → v1.10.1 — EL MOTIVO DE UN BLOQUEO NO SE INTERPRETA
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   Primera respuesta real tras v1.10.0 (Hair-Times, 24-Nov): los cuatro
 *   bloqueos de Ricardo, bien y con su hora. Pero cerró con «parecen
 *   reservas manuales para esas personas, posiblemente clientes sin cita
 *   formal» sobre el motivo «raul Y JESUS», y reescribió los motivos
 *   («Raúl y Jesús», «Lavado»). Es invención: el sistema no tiene más dato
 *   que ese texto. La empujaba la regla de asesor de aportar siempre una
 *   conclusión.
 *
 *   Una regla en el bloque de datos: el motivo es texto libre del salón, se
 *   cita tal cual y no se interpreta. Manda sobre la de aportar conclusiones.
 *   Solo cambia el prompt; el motor de datos no se toca.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.9.0 → v1.10.0 — EL PROFESIONAL SE LEE POR IDENTIFICADOR Y CADA
 *                             SERVICIO CUENTA PARA QUIEN LO HACE
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   EL FALLO (Hair-Times, 24-Nov-2026, en directo):
 *   «¿Qué bloqueos tiene Ricardo el próximo viernes?» → «ninguno», con
 *   cuatro bloqueos suyos pintados en Recepción PRO, y «3 citas» cuando
 *   en su columna había 5. Comprobado contra el CMS del viernes 27:
 *
 *   1) BLOQUEOS INVISIBLES POR PROFESIONAL. crearBloqueo graba el
 *      profesional en `staffId` y deja `staffName` VACÍO (los 11 bloqueos
 *      del día, de los tres). El filtro `staffName` comparaba el texto de
 *      la fila → «bloqueos de X» devolvía SIEMPRE cero, en cualquier salón.
 *   2) TRAMOS MOVIDOS DE COLUMNA. Una fase arrastrada a otra columna lleva
 *      su propio `staffId` (moverFase). El motor atribuía la cita entera
 *      al titular: los dos «Corte Mujer (Complemento)» de Ricardo (dentro
 *      de citas de Raquel y de Angela) contaban para ellas. Afectaba a
 *      reservas, cobros, servicios y conversión — a toda la productividad
 *      por profesional.
 *   3) SIN HORA. La muestra traía la fecha pero no la hora: AKIRA no podía
 *      decir «a las 14:20» aunque viera el dato.
 *   4) minutosOcupados / minutosProceso SIEMPRE A 0 en citas V2. Se leía
 *      la duración de la fase de `durationMin` / `duracion`, pero las fases
 *      la guardan en `dur` (crearBloqueo, moverFase y todas las fases del
 *      CMS). La ocupación real nunca llegaba al modelo.
 *
 *   EL ARREGLO (regla de atribución del cierre del día,
 *   cierreLogicExtendido v1.1.6+ repartirLineasPorStaff):
 *   · Profesional por IDENTIFICADOR contra StaffConfig (wixResourceId ‖
 *     _id → displayName ‖ canonicalName sin prefijo de orden). El texto
 *     `staffName` queda solo como respaldo. Arregla los bloqueos viejos y
 *     nuevos sin migrar nada.
 *   · Cada tramo de agenda (fase que ocupa) es de su profesional: el de su
 *     `staffId` si lo lleva, el titular si no.
 *   · Importes: cada línea de servicio se cruza con su fase (mismo label,
 *     por ocurrencia). Las demás personas reciben su parte y el titular se
 *     queda el resto, así que la suma cuadra con la cita / el cobro. En
 *     cobros, la parte es tarifa × factor neto/bruto (el del cierre).
 *   · Solo cuando la pregunta es POR PROFESIONAL (filtro staffName o
 *     agruparPor 'staff') cada cita se desdobla en una fila por persona que
 *     trabaja en ella. El resto de preguntas siguen contando citas y
 *     cobros enteros: los totales no cambian.
 *   · Cada fila de la muestra trae hora y tramos (inicio, fin, servicio,
 *     profesional). Con incluirBloqueos llega además `bloqueos`: TODOS los
 *     del periodo con hora, profesional y motivo, sin el tope de 40.
 *   · Duración de fase: `dur` → (end − start) → campos antiguos.
 *
 *   Sin cambios de CMS, de widget ni de page code. No se toca la segunda
 *   herramienta (configuración) ni el plano AYUDA.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.8.0 → v1.9.0 — SESIÓN ANTES DE PREGUNTAR (arregla el 504 de la
 *                            PRIMERA pregunta de cada chat)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   EL FALLO (medido en producción Hair-Times, 20-Ago-2026):
 *
 *   El widget solo aprendía el sessionId del CUERPO de la respuesta de
 *   akiraAsk (`data.sessionId`). Un 504 del gateway NO trae cuerpo. Por eso,
 *   en la PRIMERA pregunta de un chat nuevo el widget se quedaba sin
 *   sessionId y la condición de arranque del polling de recuperación
 *   (`if (this._sessionId && this._lastQuery)`) era falsa: enseñaba el error
 *   del gateway aunque la respuesta ya estuviera guardada en AkiraMessages.
 *
 *   La red de polling NUNCA protegió la primera pregunta de una conversación
 *   — justo donde vive la pregunta analítica pesada. A partir de la segunda
 *   funcionaba correctamente.
 *
 *   AGRAVANTE: `_sendQuery` no fija `_sessionId`, así que cada "Reintentar"
 *   volvía a salir con sessionId null y askAkiraCore creaba OTRA sesión
 *   (línea del `if (!sessionId) _crearSesion(...)`). Caso real: 3 pulsaciones
 *   → 3 sesiones huérfanas → 3 análisis completos de ~43s facturados a
 *   Anthropic, con la respuesta guardada las 3 veces y ninguna en pantalla.
 *
 *   Traza del caso: prepMs=204 · apiMs=43020 · consultas=4 · cache hit=26331
 *   La lectura del CMS costó 0,2s de 43. El techo se pasó por las 4 tool
 *   calls, no por el barrido de datos.
 *
 *   EL ARREGLO: `crearSesionCore` — el widget pide el sessionId ANTES de
 *   lanzar la pregunta pesada. Es un insert, milisegundos, muy por debajo del
 *   techo de 14s. Con el sessionId ya en mano, el polling cubre SIEMPRE, y
 *   askAkiraCore recibe una sesión existente → se acaban las duplicadas por
 *   reintento.
 *
 *   ADITIVO. `askAkiraCore` NO se toca: sigue creando la sesión por su cuenta
 *   si le llega sin sessionId (llamadas desde webMethod, WhatsApp futuro, o
 *   un widget viejo). El camino antiguo sigue vivo.
 *
 *   Requiere http-functions.js v1.4.0 (endpoint POST /_functions/
 *   akiraNuevaSesion) y akiraConsole.js v1.2.0.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.7.0 → v1.8.0 — EL SALUDO SALE DEL CMS, NO DEL CÓDIGO
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   Los textos de bienvenida de cada plano vivían escritos a mano en el custom
 *   element (BRAND_PLANOS). Cambiar el saludo obligaba a tocar código, que es
 *   justo lo que el patrón EGAEL evita.
 *
 *   `akiraAbrir` devuelve ahora `planos`: por cada plano con alignment
 *   publicado, su welcomeTitle y welcomeText. El page code los pasa al widget
 *   como `brandPlanes` y el custom element los superpone a sus valores por
 *   defecto. Lo que esté vacío en el CMS conserva el texto de fábrica: no se
 *   puede dejar la pantalla sin saludo por descuido.
 *
 *   Campos nuevos en AkiraAlignment: welcomeTitle, welcomeText (ambos Texto).
 *   Si no existen, `akiraAbrir` devuelve los planos vacíos y el widget usa sus
 *   textos por defecto — degrada sin romper.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.6.0 → v1.7.0 — ENRUTADOR DE PLANO: LO ELIGE EL USUARIO
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   Hasta v1.6.0 el plano lo fijaba el alignment publicado: uno solo, global
 *   al salón. Ahora lo elige quien pregunta, con dos chips en la topbar del
 *   widget (ASESOR / AYUDA).
 *
 *   SIN FONTANERÍA NUEVA. El parámetro `modo` ya viajaba de punta a punta
 *   (custom element → POST /_functions/akiraAsk → askAkiraCore) desde v1.5.0
 *   y solo se usaba para escribir una línea en el prompt. Ahora ES el plano.
 *   El endpoint es PÚBLICO: el valor se valida contra PLANOS_VALIDOS y
 *   cualquier otra cosa cae a ASESOR (_planoPedido).
 *
 *   EL PLANO DECIDE TRES COSAS:
 *
 *   1) QUÉ ALIGNMENT APLICA. `_getAlignments` lee hasta 10 publicados (antes
 *      solo el último) y `_alignmentDelPlano` elige el del plano pedido. Si el
 *      salón no ha publicado uno para ese plano, NO se hereda el de otro: se
 *      usa `_identidadPorDefecto(plano)`. Heredar la identidad de ASESOR en
 *      AYUDA le diría al modelo que es consultor de negocio mientras responde
 *      dudas del manual — peor que no tener alignment.
 *
 *   2) QUÉ CORPUS SE INYECTA. `_filtrarDocsPorPlano` filtra por el plano
 *      PEDIDO, no por el del alignment. Vacío = asesor (regla v1.5.0).
 *
 *   3) SI HAY HERRAMIENTAS DE DATOS. En AYUDA no las hay: la pregunta es
 *      "cómo se usa esto", no "cuánto facturé". Se omite `tools` del body (no
 *      se manda vacío: un array vacío es error de la API) y caen con ellas las
 *      descripciones de las dos herramientas, las reglas del motor, el bloque
 *      de cómo funcionan las colecciones, las familias, las categorías
 *      canónicas, la plantilla y la tabla completa de fechas. Eso compensa en
 *      buena parte los ~32.000 tokens del manual. En su lugar entran las
 *      reglas propias de AYUDA, que incluyen decirle al usuario que cambie al
 *      chip ASESOR si lo que quiere es un dato del negocio.
 *
 *   Sin cambios de CMS: 'modo' ya existe en AkiraAlignment y AkiraDocuments.
 *   Para que AYUDA tenga identidad propia editable, publicar una fila de
 *   AkiraAlignment con modo='ayuda'. Mientras no exista, funciona con la
 *   identidad por defecto del plano.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.5.0 → v1.6.0 — EL MANUAL DE USUARIO ENTRA COMPLETO EN AYUDA
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   CONTEXTO. El corpus del plano AYUDA es el Manual de Usuario V2.1 completo:
 *   150 páginas, 22 capítulos (uno por app), ~121.000 caracteres. Se importa a
 *   AkiraDocuments con tipo='manual', modo='ayuda', orden 1..22.
 *
 *   1) PRESUPUESTO DE CORPUS POR PLANO. `MAX_DOC_CHARS` (12.000) era común a
 *      todos los planos: con el manual cargado solo habrían entrado los dos
 *      primeros capítulos y el resto se descartaba EN SILENCIO (el bucle corta
 *      y hace break, sin log). Ahora el tope se resuelve por plano vía
 *      DOC_CHARS_POR_PLANO: ASESOR y ASISTENTE siguen en 12.000; AYUDA sube a
 *      150.000 para que el manual entre entero en el bloque cacheado.
 *      El PREP loguea corpus=<chars>/<tope> y avisa si se va a truncar.
 *
 *      Por qué entero y no recuperación por capítulo: las preguntas de ayuda
 *      cruzan apps ("cobré mal una reserva, ¿dónde lo arreglo?" → Recepción PRO
 *      + Edición de Cobros). Con el corpus completo delante el modelo cose
 *      capítulos sin un segundo viaje a la API, que en esta plataforma es
 *      exposición extra al 504 ya documentado. El coste se amortiza con el
 *      prompt caching (bloque stable, cache_control ephemeral).
 *
 *   2) INSTRUCCIÓN DE CORPUS DEPENDIENTE DEL PLANO. El encabezado del bloque
 *      de conocimiento estaba redactado para ASESOR ("criterio experto…
 *      no lo cites textualmente") y se enviaba en TODOS los planos. Aplicado
 *      al manual pide justo lo contrario de lo correcto: parafrasear una
 *      interfaz produce nombres de botón inventados. AYUDA recibe ahora la
 *      instrucción inversa — reproducir nombres de pantalla y pasos literales,
 *      y decir que no está cubierto antes que deducirlo.
 *
 *   3) `_getDocumentos` limit 50 → 200. Esa query es ANTERIOR al filtro por
 *      plano (el alignment se lee en paralelo), así que el tope se reparte
 *      entre todos los planos. Con las 22 filas del manual más el corpus de
 *      ASESOR, 50 se queda corto y los últimos documentos se perdían antes
 *      de llegar al filtro. Se sube el límite en vez de filtrar en la query
 *      para no serializar el PREP.
 *
 *   Sin cambios de CMS. Sin cambios en el motor de consulta, en las tools, en
 *   el historial ni en el TTS.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.4.5 → v1.5.0 — FILTRO DE CORPUS POR PLANO (asesor/ayuda/asistente)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   AKIRA pasa a tener planos de utilidad. El plano activo lo fija el alignment
 *   publicado (AkiraAlignment.modo). Cada documento de AkiraDocuments declara a
 *   qué plano pertenece (AkiraDocuments.modo). Los documentos de conocimiento
 *   se filtran por ese plano ANTES de construir el prompt, para que el modo
 *   AYUDA lea solo el corpus "cómo se usa KAMISUITE" y no contamine al ASESOR.
 *
 *   REGLA VACÍO = ASESOR. El campo 'modo' existe en el CMS pero los documentos
 *   y el alignment actuales lo tienen vacío. Un 'modo' vacío (en el doc o en el
 *   alignment) se trata como 'asesor', para no dejar sin corpus lo ya existente.
 *
 *   OJO — dos 'modo' distintos que NO deben confundirse:
 *     · PLANO de utilidad (este cambio): asesor | ayuda | asistente. Vive en
 *       AkiraAlignment.modo / AkiraDocuments.modo. Enruta el corpus.
 *     · MODO transaccional de la herramienta de datos: reservas | cobros |
 *       conversion. Vive en los filtros de la tool. Sin cambios.
 *   Ni KamisuiteReservations ni PaymentReservations necesitan cambios. No se
 *   crea ningún campo CMS: 'modo' ya existe en AkiraAlignment y AkiraDocuments.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.4.4 → v1.4.5 — FIX: CATEGORIZAR HISTÓRICO POR KEYWORD, NO CATÁLOGO
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   PROBLEMA. "Servicios de color en junio" seguía dando 0 aunque el ledger de
 *   junio tiene 324 cobros. Causa: los nombres del histórico son de la época V1
 *   ("Tinte (AP)", "Corte de caballero", "Mechas Personalizadas (AP)") y NO
 *   coinciden con los label del ServiceCatalog actual. El cruce nombre→catálogo
 *   fallaba en el 100% del histórico.
 *
 *   FIX. Se categoriza por PALABRAS CLAVE (TINTE/MECHA→COLORACION, CORTE→
 *   CORTESMUJER, etc.), replicando reclasificarServicio/clasificarExtra de
 *   estadisticas.web.js v2.5.3 — el dashboard que ya funciona sobre este mismo
 *   ledger histórico. También se adopta su split que respeta comas dentro de
 *   paréntesis y su regex de precio, y se excluye staff='TIENDA_POS' (productos).
 *   Verificado contra el ledger real: junio → 118 servicios de color, 6.598€.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.4.3 → v1.4.4 — FIX: FORMATO REAL de PaymentReservations.descripcion
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   v1.4.3 cambió bien la FUENTE (cobros), pero inventó el formato del parser
 *   ("Nombre|precio;;"). El formato REAL del ledger es OTRO, documentado en
 *   Guía V2.0 §D.2 y ya resuelto por cierreLogicExtendido:
 *     "Nombre (precio€), Otro (precio€), 🛒 Producto (12€), ✏️ Propina (5€)"
 *   Separado por COMAS, precio entre paréntesis, con prefijos emoji para
 *   productos/propinas/descuentos.
 *
 *   FIX. _parsearDescripcionCobro se reescribe como copia LITERAL de
 *   cierreLogicExtendido.extraerServiciosFacturables (código de producción del
 *   Cierre Financiero): split por coma, regex "Nombre (precio€)", ignora 🛒
 *   (producto), ✏️ (propina), 🏷️ (descuento) y precio 0 (fase embebida). Así
 *   AKIRA cuenta SOLO servicios facturables, no productos ni propinas.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.4.2 → v1.4.3 — FIX: MODO SERVICIOS DEBE LEER DE PaymentReservations
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   SÍNTOMA. "¿Servicios de color en junio?" → "no hay". Pero en junio se
 *   facturaron 22.000€. El modo servicios (v1.4.2) leía de
 *   KamisuiteReservations, que SOLO tiene datos desde la migración (julio+).
 *   Junio no existe ahí → cero. Diagnóstico equivocado ("junio vacío") por
 *   mirar la colección equivocada.
 *
 *   FIX. consultarServicios ahora lee de PaymentReservations (el ledger),
 *   igual que el modo cobros. Es lo correcto por dos razones:
 *     · Tiene TODO el histórico, también lo anterior a la migración.
 *     · Es lo CONSUMADO: excluye por naturaleza cancelaciones/no-shows.
 *       "Servicios que se hicieron" = lo cobrado, no lo agendado.
 *   Cada cobro guarda su(s) servicio(s) en `descripcion`; se descompone con
 *   _parsearDescripcionCobro (tolera formato serviciosDetail "N|precio;;…" o
 *   nombre suelto) y cada nombre se resuelve a su group vía catálogo. Toda la
 *   agregación/desglose por categoría queda igual que en v1.4.2.
 *
 *   NOTA. El modo `reservas` sigue leyendo KamisuiteReservations (es lo
 *   COMPROMETIDO/agenda, correcto). Solo `servicios` cambió de fuente.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.4.1 → v1.4.2 — CATEGORÍA (group) COMO EJE, + MODO SERVICIOS
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   CONTEXTO. `family` NO es la categoría comercial: es la naturaleza técnica
 *   del servicio (simple / con fases / con proceso). La categoría real
 *   (COLORACION, CORTESMUJER, CABALLERO, MANICURA_&_PEDICURA, TRATAMIENTOS…)
 *   vive en ServiceCatalog.group, y desde recepcionProLogic v1.0.38 se graba
 *   también en KamisuiteReservations.group (categoría del servicio PRINCIPAL,
 *   que categoriza la reserva). AKIRA no lo usaba: filtraba por family y erraba.
 *
 *   QUÉ CAMBIA:
 *
 *   1) `group` es el EJE DE CATEGORÍA. Nuevo filtro `group` (array) y nuevo
 *      eje de agrupación `group`. family queda como eje técnico secundario.
 *      El filtro normaliza mayúsculas/acentos/_/&/espacios (normalizarGroup):
 *      el CMS guarda 'MANICURA_&_PEDICURA', el modelo puede mandar variantes.
 *
 *   2) `_getGroups()` — distinct de group (reservas + catálogo) al system
 *      prompt como "CATEGORÍAS DISPONIBLES". Cero hardcoding: cada salón las
 *      suyas. El modelo mapea el lenguaje natural del usuario ("color","uñas")
 *      contra esa lista real y DESAMBIGUA cuando un término abarca varias
 *      ("corte" → CORTESMUJER o CABALLERO → pregunta cuál).
 *
 *   3) NUEVO MODO "servicios". Distingue dos preguntas que antes se confundían:
 *        · "¿cuántas RESERVAS de color?" → modo reservas + group (cita entera,
 *          por su principal).
 *        · "¿cuántos SERVICIOS de corte?" → modo servicios: recorre
 *          serviciosDetail de cada reserva y cuenta CADA servicio, incluido el
 *          corte que va de COMPLEMENTO dentro de una reserva de tinte. El
 *          nombre en serviciosDetail es el label EXACTO de ServiceCatalog
 *          (Recepción PRO pinta el calendario de ahí), así que se resuelve a su
 *          group vía mapa label→group cacheado (_getMapaServicioGrupo, TTL 5min).
 *          Extras manuales fuera de catálogo ([EXTRA] …) quedan '(no catalogado)'.
 *
 *   4) Fix de acentos en `family` (v1.4.1) intacto: sigue vigente.
 *
 *   NO SE TOCA nada de sesiones, historial, acceso, cobros ni conversión.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.4.0 → v1.4.1 — FIX: FILTRO family FALLABA POR LA TILDE
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   SÍNTOMA (visto en el log de producción, 19-Jul):
 *     "¿Cuánto facturamos en coloración el mes pasado?" → "No hay cobros bajo
 *     la familia coloración." Y AKIRA remataba INVENTANDO una explicación
 *     falsa: "en Hair-Times el color no se categoriza bajo esa familia". Con
 *     146 reservas family='coloracion' en el CMS, eso es una alucinación de
 *     las peligrosas: cifra/conclusión errónea dicha con aplomo.
 *
 *   CAUSA RAÍZ:
 *     aplicarFiltros comparaba con .toLowerCase() PERO NO quitaba acentos.
 *     El usuario pregunta por "coloración" (con tilde). Sonnet, a veces, copia
 *     ese término tal cual al filtro en vez del canónico. El CMS guarda
 *     "coloracion" (SIN tilde). "coloración".toLowerCase() === "coloración"
 *     ≠ "coloracion" → cero match → cero registros → alucinación.
 *
 *   FIX (una sola función tocada: aplicarFiltros):
 *     El filtro `family` normaliza acentos con normalize('NFD') —el mismo
 *     patrón que consultarConfig YA usa en la búsqueda del CRM, no se inventa
 *     nada—. Ahora "coloración", "Coloración" y "coloracion" resuelven todos
 *     al mismo valor del CMS. El blindaje va en JS, no en el prompt: da igual
 *     el literal exacto que escriba el modelo ("IA entiende → JS ejecuta").
 *
 *   NO SE TOCA NADA MÁS. El resto del motor, herramientas, sesiones,
 *   historial, acceso y prompt quedan idénticos a v1.4.0.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.3.0 → v1.4.0 — FIX: EL HISTORIAL NO SE MOSTRABA
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   La sidebar salía vacía al abrir. Causa: akiraListarChats filtraba por
 *   `messageCount > 0`, un contador que yo añadí "para optimizar" y evitar la
 *   query por chat que hace CATHOVIA. Pero ese contador lo escribe
 *   _guardarMensajes DESPUÉS, con un update cuyo fallo se traga un catch. Si
 *   no se escribe, se queda en 0 y NINGUNA sesión pasa el filtro.
 *
 *   FIX: clon literal de cathoviaListarChats. Se cuentan los mensajes REALES
 *   de AkiraMessages. Una query más por chat, pero es la verdad y no depende
 *   de un contador que puede desincronizarse.
 *
 *   También: los webMethods de chats pasan a Permissions.Anyone, como en
 *   CATHOVIA. SiteMember ya rompió el TTS por la misma razón.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.2.0 → v1.3.0 — FIX: CIFRAS INCOMPLETAS EN PERIODOS LARGOS
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   QUERY_LIMIT era 1000. Hair-Times hace ~308 cobros/mes → ~3.700/año. Una
 *   pregunta como "cuánto facturamos este año" se cortaba en 1000 filas y
 *   devolvía un total MAL, sin avisar. Un consultor que da una cifra errónea
 *   con aplomo es peor que uno que no responde.
 *
 *   FIX: techo a 6000 + findAll marca `_truncado` + campo AVISO al modelo.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.1.0 → v1.2.0 — CRM (Wix Contacts)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   AKIRA no podía responder "dame el teléfono de Jesús Aldana": solo veía el
 *   clientName grabado en cada reserva, no la ficha del CRM. V1 sí lo hacía.
 *
 *   NUEVO: fuente `clientes`, servida por Wix Contacts a través de
 *   cargarTodosContactos() de recepcionLogic.web.js — el backend de producción
 *   que ya resuelve esa API. NO se reimplementa nada.
 *
 *   El registro gana dos capacidades, ambas declarativas:
 *     · `loader`  — fuentes que son API nativa de Wix, no colección CMS.
 *                   Mañana, Stores o Loyalty = declarar su loader. Nada más.
 *     · `requiereBusqueda` — el CRM tiene cientos de contactos: volcarlo entero
 *                   reventaría el contexto. Sin `busqueda`, el motor rechaza.
 *
 *   La búsqueda normaliza teléfonos: en CRM están como "+34 617 37 89 84" y se
 *   teclean como "617378984". Se comparan solo los dígitos.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.0.0 → v1.1.0 — SEGUNDA HERRAMIENTA: CONFIGURACIÓN
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   v1.0.0 solo leía datos transaccionales (Reservations/Payments). AKIRA
 *   podía decir "facturaste 4.200€ en tinte" pero NO sabía a qué precio está
 *   el tinte en el catálogo. Sin eso no hay consultoría: no puede detectar
 *   que se cobra por debajo de tarifa, ni que un profesional tiene más horas
 *   ocupadas que contratadas.
 *
 *   NUEVO: consultar_configuracion_salon, con REGISTRO DECLARATIVO
 *   (FUENTES_CONFIG). Añadir una colección mañana = añadir una entrada al
 *   objeto. Cero código nuevo. El input_schema se genera desde el registro.
 *
 *   Arranca con 5 fuentes: servicios · personal · salon · productos · externos.
 *   El resto de las 53 colecciones quedan diferidas: abrirlas todas de golpe
 *   degrada las respuestas y quema tokens.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * QUÉ ES ESTE ARCHIVO
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Cerebro de AKIRA V2, modo CONSULTOR. Sustituye conceptualmente a
 * consoleIA.web.js v3.5.8 (V1, basado en Wix Bookings) — NO lo modifica.
 * V1 sigue vivo hasta que Jal decida apagarlo.
 *
 * Arquitectura portada de EGAEL 3.0 (proyecto CATHOVIA, cathoviaBackend
 * v1.6.0), adaptada a KAMISUITE V2:
 *   · Bloques STABLE/VOLATILE con prompt caching de Anthropic (5 min).
 *   · Cascade failover Sonnet 4.6 → Haiku 4.5.
 *   · Lecturas de CMS en paralelo (Promise.all).
 *   · Sesión creada en paralelo con la llamada a Anthropic.
 *   · Log honesto: prepMs (Wix Data) + apiMs (Anthropic) + totalMs.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DIFERENCIA CLAVE CON V1 — POR QUÉ ESTE ARCHIVO ES TAN CORTO
 * ───────────────────────────────────────────────────────────────────────────
 *
 * V1 (consoleIA v3.5.8) necesitaba:
 *   · classify con prompt de ~6.500 chars lleno de reglas de Wix Bookings.
 *   · AkiraCapabilities como índice de un router de 11 categorías cerradas.
 *   · Parsear `descripcion` (texto libre) para saber qué servicio se hizo
 *     → de ahí el parche de facturación por tipo de v3.3.6.
 *   · queryExtendedBookings paginado, resolución de nombres genéricos,
 *     agrupación por GAP_MS, lectura de sessions Blocked...
 *
 * V2 no necesita NADA de eso. KamisuiteReservations tiene `family` como
 * CAMPO ESTRUCTURADO. La pregunta "ticket medio de tinte los lunes y
 * martes de mayo" es un filtro, no un parche.
 *
 * Por eso AKIRA V2 NO tiene classify ni categorías cerradas. Tiene un
 * MOTOR DE CONSULTA con filtros ortogonales + tool use nativo de Anthropic.
 * Sonnet elige filtros; JavaScript ejecuta y calcula. Las combinaciones son
 * ilimitadas porque los ejes son independientes.
 *
 * AkiraCapabilities queda OBSOLETA. Este backend no la lee.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LOS TRES MODOS DE LECTURA (decisión de Jal, 17-Jul-2026)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   1. reservas  → KamisuiteReservations. La PRODUCTIVIDAD A FUTURO: lo
 *                  comprometido. Agenda, ocupación, carga, previsión.
 *                  Una reserva existe antes de ser dinero y puede no
 *                  llegar a serlo nunca.
 *
 *   2. cobros    → PaymentReservations. El RESULTADO OPERATIVO: lo
 *                  consumado. Solo entra lo que se cobró.
 *
 *   3. conversion→ Cruce por bookingId = KRI_<reservaId>. EL DELTA: lo que
 *                  se reservó y no se cobró. Tasa de conversión, no-shows,
 *                  fugas de caja. Ninguna colección sola responde esto.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CONCEPTOS FUNDACIONALES RESPETADOS
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   · "IA entiende → JS ejecuta": Sonnet extrae parámetros. TODAS las
 *     cifras, fechas y agregaciones las calcula JavaScript. Sonnet NUNCA
 *     calcula una fecha ni una suma. Recibe el dato hecho y lo narra.
 *   · Fechas con toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).
 *   · Multi-tenant sin hardcoding: cada cuenta Wix ES un salón. NO hay
 *     cursoRef/salonId en ninguna query. SalonConfig (fila única) es el
 *     contexto. Cero nombres de staff, servicios o IDs hardcodeados.
 *   · Permissions.SiteMember (NUNCA Admin: bloquea llamadas desde páginas).
 *     Acceso CMS vía suppressAuth.
 *   · PROCESO es tiempo libre del estilista: fases con ocupa:false NO
 *     ocupan agenda. Se respeta al calcular ocupación.
 *   · fases y sessionIds son OBJECT envueltos {items:[...]} → helper jsonIn,
 *     patrón literal de recepcionProLogic.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COLECCIONES (field IDs verificados en producción, 17-Jul-2026)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   KamisuiteReservations: fechaReserva DATETIME, family TEXT, status TEXT,
 *     precioTotal NUMBER, duracionTotal NUMBER, staffId/staffName TEXT,
 *     clientName/clientPhone/clientEmail TEXT, contactId TEXT,
 *     origenRecepcion BOOLEAN, fases OBJECT, sessionIds OBJECT,
 *     serviciosDetail TEXT, extensionMin NUMBER, wixAnclaId TEXT
 *
 *   PaymentReservations: bookingId TEXT (KRI_<id>), fechaPago DATETIME,
 *     fechaReserva DATETIME, importeTotal NUMBER, tipoPago TEXT,
 *     desglosemetodopago TEXT, staff TEXT, descripcion TEXT,
 *     nombreCliente TEXT, contactId TEXT, invoiceId TEXT
 *
 *   AkiraAlignment:  promptBase, tone, detailLevel, grOnlyQuery,
 *     grNoInvent, grNoMarkdown, grConcision, extraInstructions, version,
 *     status, publicationDate
 *   AkiraDocuments:  titulo, tipo, contenido, resumen, activo, orden
 *   AkiraSessions:   title, estado, fechaCreacion, fechaActualizacion,
 *                    messageCount   ── FALTA usuarioId (ver AVISO abajo)
 *   AkiraMessages:   sessionRef, rol, contenido, orden, timestamp
 *   SalonConfig:     brandName, widgetSkin, vatRate, logoUrl, ...
 *   StaffConfig:     canonicalName, displayName, accessLevel, active
 *
 * ⚠️ AVISO — AkiraSessions.usuarioId NO EXISTE en el CMS actual.
 *   Sin ese campo NO hay historial por persona: todos los usuarios del
 *   salón verían las conversaciones de todos. El código está escrito para
 *   usarlo (USER_FIELD) y degrada de forma segura si no existe, pero
 *   Jal debe crear el campo (Texto) para que el filtrado sea real.
 *   Mientras no exista, listarChats devuelve las sesiones del salón.
 *
 * Secret: KAMISUITE (API key de Anthropic — el mismo que usa V1)
 * Logs:   Wix Dashboard → Developer Tools → Site Monitoring
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { webMethod, Permissions } from 'wix-web-module';
import { fetch } from 'wix-fetch';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';
// Wix Contacts (CRM nativo). Reutilizamos el backend de producción que ya lo
// resuelve — NO se reimplementa la API de contactos. recepcionLogic.web.js es
// "backend que NO se toca en V2" (Checklist V1↔V2 §244): reutilizable al 100%.
import { cargarTodosContactos } from 'backend/recepcionLogic.web';
// v1.11.0 — ACCESO TOTAL. AKIRA lee lo mismo que las pantallas llamando a los
// backends de producción que las alimentan; no reimplementa ninguna lectura.
//   · Tienda: gestor de productos + Tienda Productos (variantes).
//   · Ficha Cliente del CRM y su historial.
//   · Historial de ventas del TPV y pantalla Estadísticas.
//   · Listado de colecciones: patrón de cmsFieldReader.listarColeccionesV2.
import { listarProductos, obtenerHistorialVentas } from 'backend/tiendaProductos.web';
import { listarProductosParaEdicion } from 'backend/tiendaEdicionLogic.web';
import { getFichaCliente, getHistorialCliente } from 'backend/fichaClienteLogic.web';
import { obtenerEstadisticas } from 'backend/estadisticas.web';
import { elevate } from 'wix-auth';
import { collections } from 'wix-data.v2';

const VERSION = '1.12.0';
const TAG = `[AkiraLogic][${VERSION}]`;
const AUTH = { suppressAuth: true };

// ── Modelos y timeouts (patrón CATHOVIA v1.6.0) ──
const MODEL_PRIMARY   = 'claude-sonnet-4-6';
const MODEL_FALLBACK  = 'claude-haiku-4-5';
const PRIMARY_TIMEOUT_MS  = 45000;
const FALLBACK_TIMEOUT_MS = 25000;

// ── Generación ──
const MAX_TOKENS    = 1200;
const HISTORY_LIMIT = 10;
const MAX_DOC_CHARS = 12000;   // presupuesto por defecto (ASESOR / ASISTENTE)

// ── Presupuesto de corpus POR PLANO (v1.6.0) ──
// El corpus de AYUDA es el Manual de Usuario completo (~121.000 caracteres,
// 22 capítulos, uno por app). Con el tope común de 12.000 solo entrarían los
// dos primeros capítulos y el resto se descartaba en silencio.
// El manual entra ENTERO en el bloque cacheado: las preguntas de ayuda cruzan
// apps constantemente ("cobré mal una reserva, ¿dónde lo arreglo?" toca
// Recepción PRO y Edición de Cobros) y con el corpus completo delante el
// modelo cose capítulos sin necesidad de un segundo viaje a la API.
const DOC_CHARS_POR_PLANO = {
  asesor:     MAX_DOC_CHARS,
  ayuda:      150000,
  asistente:  MAX_DOC_CHARS
};

function _docCharsDelPlano(plano) {
  return DOC_CHARS_POR_PLANO[plano] || MAX_DOC_CHARS;
}

// ── Colecciones ──
const C_RESERVAS  = 'KamisuiteReservations';
const C_COBROS    = 'PaymentReservations';
const C_ALIGNMENT = 'AkiraAlignment';
const C_DOCUMENTS = 'AkiraDocuments';
const C_SESSIONS  = 'AkiraSessions';
const C_MESSAGES  = 'AkiraMessages';
const C_LOG       = 'AkiraLog';
const C_SALON     = 'SalonConfig';
const C_STAFF     = 'StaffConfig';
const C_CATALOGO  = 'ServiceCatalog';   // v1.4.2 — mapa label→group para conteo por servicio

// ── Constantes de dominio (verificadas en producción) ──
const PREFIJO_PAGO     = 'KRI_';       // PaymentReservations.bookingId = KRI_<reservaId>
const STATUS_CANCELADA = 'CANCELADA';  // filtro canónico: .ne('status','CANCELADA')
const FAMILY_BLOQUEO   = 'BLOQUEO';    // no es actividad comercial
// Techo de filas por consulta. Hair-Times hace ~308 cobros/mes → ~3.700/año.
// Con 1000 (v1.0.0) una pregunta anual se cortaba y devolvía cifras MAL sin
// avisar: el error más peligroso que puede cometer un consultor.
// 6000 cubre un año holgado. findAll marca `truncado` si aun así se llena.
const QUERY_LIMIT      = 6000;

// Nivel de acceso mínimo para AKIRA Consultor (StaffConfig.accessLevel).
// 1 = Administrador, 2 = Encargado. Briefing Consultor §2.
const CONSULTOR_MIN_LEVEL = 2;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — FECHAS (todo en JS, jamás en el LLM)
// ═══════════════════════════════════════════════════════════════════════════

function hoyMadrid() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

function fechaISOenMadrid(dateLike) {
  if (!dateLike) return '';
  try {
    return new Date(dateLike).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  } catch (_) { return ''; }
}

/** Día de la semana en Madrid. 0=domingo … 6=sábado (igual que Date.getDay). */
function dowMadrid(dateLike) {
  const iso = fechaISOenMadrid(dateLike);
  if (!iso) return -1;
  return new Date(iso + 'T12:00:00Z').getUTCDay();
}

function sumarDias(fechaISO, n) {
  const d = new Date(fechaISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

/**
 * Contexto temporal completo, precalculado en JS y entregado a Sonnet como
 * TABLA DE CONSULTA. Sonnet COPIA de aquí; no calcula nunca una fecha.
 * Regla de Conceptos Fundacionales §20.
 */
function resolverFechas() {
  const hoyISO = hoyMadrid();
  const dow = new Date(hoyISO + 'T12:00:00Z').getUTCDay();
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const diffLun = dow === 0 ? -6 : 1 - dow;

  const y = parseInt(hoyISO.substring(0, 4), 10);
  const m = parseInt(hoyISO.substring(5, 7), 10);
  const ultimoDiaMes = new Date(y, m, 0).getDate();
  const mesAntY = m === 1 ? y - 1 : y;
  const mesAntM = m === 1 ? 12 : m - 1;
  const ultimoDiaMesAnt = new Date(mesAntY, mesAntM, 0).getDate();
  const p2 = (n) => String(n).padStart(2, '0');

  return {
    hoyISO,
    hoyNombre: dias[dow],
    ayer:   sumarDias(hoyISO, -1),
    manana: sumarDias(hoyISO, 1),
    estaSemanaDesde: sumarDias(hoyISO, diffLun),
    estaSemanaHasta: sumarDias(hoyISO, diffLun + 6),
    semanaPasadaDesde: sumarDias(hoyISO, diffLun - 7),
    semanaPasadaHasta: sumarDias(hoyISO, diffLun - 1),
    esteMesDesde: `${y}-${p2(m)}-01`,
    esteMesHasta: `${y}-${p2(m)}-${p2(ultimoDiaMes)}`,
    mesPasadoDesde: `${mesAntY}-${p2(mesAntM)}-01`,
    mesPasadoHasta: `${mesAntY}-${p2(mesAntM)}-${p2(ultimoDiaMesAnt)}`,
    esteAnioDesde: `${y}-01-01`,
    esteAnioHasta: `${y}-12-31`,
    anioPasadoDesde: `${y - 1}-01-01`,
    anioPasadoHasta: `${y - 1}-12-31`
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — CMS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lectura de campos OBJECT envueltos: { items: [...] } / { ids: [...] }.
 * Patrón LITERAL de recepcionProLogic.web.js. No reinventar.
 */
function jsonIn(v, unwrapKey) {
  if (v == null || v === '') return [];
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch (e) { return []; }
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (unwrapKey && Array.isArray(v[unwrapKey])) return v[unwrapKey];
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.ids))   return v.ids;
    return [];
  }
  if (Array.isArray(v)) return v;
  return [];
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Normaliza texto para comparaciones robustas: minúsculas SIN acentos.
 * Mismo patrón normalize('NFD') que consultarConfig ya usa en la búsqueda del
 * CRM. Se extrae a helper para reutilizarlo en el filtro `family`: el usuario
 * escribe "coloración" (con tilde) y el CMS guarda "coloracion" (sin tilde);
 * sin quitar acentos, .toLowerCase() por sí solo NO hace match.
 */
function normalizarTexto(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * Normaliza un valor de CATEGORÍA (group) para comparación robusta.
 * Los groups del CMS vienen en MAYÚSCULAS y con formatos dispares:
 * 'COLORACION', 'MANICURA_&_PEDICURA', 'COMPLEMENTOS DE FASES',
 * 'PEINADOS_&_RECOGIDOS'. El usuario jamás escribe eso literal: dice
 * "manicura", "color", "peinados". Este helper reduce ambos lados a un
 * token comparable — quita acentos y colapsa TODO lo no alfanumérico
 * (guiones bajos, &, espacios, guiones) para que "manicura_&_pedicura",
 * "manicura y pedicura" y "MANICURA & PEDICURA" resuelvan igual.
 * El mapeo semántico (usuario dice "uñas" → MANICURA) lo hace el MODELO
 * contra la lista real de groups del prompt; esto es solo el match final.
 */
function normalizarGroup(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Pagina una query hasta `techo` filas. Wix devuelve máx. 100 por página.
 *
 * Marca items._truncado = true si se alcanza el techo con más datos pendientes.
 * CRÍTICO: sin esta marca, una consulta que desborda devuelve cifras
 * silenciosamente incompletas — y un consultor que da un total erróneo sin
 * avisar es peor que uno que no responde.
 */
async function findAll(query, limite) {
  const techo = limite || QUERY_LIMIT;
  let items = [], skip = 0, truncado = false;
  while (skip < techo) {
    const res = await query.skip(skip).limit(100).find(AUTH);
    const page = res.items || [];
    items = items.concat(page);
    if (page.length < 100) break;
    skip += 100;
    if (skip >= techo) truncado = true;
  }
  if (truncado) {
    console.warn(`${TAG} ⚠️ findAll TRUNCADO en ${techo} filas — cifras incompletas`);
    items._truncado = true;
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.10.0 — PROFESIONAL POR IDENTIFICADOR Y REPARTO POR TRAMO
// ═══════════════════════════════════════════════════════════════════════════
// Regla del cierre del día (cierreLogicExtendido v1.1.6+): en la agenda cada
// fase lleva su profesional; una fase sin `staffId` propio es del titular.

// Valores de PaymentReservations.staff que NO son personas (ventas de
// producto y ESPECIALES). Copia de cierreLogicExtendido / estadisticas.
const MARCADORES_NO_PERSONA = new Set(['TIENDA', 'TIENDA_POS', 'ESPECIALES']);

// Copia literal de cierreLogicExtendido.nombreStaffLimpio: el prefijo 'C_'
// es de ordenación y no forma parte del nombre.
function nombreStaffLimpio(v) {
  return String(v || '').trim().replace(/^[A-Z]_/, '').trim();
}

// Copia literal de cierreLogicExtendido.horaMadrid.
function horaMadrid(d) {
  if (!d) return '';
  const dd = (d instanceof Date) ? d : new Date(d);
  return dd.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Madrid' });
}

/**
 * Duración de una fase en minutos. Las fases del CMS la guardan en `dur`
 * (crearBloqueo, moverFase…). Si falta, se mide con end − start, como hace
 * moverFase. Los campos que leía v1.9.0 quedan como último respaldo.
 */
function _durFase(f) {
  if (!f) return 0;
  const d = Number(f.dur);
  if (Number.isFinite(d) && d > 0) return d;
  if (f.start && f.end) {
    const ms = new Date(f.end).getTime() - new Date(f.start).getTime();
    if (Number.isFinite(ms) && ms > 0) return Math.round(ms / 60000);
  }
  const legado = Number(f.durationMin != null ? f.durationMin : f.duracion);
  return Number.isFinite(legado) && legado > 0 ? legado : 0;
}

// wixResourceId → nombre del profesional. Es el identificador que guardan
// la cita (`staffId`) y sus fases. `wixResourceId || _id`, como resuelve
// recepcionProLogic el id del profesional. Sin filtro `active`: el
// histórico puede nombrar a alguien que ya no está. Caché corta, como el
// mapa del catálogo.
let _staffPorRid = null;
let _staffPorRidTs = 0;
const _STAFF_TTL_MS = 5 * 60 * 1000;

async function _getStaffPorResourceId() {
  const ahora = Date.now();
  if (_staffPorRid && (ahora - _staffPorRidTs) < _STAFF_TTL_MS) return _staffPorRid;
  const mapa = {};
  try {
    const res = await wixData.query(C_STAFF).limit(100).find(AUTH);
    for (const s of (res.items || [])) {
      const nombre = nombreStaffLimpio(s.displayName || s.canonicalName);
      const rid = String(s.wixResourceId || s._id || '').trim();
      if (rid && nombre) mapa[rid] = nombre;
    }
  } catch (e) {
    console.warn(`${TAG} _getStaffPorResourceId fallo:`, e.message);
    return mapa;   // sin cachear el fallo
  }
  _staffPorRid = mapa;
  _staffPorRidTs = ahora;
  return mapa;
}

/** Citas por _id, en lotes de 50 (patrón de estadisticas.titularPorReserva). */
async function _cargarReservasPorId(ids) {
  const lista = Array.from(new Set(Array.from(ids || []).map(x => String(x || '').trim()).filter(Boolean)));
  const out = {};
  for (let i = 0; i < lista.length; i += 50) {
    const lote = lista.slice(i, i + 50);
    try {
      const r = await wixData.query(C_RESERVAS).hasSome('_id', lote).limit(50).find(AUTH);
      for (const it of (r.items || [])) out[it._id] = it;
    } catch (e) {
      console.warn(`${TAG} _cargarReservasPorId lote ${i}:`, e.message);
    }
  }
  return out;
}

/**
 * Líneas de servicio de la cita con el profesional que ejecuta cada una.
 * MISMA REGLA que repartirLineasPorStaff del cierre del día: la línea de
 * serviciosDetail se cruza con la fase `tipo:'servicio'` del mismo label; si
 * el servicio se repite, por número de ocurrencia. El staffId de esa fase se
 * resuelve contra StaffConfig. Sin staffId propio → `quien: null` (titular).
 * Fuera, como en el cierre: productos 🛒, [EXTRA] y descuentos. Las líneas a
 * 0 € entran para que la ocurrencia se alinee con todas las fases.
 */
function _lineasConProfesional(reserva, staffMap) {
  const fasesSvc = jsonIn(reserva.fases, 'items').filter(f => f && f.tipo === 'servicio');
  const vistas = {};
  const out = [];
  const items = String(reserva.serviciosDetail || '').split(';;').filter(Boolean);
  for (const raw of items) {
    const t = raw.trim();
    if (!t) continue;
    const [labelRaw, priceRaw, cantRaw] = t.split('|');
    const label = (labelRaw || '').trim();
    if (!label) continue;
    if (label.startsWith('🛒') || label.startsWith('[EXTRA]')) continue;
    if (label.toLowerCase().includes('descuento') || label.startsWith('[DESC]')) continue;
    const precio = parseFloat(String(priceRaw || '0').replace(',', '.')) || 0;
    const cantidad = parseInt(cantRaw || '1', 10) || 1;

    const occ = vistas[label] || 0;
    vistas[label] = occ + 1;

    let quien = null;
    let seen = 0;
    for (const f of fasesSvc) {
      if (String(f.label || '').trim() !== label) continue;
      if (seen === occ) {
        const sid = String(f.staffId || '').trim();
        if (sid && staffMap[sid]) quien = staffMap[sid];
        break;
      }
      seen++;
    }
    out.push({ nombre: label, precio, cantidad, quien });
  }
  return out;
}

/**
 * Bruto de la cita para el factor neto/bruto de un cobro: servicios (> 0 €)
 * + extras + productos de serviciosDetail. Mismo cálculo que el cierre del
 * día (parsearServiciosDetail + brutoLineas).
 */
function _brutoLineasCita(detalle) {
  let bruto = 0;
  const items = String(detalle || '').split(';;').filter(Boolean);
  for (const raw of items) {
    const t = raw.trim();
    if (!t) continue;
    const [labelRaw, priceRaw, cantRaw] = t.split('|');
    const label = (labelRaw || '').trim();
    const price = parseFloat(String(priceRaw || '0').replace(',', '.')) || 0;
    const cant  = parseInt(cantRaw || '1', 10) || 1;
    if (label.startsWith('🛒')) bruto += Math.round(price * cant * 100) / 100;
    else if (label.startsWith('[EXTRA]')) bruto += price;
    else if (label.toLowerCase().includes('descuento') || label.startsWith('[DESC]')) continue;
    else if (price > 0) bruto += price * cant;
  }
  return bruto;
}

function _mismoProfesional(a, b) {
  return nombreStaffLimpio(a).toLowerCase() === nombreStaffLimpio(b).toLowerCase();
}

/** ¿La pregunta es por profesional? Solo entonces se desdobla por persona. */
function _esConsultaPorProfesional(f) {
  return !!(f && ((f.staffName && String(f.staffName).trim()) || f.agruparPor === 'staff'));
}

// ═══════════════════════════════════════════════════════════════════════════
// MOTOR DE CONSULTA — TRES MODOS, FILTROS ORTOGONALES
// ═══════════════════════════════════════════════════════════════════════════
//
// El corazón de AKIRA Consultor. Los ejes son INDEPENDIENTES entre sí, por
// eso las combinaciones son ilimitadas sin escribir funciones nuevas:
//
//   desde/hasta · family · staffId · diasSemana · origen · status
//   × agruparPor × modo(reservas|cobros|conversion)
//
// "Ticket medio de tinte los lunes y martes de mayo" =
//   { modo:'reservas', desde:'2026-05-01', hasta:'2026-05-31',
//     family:'coloracion', diasSemana:[1,2], agruparPor:'ninguno' }
// → JS filtra, agrega y divide. Sonnet solo narra el resultado.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normaliza una fila de KamisuiteReservations a la forma que usa el motor.
 * v1.10.0 — `staffMap` (wixResourceId → nombre) resuelve el titular por
 * identificador y el profesional de cada tramo. Añade hora, tramos, minutos
 * por profesional y el reparto del precio entre quienes trabajan la cita.
 */
function normalizarReserva(r, staffMap) {
  const sm = staffMap || {};
  const fecha = fechaISOenMadrid(r.fechaReserva);
  const fasesArr = jsonIn(r.fases, 'items');
  const esBloqueo = r.family === FAMILY_BLOQUEO;

  // v1.10.0 — titular por IDENTIFICADOR. Los bloqueos se graban con
  // staffName vacío: el texto solo es respaldo.
  const titular = sm[String(r.staffId || '').trim()] || nombreStaffLimpio(r.staffName) || '';

  // PROCESO = fases con ocupa:false. NO ocupan al estilista (Conceptos
  // Fundacionales §1). Se separan para poder medir ocupación real.
  // v1.10.0 — duración real de la fase (`dur`), y cada fase que ocupa es un
  // TRAMO de su profesional.
  let minOcupa = 0, minProceso = 0;
  const tramos = [];
  const minPorProfesional = {};
  for (const f of fasesArr) {
    if (!f) continue;
    const dur = _durFase(f);
    if (f.ocupa === false) { minProceso += dur; continue; }
    minOcupa += dur;
    const sid = String(f.staffId || '').trim();
    const deFase = sid ? sm[sid] : '';
    const profesional = (deFase && !_mismoProfesional(deFase, titular)) ? deFase : titular;
    minPorProfesional[profesional] = (minPorProfesional[profesional] || 0) + dur;
    tramos.push({
      inicio: horaMadrid(f.start),
      fin: horaMadrid(f.end),
      servicio: f.label || '',
      profesional,
      _ms: f.start ? new Date(f.start).getTime() : 0
    });
  }
  tramos.sort((a, b) => a._ms - b._ms);

  // v1.10.0 — reparto del precio: las líneas que hace otra persona son
  // suyas; el titular se queda el resto (la suma es el precio de la cita).
  const precio = Number(r.precioTotal) || 0;
  const cuotas = {};
  let resto = precio;
  for (const l of _lineasConProfesional(r, sm)) {
    if (!l.quien || _mismoProfesional(l.quien, titular) || l.precio <= 0) continue;
    const imp = l.precio * l.cantidad;
    cuotas[l.quien] = (cuotas[l.quien] || 0) + imp;
    resto -= imp;
  }
  cuotas[titular] = (cuotas[titular] || 0) + resto;

  return {
    id: r._id,
    fecha,
    hora: horaMadrid(r.fechaReserva),
    dow: dowMadrid(r.fechaReserva),
    family: r.family || '',
    group: r.group || '',
    status: r.status || '',
    precio,
    duracion: Number(r.duracionTotal) || 0,
    minOcupa,
    minProceso,
    staffId: r.staffId || '',
    staffName: titular,
    cliente: r.clientName || '',
    contactId: r.contactId || '',
    telefono: r.clientPhone || '',
    origenRecepcion: r.origenRecepcion === true,
    servicios: r.serviciosDetail || '',
    titulo: r.title || '',
    esBloqueo,
    motivo: esBloqueo ? (r.title || '') : '',
    tramos,
    minPorProfesional,
    cuotas
  };
}

/** Personas que trabajan en una cita: las que tienen tramo o importe. */
function _participantes(r) {
  const set = new Set(Object.keys(r.minPorProfesional || {}));
  for (const [k, v] of Object.entries(r.cuotas || {})) {
    if (Math.abs(Number(v) || 0) > 0.000001) set.add(k);
  }
  if (!set.size) set.add(r.staffName);
  return Array.from(set);
}

/**
 * v1.10.0 — Desdobla cada cita en una fila por profesional que trabaja en
 * ella: su parte del precio, sus minutos y sus tramos. El proceso queda con
 * el titular. `precioCita` conserva el precio entero (lo usa conversión).
 */
function _expandirPorProfesional(filas) {
  const out = [];
  for (const r of filas) {
    const personas = _participantes(r);
    for (const quien of personas) {
      const tramos = (r.tramos || []).filter(t => t.profesional === quien);
      out.push({
        ...r,
        staffName: quien,
        precio: Number(r.cuotas && r.cuotas[quien]) || 0,
        precioCita: r.precio,
        minOcupa: (r.minPorProfesional && r.minPorProfesional[quien]) || 0,
        minProceso: quien === r.staffName ? r.minProceso : 0,
        tramos,
        hora: tramos.length ? tramos[0].inicio : r.hora,
        titularCita: r.staffName,
        compartida: personas.length > 1
      });
    }
  }
  out.sort((a, b) => (`${a.fecha} ${a.hora}`).localeCompare(`${b.fecha} ${b.hora}`));
  return out;
}

/** Forma de un tramo en la respuesta al modelo. */
function _tramosSalida(tramos) {
  return (tramos || []).map(t => ({ inicio: t.inicio, fin: t.fin, servicio: t.servicio, profesional: t.profesional }));
}

/** Normaliza una fila de PaymentReservations. */
function normalizarCobro(p) {
  const bid = p.bookingId || '';
  return {
    id: p._id,
    bookingId: bid,
    reservaId: bid.indexOf(PREFIJO_PAGO) === 0 ? bid.substring(PREFIJO_PAGO.length) : '',
    fechaPago: fechaISOenMadrid(p.fechaPago),
    dowPago: dowMadrid(p.fechaPago),
    fechaReserva: fechaISOenMadrid(p.fechaReserva),
    importe: Number(p.importeTotal) || 0,
    tipoPago: p.tipoPago || '',
    desglose: p.desglosemetodopago || '',
    staff: p.staff || '',
    descripcion: p.descripcion || '',
    cliente: p.nombreCliente || '',
    contactId: p.contactId || '',
    invoiceId: p.invoiceId || ''
  };
}

/** Aplica los filtros ortogonales en memoria (los de rango ya van en la query). */
function aplicarFiltros(filas, f, campoDow) {
  let out = filas;
  if (f.family) {
    // Comparación SIN acentos: el usuario dice "coloración" (con tilde) y el
    // CMS guarda "coloracion" (sin tilde). .toLowerCase() a secas NO casa;
    // normalizarTexto() quita también los acentos. (Fix v1.4.1.)
    const fams = (Array.isArray(f.family) ? f.family : [f.family]).map(normalizarTexto);
    out = out.filter(r => fams.indexOf(normalizarTexto(r.family)) !== -1);
  }
  if (f.group) {
    // Categoría operativa. El CMS guarda 'COLORACION', 'MANICURA_&_PEDICURA'…
    // normalizarGroup colapsa mayúsculas/acentos/_/&/espacios en ambos lados
    // para que el canónico que envía el modelo case aunque no sea idéntico
    // carácter a carácter. (v1.4.2 — group es el eje de categoría.)
    const grps = (Array.isArray(f.group) ? f.group : [f.group]).map(normalizarGroup);
    out = out.filter(r => grps.indexOf(normalizarGroup(r.group)) !== -1);
  }
  if (f.staffId) {
    const ids = Array.isArray(f.staffId) ? f.staffId : [f.staffId];
    out = out.filter(r => ids.indexOf(r.staffId) !== -1);
  }
  if (f.staffName) {
    // v1.10.0 — sin el prefijo de orden ('A_Ricardo' → 'ricardo'): el modelo
    // puede copiar el nombre tal cual aparece en StaffConfig.
    const n = nombreStaffLimpio(f.staffName).toLowerCase();
    out = out.filter(r => String(r.staffName || r.staff || '').toLowerCase().indexOf(n) !== -1);
  }
  if (Array.isArray(f.diasSemana) && f.diasSemana.length > 0) {
    const ds = f.diasSemana.map(Number);
    out = out.filter(r => ds.indexOf(r[campoDow]) !== -1);
  }
  if (f.origen === 'web')      out = out.filter(r => r.origenRecepcion === false);
  if (f.origen === 'recepcion') out = out.filter(r => r.origenRecepcion === true);
  if (f.tipoPago) {
    const t = String(f.tipoPago).toLowerCase();
    out = out.filter(r => String(r.tipoPago || '').toLowerCase().indexOf(t) !== -1);
  }
  if (f.contactId) out = out.filter(r => r.contactId === f.contactId);
  if (f.cliente) {
    const c = String(f.cliente).toLowerCase();
    out = out.filter(r => String(r.cliente || '').toLowerCase().indexOf(c) !== -1);
  }
  return out;
}

/** Clave de agrupación. Añadir un caso aquí = nuevo eje para TODAS las métricas. */
function claveGrupo(r, agruparPor) {
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  switch (agruparPor) {
    case 'staff':      return r.staffName || r.staff || '(sin asignar)';
    case 'family':     return r.family || '(sin familia)';
    case 'group':      return r.group || '(sin categoría)';
    case 'dia':        return r.fecha || r.fechaPago || '(sin fecha)';
    case 'diaSemana':  return dias[r.dow != null ? r.dow : r.dowPago] || '(?)';
    case 'mes':        return (r.fecha || r.fechaPago || '').substring(0, 7) || '(?)';
    case 'tipoPago':   return r.tipoPago || '(sin método)';
    case 'cliente':    return r.cliente || '(sin nombre)';
    case 'origen':     return r.origenRecepcion ? 'recepción' : 'web';
    case 'status':     return r.status || '(sin estado)';
    default:           return null;
  }
}

/** Agrega un conjunto de filas: total, media, count y desglose por grupo. */
function agregar(filas, campoImporte, agruparPor) {
  const total = filas.reduce((s, r) => s + (Number(r[campoImporte]) || 0), 0);
  const count = filas.length;
  const base = {
    numRegistros: count,
    importeTotal: round2(total),
    ticketMedio: count > 0 ? round2(total / count) : 0
  };
  if (!agruparPor || agruparPor === 'ninguno') return base;

  const mapa = {};
  for (const r of filas) {
    const k = claveGrupo(r, agruparPor);
    if (k === null) continue;
    if (!mapa[k]) mapa[k] = { grupo: k, numRegistros: 0, importeTotal: 0 };
    mapa[k].numRegistros++;
    mapa[k].importeTotal += Number(r[campoImporte]) || 0;
  }
  base.desglose = Object.values(mapa)
    .map(g => ({
      grupo: g.grupo,
      numRegistros: g.numRegistros,
      importeTotal: round2(g.importeTotal),
      ticketMedio: g.numRegistros > 0 ? round2(g.importeTotal / g.numRegistros) : 0
    }))
    .sort((a, b) => b.importeTotal - a.importeTotal);
  return base;
}

// ── MODO 1: RESERVAS (productividad a futuro / lo comprometido) ────────────
async function consultarReservas(f) {
  let q = wixData.query(C_RESERVAS);
  if (f.desde) q = q.ge('fechaReserva', new Date(`${f.desde}T00:00:00.000Z`));
  if (f.hasta) q = q.le('fechaReserva', new Date(`${f.hasta}T23:59:59.999Z`));
  q = q.ascending('fechaReserva');

  const raw = await findAll(q, f.limite);
  const staffMap = await _getStaffPorResourceId();   // v1.10.0
  let filas = raw.map(r => normalizarReserva(r, staffMap));

  // Recorte exacto por día de Madrid (la query va en UTC y puede desbordar).
  if (f.desde) filas = filas.filter(r => r.fecha >= f.desde);
  if (f.hasta) filas = filas.filter(r => r.fecha <= f.hasta);

  // Canceladas fuera salvo petición explícita (patrón de producción).
  if (!f.incluirCanceladas) filas = filas.filter(r => r.status !== STATUS_CANCELADA);
  // BLOQUEO no es actividad comercial: fuera salvo que se pida.
  if (!f.incluirBloqueos) filas = filas.filter(r => r.family !== FAMILY_BLOQUEO);
  if (f.status) filas = filas.filter(r => r.status === f.status);

  // v1.10.0 — pregunta por profesional: una fila por persona y cita, con
  // su parte, sus minutos y sus tramos.
  const porProfesional = _esConsultaPorProfesional(f);
  if (porProfesional) filas = _expandirPorProfesional(filas);

  filas = aplicarFiltros(filas, f, 'dow');

  const res = agregar(filas, 'precio', f.agruparPor);
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más registros de los que se pueden leer de una vez. Advierte al usuario de que las cifras son parciales y sugiérele acotar el periodo.';
  }
  if (porProfesional) {
    res.REPARTO = 'Por profesional: cada servicio cuenta para quien lo hace (su columna en la agenda), aunque la cita sea de otra persona. numRegistros = citas en las que trabaja; importeTotal = su parte de esas citas; minutosOcupados = sus tramos.';
  }
  res.minutosOcupados = filas.reduce((s, r) => s + r.minOcupa, 0);
  res.minutosProceso  = filas.reduce((s, r) => s + r.minProceso, 0);
  // v1.10.0 — un bloqueo no es una clienta.
  res.clientesUnicos  = new Set(filas.filter(r => !r.esBloqueo).map(r => r.contactId || r.cliente).filter(Boolean)).size;

  // v1.10.0 — bloqueos completos (sin el tope de la muestra), con hora.
  if (f.incluirBloqueos) {
    const bloqueos = filas.filter(r => r.esBloqueo);
    res.numBloqueos = bloqueos.length;
    res.bloqueos = bloqueos.slice(0, 200).map(r => ({
      fecha: r.fecha,
      inicio: r.tramos.length ? r.tramos[0].inicio : r.hora,
      fin: r.tramos.length ? r.tramos[r.tramos.length - 1].fin : '',
      profesional: r.staffName,
      motivo: r.motivo,
      duracionMin: r.minOcupa
    }));
  }

  res.muestra = filas.slice(0, 40).map(r => {
    const m = {
      fecha: r.fecha, hora: r.hora,
      tipo: r.esBloqueo ? 'bloqueo' : 'cita',
      staff: r.staffName
    };
    if (r.esBloqueo) {
      m.motivo = r.motivo;
    } else {
      m.family = r.family;
      m.cliente = r.cliente;
      m.precio = round2(r.precio);
      m.status = r.status;
      m.origen = r.origenRecepcion ? 'recepción' : 'web';
      m.servicios = r.servicios;
    }
    m.duracion = r.duracion;
    m.tramos = _tramosSalida(r.tramos);
    if (porProfesional && r.titularCita && r.titularCita !== r.staffName) m.titularCita = r.titularCita;
    return m;
  });
  if (filas.length > 40) {
    res.muestraParcial = `La muestra enseña 40 de ${filas.length} filas. Los totales sí cubren todas; para el detalle completo acota el periodo o el profesional.`;
  }
  return res;
}

// ── MAPA label → group (catálogo) para el modo SERVICIOS ───────────────────
//
// serviciosDetail guarda "Nombre|precio;;Nombre|precio|cantidad;;…". El nombre
// es EXACTAMENTE el label de ServiceCatalog (la reserva no reinventa nombres:
// Recepción PRO pinta el calendario desde ese mismo dato). Para categorizar
// cada servicio individual —incluidos los complementos dentro de una reserva—
// se resuelve su nombre contra este mapa y se lee el group del catálogo.
//
// Se cachea a nivel de módulo con TTL corto: el catálogo cambia rara vez y
// una consulta de servicios puede recorrer miles de líneas. Sin caché sería
// una query por consulta; con caché, una cada pocos minutos.
let _mapaSrvGrupo = null;
let _mapaSrvGrupoTs = 0;
const _MAPA_TTL_MS = 5 * 60 * 1000;

async function _getMapaServicioGrupo() {
  const ahora = Date.now();
  if (_mapaSrvGrupo && (ahora - _mapaSrvGrupoTs) < _MAPA_TTL_MS) return _mapaSrvGrupo;
  const mapa = {};
  try {
    const q = wixData.query(C_CATALOGO).isNotEmpty('label').limit(1000);
    const raw = await findAll(q, 1000);
    for (const it of raw) {
      const lab = normalizarTexto(it.label);
      if (lab) mapa[lab] = it.group || '';
    }
  } catch (e) {
    console.warn(`${TAG} _getMapaServicioGrupo fallo:`, e.message);
  }
  _mapaSrvGrupo = mapa;
  _mapaSrvGrupoTs = ahora;
  return mapa;
}

/**
 * Descompone serviciosDetail en líneas de servicio individuales.
 * "Tinte Raiz|40;;Corte Mujer (Complemento)|23;;Secado|6"
 *   → [{nombre:'Tinte Raiz', precio:40, cantidad:1, principal:true},
 *      {nombre:'Corte Mujer (Complemento)', precio:23, cantidad:1, principal:false},
 *      {nombre:'Secado', precio:6, cantidad:1, principal:false}]
 * El PRIMER elemento es el principal; el resto complementos/extras.
 */
function _parsearServiciosDetail(detail) {
  const out = [];
  if (!detail) return out;
  const tramos = String(detail).split(';;');
  for (let i = 0; i < tramos.length; i++) {
    const t = tramos[i].trim();
    if (!t) continue;
    const partes = t.split('|');
    const nombre = (partes[0] || '').trim();
    if (!nombre) continue;
    const precio = Number(partes[1]) || 0;
    const cantidad = partes.length >= 3 ? (Number(partes[2]) || 1) : 1;
    out.push({ nombre, precio, cantidad, principal: i === 0 });
  }
  return out;
}

/**
 * Descompone la `descripcion` de un cobro (PaymentReservations) en los
 * SERVICIOS facturables. Copia LITERAL del split y parseo de estadisticas.web.js
 * v2.5.3 (código de producción del dashboard, que lleva sobre este mismo ledger
 * meses funcionando). Ignora productos (🛒) y extras/propinas (✏️).
 *
 * ⚠️ El split respeta las comas DENTRO de paréntesis:
 *   /,\s*(?=[^)]*(?:\(|$))/  — no parte "Corte (lavado y secado) (35€)".
 * El precio se lee con la regex de estadisticas: \(([\d.]+)€\)\s*$
 */
function _parsearDescripcionCobro(descripcion) {
  const out = [];
  if (!descripcion) return out;
  const items = String(descripcion).split(/,\s*(?=[^)]*(?:\(|$))/);
  for (const raw of items) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('🛒')) continue;   // producto, no servicio
    if (trimmed.startsWith('✏️')) continue;   // propina / extra manual
    const precioMatch = trimmed.match(/\(([\d.]+)€\)\s*$/);
    const precio = precioMatch ? parseFloat(precioMatch[1]) : 0;
    if (precio <= 0) continue;                 // fase embebida a 0€ (Lavado, Secado)
    let nombre = trimmed;
    if (precioMatch) {
      nombre = trimmed.substring(0, trimmed.lastIndexOf('(' + precioMatch[1])).trim();
    }
    nombre = nombre.replace(/,\s*$/, '').trim();
    if (!nombre) continue;
    out.push({ nombre, precio, cantidad: 1, principal: out.length === 0 });
  }
  return out;
}

/**
 * Categoriza un nombre de servicio del ledger por PALABRAS CLAVE, no por cruce
 * con ServiceCatalog. Motivo (lección 19-Jul): los nombres del histórico son de
 * la época V1 ("Tinte (AP)", "Corte de caballero", "Mechas Personalizadas (AP)")
 * y NO coinciden con los label del catálogo actual. estadisticas.web.js ya
 * categoriza así (reclasificarServicio/clasificarExtra). Se replica su mapa de
 * keywords, devolviendo el group canónico de KAMISUITE.
 *
 * Devuelve '' si no reconoce el servicio (queda '(no catalogado)').
 */
function _categorizarPorKeyword(nombre) {
  const n = String(nombre || '')
    .replace(/\s*\(.*?\)\s*/g, ' ')   // quitar "(AP)", "(Complemento)", "(35€)"
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase();
  if (!n) return '';
  // Orden importa: lo más específico primero.
  if (n.includes('TINTE') || n.includes('MECHA') || n.includes('COLOR') || n.includes('MATIZ') || n.includes('BALAYAGE') || n.includes('ILUMINACION')) return 'COLORACION';
  if (n.includes('TRATAMIENTO') || n.includes('BOTOX') || n.includes('KERASTASE') || n.includes('NANOPLASTIA') || n.includes('FUSIO') || n.includes('AMPOLLA') || n.includes('RECONSTRUCCION')) return 'TRATAMIENTOS';
  if (n.includes('BARBA') || (n.includes('CABALLERO')) || n.includes('HOMBRE')) return 'CABALLERO';
  if (n.includes('NIÑO') || n.includes('NINO') || n.includes('NIÑA') || n.includes('NINA')) return 'CABALLERO';
  if (n.includes('MANICURA') || n.includes('PEDICURA') || n.includes('UÑAS') || n.includes('UNAS')) return 'MANICURA_&_PEDICURA';
  if (n.includes('DEPILACION') || n.includes('CERA')) return 'DEPILACION';
  if (n.includes('RECOGIDO') || n.includes('PEINADO') || n.includes('SEMIRECOGIDO')) return 'PEINADOS_&_RECOGIDOS';
  if (n.includes('SPA')) return 'SPA CAPILAR';
  if (n.includes('MOLDEADO') || n.includes('PERMANENTE')) return 'MOLDEADOS';
  if (n.includes('MAQUILLAJE')) return 'OTROS';
  if (n.includes('CORTE')) return 'CORTESMUJER';
  if (n === 'LAVADO' || n === 'SECADO') return '';   // fase, ya excluida por 0€ igualmente
  return '';
}

// ── MODO 4: SERVICIOS (unidades por CATEGORÍA, contando complementos) ──────
// Responde "¿cuántos servicios de corte en junio?" contando CADA servicio
// realmente COBRADO, esté como principal o como complemento.
//
// ⚠️ LEE DE PaymentReservations (el ledger), NO de KamisuiteReservations.
// Motivos (lección 19-Jul, dura):
//   · KamisuiteReservations solo tiene datos desde la migración (julio+). Los
//     meses previos (junio, con 22.000€ facturados) SOLO están en el ledger.
//   · El ledger es lo CONSUMADO: excluye por naturaleza lo no cobrado
//     (cancelaciones, no-shows). "Servicios que se hicieron" = lo que se cobró,
//     no lo que se agendó. Contar sobre reservas metería canceladas.
//
// Cada cobro guarda su(s) servicio(s) en `descripcion` con formato de ledger
// ("Nombre (precio€), Otro (precio€), 🛒 Producto…"). Se descompone con
// _parsearDescripcionCobro —patrón LITERAL de cierreLogicExtendido, que ya
// hace esto para el Cierre Financiero: separa por comas, ignora productos 🛒,
// propinas ✏️ y descuentos 🏷️, y descarta fases a 0€—. Cada nombre de servicio
// se resuelve a su group vía el mapa label→group del catálogo.
async function consultarServicios(f) {
  let q = wixData.query(C_COBROS);
  if (f.desde) q = q.ge('fechaPago', new Date(`${f.desde}T00:00:00.000Z`));
  if (f.hasta) q = q.le('fechaPago', new Date(`${f.hasta}T23:59:59.999Z`));
  q = q.ascending('fechaPago');

  const raw = await findAll(q, f.limite);

  let cobros = raw.map(normalizarCobro);
  if (f.desde) cobros = cobros.filter(r => r.fechaPago >= f.desde);
  if (f.hasta) cobros = cobros.filter(r => r.fechaPago <= f.hasta);
  // Productos de tienda POS no son servicios (Guía V2.0 §D.2: staff='TIENDA_POS').
  cobros = cobros.filter(r => String(r.staff || '').toUpperCase() !== 'TIENDA_POS');
  // Filtros de cobro que también aplican al servicio (día, cliente…).
  // family/group se filtran DESPUÉS, a nivel de servicio individual.
  // v1.10.0 — staffName también: el profesional es el de CADA servicio, no
  // el titular del cobro.
  cobros = aplicarFiltros(cobros, { ...f, family: undefined, group: undefined, staffName: undefined }, 'dowPago');

  const gruposPedidos = f.group
    ? (Array.isArray(f.group) ? f.group : [f.group]).map(normalizarGroup)
    : null;

  // Expandir: una línea por servicio individual cobrado, categorizado por
  // keyword (los nombres del histórico no coinciden con el catálogo actual).
  let servicios = [];
  for (const c of cobros) {
    const lineas = _parsearDescripcionCobro(c.descripcion);
    for (const l of lineas) {
      const group = _categorizarPorKeyword(l.nombre);
      servicios.push({
        nombre: l.nombre,
        group,
        precio: l.precio,
        cantidad: l.cantidad,
        principal: l.principal,
        fecha: c.fechaPago,
        dow: c.dowPago,
        staffName: c.staff,
        cliente: c.cliente,
        _catalogado: group !== '',
        _cobroId: c.id,
        _reservaId: c.reservaId
      });
    }
  }

  // Filtro por categoría (group) a nivel de SERVICIO, no de cobro.
  if (gruposPedidos) {
    servicios = servicios.filter(s => gruposPedidos.indexOf(normalizarGroup(s.group)) !== -1);
  }

  // v1.10.0 — PROFESIONAL DE CADA SERVICIO. El cobro guarda al titular de la
  // cita; quién hizo cada línea está en las fases de la cita (KRI_<id>).
  // Pregunta por profesional → se resuelven todas; si no, solo las que van
  // en la muestra (una lectura, no una por cobro del periodo).
  const porProfesional = _esConsultaPorProfesional(f);
  const objetivo = porProfesional ? servicios : servicios.slice(0, 40);
  const idsCita = new Set(objetivo
    .filter(s => s._reservaId && !MARCADORES_NO_PERSONA.has(String(s.staffName || '').trim().toUpperCase()))
    .map(s => s._reservaId));
  if (idsCita.size > 0) {
    const staffMap = await _getStaffPorResourceId();
    const citas = await _cargarReservasPorId(idsCita);
    const colasPorCobro = {};
    for (const s of objetivo) {
      const cita = s._reservaId ? citas[s._reservaId] : null;
      if (!cita) continue;
      if (!colasPorCobro[s._cobroId]) {
        // Solo líneas > 0 €: _parsearDescripcionCobro descarta las de 0 €.
        const colas = {};
        for (const l of _lineasConProfesional(cita, staffMap)) {
          if (l.precio <= 0) continue;
          if (!colas[l.nombre]) colas[l.nombre] = [];
          colas[l.nombre].push(l.quien || s.staffName);
        }
        colasPorCobro[s._cobroId] = colas;
      }
      const cola = colasPorCobro[s._cobroId][s.nombre];
      if (cola && cola.length) s.staffName = cola.shift();
    }
  }
  if (f.staffName) {
    const n = nombreStaffLimpio(f.staffName).toLowerCase();
    servicios = servicios.filter(s => String(s.staffName || '').toLowerCase().indexOf(n) !== -1);
  }

  const totalImporte = servicios.reduce((s, x) => s + x.precio, 0);
  const totalUnidades = servicios.reduce((s, x) => s + x.cantidad, 0);

  const res = {
    numServicios: servicios.length,
    unidades: totalUnidades,
    importeTotal: round2(totalImporte),
    ticketMedio: servicios.length > 0 ? round2(totalImporte / servicios.length) : 0
  };
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más registros de los que se pueden leer de una vez. Advierte al usuario de que las cifras son parciales y sugiérele acotar el periodo.';
  }

  // Desglose por categoría (group) salvo que pidan otro eje.
  const eje = f.agruparPor && f.agruparPor !== 'ninguno' ? f.agruparPor : 'group';
  const mapa = {};
  for (const s of servicios) {
    let k;
    if (eje === 'group')      k = s.group || '(no catalogado)';
    else if (eje === 'staff') k = s.staffName || '(sin asignar)';
    else if (eje === 'dia')   k = s.fecha || '(sin fecha)';
    else if (eje === 'mes')   k = (s.fecha || '').substring(0, 7) || '(?)';
    else if (eje === 'servicio') k = s.nombre;
    else k = s.group || '(no catalogado)';
    if (!mapa[k]) mapa[k] = { grupo: k, numServicios: 0, unidades: 0, importeTotal: 0 };
    mapa[k].numServicios++;
    mapa[k].unidades += s.cantidad;
    mapa[k].importeTotal += s.precio;
  }
  res.desglose = Object.values(mapa)
    .map(g => ({
      grupo: g.grupo,
      numServicios: g.numServicios,
      unidades: g.unidades,
      importeTotal: round2(g.importeTotal),
      ticketMedio: g.numServicios > 0 ? round2(g.importeTotal / g.numServicios) : 0
    }))
    .sort((a, b) => b.numServicios - a.numServicios);

  res.muestra = servicios.slice(0, 40).map(s => ({
    fecha: s.fecha, servicio: s.nombre, categoria: s.group || '(no catalogado)',
    precio: s.precio, staff: s.staffName, esComplemento: !s.principal
  }));
  return res;
}


async function consultarCobros(f) {
  let q = wixData.query(C_COBROS);
  if (f.desde) q = q.ge('fechaPago', new Date(`${f.desde}T00:00:00.000Z`));
  if (f.hasta) q = q.le('fechaPago', new Date(`${f.hasta}T23:59:59.999Z`));
  q = q.ascending('fechaPago');

  const raw = await findAll(q, f.limite);
  let filas = raw.map(normalizarCobro);

  if (f.desde) filas = filas.filter(r => r.fechaPago >= f.desde);
  if (f.hasta) filas = filas.filter(r => r.fechaPago <= f.hasta);

  // v1.10.0 — pregunta por profesional: cada cobro de cita se reparte entre
  // quienes la trabajaron (regla del cierre del día).
  const porProfesional = _esConsultaPorProfesional(f);
  if (porProfesional) filas = await _repartirCobrosPorProfesional(filas);

  filas = aplicarFiltros(filas, f, 'dowPago');

  const res = agregar(filas, 'importe', f.agruparPor);
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más registros de los que se pueden leer de una vez. Advierte al usuario de que las cifras son parciales y sugiérele acotar el periodo.';
  }
  if (porProfesional) {
    res.REPARTO = 'Por profesional: cada servicio cobrado cuenta para quien lo hizo, aunque el cobro sea de una cita de otra persona (con el descuento repartido en proporción). El titular de la cita se queda el resto del cobro.';
  }
  res.clientesUnicos = new Set(filas.map(r => r.contactId || r.cliente).filter(Boolean)).size;
  // v1.10.0 — sin reparto, `staff` del cobro es el TITULAR de la cita, no
  // quien hizo cada servicio: se le llama por su nombre.
  res.muestra = filas.slice(0, 40).map(r => {
    const m = {
      fechaPago: r.fechaPago, importe: round2(r.importe), tipoPago: r.tipoPago,
      cliente: r.cliente, descripcion: r.descripcion
    };
    if (porProfesional) {
      m.staff = r.staff;
      if (r.titularCita && !_mismoProfesional(r.titularCita, r.staff)) m.titularCita = r.titularCita;
    } else {
      m.titularCita = r.staff;
    }
    return m;
  });
  return res;
}

/**
 * v1.10.0 — Reparte cada cobro de cita entre quienes la trabajaron.
 * Importe de cada línea = tarifa × factor neto/bruto del cobro (cierre del
 * día). Las demás personas reciben su parte en una fila propia; el titular
 * se queda el resto, así que la suma de las filas es el cobro. Cobros sin
 * cita enlazada o de venta (TIENDA, ESPECIALES…) quedan como están.
 */
async function _repartirCobrosPorProfesional(filas) {
  const conCita = filas.filter(c => c.reservaId && !MARCADORES_NO_PERSONA.has(String(c.staff || '').trim().toUpperCase()));
  if (!conCita.length) return filas;
  const staffMap = await _getStaffPorResourceId();
  const citas = await _cargarReservasPorId(conCita.map(c => c.reservaId));

  const out = [];
  for (const c of filas) {
    const cita = c.reservaId ? citas[c.reservaId] : null;
    if (!cita || MARCADORES_NO_PERSONA.has(String(c.staff || '').trim().toUpperCase())) { out.push(c); continue; }

    const bruto = _brutoLineasCita(cita.serviciosDetail);
    const factor = bruto > 0 ? (c.importe / bruto) : 1;
    const cuotas = {};
    let resto = c.importe;
    for (const l of _lineasConProfesional(cita, staffMap)) {
      if (!l.quien || _mismoProfesional(l.quien, c.staff) || l.precio <= 0) continue;
      const imp = l.precio * l.cantidad * factor;
      cuotas[l.quien] = (cuotas[l.quien] || 0) + imp;
      resto -= imp;
    }
    if (!Object.keys(cuotas).length) { out.push(c); continue; }

    // Si todo lo hizo otra persona, el titular no trabajó en ese cobro.
    if (Math.abs(resto) >= 0.005) out.push({ ...c, importe: resto, titularCita: c.staff });
    for (const [quien, imp] of Object.entries(cuotas)) {
      out.push({ ...c, staff: quien, importe: imp, titularCita: c.staff });
    }
  }
  return out;
}

// ── MODO 3: CONVERSIÓN (el delta reservado → cobrado) ──────────────────────
// Ninguna colección sola responde esto. El cruce es por bookingId=KRI_<id>.
async function consultarConversion(f) {
  const fReservas = { ...f, agruparPor: 'ninguno' };
  let q = wixData.query(C_RESERVAS);
  if (f.desde) q = q.ge('fechaReserva', new Date(`${f.desde}T00:00:00.000Z`));
  if (f.hasta) q = q.le('fechaReserva', new Date(`${f.hasta}T23:59:59.999Z`));
  const rawR = await findAll(q, f.limite);

  const staffMap = await _getStaffPorResourceId();   // v1.10.0
  let reservas = rawR.map(r => normalizarReserva(r, staffMap));
  if (f.desde) reservas = reservas.filter(r => r.fecha >= f.desde);
  if (f.hasta) reservas = reservas.filter(r => r.fecha <= f.hasta);
  reservas = reservas.filter(r => r.family !== FAMILY_BLOQUEO);
  // v1.10.0 — por profesional: una fila por persona y cita (su parte).
  if (_esConsultaPorProfesional(f)) reservas = _expandirPorProfesional(reservas);
  reservas = aplicarFiltros(reservas, fReservas, 'dow');

  // Cobros del periodo (por fecha de RESERVA: así el cruce es del mismo lote).
  let qc = wixData.query(C_COBROS);
  if (f.desde) qc = qc.ge('fechaReserva', new Date(`${f.desde}T00:00:00.000Z`));
  if (f.hasta) qc = qc.le('fechaReserva', new Date(`${f.hasta}T23:59:59.999Z`));
  const rawC = await findAll(qc, f.limite);
  const cobros = rawC.map(normalizarCobro);

  const cobradoPorReserva = {};
  for (const c of cobros) {
    if (!c.reservaId) continue;
    if (!cobradoPorReserva[c.reservaId]) cobradoPorReserva[c.reservaId] = 0;
    cobradoPorReserva[c.reservaId] += c.importe;
  }

  // v1.10.0 — en una fila por profesional, lo cobrado se reparte en la
  // misma proporción que el precio de la cita (su parte / precio entero).
  const cobradoDe = (r) => {
    const c = cobradoPorReserva[r.id];
    if (c == null) return null;
    if (r.precioCita != null && Number(r.precioCita) !== 0) return c * (r.precio / r.precioCita);
    return c;
  };

  const canceladas = reservas.filter(r => r.status === STATUS_CANCELADA);
  const vivas      = reservas.filter(r => r.status !== STATUS_CANCELADA);
  const cobradas   = vivas.filter(r => cobradoPorReserva[r.id] != null);
  const sinCobrar  = vivas.filter(r => cobradoPorReserva[r.id] == null);

  const valorComprometido = vivas.reduce((s, r) => s + r.precio, 0);
  const valorCobrado      = cobradas.reduce((s, r) => s + (cobradoDe(r) || 0), 0);
  const valorPerdido      = sinCobrar.reduce((s, r) => s + r.precio, 0);
  const valorCancelado    = canceladas.reduce((s, r) => s + r.precio, 0);

  const res = {
    reservasVivas: vivas.length,
    reservasCanceladas: canceladas.length,
    reservasCobradas: cobradas.length,
    reservasSinCobrar: sinCobrar.length,
    tasaConversionPct: vivas.length > 0 ? round2((cobradas.length / vivas.length) * 100) : 0,
    valorComprometido: round2(valorComprometido),
    valorCobrado: round2(valorCobrado),
    valorPendienteOPerdido: round2(valorPerdido),
    valorCancelado: round2(valorCancelado),
    desviacionCobroPct: valorComprometido > 0
      ? round2(((valorCobrado - valorComprometido) / valorComprometido) * 100) : 0
  };

  if (f.agruparPor && f.agruparPor !== 'ninguno') {
    const mapa = {};
    for (const r of vivas) {
      const k = claveGrupo(r, f.agruparPor);
      if (k === null) continue;
      if (!mapa[k]) mapa[k] = { grupo: k, reservas: 0, cobradas: 0, comprometido: 0, cobrado: 0 };
      mapa[k].reservas++;
      mapa[k].comprometido += r.precio;
      if (cobradoPorReserva[r.id] != null) {
        mapa[k].cobradas++;
        mapa[k].cobrado += cobradoDe(r);
      }
    }
    res.desglose = Object.values(mapa).map(g => ({
      grupo: g.grupo,
      reservas: g.reservas,
      cobradas: g.cobradas,
      tasaConversionPct: g.reservas > 0 ? round2((g.cobradas / g.reservas) * 100) : 0,
      comprometido: round2(g.comprometido),
      cobrado: round2(g.cobrado)
    })).sort((a, b) => b.comprometido - a.comprometido);
  }

  res.muestraSinCobrar = sinCobrar.slice(0, 25).map(r => ({
    fecha: r.fecha, hora: r.hora, cliente: r.cliente, staff: r.staffName,
    family: r.family, precio: round2(r.precio), status: r.status
  }));
  return res;
}

/** Router del motor. Único punto de entrada de la herramienta. */
async function ejecutarConsulta(filtros) {
  const f = filtros || {};
  const modo = f.modo || 'reservas';
  const t0 = Date.now();
  let datos;
  if (modo === 'cobros')          datos = await consultarCobros(f);
  else if (modo === 'conversion') datos = await consultarConversion(f);
  else if (modo === 'servicios')  datos = await consultarServicios(f);
  else                            datos = await consultarReservas(f);
  console.log(`${TAG} consulta modo=${modo} desde=${f.desde || '-'} hasta=${f.hasta || '-'} family=${f.family || '-'} group=${f.group || '-'} staff=${f.staffName || '-'} bloqueos=${f.incluirBloqueos ? 'sí' : 'no'} dow=[${(f.diasSemana || []).join(',')}] agrupa=${f.agruparPor || '-'} → ${Date.now() - t0}ms`);
  return { modo, filtrosAplicados: f, ...datos };
}

// ═══════════════════════════════════════════════════════════════════════════
// MOTOR DE CONFIGURACIÓN — REGISTRO DECLARATIVO
// ═══════════════════════════════════════════════════════════════════════════
//
// SEGUNDA HERRAMIENTA. No es un cuarto modo del motor transaccional, y esto
// es deliberado:
//
//   · Reservations/Payments son TRANSACCIONALES: tienen fecha. Se filtran por
//     periodo, día de semana, rango. "Ticket medio de mayo" tiene sentido.
//   · ServiceCatalog/StaffConfig son CONFIGURACIÓN: NO tienen fecha. Un tinte
//     cuesta 45€ hoy y costaba 45€ en mayo. "Precio del tinte en mayo" no
//     significa nada. Se leen enteras, no se filtran por periodo.
//
// Meterlas en el mismo enum obligaría a que la mitad de los parámetros fueran
// inaplicables según el modo, y el modelo se confundiría.
//
// ───────────────────────────────────────────────────────────────────────────
// POR QUÉ UN REGISTRO Y NO UN SWITCH (regla de Jal, 17-Jul-2026)
// ───────────────────────────────────────────────────────────────────────────
//
// Un switch con 15 casos sería AkiraCapabilities otra vez: hardcodeo
// disfrazado. Aquí, añadir una colección mañana = AÑADIR UNA ENTRADA A ESTE
// OBJETO. Cero código nuevo: ni función, ni caso, ni herramienta.
//
// El input_schema de la herramienta se GENERA desde Object.keys(FUENTES_CONFIG),
// así que el modelo ve la fuente nueva automáticamente, sin tocar el prompt.
//
// v1.11.0: abiertas todas (petición de Jal, 24-Nov-2026). El coste se contiene
// con los techos de filas y de tamaño, el modo compacto y `busqueda`/fechas.
//
// ───────────────────────────────────────────────────────────────────────────
// ANATOMÍA DE UNA FUENTE
// ───────────────────────────────────────────────────────────────────────────
//
//   coleccion     — nombre real de la colección CMS
//   descripcion   — qué contiene. VA AL PROMPT: el modelo elige por aquí.
//   filtroDefecto — { campo: valor } aplicado siempre (p.ej. active:true)
//   orden         — campo de ordenación ascendente (opcional)
//   limite        — techo de filas
//   campos        — WHITELIST, o null = TODOS los campos del registro
//                   (v1.11.0). Los sensibles nunca viajan en ningún caso.
//   objetos       — { campo: claveDesenvuelto } → jsonIn (patrón producción)
//   sensibles     — campos que NUNCA llegan al modelo aunque estén en `campos`
//   transform     — (fila) => fila. Traducción de formatos ilegibles.
//   filaUnica     — true si la colección tiene una sola fila (SalonConfig)
//   loader        — async (params) => filas[] | { filas, nota, aviso }. Para
//                   fuentes que NO son CMS (Contacts, tienda, ficha CRM,
//                   Estadísticas…): llama al backend de la pantalla. Si se declara,
//                   sustituye a `coleccion`/`filtroDefecto`/`orden`. El resto
//                   del motor (whitelist, sensibles, búsqueda) se aplica igual.
//   requiereBusqueda — true si la fuente tiene demasiadas filas para volcarla
//                   entera (CRM: cientos de contactos). El motor rechaza la
//                   llamada sin `busqueda` en vez de reventar el contexto.
//
// ⚠️ `sensibles` NO es decorativo: StaffConfig.pinCode es el PIN de acceso a
// Recepción PRO. Sin esta lista, un PIN viajaría a Anthropic en cada consulta
// de horarios. Lo mismo con masterPin de SalonConfig.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Traduce workingHoursSessionIds (TEXT con JSON) a horario legible.
 *
 * PATRÓN LITERAL de leerHorarioStaffEnDia en widgetPublicoLogic.web.js.
 * NO reinventar: el formato V2 es
 *   {"items":[{"dow":0,"open":false},{"dow":1,"open":true,"from":"10:00","to":"20:00"}]}
 * donde dow = Date.getDay() → 0=domingo … 6=sábado.
 *
 * El formato V1 (lista de session IDs de Bookings) parsea SILENCIOSAMENTE
 * pero no tiene `dow`: rompe toda la disponibilidad pública. Si aparece, se
 * marca como no interpretable en vez de mentir con un horario vacío.
 */
function _transformHorario(fila) {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const raw = fila.workingHoursSessionIds;
  const out = { ...fila };
  delete out.workingHoursSessionIds;

  if (!raw) { out.horario = 'sin horario configurado'; return out; }

  let items = [];
  try {
    if (typeof raw === 'string') {
      const obj = JSON.parse(raw);
      items = Array.isArray(obj?.items) ? obj.items : (Array.isArray(obj) ? obj : []);
    } else if (raw && typeof raw === 'object') {
      items = Array.isArray(raw.items) ? raw.items : (Array.isArray(raw) ? raw : []);
    }
  } catch (e) {
    out.horario = 'horario con formato inválido';
    return out;
  }

  // Detección del formato V1: sin `dow` no hay horario interpretable.
  const tieneDow = items.some(it => it && it.dow != null);
  if (items.length > 0 && !tieneDow) {
    out.horario = 'formato antiguo (V1) — no interpretable, requiere migración';
    return out;
  }

  const tramos = [];
  let minutosSemana = 0;
  for (let d = 0; d <= 6; d++) {
    const it = items.find(x => Number(x?.dow) === d);
    if (!it || !it.open || !it.from || !it.to) continue;
    tramos.push(`${dias[d]} ${it.from}-${it.to}`);
    const [hf, mf] = String(it.from).split(':').map(Number);
    const [ht, mt] = String(it.to).split(':').map(Number);
    const min = (ht * 60 + mt) - (hf * 60 + mf);
    if (min > 0) minutosSemana += min;
  }

  out.horario = tramos.length > 0 ? tramos.join(' · ') : 'sin días abiertos';
  out.horasSemana = round2(minutosSemana / 60);
  out.diasTrabajados = tramos.length;
  return out;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ACCESO TOTAL (v1.11.0) — AKIRA LEE TODO LO QUE GUARDA KAMISUITE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tres vías, y ninguna reimplementa una lectura que ya exista:
 *   1. Colecciones CMS declaradas abajo, con su descripción para el modelo.
 *      Llegan TODOS los campos de cada registro (`campos: null`), como se
 *      decidió el 19-Jul-2026 para el catálogo: la exclusión es por regla
 *      estructural, no por lista de nombres.
 *   2. Datos que no son CMS (tienda, ficha CRM completa, ventas del TPV,
 *      Estadísticas): `loader` que llama a la MISMA función de backend que
 *      alimenta la pantalla correspondiente.
 *   3. Fuente `coleccion`: cualquier otra colección del sitio, también las
 *      que se creen mañana, listadas en tiempo real con el patrón de
 *      cmsFieldReader.listarColeccionesV2.
 *
 * Lo único que NUNCA viaja al modelo: PIN, tokens, secretos, contraseñas y
 * claves de API (RE_CAMPO_SENSIBLE + `sensibles`) y `_owner`.
 */

// Regla estructural: vale para cualquier colección, también las futuras.
// «pin» solo al principio del nombre o como palabra en camelCase (masterPin,
// pinCode, pinMetaNActual), para no tocar nombres como «shipping».
const RE_CAMPO_SENSIBLE = /(^pin|Pin($|[A-Z0-9_])|^PIN|token|Token|TOKEN|secret|Secret|SECRET|password|Password|PASSWORD|apikey|apiKey|ApiKey|APIKEY|api_key|API_KEY)/;
const CAMPOS_SISTEMA_FUERA = new Set(['_owner']);
const MAX_TEXTO_CAMPO     = 2000;    // texto más largo → se recorta
const MAX_OBJETO_CAMPO    = 6000;    // objeto/lista más largo → se recorta
const MAX_RESULTADO_CHARS = 120000;  // techo de lo que viaja al modelo por llamada
const ESCANEO_BUSQUEDA    = 1000;    // filas leídas antes de aplicar `busqueda`
// Modo compacto: si el resultado no cabe, primero se acortan textos y objetos
// de TODOS los registros; solo si aun así no cabe se quitan registros.
const MAX_TEXTO_COMPACTO  = 200;
const MAX_OBJETO_COMPACTO = 800;

function _esCampoSensible(campo, def) {
  if ((def.sensibles || []).indexOf(campo) !== -1) return true;
  return RE_CAMPO_SENSIBLE.test(String(campo));
}

/** Fecha → "AAAA-MM-DD HH:MM" en Madrid; texto u objeto largo → recortado. */
function _valorParaModelo(v, def) {
  if (v instanceof Date) {
    const f = fechaISOenMadrid(v);
    const h = horaMadrid(v);
    return h ? `${f} ${h}` : f;
  }
  if (def.sinRecorte && !def.compacto) return v;
  const maxTexto  = def.compacto ? MAX_TEXTO_COMPACTO  : MAX_TEXTO_CAMPO;
  const maxObjeto = def.compacto ? MAX_OBJETO_COMPACTO : MAX_OBJETO_CAMPO;
  if (typeof v === 'string') {
    return v.length > maxTexto ? v.substring(0, maxTexto) + '… [texto recortado]' : v;
  }
  if (v && typeof v === 'object') {
    let s;
    try { s = JSON.stringify(v); } catch (e) { return '[no legible]'; }
    if (s && s.length > maxObjeto) return s.substring(0, maxObjeto) + '… [recortado]';
  }
  return v;
}

/**
 * Proyección de un registro. `campos` declarado = whitelist (comportamiento
 * anterior); `campos: null` = todos los campos del registro. En los dos
 * casos se aplican sensibles, OBJECT envueltos (jsonIn) y transform.
 */
function _proyectarFila(item, def) {
  const out = {};
  const src = item || {};
  const objetos = (def.objetos && !Array.isArray(def.objetos)) ? def.objetos : {};
  const campos = Array.isArray(def.campos) ? def.campos : Object.keys(src);
  for (const campo of campos) {
    if (CAMPOS_SISTEMA_FUERA.has(campo)) continue;
    if (_esCampoSensible(campo, def)) continue;
    if (Object.prototype.hasOwnProperty.call(objetos, campo)) continue; // se desenvuelve abajo
    const v = src[campo];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[campo] = _valorParaModelo(v, def);
  }
  for (const [campo, clave] of Object.entries(objetos)) {
    if (_esCampoSensible(campo, def)) continue;
    const arr = jsonIn(src[campo], clave);
    if (arr.length > 0) out[campo] = def.compacto ? _valorParaModelo(arr, def) : arr;
  }
  return def.transform ? def.transform(out) : out;
}

/** ¿Cae la fecha en [desde, hasta] (días de Madrid, inclusive)? */
function _enRangoMadrid(valor, desde, hasta) {
  if (!valor) return false;
  const f = fechaISOenMadrid(valor);
  if (!f) return false;
  if (desde && f < desde) return false;
  if (hasta && f > hasta) return false;
  return true;
}

/**
 * Lectura declarativa de una colección CMS. Con fecha: la query se abre un
 * día por cada lado (va en UTC) y se recorta exacto por día de Madrid, como
 * consultarReservas. Lo más reciente primero, para que el techo deje fuera
 * lo más antiguo y no lo último.
 */
async function _leerColeccion(coleccion, def, p) {
  let q = wixData.query(coleccion);
  if (!p.incluirInactivos) {
    for (const [campo, valor] of Object.entries(def.filtroDefecto || {})) {
      q = q.eq(campo, valor);
    }
  }
  const campoFecha = def.campoFecha || null;
  const conRango = !!(campoFecha && (p.desde || p.hasta));
  if (campoFecha) {
    if (p.desde) q = q.ge(campoFecha, new Date(`${sumarDias(p.desde, -1)}T00:00:00.000Z`));
    if (p.hasta) q = q.le(campoFecha, new Date(`${sumarDias(p.hasta, 1)}T23:59:59.999Z`));
    q = q.descending(campoFecha);
  } else if (def.orden) {
    q = q.ascending(def.orden);
  }
  const limite = def.limite || 300;
  const techo = p.busqueda ? Math.max(limite, def.escaneo || ESCANEO_BUSQUEDA) : limite;
  const raw = await findAll(q, techo);
  let filas = raw;
  if (conRango) filas = raw.filter(it => _enRangoMadrid(it[campoFecha], p.desde, p.hasta));
  return { filas, truncado: !!raw._truncado, techo };
}

// ── LOADERS (datos que no son CMS: misma función que la pantalla) ─────────

/**
 * Loader del CRM de Wix (Wix Contacts).
 *
 * CONTRATO VERIFICADO en producción (pagecode_recepcionPRO v2.1.5 línea 247):
 *   cargarTodosContactos() → { ok: true, clientes: [{ contactId, nombreCompleto, email, telefono }] }
 * NO devuelve un array pelado. `consoleIA` v3.5.8 hace `todosRaw?.clientes`.
 *
 * v1.11.0: el contactId VIAJA al modelo (capa de datos ≠ capa de conversación,
 * 19-Jul-2026): es la llave para pedir la ficha completa o buscar al cliente
 * en bonos, notas, cuidado o LOPD. La regla 1c le prohíbe recitarlo.
 */
async function _loaderClientes() {
  const res = await cargarTodosContactos();
  if (!res || !res.ok) {
    console.warn(`${TAG} _loaderClientes: cargarTodosContactos no OK`);
    return [];
  }
  return (res.clientes || []).map(c => ({
    nombreCompleto: c.nombreCompleto || '',
    telefono: c.telefono || '',
    email: c.email || '',
    contactId: c.contactId || ''
  }));
}

const RE_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function _normBusqueda(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Ficha CRM completa de UN cliente: lo mismo que pinta la Ficha Cliente
 * (getFichaCliente: contacto, puntos, PRIME, bonos, tarjetas, notas, CIF,
 * fecha de nacimiento, facturado y visitas) más su historial de cobros
 * (getHistorialCliente). Acepta contactId o texto (nombre, teléfono, email):
 * si el texto da varios clientes, devuelve los candidatos para elegir.
 * Nota: getFichaCliente sincroniza la caché ClientProfile, igual que al abrir
 * la ficha en pantalla.
 */
async function _loaderFichaCliente(p) {
  const texto = String(p.busqueda || '').trim();
  let contactId = RE_GUID.test(texto) ? texto : '';

  if (!contactId) {
    const todos = await _loaderClientes();
    const needle = _normBusqueda(texto);
    const digitos = needle.replace(/[^\d]/g, '');
    const match = todos.filter(c => {
      const blob = _normBusqueda(`${c.nombreCompleto} ${c.email} ${c.telefono}`);
      if (needle && blob.indexOf(needle) !== -1) return true;
      if (digitos.length >= 6 && blob.replace(/[^\d]/g, '').indexOf(digitos) !== -1) return true;
      return false;
    });
    if (match.length === 0) {
      return { filas: [], nota: `No hay ningún cliente que coincida con "${texto}".` };
    }
    if (match.length > 1) {
      return {
        filas: match.slice(0, 25),
        nota: `Hay ${match.length} clientes que coinciden con "${texto}". Pregunta cuál es o vuelve a llamar con su contactId.`
      };
    }
    contactId = match[0].contactId;
  }

  const [ficha, historial] = await Promise.all([
    getFichaCliente({ contactId }),
    getHistorialCliente({ contactId })
  ]);
  if (!ficha || !ficha.ok) {
    const msg = (ficha && ficha.error && (ficha.error.message || ficha.error)) || 'sin respuesta';
    throw new Error('ficha no disponible: ' + msg);
  }
  const fila = { contactId, cliente: ficha.cliente, perfil: ficha.profile, avisos: ficha.warnings };
  if (historial && historial.ok) {
    fila.visitas = historial.visitas;
    fila.comprasTienda = historial.ventasTienda;
  }
  return [fila];
}

// La tienda se lee dos veces por pregunta en el peor caso (el modelo puede
// volver a pedirla): caché corta para no repetir el recorrido del catálogo.
let _cacheTienda = null;
let _cacheTiendaTs = 0;
const TTL_TIENDA_MS = 3 * 60 * 1000;

/**
 * Productos de la TIENDA (Wix Stores), con lo mismo que ve el gestor de
 * productos (listarProductosParaEdicion: ocultos incluidos, visibilidad,
 * oferta, porcentaje, stock, marca, categorías) y las variantes con su
 * precio de la pantalla Tienda Productos (listarProductos). Si las variantes
 * fallan, el catálogo llega igual sin ellas.
 */
async function _loaderTienda(p) {
  if (_cacheTienda && (Date.now() - _cacheTiendaTs) < TTL_TIENDA_MS) return _filasTiendaSegun(_cacheTienda, p);

  const [ed, tpv] = await Promise.all([
    listarProductosParaEdicion(),
    listarProductos().catch(e => ({ ok: false, error: e.message }))
  ]);
  if (!ed || !ed.ok) throw new Error((ed && ed.error) || 'no se pudo leer la tienda');

  const variantesPorId = new Map();
  if (tpv && tpv.ok) {
    for (const p of (tpv.productos || [])) {
      if (p.manageVariants && Array.isArray(p.variants) && p.variants.length) {
        variantesPorId.set(p.id, p.variants.map(v => ({
          variante: v.label,
          precioVenta: v.price,
          precioOriginal: v.precioOriginal,
          enOferta: v.enPromocion === true,
          sku: v.sku || undefined,
          enStock: v.inStock
        })));
      }
    }
  } else {
    console.warn(`${TAG} _loaderTienda: variantes no disponibles (${tpv && tpv.error})`);
  }

  const filas = (ed.productos || []).map(p => {
    const enOferta = p.enPromocion === true;
    return {
      id: p.id,
      nombre: p.name,
      marca: p.brand || undefined,
      precioVenta: enOferta ? p.discountedPrice : p.price,
      precioOriginal: p.price,
      enOferta,
      descuentoPct: enOferta ? p.descuentoPct : undefined,
      descuentoGuardado: p.discount || undefined,
      cinta: p.ribbon || undefined,
      visibleEnLaWeb: p.visible,
      enStock: p.inStock,
      seguimientoStock: p.trackInventory,
      unidadesEnStock: p.quantityInStock,
      sku: p.sku || undefined,
      tipo: p.productType,
      categorias: (p.collections || []).map(c => c.name).filter(Boolean),
      variantes: variantesPorId.get(p.id),
      infoAdicional: (Array.isArray(p.additionalInfoSections) && p.additionalInfoSections.length)
        ? p.additionalInfoSections : undefined,
      descripcion: String(p.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    };
  });

  _cacheTienda = filas;
  _cacheTiendaTs = Date.now();
  return _filasTiendaSegun(filas, p);
}

// Sin búsqueda viaja el catálogo entero: la descripción y la información
// adicional (textos largos) solo cuando se pregunta por productos concretos.
function _filasTiendaSegun(filas, p) {
  if (p && p.busqueda) return filas;
  return filas.map(f => {
    const o = { ...f };
    delete o.descripcion;
    delete o.infoAdicional;
    return o;
  });
}

/** Ventas de productos en el TPV (pedidos de la tienda), como el historial de ventas. */
// Search Orders devuelve 100 pedidos por página (docs de eCommerce); el
// historial de ventas pide una sola página. Si llegan 100, puede haber más.
async function _loaderVentasTpv(p) {
  const res = await obtenerHistorialVentas({ fechaDesde: p.desde, fechaHasta: p.hasta, limit: 100 });
  if (!res || !res.ok) throw new Error((res && res.error) || 'no se pudo leer el historial de ventas');
  const ventas = res.ventas || [];
  if (ventas.length >= 100) {
    return { filas: ventas, aviso: 'Se han leído los 100 pedidos más recientes del periodo: puede haber más. Acota con desde/hasta.' };
  }
  return ventas;
}

/** Lo mismo que la pantalla Estadísticas para un periodo. */
async function _loaderEstadisticas(p) {
  const res = await obtenerEstadisticas({ fechaDesde: p.desde, fechaHasta: p.hasta });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'no se pudieron calcular las estadísticas');
  if (res.hayDatos === false) return { filas: [], nota: 'No hay datos en ese periodo.' };
  const out = { ...res };
  delete out.ok;
  return [out];
}

// Listado de colecciones del sitio: patrón LITERAL de
// cmsFieldReader.listarColeccionesV2 (elevate + parseo del response).
// Por defecto devuelve hasta 1000 colecciones (docs de List Data Collections).
const listDataCollectionsElevated = elevate(collections.listDataCollections);
let _cacheColecciones = null;
let _cacheColeccionesTs = 0;

async function _listarColeccionesSitio() {
  if (_cacheColecciones && (Date.now() - _cacheColeccionesTs) < 10 * 60 * 1000) return _cacheColecciones;
  const response = await listDataCollectionsElevated();
  let rawList = [];
  if (response && Array.isArray(response.collections)) {
    rawList = response.collections;
  } else if (response && Array.isArray(response.dataCollections)) {
    rawList = response.dataCollections;
  } else if (Array.isArray(response)) {
    rawList = response;
  } else if (response && Array.isArray(response.items)) {
    rawList = response.items;
  }
  const lista = rawList.map(c => ({
    id: c.id || c._id || c.dataCollectionId || '',
    nombre: c.displayName || c.displayField || c.name || '',
    tipo: (typeof c.collectionType !== 'undefined') ? c.collectionType
        : (typeof c.type !== 'undefined') ? c.type : ''
  })).filter(c => c.id);
  _cacheColecciones = lista;
  _cacheColeccionesTs = Date.now();
  return lista;
}

/**
 * Registro de fuentes.
 * AMPLIAR AQUÍ = añadir una entrada. El enum de la herramienta y su
 * descripción se generan desde este objeto.
 *
 *   campoFecha — campo de fecha por el que filtran `desde`/`hasta` (el que ya
 *                usa el backend de producción de esa colección; si no hay
 *                ninguno, `_createdDate`, que existe en todas).
 *   escaneo    — filas que se leen antes de aplicar `busqueda`.
 *   requiereFechas — la fuente exige `desde` y `hasta`.
 *   sinRecorte — los textos y objetos largos no se recortan (informes).
 *   toleraSinMatch — fuente pequeña de configuración: una búsqueda sin
 *                coincidencias devuelve todo (comportamiento anterior). En
 *                el resto, sin coincidencias es cero.
 */
const FUENTES_CONFIG = {

  // ── CONFIGURACIÓN Y CATÁLOGOS ─────────────────────────────────────────

  servicios: {
    coleccion: 'ServiceCatalog',
    toleraSinMatch: true,
    descripcion: 'Catálogo de servicios con TODOS sus datos: precio de tarifa, duración, familia, grupo, fases, complementos, variantes, bonos, descuentos promocionales, si se reserva por web o solo en recepción, pago anticipado, servicio enlazado, smart pricing… Para el precio al que ESTÁ un servicio (tarifa), no lo cobrado. Solo activos salvo incluirInactivos.',
    filtroDefecto: { active: true },
    orden: 'order',
    limite: 400,
    campos: null,
    objetos: { mapeoFases: 'items', complementos: 'items', variantes: 'items' },
    sensibles: []
  },

  categorias: {
    coleccion: 'HairSalonServices',
    toleraSinMatch: true,
    descripcion: 'Categorías del Tour de Servicios (agrupación comercial de los servicios en la web) y qué colecciones de la tienda se sugieren con cada una en los correos.',
    limite: 200,
    campos: null,
    sensibles: []
  },

  personal: {
    coleccion: 'StaffConfig',
    toleraSinMatch: true,
    descripcion: 'Profesionales del salón con todos sus datos: horario semanal, horas semanales, comisión, si es externo, nivel de acceso, foto, notas. Solo activos salvo incluirInactivos.',
    filtroDefecto: { active: true },
    limite: 100,
    campos: null,
    objetos: {},
    // pinCode NUNCA llega al modelo: es el PIN de acceso a Recepción PRO.
    sensibles: ['pinCode'],
    transform: _transformHorario
  },

  salon: {
    coleccion: 'SalonConfig',
    toleraSinMatch: true,
    descripcion: 'Configuración general del salón (todos los ajustes): nombre, datos fiscales y de contacto, IVA, horarios de apertura, módulos activos (tienda, fidelización, WhatsApp, email), plan contratado, avisos y textos configurados.',
    filaUnica: true,
    limite: 1,
    campos: null,
    objetos: {},
    // masterPin y pinMetaNActual son credenciales. Nunca al modelo.
    sensibles: ['masterPin', 'pinMetaNActual', 'newnumbercommandMeta']
  },

  externos: {
    coleccion: 'ExternalServices',
    toleraSinMatch: true,
    descripcion: 'Catálogo de servicios externos (los que presta personal no propio) y el porcentaje que retiene el salón de cada uno.',
    filtroDefecto: { activeStatus: true },
    limite: 100,
    campos: null,
    objetos: {},
    sensibles: []
  },

  tienda: {
    fuenteApi: 'Tienda (catálogo de productos a la venta)',
    descripcion: 'PRODUCTOS DE LA TIENDA (los que se venden a la clienta, online o en el salón), ocultos incluidos: precio de venta, precio original, si está EN OFERTA y con qué % de descuento, visibilidad en la web, stock y unidades, marca, categorías, variantes con su precio; la descripción y la información adicional llegan al buscar productos concretos. Úsala para cualquier pregunta de productos a la venta, precios de producto, ofertas o descuentos de producto. NO es el almacén de uso interno.',
    loader: _loaderTienda,
    limite: 1000,
    campos: null,
    sensibles: []
  },

  almacen: {
    coleccion: 'KamisuiteStock',
    toleraSinMatch: true,
    descripcion: 'ALMACÉN DE USO EN EL SALÓN (productos que se consumen en cabina, no la tienda): botes cerrados en estantería, botes abiertos en uso, stock mínimo y máximo, coste unitario, precio de venta de referencia, proveedor, marca, categoría. Para productos bajo mínimos, valor del almacén o reposición. Solo activos salvo incluirInactivos.',
    filtroDefecto: { active: true },
    orden: 'productName',
    limite: 1000,
    campos: null,
    sensibles: []
  },

  especialesConfig: {
    coleccion: 'KamisuiteProductsConfig',
    descripcion: 'Configuración de los productos especiales del salón (PRIME, bonos, tarjetas promocionales): si están activos, precio y duración de PRIME, validez de los bonos, beneficios.',
    filaUnica: true,
    limite: 1,
    campos: null,
    sensibles: []
  },

  campanasPromo: {
    coleccion: 'KamisuitePromoCampaigns',
    descripcion: 'Campañas de tarjetas promocionales definidas por el salón: tipo, precio, ventana de fechas, si están activas.',
    limite: 200,
    campos: null,
    sensibles: []
  },

  tarjetasRegaloPromo: {
    coleccion: 'PromoGiftCards',
    descripcion: 'Promociones de tarjeta regalo publicadas: título, precio original, precio promocional, descripción, validez y si están activas.',
    limite: 200,
    campos: null,
    sensibles: []
  },

  smartPricing: {
    coleccion: 'SmartPricingVersiones',
    descripcion: 'Smart pricing (ofertas por día y hora en la reserva online). Cada fila es un análisis de ocupación con sus propuestas; la que tiene vigente = true es la que se aplica, con sus reglas (días, horas, porcentaje y días de antelación). OJO: solo funciona si el interruptor general está encendido (smartPricingActivo en salon) y SOLO se aplica a los servicios que tienen smart pricing activado en el catálogo (campo smartPricing en servicios); no a todos. Nunca se suma a la promo del servicio: solo se aplica si la supera. Para decir a qué servicios se aplica, consulta servicios.',
    campoFecha: '_createdDate',
    limite: 100,
    campos: null,
    sensibles: []
  },

  campanaTienda: {
    coleccion: 'KamisuiteCampanaProgramada',
    descripcion: 'Campañas de descuento para toda la tienda (p. ej. Black Friday) programadas por fechas: porcentaje, inicio, fin, estado (PROGRAMADA, ACTIVA, TERMINADA) y resultado.',
    campoFecha: '_createdDate',
    limite: 100,
    campos: null,
    sensibles: []
  },

  b2b: {
    coleccion: 'B2BProfiles',
    descripcion: 'Perfiles de clientes profesionales (B2B): empresa, CIF/NIF, dirección de facturación, código de descuento y productos habituales.',
    limite: 300,
    campos: null,
    sensibles: []
  },

  // ── CLIENTES ──────────────────────────────────────────────────────────

  clientes: {
    fuenteApi: 'Wix Contacts (CRM)',
    descripcion: 'Contactos del salón: nombre completo, teléfono, email y su contactId. Úsalo para localizar a una persona (o su contactId para buscarla en otras fuentes). SIEMPRE con `busqueda`: son cientos de contactos. Para todo lo demás de un cliente usa fichaCliente.',
    loader: _loaderClientes,
    requiereBusqueda: true,
    limite: 25,
    campos: ['nombreCompleto', 'telefono', 'email', 'contactId'],
    objetos: {},
    sensibles: []
  },

  fichaCliente: {
    fuenteApi: 'Ficha Cliente del CRM',
    descripcion: 'FICHA COMPLETA DE UN CLIENTE, la misma de la pantalla Ficha Cliente: datos de contacto, fecha de nacimiento, sexo, CIF y razón social, puntos de fidelización, PRIME, bonos y tarjetas activos, notas del salón, mensajes con la clienta, notas de color y tratamientos, total facturado, número de visitas, última visita y el historial de visitas y compras. `busqueda` = nombre, teléfono, email o contactId; si hay varios clientes devuelve los candidatos.',
    loader: _loaderFichaCliente,
    loaderBusca: true,   // la búsqueda la resuelve el propio loader
    requiereBusqueda: true,
    limite: 25,
    campos: null,
    sinRecorte: true,
    sensibles: []
  },

  notasCliente: {
    coleccion: 'KamisuiteClientRecords',
    descripcion: 'Anotaciones de clientes, una fila por anotación: fichas técnicas de COLOR y TRATAMIENTO, notas generales, notas que la clienta deja al salón (NOTA_CLIENTE) y mensajes del salón a la clienta (MENSAJE_SALON). Busca por nombre o contactId.',
    campoFecha: '_createdDate',
    escaneo: 3000,
    limite: 300,
    campos: null,
    sensibles: []
  },

  cuidadoPerfil: {
    coleccion: 'ClientCareProfile',
    descripcion: 'Perfil de Cuidado y Salud de cada cliente (uno por cliente): estado del cabello, piel, uñas o pestañas, notas y seguimiento. Busca por nombre o contactId.',
    escaneo: 3000,
    limite: 200,
    campos: null,
    sensibles: []
  },

  cuidadoVisitas: {
    coleccion: 'CareVisitRecord',
    descripcion: 'Historial de Cuidado y Salud por visita y zona: diagnósticos (también los de IA sobre foto), tratamientos y recomendaciones.',
    campoFecha: '_createdDate',
    escaneo: 3000,
    limite: 200,
    campos: null,
    sensibles: []
  },

  lopd: {
    coleccion: 'ClientLopdSignatures',
    descripcion: 'Firmas de protección de datos (LOPD) de los clientes: fecha de firma y consentimientos aceptados, incluido el uso de imágenes del resultado del trabajo.',
    campoFecha: '_createdDate',
    escaneo: 3000,
    limite: 300,
    campos: null,
    sensibles: []
  },

  bonos: {
    coleccion: 'KamisuiteVouchers',
    descripcion: 'Bonos vendidos: cliente, servicio, sesiones totales y restantes, descuento aplicado, estado, caducidad y si van ligados a PRIME.',
    campoFecha: '_createdDate',
    escaneo: 3000,
    limite: 500,
    campos: null,
    sensibles: []
  },

  bonosCanjes: {
    coleccion: 'KamisuiteVoucherRedemptions',
    descripcion: 'Canjes de bonos: cada sesión de bono consumida, con su cliente, bono y fecha.',
    campoFecha: '_createdDate',
    escaneo: 3000,
    limite: 500,
    campos: null,
    sensibles: []
  },

  prime: {
    coleccion: 'KamisuitePrimeMemberships',
    descripcion: 'Membresías PRIME emitidas: cliente, código, estado, fecha de alta y caducidad.',
    campoFecha: '_createdDate',
    escaneo: 3000,
    limite: 500,
    campos: null,
    sensibles: []
  },

  tarjetasPromo: {
    coleccion: 'KamisuitePromoCards',
    descripcion: 'Tarjetas promocionales vendidas (una por venta), también las de regalo: comprador, beneficiario, importe, estado y caducidad.',
    campoFecha: '_createdDate',
    escaneo: 3000,
    limite: 500,
    campos: null,
    sensibles: []
  },

  pedidosTarjetaRegalo: {
    coleccion: 'GiftCardOrders',
    descripcion: 'Pedidos de tarjetas regalo promocionales hechos en la web: promoción, quién la envía, destinatario, mensaje e importe.',
    campoFecha: '_createdDate',
    limite: 300,
    campos: null,
    sensibles: []
  },

  // ── ACTIVIDAD (todo con fechas: desde / hasta) ────────────────────────

  reservasDetalle: {
    coleccion: 'KamisuiteReservations',
    descripcion: 'Reservas registro a registro con TODOS sus datos (notas, fases, tramos, origen, estado, precio, cliente, profesional). Para el detalle de citas concretas. Para totales, conteos y comparativas usa consultar_datos_salon.',
    campoFecha: 'fechaReserva',
    escaneo: 2000,
    limite: 300,
    campos: null,
    sensibles: []
  },

  cobrosDetalle: {
    coleccion: 'PaymentReservations',
    descripcion: 'Cobros registro a registro con TODOS sus datos (descripción de lo cobrado, método de pago, importe, descuentos, propina, factura, cliente, profesional), también ventas de producto y de especiales. Para totales usa consultar_datos_salon.',
    campoFecha: 'fechaPago',
    escaneo: 2000,
    limite: 300,
    campos: null,
    sensibles: []
  },

  cobrosExternos: {
    coleccion: 'PagoreservasExternos',
    descripcion: 'Cobros de servicios externos (personal no propio): servicio, cliente, importe y comisión.',
    campoFecha: 'fechaPago',
    escaneo: 2000,
    limite: 300,
    campos: null,
    sensibles: []
  },

  externosHistorico: {
    coleccion: 'SvExternalRecords',
    descripcion: 'Registro histórico de citas de servicios externos del sistema anterior (lo siguen leyendo Estadísticas y la ficha del cliente).',
    campoFecha: 'date',
    escaneo: 2000,
    limite: 300,
    campos: null,
    sensibles: []
  },

  ventasTpv: {
    fuenteApi: 'Pedidos del TPV de la tienda',
    descripcion: 'Ventas de productos hechas en el TPV de la tienda (pedidos), con producto, cantidad, importe, cliente, fecha y factura. Las ventas de producto cobradas en Recepción también están en cobrosDetalle.',
    loader: _loaderVentasTpv,
    loaderFechas: true,
    limite: 1000,
    campos: null,
    sensibles: []
  },

  estadisticas: {
    fuenteApi: 'Pantalla Estadísticas',
    descripcion: 'Lo mismo que la pantalla Estadísticas para un periodo: ingresos, IVA, descuentos, propinas, ranking de servicios, por día, día de la semana, método de pago y profesional, productividad, extras, externos, PRODUCTOS VENDIDOS (web y TPV), bonos (canjes, trabajo y deuda) y tipos de cliente. Exige desde y hasta.',
    loader: _loaderEstadisticas,
    loaderFechas: true,
    requiereFechas: true,
    filaUnica: true,
    limite: 1,
    campos: null,
    sinRecorte: true,
    sensibles: []
  },

  facturas: {
    coleccion: 'Invoices',
    descripcion: 'Facturas emitidas a clientes: número, fecha, cliente, datos fiscales, líneas, base, IVA y total.',
    campoFecha: '_createdDate',
    escaneo: 2000,
    limite: 300,
    campos: null,
    sensibles: []
  },

  caja: {
    coleccion: 'CashRegister',
    descripcion: 'Caja del día (una fila por día): apertura, fondo, arqueo de efectivo, cierre, y confirmación de datáfono y Bizum.',
    campoFecha: 'registerDate',
    limite: 400,
    campos: null,
    sensibles: []
  },

  cajaMovimientos: {
    coleccion: 'CashMovements',
    descripcion: 'Movimientos manuales de caja: entradas, salidas y retiradas de efectivo, con importe, motivo y quién lo hizo.',
    campoFecha: 'registerDate',
    escaneo: 2000,
    limite: 500,
    campos: null,
    sensibles: []
  },

  almacenMovimientos: {
    coleccion: 'KamisuiteStockMoves',
    descripcion: 'Libro de movimientos del almacén de uso en el salón: entradas (compra, traspaso desde la tienda, devolución), salidas (consumo en servicio, rotura, caducidad), aperturas de bote y ajustes por recuento, con producto, cantidad, existencias antes y después y quién lo hizo.',
    campoFecha: '_createdDate',
    escaneo: 3000,
    limite: 500,
    campos: null,
    sensibles: []
  },

  fichajes: {
    coleccion: 'TimeClockRecords',
    descripcion: 'Control horario del personal: fichajes de entrada, salida y pausas, con profesional, día y hora.',
    campoFecha: '_createdDate',
    escaneo: 3000,
    limite: 600,
    campos: null,
    sensibles: []
  },

  accesosRecepcion: {
    coleccion: 'ReceptionAccessLog',
    descripcion: 'Registro de accesos y actividad en Recepción PRO: quién entró con su PIN, cuándo y qué hizo.',
    campoFecha: '_createdDate',
    escaneo: 3000,
    limite: 500,
    campos: null,
    sensibles: []
  },

  comunicaciones: {
    coleccion: 'CommunicationLog',
    descripcion: 'Histórico de comunicaciones enviadas a clientes por WhatsApp y email (confirmaciones, recordatorios, cancelaciones, compras, campañas…): canal, evento, destinatario, resultado y estado de entrega.',
    campoFecha: '_createdDate',
    escaneo: 3000,
    limite: 600,
    campos: null,
    sensibles: []
  },

  recordatorios: {
    coleccion: 'ReminderLog',
    descripcion: 'Recordatorios automáticos de cita enviados (24 h antes): a qué reserva y cuándo.',
    campoFecha: '_createdDate',
    escaneo: 3000,
    limite: 600,
    campos: null,
    sensibles: []
  },

  campanasEmail: {
    coleccion: 'EmailCampaigns',
    descripcion: 'Campañas de email: asunto, lista de destinatarios, programación, estado y cifras de envío.',
    campoFecha: '_createdDate',
    limite: 200,
    campos: null,
    sensibles: []
  },

  campanasWhatsapp: {
    coleccion: 'MarketingCampaigns',
    descripcion: 'Campañas de WhatsApp guardadas: plantilla, contenido, último uso y número de veces usada.',
    campoFecha: '_createdDate',
    limite: 200,
    campos: null,
    sensibles: []
  },

  cambiosServicios: {
    coleccion: 'ChangeLogServices',
    descripcion: 'Registro de cambios hechos en el catálogo de servicios (qué se cambió, cuándo y valores anteriores).',
    campoFecha: '_createdDate',
    escaneo: 2000,
    limite: 300,
    campos: null,
    sensibles: []
  },

  historicoMensualAnterior: {
    coleccion: 'KamisuiteLegacyMensual',
    descripcion: 'Histórico del programa anterior a KAMISUITE: una fila por mes con sus totales.',
    limite: 300,
    campos: null,
    sensibles: []
  },

  ticketsAnteriores: {
    coleccion: 'KamisuiteLegacyTickets',
    descripcion: 'Tickets del programa anterior a KAMISUITE, uno por visita: fecha, cliente, profesional, servicios, productos e importes.',
    campoFecha: 'fecha',
    escaneo: 3000,
    limite: 300,
    campos: null,
    sensibles: []
  },

  // ── CUALQUIER OTRA COLECCIÓN ──────────────────────────────────────────

  coleccion: {
    generica: true,
    descripcion: 'CUALQUIER otra colección de datos del salón que no esté en esta lista. Sin `coleccion` devuelve el listado de todas las colecciones; con `coleccion` (su id exacto del listado) devuelve sus registros con todos los campos. Úsala antes de afirmar que un dato no existe.',
    limite: 300,
    campos: null,
    sensibles: []
  }
};

/**
 * Fuente `coleccion`: lee cualquier colección del sitio por su id. Sin id,
 * devuelve el listado. Un id que no está en el listado no se lee.
 */
async function _consultarColeccionLibre(p, def, t0) {
  const lista = await _listarColeccionesSitio();
  const id = String(p.coleccion || '').trim();
  if (!id) {
    return { fuente: 'coleccion', numRegistros: lista.length, datos: lista,
      nota: 'Llama otra vez con `coleccion` = el id de la que necesites.' };
  }
  const existe = lista.find(c => c.id === id) || lista.find(c => c.id.toLowerCase() === id.toLowerCase());
  if (!existe) {
    return { fuente: 'coleccion', error: `No existe ninguna colección "${id}" en este salón.`, colecciones: lista.map(c => c.id) };
  }
  const defLibre = { ...def, campoFecha: '_createdDate' };
  const { filas, truncado, techo } = await _leerColeccion(existe.id, defLibre, p);
  return _cerrarResultado('coleccion', defLibre, p, filas, { truncado, techo, t0, coleccion: existe.id });
}

/**
 * Proyección + búsqueda + techos, común a todas las fuentes.
 */
function _cerrarResultado(clave, def, p, raw, extra) {
  const ex = extra || {};
  let pares = (raw || []).map(item => ({ raw: item, f: _proyectarFila(item, def) }));
  const notas = [];
  if (ex.nota) notas.push(ex.nota);
  const avisos = [];
  if (ex.aviso) avisos.push(ex.aviso);

  const admiteFechas = !!(def.campoFecha || def.loaderFechas);
  if ((p.desde || p.hasta) && !admiteFechas) {
    notas.push('Esta fuente no tiene fechas: desde/hasta no se han aplicado.');
  }

  // ── Búsqueda libre sobre los campos ya proyectados ──
  if (p.busqueda && !def.loaderBusca) {
    const norm = (s) => String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    const needle = norm(p.busqueda).trim();
    // Si buscan un teléfono, comparar solo dígitos: en CRM está como
    // "+34 617 37 89 84" y lo teclean como "617378984".
    const soloDigitos = needle.replace(/[^\d]/g, '');
    const esTelefono = soloDigitos.length >= 6;

    const match = pares.filter(x => {
      const blob = norm(JSON.stringify(x.f));
      if (blob.indexOf(needle) !== -1) return true;
      if (esTelefono && blob.replace(/[^\d]/g, '').indexOf(soloDigitos) !== -1) return true;
      return false;
    });

    // En las fuentes pequeñas de configuración (catálogo, personal…), sin
    // match se devuelve todo: mejor contexto de más que respuesta vacía por
    // una búsqueda mal formulada. En el resto, sin match es CERO.
    const toleraSinMatch = def.toleraSinMatch === true;
    if (match.length > 0 || !toleraSinMatch) {
      if (match.length === 0) {
        console.log(`${TAG} config fuente=${clave} busqueda="${p.busqueda}" → 0 resultados`);
        if (ex.truncado) {
          avisos.push(`Solo se han revisado los ${ex.techo} registros más recientes: puede haber coincidencias más antiguas. Acota con desde/hasta.`);
        }
        const vacio = {
          fuente: clave,
          numRegistros: 0,
          datos: [],
          nota: [`No se ha encontrado ningún registro que coincida con "${p.busqueda}".`].concat(notas).join(' ')
        };
        if (avisos.length) vacio.AVISO = avisos.join(' ');
        return vacio;
      }
      pares = match;
    }
  }

  if (ex.truncado) {
    avisos.push(`Hay más registros de los ${ex.techo} leídos: el resultado NO es completo. Acota con desde/hasta o busqueda antes de dar totales.`);
  }

  // Techo de filas tras filtrar: protege el contexto del modelo.
  const limite = def.limite || 300;
  if (pares.length > limite) {
    avisos.push(`Se muestran ${limite} de ${pares.length} registros.`);
    pares = pares.slice(0, limite);
  }

  // Techo de tamaño: lo que viaja a Anthropic en una sola llamada.
  // 1) modo compacto (mismos registros, textos y objetos más cortos);
  // 2) si aún no cabe, menos registros, avisándolo.
  let datos = def.filaUnica ? (pares[0] ? pares[0].f : null) : pares.map(x => x.f);
  if ((JSON.stringify(datos) || '').length > MAX_RESULTADO_CHARS) {
    const defC = { ...def, compacto: true };
    const compactos = pares.map(x => _proyectarFila(x.raw, defC));
    datos = def.filaUnica ? (compactos[0] || null) : compactos;
    const json = JSON.stringify(datos) || '';
    if (json.length <= MAX_RESULTADO_CHARS) {
      avisos.push('Por tamaño, los textos largos llegan acortados. Para el detalle completo de un registro, búscalo con busqueda.');
    } else if (def.filaUnica || !Array.isArray(datos)) {
      datos = json.substring(0, MAX_RESULTADO_CHARS) + '… [recortado]';
      avisos.push('El resultado era demasiado grande y llega recortado.');
    } else {
      const total = datos.length;
      while (datos.length > 1 && JSON.stringify(datos).length > MAX_RESULTADO_CHARS) {
        datos = datos.slice(0, Math.max(1, Math.floor(datos.length * 0.8)));
      }
      avisos.push(`Resultado recortado por tamaño: se muestran ${datos.length} de ${total} registros. Acota con busqueda o con fechas antes de dar totales.`);
    }
  }

  console.log(`${TAG} config fuente=${clave}${ex.coleccion ? '/' + ex.coleccion : ''} filas=${Array.isArray(datos) ? datos.length : 1} → ${Date.now() - (ex.t0 || Date.now())}ms`);

  const out = { fuente: clave };
  if (ex.coleccion) out.coleccion = ex.coleccion;
  else if (def.coleccion) out.coleccion = def.coleccion;
  if (def.filaUnica) out.datos = datos;
  else { out.numRegistros = datos.length; out.datos = datos; }
  if (notas.length) out.nota = notas.join(' ');
  if (avisos.length) out.AVISO = avisos.join(' ');
  return out;
}

/**
 * Ejecuta una lectura. Genérica: NO conoce ninguna colección.
 * Todo su comportamiento sale del registro.
 */
async function consultarConfig(params) {
  const p = params || {};
  const clave = p.fuente;
  const def = FUENTES_CONFIG[clave];

  if (!def) {
    return {
      error: `Fuente "${clave}" no disponible.`,
      fuentesDisponibles: Object.keys(FUENTES_CONFIG)
    };
  }

  const t0 = Date.now();

  // Fuentes con miles de filas (CRM) exigen término de búsqueda: volcarlas
  // enteras al modelo reventaría el contexto y el coste.
  if (def.requiereBusqueda && !p.busqueda) {
    return {
      error: `La fuente "${clave}" necesita un término de búsqueda (nombre, teléfono, email o contactId).`
    };
  }
  if (def.requiereFechas && !(p.desde && p.hasta)) {
    return {
      error: `La fuente "${clave}" necesita las fechas desde y hasta. Cópialas de la tabla FECHAS.`
    };
  }

  try {
    if (def.generica) return await _consultarColeccionLibre(p, def, t0);

    if (typeof def.loader === 'function') {
      const r = await def.loader(p);
      const filas = Array.isArray(r) ? r : ((r && r.filas) || []);
      const nota = (!Array.isArray(r) && r && r.nota) || null;
      const aviso = (!Array.isArray(r) && r && r.aviso) || null;
      return _cerrarResultado(clave, def, p, filas, { t0, nota, aviso });
    }

    const { filas, truncado, techo } = await _leerColeccion(def.coleccion, def, p);
    return _cerrarResultado(clave, def, p, filas, { truncado, techo, t0 });
  } catch (e) {
    console.warn(`${TAG} config fuente=${clave} falló:`, e.message);
    return {
      fuente: clave,
      error: `No se ha podido leer "${clave}" en este salón: ${e.message}`
    };
  }
}

/**
 * Definición de la herramienta, GENERADA desde el registro.
 * Añadir una fuente al registro la hace visible al modelo automáticamente:
 * el enum y las descripciones salen de aquí, no de un literal.
 */
function _buildToolConfig() {
  const claves = Object.keys(FUENTES_CONFIG);
  const listado = claves
    .map(k => {
      const f = FUENTES_CONFIG[k];
      const req = f.requiereBusqueda ? ' [REQUIERE `busqueda`]'
        : (f.requiereFechas ? ' [REQUIERE `desde` y `hasta`]'
        : ((f.campoFecha || f.loaderFechas) ? ' [admite `desde`/`hasta`]' : ''));
      return `· "${k}"${req}: ${f.descripcion}`;
    })
    .join('\n');
  const conBusqueda = claves.filter(k => FUENTES_CONFIG[k].requiereBusqueda);

  return {
    name: 'consultar_configuracion_salon',
    description:
      'Acceso a TODA la información guardada en KAMISUITE, registro a registro: configuración, ' +
      'catálogos, tienda, almacén, clientes y su ficha completa, bonos, PRIME, tarjetas, cuidado y ' +
      'salud, LOPD, facturas, caja, fichajes, comunicaciones, campañas, histórico y cualquier otra ' +
      'colección del salón.\n\n' +
      'Para totales, conteos y comparativas de reservas y cobros usa consultar_datos_salon; esta ' +
      'herramienta da el detalle. Combínalas cuando la pregunta cruce configuración y actividad ' +
      '(por ejemplo: comparar el precio de tarifa de un servicio con lo que se está cobrando).\n\n' +
      'Antes de afirmar que algo no existe o que no hay ninguno (descuentos, bonos, notas…), lee ' +
      'la fuente que lo guarda. Si no sabes cuál es, usa "coleccion".\n\n' +
      'Fuentes disponibles:\n' + listado,
    input_schema: {
      type: 'object',
      properties: {
        fuente: {
          type: 'string',
          enum: claves,
          description: 'Qué información leer.'
        },
        busqueda: {
          type: 'string',
          description: 'Texto libre para acotar: nombre de un servicio, producto, profesional o cliente; también un teléfono, un email o un contactId. ' +
            (conBusqueda.length > 0
              ? `OBLIGATORIO en: ${conBusqueda.join(', ')}. `
              : '') +
            'En el resto es opcional.'
        },
        desde: { type: 'string', description: 'Fecha inicio YYYY-MM-DD, en las fuentes con fechas. Cópiala de la tabla FECHAS; no la calcules.' },
        hasta: { type: 'string', description: 'Fecha fin YYYY-MM-DD, inclusive.' },
        coleccion: { type: 'string', description: 'Solo con fuente "coleccion": id exacto de la colección, tal como sale en su listado.' },
        incluirInactivos: { type: 'boolean', description: 'true para incluir también lo desactivado (servicios, personal, externos, almacén). Por defecto false.' }
      },
      required: ['fuente']
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFINICIÓN DE LA HERRAMIENTA (tool use nativo de Anthropic)
// ═══════════════════════════════════════════════════════════════════════════
// Sustituye al classify de V1. Sonnet elige filtros; NUNCA calcula cifras.

const TOOL_CONSULTAR = {
  name: 'consultar_datos_salon',
  description:
    'Consulta los datos reales del salón. Úsala SIEMPRE que la pregunta requiera cualquier cifra, ' +
    'listado o dato del negocio. Nunca respondas con cifras de memoria ni las calcules tú: ' +
    'pide los datos con esta herramienta y narra el resultado. Puedes llamarla varias veces ' +
    '(por ejemplo, para comparar dos periodos). Los filtros son combinables entre sí.',
  input_schema: {
    type: 'object',
    properties: {
      modo: {
        type: 'string',
        enum: ['reservas', 'cobros', 'conversion', 'servicios'],
        description:
          'reservas = lo COMPROMETIDO (agenda, ocupación, previsión, carga de trabajo; incluye futuro). Cuenta RESERVAS enteras, categorizadas por su servicio principal. ' +
          'cobros = lo CONSUMADO (dinero realmente cobrado, métodos de pago, caja). ' +
          'conversion = el DELTA entre ambos (tasa de conversión, no-shows, reservas sin cobrar, fugas). ' +
          'servicios = cuenta SERVICIOS INDIVIDUALES realmente COBRADOS por categoría, incluidos los que van como complemento. Lee del ledger de cobros, así que ABARCA TODO EL HISTÓRICO (también meses anteriores a la migración) y refleja solo lo cobrado (sin cancelaciones). Usa este modo para "¿cuántos cortes/servicios de X se hicieron/facturaron?". Es el modo correcto para categoría de servicio en cualquier periodo pasado.'
      },
      desde: { type: 'string', description: 'Fecha inicio YYYY-MM-DD. Cópiala de la tabla FECHAS del system; no la calcules.' },
      hasta: { type: 'string', description: 'Fecha fin YYYY-MM-DD, inclusive.' },
      group: {
        type: 'array', items: { type: 'string' },
        description: 'CATEGORÍA(S) de servicio a incluir. Es el eje de categoría PRINCIPAL. Usa los valores canónicos EXACTOS de la lista "CATEGORÍAS DISPONIBLES" del system (p.ej. COLORACION, CORTESMUJER, CABALLERO, TRATAMIENTOS, MANICURA_&_PEDICURA). El usuario dirá "color", "corte", "uñas": traduce tú al canónico. Si un término abarca varias categorías (p.ej. "corte" → CORTESMUJER y CABALLERO), NO adivines: pregunta cuál. Vacío = todas.'
      },
      family: {
        type: 'array', items: { type: 'string' },
        description: 'Eje TÉCNICO secundario (naturaleza del servicio: simple, coloracion, tratamiento, externo, medida). Para categorías comerciales usa `group`, no esto. Vacío = todas.'
      },
      staffName: { type: 'string', description: 'Filtra por profesional (coincidencia parcial del nombre). Cada servicio cuenta para quien lo hace —la columna en la que está en la agenda—, aunque la cita sea de otra persona: importes, minutos y servicios llegan ya repartidos así. Los bloqueos de agenda también se atribuyen a su profesional. Úsalo en cualquier pregunta sobre la agenda, el trabajo o la productividad de una persona.' },
      diasSemana: {
        type: 'array', items: { type: 'number' },
        description: 'Días de la semana: 0=domingo, 1=lunes … 6=sábado. Ej: [1,2] = lunes y martes.'
      },
      origen: { type: 'string', enum: ['web', 'recepcion'], description: 'Canal de la reserva. Solo modo reservas/conversion.' },
      tipoPago: { type: 'string', description: 'Método de pago (efectivo, tarjeta…). Solo modo cobros.' },
      cliente: { type: 'string', description: 'Nombre de cliente (coincidencia parcial).' },
      agruparPor: {
        type: 'string',
        enum: ['ninguno', 'staff', 'family', 'group', 'dia', 'diaSemana', 'mes', 'tipoPago', 'cliente', 'origen', 'status', 'servicio'],
        description: 'Eje de desglose del resultado. "group" desglosa por categoría. "staff" desglosa por profesional, con cada servicio para quien lo hace. "servicio" (solo modo servicios) desglosa por nombre de servicio. "ninguno" devuelve solo los totales.'
      },
      incluirCanceladas: { type: 'boolean', description: 'Por defecto false. true para analizar cancelaciones.' },
      incluirBloqueos: { type: 'boolean', description: 'Por defecto false. true para ver los bloqueos de agenda (descansos, comidas, ausencias, huecos reservados a mano). Solo modo reservas: llegan en `bloqueos` con fecha, hora de inicio y fin, profesional y motivo.' }
    },
    required: ['modo']
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — ANTHROPIC (timeout + cascade failover, patrón CATHOVIA v1.6.0)
// ═══════════════════════════════════════════════════════════════════════════

function _withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function _postAnthropic(apiKey, body, timeoutMs, label) {
  const res = await _withTimeout(
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    }),
    timeoutMs, label
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data && data.error ? data.error.message : `HTTP ${res.status}`);
  return data;
}

/**
 * Bucle de tool use. Sonnet pide datos → JS ejecuta el motor → Sonnet narra.
 * Máx. 4 vueltas: permite comparativas (dos periodos) sin bucle infinito.
 */
async function _callClaudeConHerramientas(model, apiKey, systemBlocks, messages, timeoutMs, conTools, forzarLectura) {
  const startMs = Date.now();
  const convo = messages.slice();
  let cacheStats = { hit: 0, create: 0, input: 0, output: 0 };
  let consultas = 0;
  const usaTools = conTools !== false;

  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const payload = {
      model,
      max_tokens: MAX_TOKENS,
      system: systemBlocks,
      messages: convo
    };
    // v1.7.0 — sin herramientas en el plano AYUDA. `tools` se omite del body
    // en lugar de mandarse vacío: un array vacío es un error de la API.
    if (usaTools) payload.tools = [TOOL_CONSULTAR, _buildToolConfig()];
    // v1.12.0 — en ASESOR la primera vuelta OBLIGA a leer datos (tool_choice
    // «any»): ninguna respuesta sale sin haber consultado. Las siguientes
    // vueltas quedan libres para contestar. Ver cabecera.
    if (usaTools && forzarLectura && vuelta === 0) payload.tool_choice = { type: 'any' };

    const data = await _postAnthropic(apiKey, payload, timeoutMs, model);

    const u = data.usage || {};
    cacheStats = {
      hit:    cacheStats.hit    + (u.cache_read_input_tokens     || 0),
      create: cacheStats.create + (u.cache_creation_input_tokens || 0),
      input:  cacheStats.input  + (u.input_tokens  || 0),
      output: cacheStats.output + (u.output_tokens || 0)
    };

    const bloques = data.content || [];
    const toolUses = bloques.filter(b => b.type === 'tool_use');

    if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const respuesta = bloques.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return { respuesta, timeMs: Date.now() - startMs, cacheStats, consultas };
    }

    convo.push({ role: 'assistant', content: bloques });

    const resultados = [];
    for (const tu of toolUses) {
      consultas++;
      let out;
      try {
        // Router de herramientas por nombre. Añadir una herramienta = añadir
        // un caso aquí y declararla en el array `tools` de _postAnthropic.
        if (tu.name === 'consultar_configuracion_salon') {
          out = await consultarConfig(tu.input || {});
        } else {
          out = await ejecutarConsulta(tu.input || {});
        }
      } catch (e) {
        console.warn(`${TAG} herramienta ${tu.name} falló:`, e.message);
        out = { error: 'No se pudieron leer los datos: ' + e.message };
      }
      resultados.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(out)
      });
    }
    convo.push({ role: 'user', content: resultados });
  }

  // Salvaguarda: si agota las vueltas, pide el cierre sin más herramientas.
  const final = await _postAnthropic(apiKey, {
    model, max_tokens: MAX_TOKENS, system: systemBlocks, messages: convo
  }, timeoutMs, model + '-cierre');
  const respuesta = (final.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  return { respuesta, timeMs: Date.now() - startMs, cacheStats, consultas };
}

async function _callClaudeConFallback(apiKey, systemBlocks, messages, usarHerramientas, forzarLectura) {
  const conTools = usarHerramientas !== false;   // por defecto, como hasta v1.6.0
  try {
    const r = await _callClaudeConHerramientas(MODEL_PRIMARY, apiKey, systemBlocks, messages, PRIMARY_TIMEOUT_MS, conTools, forzarLectura);
    return { ...r, modeloUsado: MODEL_PRIMARY };
  } catch (err1) {
    console.warn(`${TAG} Sonnet falló, cayendo a Haiku: ${err1.message}`);
    try {
      const r = await _callClaudeConHerramientas(MODEL_FALLBACK, apiKey, systemBlocks, messages, FALLBACK_TIMEOUT_MS, conTools, forzarLectura);
      return { ...r, modeloUsado: MODEL_FALLBACK };
    } catch (err2) {
      throw new Error(`Sonnet:[${err1.message}] Haiku:[${err2.message}]`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — CONTEXTO DEL SALÓN (multi-tenant: cada cuenta ES un salón)
// ═══════════════════════════════════════════════════════════════════════════

async function _getSalonConfig() {
  try {
    const res = await wixData.query(C_SALON).limit(1).find(AUTH);
    return res.items.length > 0 ? res.items[0] : null;
  } catch (e) {
    console.warn(`${TAG} _getSalonConfig fallo:`, e.message);
    return null;
  }
}

async function _getStaff() {
  try {
    const res = await wixData.query(C_STAFF).eq('active', true).limit(50).find(AUTH);
    return res.items || [];
  } catch (e) {
    console.warn(`${TAG} _getStaff fallo:`, e.message);
    return [];
  }
}

// v1.7.0 — se leen TODOS los alignments publicados (hasta 10), no solo el
// último. Con el enrutador de planos puede haber uno publicado por plano
// (ASESOR y AYUDA con identidad, tono y guardrails distintos). La selección
// del que aplica se hace después, con el plano que pide el widget.
async function _getAlignments() {
  try {
    const res = await wixData.query(C_ALIGNMENT)
      .eq('status', 'publicado')
      .descending('publicationDate')
      .limit(10)
      .find(AUTH);
    return res.items || [];
  } catch (e) {
    console.warn(`${TAG} _getAlignments fallo:`, e.message);
    return [];
  }
}

// Alignment que aplica al plano pedido. Si el salón no ha publicado uno para
// ese plano, devuelve null: el prompt usa entonces la identidad por defecto
// del plano (definida en código) en lugar de la de otro plano, que diría al
// modelo que es consultor de negocio mientras responde dudas del manual.
function _alignmentDelPlano(alignments, plano) {
  const lista = alignments || [];
  const match = lista.find(a => _normPlano(a && a.modo) === plano);
  return match || null;
}

// v1.6.0 — el límite sube de 50 a 200. Esta query es ANTERIOR al filtro por
// plano (el alignment se lee en paralelo, aún no está disponible aquí), así
// que el tope se reparte entre TODOS los planos: con el manual de AYUDA
// cargado (22 filas) más el corpus de ASESOR, 50 se queda corto y los últimos
// documentos se perdían antes incluso de llegar al filtro, sin error visible.
// Se sube el tope en vez de filtrar en la query para no serializar el PREP
// (habría que esperar al alignment antes de pedir los documentos).
async function _getDocumentos() {
  try {
    const res = await wixData.query(C_DOCUMENTS)
      .eq('activo', true)
      .ascending('orden')
      .limit(200)
      .find(AUTH);
    return res.items || [];
  } catch (e) {
    console.warn(`${TAG} _getDocumentos fallo:`, e.message);
    return [];
  }
}

// ── Plano de utilidad de AKIRA (asesor | ayuda | asistente) ──
// NO es el modo transaccional (reservas|cobros|conversion) de la herramienta de
// datos. Este 'modo' vive en AkiraAlignment/AkiraDocuments y enruta QUÉ corpus
// de conocimiento ve AKIRA según el plano publicado.
const PLANO_DEFECTO = 'asesor';

function _normPlano(v) {
  const s = (v === null || v === undefined) ? '' : String(v).trim().toLowerCase();
  return s || PLANO_DEFECTO;   // vacío (doc o alignment) = asesor
}

// Filtra los documentos de conocimiento por el plano del alignment publicado.
// Regla acordada: modo vacío se trata como 'asesor', para no dejar sin corpus
// a los documentos ya existentes que aún no tienen 'modo' relleno.
// v1.7.0 — filtra por el plano PEDIDO (antes se deducía del alignment
// publicado). Vacío = asesor, como en v1.5.0.
function _filtrarDocsPorPlano(docs, plano) {
  const planoActivo = _normPlano(plano);
  return (docs || []).filter(d => _normPlano(d && d.modo) === planoActivo);
}

// Instrucción que encabeza el bloque de conocimiento. Depende del plano
// porque la naturaleza del corpus es distinta en cada uno:
//   · ASESOR    → normativa y metodología. Criterio experto, no se cita.
//   · AYUDA     → Manual de Usuario. Se reproduce literal: nombres de pantalla
//                 y pasos exactos. Parafrasear aquí es inventar la interfaz.
//   · ASISTENTE → hereda la redacción de ASESOR mientras no tenga corpus propio.
const INSTRUCCION_CORPUS = {
  asesor: 'Este material es tu criterio experto: interpretación de ratios, metodología de gestión y normativa aplicable. Intégralo con naturalidad; no lo cites textualmente.',
  ayuda: 'Este material es el Manual de Usuario oficial de KAMISUITE, un capítulo por aplicación. Es tu ÚNICA fuente sobre cómo se usa el software. Reproduce los nombres de pantalla, botones, pestañas y campos EXACTAMENTE como aparecen en el manual, sin reformularlos ni traducirlos, y respeta el orden de los pasos. Si el manual no cubre lo que se pregunta, dilo en lugar de deducirlo: nunca describas una pantalla, un botón o un paso que no esté en el manual.',
  asistente: 'Este material es tu criterio experto: interpretación de ratios, metodología de gestión y normativa aplicable. Intégralo con naturalidad; no lo cites textualmente.'
};

function _instruccionCorpus(plano) {
  return INSTRUCCION_CORPUS[plano] || INSTRUCCION_CORPUS[PLANO_DEFECTO];
}

// ── ENRUTADOR DE PLANO (v1.7.0) ──
// El plano lo pide el widget con los chips y llega por el parámetro `modo` de
// askAkiraCore, que ya viajaba de punta a punta (custom element → akiraAsk →
// backend) desde v1.5.0 sin usarse para nada más que una línea del prompt.
// El endpoint es PÚBLICO: se valida contra lista cerrada, nunca se confía.
const PLANOS_VALIDOS = ['asesor', 'ayuda', 'asistente'];

function _planoPedido(modo) {
  const p = _normPlano(modo);
  return PLANOS_VALIDOS.indexOf(p) >= 0 ? p : PLANO_DEFECTO;
}

// Herramientas de datos: solo donde la pregunta es sobre el negocio. En AYUDA
// la pregunta es sobre la interfaz y el manual es toda la respuesta.
function _planoUsaHerramientas(plano) {
  return plano !== 'ayuda';
}

// Identidad por defecto de cada plano. Solo se usa cuando el salón NO ha
// publicado un AkiraAlignment para ese plano. Nunca se hereda la identidad de
// otro plano: decirle al modelo que es consultor de negocio mientras responde
// dudas del manual es peor que no tener alignment.
function _identidadPorDefecto(plano, brand) {
  if (plano === 'ayuda') {
    return `Eres AKIRA, la inteligencia artificial de ${brand}, integrada en KAMISUITE. ` +
      `Trabajas en modo AYUDA: enseñas a usar KAMISUITE. Respondes dudas sobre pantallas, ` +
      `botones y procedimientos del software apoyándote en el Manual de Usuario. Explicas los ` +
      `pasos en orden, con los nombres exactos que aparecen en pantalla. Hablas en español, ` +
      `con claridad y sin tecnicismos: quien pregunta está trabajando en el salón.`;
  }
  if (plano === 'asistente') {
    return `Eres AKIRA, la inteligencia artificial de ${brand}, integrada en KAMISUITE. ` +
      `Trabajas en modo ASISTENTE. Hablas en español, con criterio profesional y sin rodeos.`;
  }
  return `Eres AKIRA, la inteligencia artificial de gestión de ${brand}, integrada en KAMISUITE. ` +
    `Trabajas en modo ASESOR: eres un consultor de negocio permanente para la propiedad del salón. ` +
    `Analizas el rendimiento real del negocio, detectas tendencias y anomalías, y das conclusiones ` +
    `accionables. Hablas en español, con criterio profesional y sin rodeos.`;
}

/** Familias reales presentes en el CMS. Cero hardcoding: se leen del dato. */
async function _getFamilias() {
  try {
    const res = await wixData.query(C_RESERVAS)
      .isNotEmpty('family')
      .limit(50)
      .distinct('family', AUTH);
    return (res.items || []).filter(f => f && f !== FAMILY_BLOQUEO);
  } catch (e) {
    console.warn(`${TAG} _getFamilias fallo:`, e.message);
    return [];
  }
}

/**
 * CATEGORÍAS (group) reales presentes en el CMS. Cero hardcoding: cada salón
 * tiene las suyas. El modelo mapea el lenguaje natural del usuario ("color",
 * "uñas") contra esta lista real. Se lee de las reservas (el group que grabó
 * crearPackReserva); si aún hay pocas reservas con group, se completa con el
 * catálogo para no dejar categorías fuera del prompt.
 */
async function _getGroups() {
  const set = new Set();
  try {
    const res = await wixData.query(C_RESERVAS)
      .isNotEmpty('group')
      .limit(50)
      .distinct('group', AUTH);
    for (const g of (res.items || [])) {
      if (g && g !== FAMILY_BLOQUEO) set.add(g);
    }
  } catch (e) {
    console.warn(`${TAG} _getGroups (reservas) fallo:`, e.message);
  }
  // Completar con el catálogo: categorías que existen aunque aún no tengan
  // reservas con group (histórico previo al despliegue del campo).
  try {
    const resCat = await wixData.query(C_CATALOGO)
      .isNotEmpty('group')
      .limit(100)
      .distinct('group', AUTH);
    for (const g of (resCat.items || [])) {
      if (g && g !== FAMILY_BLOQUEO) set.add(g);
    }
  } catch (e) {
    console.warn(`${TAG} _getGroups (catálogo) fallo:`, e.message);
  }
  return Array.from(set);
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — bloques STABLE (cacheado 5 min) + VOLATILE (por pregunta)
// ═══════════════════════════════════════════════════════════════════════════

function _buildSystemBlocks(ctx) {
  const { config, documentos, salon, staff, familias, groups, fechas, plano } = ctx;
  const stable = [];

  // Plano ACTIVO en esta pregunta (v1.7.0). Ya no se deduce del alignment
  // publicado: lo pide el usuario con los chips del widget y llega resuelto
  // y validado desde askAkiraCore. `config` es el alignment de ESTE plano.
  const planoActivo = _planoPedido(plano);
  const conHerramientas = _planoUsaHerramientas(planoActivo);

  // ── IDENTIDAD ──
  const brand = (salon && salon.brandName) || 'el salón';
  if (config && config.promptBase) {
    stable.push(config.promptBase);
  } else {
    stable.push(_identidadPorDefecto(planoActivo, brand));
  }

  stable.push(`MODO ACTIVO: ${planoActivo.toUpperCase()}.`);

  // ── TONO Y DETALLE (AkiraAlignment) ──
  if (config) {
    const tones = {
      'formal':  'TONO: Formal y profesional. Sin emojis ni coloquialismos.',
      'directo': 'TONO: Directo y al grano. Mínimas palabras, máxima información.',
      'cercano': 'TONO: Cercano y natural, como un compañero de equipo.'
    };
    if (tones[config.tone]) stable.push(tones[config.tone]);

    const details = {
      'breve':   'NIVEL DE DETALLE: Respuestas breves y densas.',
      'medio':   'NIVEL DE DETALLE: Extensión media. Dato, contexto y conclusión.',
      'extenso': 'NIVEL DE DETALLE: Análisis detallado, con matices y comparativas.'
    };
    if (details[config.detailLevel]) stable.push(details[config.detailLevel]);
  }

  // ── CONTEXTO DEL SALÓN (real, leído del CMS) ──
  // v1.7.0 — en AYUDA solo entra la identificación del salón. Las familias,
  // las categorías canónicas y la plantilla son insumos del motor de consulta,
  // que en este plano no existe: cargarlos solo gastaría contexto.
  const ctxSalon = ['--- CONTEXTO DEL SALÓN ---'];
  if (salon) {
    if (salon.brandName) ctxSalon.push(`Nombre comercial: ${salon.brandName}`);
    if (salon.legalName) ctxSalon.push(`Razón social: ${salon.legalName}`);
    if (salon.addressUSER || salon.address) ctxSalon.push(`Dirección: ${salon.addressUSER || salon.address}`);
    if (salon.vatRate != null) ctxSalon.push(`IVA aplicable: ${salon.vatRate}%`);
  }
  if (conHerramientas) {
    if (staff && staff.length > 0) {
      ctxSalon.push('Profesionales activos: ' +
        staff.map(s => nombreStaffLimpio(s.displayName || s.canonicalName)).filter(Boolean).join(', '));
    }
    if (familias && familias.length > 0) {
      ctxSalon.push('Familias de servicio disponibles: ' + familias.join(', '));
    }
    if (groups && groups.length > 0) {
      ctxSalon.push(
        'CATEGORÍAS DISPONIBLES (valores canónicos de `group` — úsalos EXACTOS al filtrar): ' +
        groups.join(', ')
      );
    }
  }
  if (ctxSalon.length > 1) stable.push(ctxSalon.join('\n'));

  // ── CÓMO FUNCIONA EL NEGOCIO (Conceptos Fundacionales, no negociable) ──
  // Solo con herramientas: describe cómo leer las colecciones. Sin motor de
  // consulta detrás, es texto muerto que compite con el manual por atención.
  if (conHerramientas) stable.push([
    '--- CÓMO FUNCIONAN LOS DATOS DE KAMISUITE ---',
    'Hay dos fuentes de verdad y un cruce entre ambas:',
    '',
    '1. RESERVAS (modo "reservas") — la productividad COMPROMETIDA. Todo lo agendado,',
    '   pasado y futuro. Una reserva existe antes de convertirse en dinero, y puede no',
    '   llegar a serlo nunca (cancelación, no-show). Úsalo para agenda, ocupación,',
    '   carga de trabajo y previsión.',
    '',
    '2. COBROS (modo "cobros") — el resultado CONSUMADO. Solo entra aquí lo que se',
    '   cobró de verdad. Úsalo para facturación real, métodos de pago y caja.',
    '',
    '3. CONVERSIÓN (modo "conversion") — el DELTA entre ambas. Lo que se reservó y no',
    '   se cobró: tasa de conversión, no-shows, fugas de caja. Ninguna de las dos',
    '   fuentes por separado responde esto.',
    '',
    'PROCESO: en coloración y tratamientos, el producto actúa sobre el cabello durante',
    'un tiempo en el que el profesional queda LIBRE y puede atender a otra clienta. Ese',
    'tiempo NO ocupa agenda. Por eso "minutosOcupados" y "minutosProceso" se devuelven',
    'por separado: la ocupación real del profesional es minutosOcupados, nunca la',
    'duración total. Es la razón de ser de KAMISUITE y ningún competidor lo hace.',
    '',
    'origenRecepcion distingue si la reserva la creó el salón (recepción) o la clienta',
    'desde la web. Las reservas de familia BLOQUEO no son actividad comercial: son',
    'huecos bloqueados en agenda, y quedan excluidas salvo que se pidan explícitamente.',
    '',
    'PROFESIONAL: en la agenda cada tramo de una cita tiene su profesional. Un',
    'complemento puede hacerlo otra persona distinta de la titular de la cita (p. ej.',
    'el corte dentro de unas mechas). Cuando filtras por profesional (staffName) o',
    'agrupas por staff, los datos llegan ya repartidos: cada servicio cuenta para quien',
    'lo hace. Cada fila de la muestra trae su hora y sus tramos (inicio, fin, servicio,',
    'profesional): úsalos para decir a qué hora es cada cosa. Para preguntas sobre',
    'bloqueos (descansos, comidas, ausencias) usa incluirBloqueos: llegan en `bloqueos`',
    'con su hora y su motivo. Si la herramienta no trae bloqueos, di que no constan; no',
    'afirmes que el sistema no tiene ninguno sin haberlos pedido con incluirBloqueos.',
    'El MOTIVO de un bloqueo es texto libre que escribe el salón: cítalo tal cual, sin',
    'corregirlo, traducirlo ni cambiar mayúsculas o tildes. No lo interpretes: no',
    'deduzcas quién es, para qué es el hueco ni qué debería hacerse con él, porque no',
    'hay más dato que ese texto. Esta regla manda sobre la de aportar conclusiones.'
  ].join('\n'));

  // ── REGLAS DE USO DE LA HERRAMIENTA ──
  if (conHerramientas) stable.push([
    '--- REGLAS DE TRABAJO (INQUEBRANTABLES) ---',
    '1. NUNCA des una cifra que no venga de una herramienta. No calcules sumas,',
    '   medias ni porcentajes de cabeza: pídelos y nárralos. Los cálculos ya',
    '   vienen hechos en la respuesta.',
    '1b. Tienes DOS herramientas y son complementarias:',
    '   · consultar_datos_salon → qué PASÓ o pasará (reservas, cobros,',
    '     conversión). Tiene fecha.',
    '   · consultar_configuracion_salon → TODO lo demás que guarda KAMISUITE,',
    '     registro a registro: configuración, catálogos, tienda, almacén,',
    '     clientes y su ficha, bonos, PRIME, tarjetas, cuidado, LOPD, facturas,',
    '     caja, fichajes, comunicaciones, campañas y cualquier otra colección.',
    '     Las fuentes con actividad admiten desde/hasta.',
    '   Cuando la pregunta cruce ambas, llama a las dos. Ejemplos: comparar el',
    '   precio de tarifa con lo cobrado de verdad; contrastar las horas de',
    '   horario de un profesional con las que tiene ocupadas; valorar si un',
    '   servicio rinde según su duración configurada.',
    '1c. ACCESO TOTAL. Tienes acceso a toda la información del salón. Antes de',
    '   afirmar que algo no existe o que no hay ninguno, léelo en la fuente que',
    '   lo guarda (si dudas cuál, usa la fuente "coleccion"). Nunca contestes',
    '   con datos de otra fuente como si fueran lo preguntado: el almacén de uso',
    '   interno NO es la tienda, y los servicios NO son productos. Si de verdad',
    '   no está en ninguna fuente, dilo así: «eso no lo tengo en KAMISUITE».',
    '   Los identificadores internos (contactId, ids) son para tus consultas:',
    '   no los recites al usuario.',
    '   Si el usuario discute o niega un dato que has dado, VUELVE A LEERLO',
    '   antes de contestar: si los datos lo confirman, mantenlo y di de dónde',
    '   sale; si no, corrígelo con el dato bueno. Nunca digas que te lo has',
    '   inventado sin haberlo comprobado. Si te preguntan de dónde sale un',
    '   dato, dilo en lenguaje de negocio (qué registro de KAMISUITE has leído).',
    '   El historial de la conversación solo guarda tus respuestas, no los',
    '   datos que leíste: para dar nombres, cifras o listas de una pregunta',
    '   anterior, vuelve a leerlos.',
    '2. NUNCA calcules fechas. Copia las de la tabla FECHAS de este system.',
    '3. Si necesitas comparar dos periodos, llama a la herramienta dos veces.',
    '4. Si la herramienta devuelve numRegistros 0, dilo con claridad: no hay datos',
    '   para ese filtro. No inventes ni rellenes con estimaciones.',
    '4b. Si la respuesta trae un campo AVISO, TRASLÁDALO al usuario: significa',
    '   que las cifras son parciales. Nunca des un total incompleto como si',
    '   fuera definitivo.',
    '5. Eres SOLO LECTURA. No puedes reservar, cancelar ni modificar nada. Si te lo',
    '   piden, indica que se haga desde Recepción PRO.',
    '6. Importes en euros con el símbolo €. Redondea a 2 decimales.',
    '7. No expliques tu proceso interno ni menciones "la herramienta", "el JSON",',
    '   "la consulta" o los nombres de las colecciones. Habla de negocio, no de',
    '   fontanería.',
    '8. No te limites al dato: aporta la conclusión. Eres un consultor, no un',
    '   informe. Si ves una anomalía relevante, señálala.',
    '9. CATEGORÍAS. La categoría de un servicio es `group`, no `family`. Cuando',
    '   el usuario nombre una categoría en lenguaje natural ("color", "corte",',
    '   "uñas", "peinados"), tradúcela al valor canónico EXACTO de la lista',
    '   "CATEGORÍAS DISPONIBLES" y pásalo en el parámetro `group`. Nunca',
    '   inventes un nombre de categoría que no esté en esa lista.',
    '9b. DESAMBIGUA. Si un término coloquial encaja con VARIAS categorías de la',
    '   lista, NO elijas por tu cuenta: pregunta al usuario cuál quiere. Ejemplo:',
    '   "corte" puede ser CORTESMUJER o CABALLERO → pregunta "¿cortes de mujer,',
    '   de caballero, o ambos?". Solo si el usuario ya lo aclaró, filtra.',
    '9c. RESERVAS vs SERVICIOS. "¿Cuántas reservas/citas de color?" → modo',
    '   reservas con group (cuenta la cita entera, por su servicio principal).',
    '   "¿Cuántos servicios/cuántos cortes se hicieron?" → modo servicios (cuenta',
    '   cada servicio individual, incluido el que va de complemento dentro de una',
    '   reserva de otra categoría). Elige el modo según lo que se pregunta.'
  ].join('\n'));

  // ── REGLAS DEL PLANO AYUDA ──
  // Sustituyen a las reglas del motor de consulta, que aquí no aplican.
  if (!conHerramientas) stable.push([
    '--- REGLAS DE TRABAJO (INQUEBRANTABLES) ---',
    '1. Tu única fuente es el Manual de Usuario que viene más abajo. No tienes',
    '   acceso a los datos del salón en este modo: no puedes ver la agenda, ni',
    '   la caja, ni la facturación. Si te piden una cifra o un dato concreto del',
    '   negocio, di que para eso hay que cambiar al modo ASESOR con el selector',
    '   de la parte superior, y explica mientras tanto en qué pantalla se ve.',
    '2. Enseñas a USAR el software. Explica dónde está la pantalla, qué botón se',
    '   pulsa y en qué orden, con los nombres exactos del manual.',
    '3. Si el manual no cubre lo que se pregunta, dilo. No deduzcas pantallas,',
    '   botones ni pasos que no estén escritos: inventar una interfaz que no',
    '   existe hace perder más tiempo que decir que no lo sabes.',
    '4. Respuestas cortas y en orden. Si el procedimiento tiene pasos,',
    '   enuméralos en el orden en que se ejecutan.',
    '5. Eres SOLO LECTURA. No reservas, no cobras y no modificas nada: explicas',
    '   cómo hacerlo desde la pantalla que corresponda.',
    '6. Quien pregunta está trabajando en el salón, muchas veces con una clienta',
    '   delante. Ve al grano.'
  ].join('\n'));

  // ── GUARDRAILS DEL DUEÑO (AkiraAlignment) ──
  if (config) {
    const gr = [];
    if (config.grNoInvent)   gr.push('Los datos de la herramienta son la ÚNICA verdad. Si no hay dato, di que no lo hay.');
    if (config.grNoMarkdown) gr.push('Responde en texto plano: sin markdown, sin viñetas, sin emojis.');
    if (config.grConcision)  gr.push('Nunca describas tu proceso de cálculo. Da el resultado directo.');
    if (config.grOnlyQuery)  gr.push('Solo consulta. No ofrezcas agendar, reservar ni registrar nada.');
    if (gr.length > 0) stable.push('--- GUARDRAILS ---\n' + gr.join('\n'));
    if (config.extraInstructions && config.extraInstructions.trim()) {
      stable.push('--- INSTRUCCIONES DEL SALÓN ---\n' + config.extraInstructions.trim());
    }
  }

  // ── CONOCIMIENTO (AkiraDocuments, filtrado por plano) ──
  // v1.6.0 — la instrucción de uso del corpus DEPENDE DEL PLANO. La redacción
  // anterior era la única posible cuando AKIRA solo era Consultor, y pedía
  // explícitamente NO citar textualmente. En AYUDA eso es contraproducente:
  // el corpus es el Manual de Usuario y parafrasearlo produce nombres de
  // botón inventados ("Cierre de Caja" donde la pantalla pone "Cierre Diario").
  if (documentos && documentos.length > 0) {
    const bloques = ['--- CONOCIMIENTO DE REFERENCIA ---'];
    bloques.push(_instruccionCorpus(planoActivo));
    const topeDocs = _docCharsDelPlano(planoActivo);
    let chars = 0;
    for (const d of documentos) {
      const contenido = d.contenido || '';
      if (chars + contenido.length > topeDocs) {
        const queda = topeDocs - chars;
        if (queda > 200) bloques.push(`[${d.tipo || 'documento'}] ${d.titulo || 'Documento'}\n${contenido.substring(0, queda)}…`);
        break;
      }
      bloques.push(`[${d.tipo || 'documento'}] ${d.titulo || 'Documento'}\n${contenido}`);
      chars += contenido.length;
    }
    stable.push(bloques.join('\n\n'));
  }

  // ── VOLÁTIL: fechas (cambian cada día → fuera de la caché) ──
  // En AYUDA no hay filtros de fecha que resolver: basta con saber qué día es
  // hoy. La tabla completa es insumo del motor de consulta.
  if (!conHerramientas) {
    return [
      { type: 'text', text: stable.join('\n\n'), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `--- FECHA ---\nHOY: ${fechas.hoyNombre} ${fechas.hoyISO}` }
    ];
  }

  const volatile = [
    '--- FECHAS (COPIA DE AQUÍ, NO CALCULES) ---',
    `HOY: ${fechas.hoyNombre} ${fechas.hoyISO}`,
    `ayer=${fechas.ayer} | mañana=${fechas.manana}`,
    `esta semana=${fechas.estaSemanaDesde} a ${fechas.estaSemanaHasta}`,
    `semana pasada=${fechas.semanaPasadaDesde} a ${fechas.semanaPasadaHasta}`,
    `este mes=${fechas.esteMesDesde} a ${fechas.esteMesHasta}`,
    `mes pasado=${fechas.mesPasadoDesde} a ${fechas.mesPasadoHasta}`,
    `este año=${fechas.esteAnioDesde} a ${fechas.esteAnioHasta}`,
    `año pasado=${fechas.anioPasadoDesde} a ${fechas.anioPasadoHasta}`,
    'Días de la semana: 0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado.'
  ].join('\n');

  return [
    { type: 'text', text: stable.join('\n\n'), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: volatile }
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SESIONES E HISTORIAL
// ═══════════════════════════════════════════════════════════════════════════

// AkiraSessions NO tiene usuarioId hoy. Se escribe igualmente: si Jal crea el
// campo, el filtrado por usuario empieza a funcionar sin tocar el código.
// Si no existe, Wix ignora la clave y el historial es del salón.
const USER_FIELD = 'usuarioId';

async function _crearSesion(userId, userName, primeraQuery) {
  const now = new Date();
  const titulo = primeraQuery
    ? String(primeraQuery).substring(0, 60)
    : 'Consulta ' + now.toLocaleDateString('es-ES');
  const registro = {
    title: titulo,
    estado: 'activa',
    fechaCreacion: now,
    fechaActualizacion: now,
    messageCount: 0
  };
  registro[USER_FIELD] = userId || '';
  registro.usuarioNombre = userName || '';
  const res = await wixData.insert(C_SESSIONS, registro, AUTH);
  return res._id;
}

/**
 * Crea la sesión y devuelve su _id. NUEVO v1.9.0.
 *
 * Función PURA, no webMethod: la llama http-functions.js, que corre SIN
 * sesión de miembro (mismo motivo por el que askAkiraCore es pura).
 *
 * PARA QUÉ EXISTE:
 *   Para que el widget tenga sessionId ANTES de lanzar la pregunta pesada.
 *   Sin él no puede arrancar el polling de recuperación del 504, porque el
 *   504 no trae cuerpo del que sacarlo. Ver el bloque de cabecera v1.9.0.
 *
 *   Coste: un insert. Milisegundos. El techo de 14s ni se acerca.
 *
 * NO valida nada más: la sesión vacía es inofensiva. Si el usuario cierra la
 * pestaña antes de que llegue la respuesta, queda una sesión con título y sin
 * mensajes — el mismo residuo que ya dejaba askAkiraCore cuando Anthropic
 * fallaba después de _crearSesion.
 */
export async function crearSesionCore({ userId, userName, query } = {}) {
  try {
    const sessionId = await _crearSesion(userId, userName, query);
    console.log(`${TAG} crearSesionCore OK sessionId=${sessionId}`);
    return { ok: true, sessionId };
  } catch (err) {
    console.error(`${TAG} crearSesionCore EXCEPTION:`, err.message || err);
    return { ok: false, error: err.message || 'No he podido abrir la conversación.' };
  }
}

async function _getHistorial(sessionId) {
  // v1.12.0 — las ÚLTIMAS HISTORY_LIMIT preguntas, no las primeras. Con
  // ascending + limit llegaban los 10 primeros turnos: desde la pregunta 11
  // AKIRA no veía lo que acababa de decir (24-Nov: negó haber hablado de
  // smart pricing dos turnos después de hacerlo).
  const res = await wixData.query(C_MESSAGES)
    .eq('sessionRef', sessionId)
    .descending('orden')
    .limit(HISTORY_LIMIT * 2)
    .find(AUTH);
  const msgs = (res.items || []).slice().reverse().map(m => ({
    role: m.rol === 'user' ? 'user' : 'assistant',
    content: m.contenido
  }));
  // La conversación que va a Anthropic tiene que empezar por el usuario: si
  // el corte deja una respuesta suelta al principio, fuera.
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

/**
 * Guarda el turno. READ-MERGE-UPDATE obligatorio en la sesión:
 * wixData.update REEMPLAZA el documento entero (Conceptos Fundacionales).
 */
async function _guardarMensajes(sessionId, query, respuesta) {
  const res = await wixData.query(C_MESSAGES)
    .eq('sessionRef', sessionId)
    .descending('orden')
    .limit(1)
    .find(AUTH);
  let orden = res.items.length > 0 ? (Number(res.items[0].orden) || 0) + 1 : 1;
  const now = new Date();

  await wixData.insert(C_MESSAGES, {
    sessionRef: sessionId, rol: 'user', contenido: query, orden, timestamp: now
  }, AUTH);
  await wixData.insert(C_MESSAGES, {
    sessionRef: sessionId, rol: 'assistant', contenido: respuesta, orden: orden + 1, timestamp: now
  }, AUTH);

  try {
    const sesion = await wixData.get(C_SESSIONS, sessionId, AUTH);
    if (sesion) {
      const merged = { ...sesion };
      merged.fechaActualizacion = now;
      merged.messageCount = (Number(sesion.messageCount) || 0) + 2;
      await wixData.update(C_SESSIONS, merged, AUTH);
    }
  } catch (e) {
    console.warn(`${TAG} _guardarMensajes: no se pudo tocar la sesión:`, e.message);
  }
}

function _log(campos) {
  return wixData.insert(C_LOG, {
    timestamp: new Date(),
    query: (campos.query || '').substring(0, 500),
    category: campos.modo || 'consultor',
    params: JSON.stringify({
      modelo: campos.modeloUsado, consultas: campos.consultas,
      prepMs: campos.prepMs, apiMs: campos.apiMs, cache: campos.cacheStats
    }).substring(0, 1000),
    responseSummary: (campos.respuesta || '').substring(0, 200),
    version: VERSION,
    timeMs: campos.totalMs || 0,
    error: campos.error || ''
  }, AUTH).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTROL DE ACCESO — StaffConfig.accessLevel (briefing Consultor §2)
// ═══════════════════════════════════════════════════════════════════════════

export const akiraVerificarAcceso = webMethod(
  Permissions.SiteMember,
  async ({ pinCode }) => {
    try {
      if (!pinCode) return { ok: false, error: 'PIN requerido' };
      const res = await wixData.query(C_STAFF)
        .eq('pinCode', String(pinCode))
        .eq('active', true)
        .limit(1)
        .find(AUTH);
      if (res.items.length === 0) return { ok: false, error: 'PIN no reconocido.' };
      const s = res.items[0];
      const nivel = Number(s.accessLevel);
      if (!(nivel >= 1 && nivel <= CONSULTOR_MIN_LEVEL)) {
        console.log(`${TAG} acceso denegado: nivel=${nivel}`);
        return { ok: false, error: 'Tu perfil no tiene acceso al modo Consultor.' };
      }
      return {
        ok: true,
        staffId: s._id,
        nombre: s.displayName || s.canonicalName || '',
        accessLevel: nivel
      };
    } catch (e) {
      console.error(`${TAG} akiraVerificarAcceso EXCEPTION:`, e);
      return { ok: false, error: 'Error verificando el acceso.' };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// NÚCLEO — askAkiraCore
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lógica principal. Función pura async llamable desde webMethod o desde
 * http-functions.js (que es la ruta real del widget).
 *
 * SOBRE EL TECHO DE 14s DE WIX (medido en CATHOVIA, no supuesto):
 *   Wix corta la CONEXIÓN al cliente a los ~14s, tanto en webMethod como en
 *   http-function. Pero el código backend SIGUE EJECUTÁNDOSE y termina de
 *   guardar en AkiraMessages. Por eso el widget hace polling: si recibe 504,
 *   busca la respuesta en el historial. NO intentar SSE: está medido que
 *   wix-http-functions no acepta streams.
 */
export async function askAkiraCore({ sessionId, query, userId, userName, modo }) {
  const tIn = Date.now();
  console.log(`${TAG} askAkiraCore IN sessionId=${sessionId || 'nueva'} query="${(query || '').substring(0, 50)}…"`);

  try {
    if (!query || !String(query).trim()) return { ok: false, error: 'query obligatoria' };

    // ── PREP: todas las lecturas independientes en paralelo ──
    const apiKeyPromise = getSecret('KAMISUITE').catch(e => {
      console.error(`${TAG} secret KAMISUITE no accesible:`, e.message);
      return null;
    });

    const [alignments, documentos, salon, staff, familias, groups] = await Promise.all([
      _getAlignments(),
      _getDocumentos(),
      _getSalonConfig(),
      _getStaff(),
      _getFamilias(),
      _getGroups()
    ]);

    // ── PLANO SOLICITADO (v1.7.0) ──
    // Lo pide el widget con los chips (asesor | ayuda). El endpoint akiraAsk
    // es público, así que el valor se valida contra la lista cerrada: cualquier
    // otra cosa cae a ASESOR. El plano decide TRES cosas: qué alignment aplica,
    // qué corpus se inyecta y si hay herramientas de datos.
    const plano  = _planoPedido(modo);
    const config = _alignmentDelPlano(alignments, plano);

    // Corpus del plano. Vacío = asesor (regla v1.5.0): los documentos que aún
    // no tienen 'modo' relleno siguen siendo visibles para el Consultor.
    const documentosDelPlano = _filtrarDocsPorPlano(documentos, plano);

    const fechas = resolverFechas();
    const prepMs = Date.now() - tIn;
    const charsCorpus = documentosDelPlano.reduce((n, d) => n + ((d && d.contenido) ? d.contenido.length : 0), 0);
    console.log(`${TAG} PREP ${prepMs}ms: plano=${plano} align=${config ? 'v' + (config.version || '?') : 'por defecto'} docs=${documentos.length}→${documentosDelPlano.length} corpus=${charsCorpus}/${_docCharsDelPlano(plano)} chars staff=${staff.length} fams=${familias.length} groups=${groups.length}`);
    if (charsCorpus > _docCharsDelPlano(plano)) {
      console.warn(`${TAG} ⚠️ corpus del plano '${plano}' excede el presupuesto: se truncará en ${_docCharsDelPlano(plano)} chars`);
    }
    if (!config) {
      console.warn(`${TAG} sin AkiraAlignment publicado para el plano '${plano}' — se usa la identidad por defecto del plano.`);
    }

    const apiKey = await apiKeyPromise;
    if (!apiKey) {
      return { ok: false, error: 'Configuración incompleta: falta el secret KAMISUITE.' };
    }

    const systemBlocks = _buildSystemBlocks({
      config, documentos: documentosDelPlano, salon, staff, familias, groups, fechas, plano
    });

    // En AYUDA no hay herramientas de datos: la pregunta es "cómo se usa esto",
    // no "cuánto facturé". Sin tools, el prompt se queda sin las descripciones
    // de las dos herramientas ni las reglas del motor — lo que compensa en
    // buena medida el tamaño del manual.
    const usarHerramientas = _planoUsaHerramientas(plano);

    // ── SESIÓN E HISTORIAL ──
    // Sesión nueva: se crea EN PARALELO con Anthropic (su _id solo hace
    // falta al guardar). Patrón CATHOVIA v1.6.0 (-250ms).
    let messages = [];
    let sessionPromise;
    if (!sessionId) {
      sessionPromise = _crearSesion(userId, userName, query);
    } else {
      sessionPromise = Promise.resolve(sessionId);
      messages = await _getHistorial(sessionId);
    }
    messages.push({ role: 'user', content: String(query) });

    // ── ANTHROPIC con tool use + failover ──
    let r;
    try {
      r = await _callClaudeConFallback(apiKey, systemBlocks, messages, usarHerramientas, plano === 'asesor');
    } catch (err) {
      console.error(`${TAG} ambos modelos fallaron:`, err.message);
      try { await sessionPromise; } catch (_) {}
      _log({ query, error: err.message, totalMs: Date.now() - tIn, prepMs });
      return { ok: false, error: 'El servicio de IA no responde ahora mismo. Reinténtalo en unos segundos.' };
    }

    const { respuesta, modeloUsado, timeMs: apiMs, cacheStats, consultas } = r;

    let effectiveSessionId;
    try {
      effectiveSessionId = await sessionPromise;
    } catch (e) {
      console.error(`${TAG} _crearSesion falló:`, e.message);
      return { ok: false, error: 'No he podido abrir la conversación. Reinténtalo.' };
    }

    if (!respuesta) {
      return { ok: false, error: 'No he podido generar respuesta. Reformula la pregunta.' };
    }

    await _guardarMensajes(effectiveSessionId, String(query), respuesta);

    const totalMs = Date.now() - tIn;
    _log({ query, respuesta, modo, modeloUsado, consultas, prepMs, apiMs, totalMs, cacheStats });

    console.log(`${TAG} askAkiraCore OUT total=${totalMs}ms (prep=${prepMs}ms api=${apiMs}ms) modelo=${modeloUsado} consultas=${consultas} cache=${cacheStats.hit}/${cacheStats.create} len=${respuesta.length}`);

    return { ok: true, respuesta, sessionId: effectiveSessionId };

  } catch (err) {
    console.error(`${TAG} askAkiraCore EXCEPTION:`, err);
    _log({ query, error: err.message || String(err), totalMs: Date.now() - tIn });
    return { ok: false, error: 'Error técnico: ' + (err.message || 'desconocido') };
  }
}

/** Wrapper webMethod. La ruta real del widget es http-functions (sin proxy). */
export const akiraPreguntar = webMethod(
  Permissions.SiteMember,
  async (params) => askAkiraCore(params)
);

// ═══════════════════════════════════════════════════════════════════════════
// GESTIÓN DE CHATS (sidebar del widget)
// ═══════════════════════════════════════════════════════════════════════════

export const akiraAbrir = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      const [alignments, salon] = await Promise.all([_getAlignments(), _getSalonConfig()]);
      const config = _alignmentDelPlano(alignments, PLANO_DEFECTO) || (alignments[0] || null);

      // Textos de bienvenida por plano (v1.8.0). Solo se devuelve lo que el
      // salón haya escrito: los vacíos NO se mandan, para que el widget
      // conserve su texto por defecto en lugar de quedarse en blanco.
      const planos = {};
      for (const p of PLANOS_VALIDOS) {
        const a = _alignmentDelPlano(alignments, p);
        if (!a) continue;
        const bloque = {};
        if (a.welcomeTitle && String(a.welcomeTitle).trim()) bloque.welcomeTitle = String(a.welcomeTitle).trim();
        if (a.welcomeText  && String(a.welcomeText).trim())  bloque.welcome      = String(a.welcomeText).trim();
        if (Object.keys(bloque).length > 0) planos[p] = bloque;
      }

      // Cada visita arranca en welcome (lección CATHOVIA v1.5.3).
      return {
        ok: true,
        sessionId: null,
        brandName: (salon && salon.brandName) || '',
        widgetSkin: (salon && salon.widgetSkin) || 'niebla',
        logoUrl: (salon && salon.logoUrl) || '',
        planos: planos,
        alignment: config ? { version: config.version || '1.0', tone: config.tone || 'directo' } : null
      };
    } catch (e) {
      console.error(`${TAG} akiraAbrir EXCEPTION:`, e);
      return { ok: false, error: e.message };
    }
  }
);

export const akiraListarChats = webMethod(
  Permissions.Anyone,
  async ({ userId, limit }) => {
    console.log(`${TAG} akiraListarChats IN userId=${userId || 'anon'}`);
    try {
      // CLON LITERAL de cathoviaListarChats (cathoviaBackend v1.6.0).
      //
      // ⚠️ NO se filtra por messageCount. v1.0.0 lo hacía "para optimizar" y
      // la sidebar salía VACÍA: _crearSesion inserta messageCount:0 y quien lo
      // sube a 2 es _guardarMensajes con un update que, si falla por lo que
      // sea, se traga la excepción en silencio → el contador se queda en 0 →
      // ninguna sesión pasa el filtro. CATHOVIA no usa contador: cuenta los
      // mensajes REALES. Es una query más por chat, pero es la verdad.
      //
      // El filtro por usuario tampoco se aplica a ciegas: si AkiraSessions no
      // tiene el campo usuarioId, .eq() devuelve 0 filas y la sidebar quedaría
      // vacía otra vez. Se intenta y se cae a sin filtrar.
      let items = [];
      if (userId) {
        try {
          const r = await wixData.query(C_SESSIONS)
            .eq(USER_FIELD, userId)
            .descending('fechaActualizacion')
            .limit(limit || 30)
            .find(AUTH);
          items = r.items || [];
        } catch (e) {
          console.warn(`${TAG} akiraListarChats: filtro por ${USER_FIELD} falló:`, e.message);
          items = [];
        }
      }
      if (items.length === 0) {
        const r2 = await wixData.query(C_SESSIONS)
          .descending('fechaActualizacion')
          .limit(limit || 30)
          .find(AUTH);
        items = r2.items || [];
        if (userId) console.log(`${TAG} akiraListarChats: sin filtro por usuario (¿falta ${USER_FIELD}?)`);
      }

      console.log(`${TAG} akiraListarChats: ${items.length} sesiones en bruto`);

      // Preview + comprobación de que la sesión tiene mensajes de verdad.
      const chatsRaw = await Promise.all(items.map(async (sesion) => {
        let preview = '';
        let hasUserMsg = false;
        try {
          const lastMsg = await wixData.query(C_MESSAGES)
            .eq('sessionRef', sesion._id)
            .eq('rol', 'user')
            .descending('orden')
            .limit(1)
            .find(AUTH);
          if (lastMsg.items.length > 0) {
            preview = (lastMsg.items[0].contenido || '').substring(0, 90);
            hasUserMsg = true;
          }
        } catch (_) { }
        return {
          id: sesion._id,
          titulo: sesion.title || 'Consulta',
          fecha: sesion.fechaActualizacion || sesion._createdDate,
          preview: preview,
          _hasUserMsg: hasUserMsg
        };
      }));

      const chats = chatsRaw
        .filter(c => c._hasUserMsg)
        .map(c => ({ id: c.id, titulo: c.titulo, fecha: c.fecha, preview: c.preview }));

      console.log(`${TAG} akiraListarChats OUT ${chats.length} conversaciones`);
      return { ok: true, chats };
    } catch (e) {
      console.error(`${TAG} akiraListarChats EXCEPTION:`, e);
      return { ok: false, error: e.message, chats: [] };
    }
  }
);

export const akiraAbrirChat = webMethod(
  Permissions.Anyone,
  async ({ sessionId }) => {
    try {
      if (!sessionId) return { ok: false, error: 'sessionId requerido' };
      const res = await wixData.query(C_MESSAGES)
        .eq('sessionRef', sessionId)
        .ascending('orden')
        .limit(200)
        .find(AUTH);
      const mensajes = (res.items || []).map(m => ({
        rol: m.rol, contenido: m.contenido, timestamp: m.timestamp
      }));
      return { ok: true, sessionId, mensajes };
    } catch (e) {
      console.error(`${TAG} akiraAbrirChat EXCEPTION:`, e);
      return { ok: false, error: e.message };
    }
  }
);

export const akiraBorrarChat = webMethod(
  Permissions.Anyone,
  async ({ sessionId, userId }) => {
    try {
      if (!sessionId) return { ok: false, error: 'sessionId requerido' };

      let sesion;
      try { sesion = await wixData.get(C_SESSIONS, sessionId, AUTH); }
      catch (_) { sesion = null; }
      if (!sesion) return { ok: true, sessionId, alreadyGone: true };

      const owner = sesion[USER_FIELD] || '';
      if (userId && owner && owner !== userId) {
        console.warn(`${TAG} ${userId} intentó borrar sesión de ${owner}`);
        return { ok: false, error: 'No tienes permiso para borrar esta conversación.' };
      }

      let borrados = 0;
      while (true) {
        const batch = await wixData.query(C_MESSAGES)
          .eq('sessionRef', sessionId).limit(50).find(AUTH);
        const items = batch.items || [];
        if (items.length === 0) break;
        await Promise.all(items.map(m => wixData.remove(C_MESSAGES, m._id, AUTH).catch(() => null)));
        borrados += items.length;
        if (items.length < 50) break;
      }
      await wixData.remove(C_SESSIONS, sessionId, AUTH);

      console.log(`${TAG} akiraBorrarChat OK: ${borrados} mensajes + sesión`);
      return { ok: true, sessionId, deletedMsgs: borrados };
    } catch (e) {
      console.error(`${TAG} akiraBorrarChat EXCEPTION:`, e);
      return { ok: false, error: 'Error técnico: ' + (e.message || 'desconocido') };
    }
  }
);
