/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — AKIRA Backend (Wix Velo)
 * Archivo:  backend/akiraLogic.web.js
 * VERSION:  2.1.2
 * FECHA:    11 Agosto 2026
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v2.1.1 → v2.1.2 — FICHA TÉCNICA VERIFICADA CONTRA PRODUCCIÓN
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   `clientRecordsLogic.web.js` v1.0.1 está en el repo de HAIR-TIMES, no en el
 *   de KALÓNICE: la Recepción con ficha técnica en modal y el CRM migrado
 *   están de momento solo allí (bitácora 11-Ago-2026). Leído y comparado, la
 *   normalización de v2.1.1 se desviaba en tres puntos. Ahora es copia literal
 *   de su `leerAnotaciones`:
 *
 *     · FECHA con fallback: recordDate || _createdDate. Sin él, una fila sin
 *       recordDate informado quedaba fuera de todo rango y desaparecía.
 *     · TIPO y ORIGEN normalizados a mayúsculas con sus defectos
 *       (GENERAL / RECEPCION), para no fabricar categorías fantasma en el
 *       desglose por una diferencia de caja.
 *     · Filas SIN TEXTO descartadas: una anotación vacía no es una anotación,
 *       y contarla inflaría el total.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v2.1.0 → v2.1.1 — AVISO DE `source` EN FICHA TÉCNICA
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   Matiz de la bitácora del 11-Ago-2026 que faltaba trasladar al modelo: la
 *   ficha de un cliente es UNA SOLA. Se leen todas sus filas sin filtrar por
 *   `source`, porque lo que anota Recepción PRO se ve en el CRM y al revés;
 *   `source` (RECEPCION / CRM / CLIENTE) registra PROCEDENCIA, no segrega.
 *   El código ya lo hacía; ahora el aviso del modo lo dice, para que AKIRA no
 *   sugiera que hay fichas distintas según la pantalla desde la que se anotó.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v2.0.0 → v2.1.0 — FICHA TÉCNICA Y CUIDADO Y SALUD
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   CORRECCIÓN DE UN ERROR DE v2.0.0. Aquella versión dejó fuera la ficha
 *   técnica clasificándola como dato de salud. Era falso, y además el alcance
 *   del producto no lo decide este archivo.
 *
 *   · modo `ficha`  → KamisuiteClientRecords. La FICHA TÉCNICA: fórmula de
 *     tinte, código de color, productos y tiempos aplicados, notas de
 *     trabajo. Documentación de OFICIO para repetir o corregir el trabajo en
 *     la próxima visita, como la ficha de un taller. Filtro de `active` en
 *     memoria (una fila sin el campo informado no debe desaparecer), tipo
 *     filtrable por `group`, y el texto se sirve ENTERO: es la fórmula.
 *
 *   · modo `care`   → ClientCareProfile + CareVisitRecord. Módulo DISTINTO:
 *     expediente evolutivo por zonas (hair, nails, lashes, skin) con
 *     diagnóstico, nivel de daño, productos recomendados y fotos. `diagnosis`
 *     es JSON serializado y se parsea con el mismo criterio que consoleIA
 *     v3.5.8, que es quien lo servía en AKIRA V1.
 *
 *   Campos verificados en careProfileLogic v1.3.0, hairAssessmentLogic y
 *   salonPhotoLogic (los backends que escriben esas filas) y, para la ficha
 *   técnica, en el contrato documentado de clientRecordsLogic v1.0.1.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.5.0 → v2.0.0 — ORÁCULO: ÍNDICE + FICHA BAJO DEMANDA + 5 MOTORES
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   PROBLEMA QUE RESUELVE. Hasta v1.5.0 cada fuente abierta metía en el prompt
 *   su descripción Y su lista de campos, en TODAS las preguntas. Ese coste se
 *   paga siempre, aunque nadie pregunte por esa fuente, y —más grave— degrada
 *   la elección: con 40 descripciones parecidas delante, el modelo se equivoca
 *   de fuente incluso en preguntas que antes acertaba.
 *
 *   ESTRATEGIA (sin vectores, determinista y auditable):
 *
 *   1) ÍNDICE DE UNA LÍNEA. El prompt ya no lleva campos. Lleva un índice
 *      agrupado por DOMINIO con una frase por fuente y sus ALIAS (las palabras
 *      que dice de verdad la gente del salón: "packs", "fichar", "cubito"…).
 *      El léxico declarado sustituye al embedding: mismo efecto de acercar
 *      "bono" y "pack", pero explícito y sin fallos silenciosos.
 *
 *   2) FICHA BAJO DEMANDA. Nueva herramienta `describir_fuente`: devuelve
 *      campos, eje de fecha, ejes de agrupación y avisos SOLO de la fuente que
 *      el modelo va a usar. El coste pasa a ser proporcional al uso, no al
 *      catálogo. Mismo patrón que ya usaban AkiraDocuments.
 *
 *   3) CATÁLOGO EN CMS. El índice se lee de la colección `AkiraSources` si
 *      existe; el registro embebido queda como FALLBACK y como semilla. Añadir
 *      una fuente = una fila. Activar/desactivar por salón = un booleano. Si
 *      la colección no existe o está vacía, AKIRA funciona igual con el
 *      registro embebido: nunca se queda sin fuentes.
 *
 *   MOTORES TRANSACCIONALES NUEVOS (el descubrimiento es barato, pero leer
 *   cada dominio sigue necesitando su lógica):
 *
 *   · bonos       → KamisuiteVouchers + KamisuiteVoucherRedemptions +
 *                   KamisuitePrimeMemberships + KamisuitePromoCards.
 *                   Mide el PASIVO: servicio cobrado y aún debido (bonos
 *                   emitidos sin consumir). Ninguna pantalla lo cuenta hoy.
 *   · almacen     → KamisuiteStockMoves. Consumo real de producto, no la foto
 *                   de stock (esa ya está como fuente de configuración).
 *   · fichajes    → TimeClockRecords. Horas REALES presentes, frente al
 *                   horario configurado que ya usaba productividad.
 *   · caja        → CashRegister + CashMovements. Arqueos y descuadres.
 *   · facturacion → Invoices. Documentos emitidos, base/cuota, rectificativas.
 *                   Trae ya los campos Verifactu (aeatStatus, currentHash):
 *                   hoy informan 'no_aplica' y el día que se active la
 *                   obligación AKIRA responde sobre remisión a la AEAT sin
 *                   tocar este archivo.
 *
 *   FUENTES DE CONFIGURACIÓN NUEVAS: productosConfig (política comercial de
 *   bonos/PRIME/tarjetas) y campanas (campañas promocionales).
 *
 *   NO INCLUIDO DELIBERADAMENTE. Ficha técnica de clientes (ClientCareProfile,
 *   CareVisitRecord, KamisuiteClientRecords): son datos personales de salud
 *   capilar. Abrirlos a un consultor conversacional cuyo log queda registrado
 *   en AkiraLog es una decisión de LOPD, no de arquitectura, y requiere fijar
 *   antes quién consulta y qué se registra. Ver §NOTA LOPD al final del
 *   registro de fuentes.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.4.5 → v1.5.0 — MODO EXTERNOS (bruto + comisión + histórico)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   PROBLEMA. AKIRA no daba ningún dato de servicios externos. El motor solo
 *   conocía KamisuiteReservations y PaymentReservations. Los cobros externos
 *   NO están en PaymentReservations: van a PagoreservasExternos (prefijo
 *   EXT_<reservaId>), colección separada por asepsia jurídica desde
 *   recepcionProLogic v1.0.37. Ninguna consulta llegaba ahí, así que "cuánto
 *   facturó EMY" devolvía cero o nada.
 *
 *   NUEVO MODO `externos` en consultar_datos_salon:
 *
 *   · FUENTE V2 — PagoreservasExternos, filtrada por fechaPago (mismo criterio
 *     que el modo cobros). Campos verificados: bookingId, descripcion,
 *     fechaPago, fechaReserva, importeTotal, nombreCliente, staff, tipoPago.
 *     NO tiene contactId ni desglosemetodopago.
 *
 *   · HISTÓRICO V1 — SvExternalRecords (status PAGADO, campo `date`), la
 *     colección de la época V1 que rellenaba externosLogic. Se incluyen SOLO
 *     las filas que no tienen gemela en PagoreservasExternos
 *     (bookingId = 'EXT_' + _id): desde externosLogic v1.1.3 (mar-2026) el
 *     cobro se escribía en AMBAS, y contarlas dos veces duplicaría la cifra.
 *     Así AKIRA abarca todo el histórico de externos sin inflarlo.
 *     Las filas legacy no llevan profesional (la colección no tiene campo
 *     staff): se marcan con origen 'historico' y no se les puede atribuir
 *     empleado.
 *
 *   · COMISIÓN. Se devuelve SIEMPRE junto al bruto, porque el ingreso real del
 *     salón en un servicio externo es la comisión, no la venta.
 *       - V2: cruce POR EMPLEADO, replicado literalmente de
 *         cierreExternosLogic v1.1.0 (el backend del Informe del día):
 *         ExternalServices.staffResourceId → StaffConfig.wixResourceId →
 *         StaffConfig.displayName, contra PagoreservasExternos.staff.
 *         Fallback compat por contactPerson. SIN fallback global.
 *       - Histórico: cruce por nombre de servicio (category contra
 *         ExternalServices.serviceName, con partes '+' y fallback al primer
 *         % > 0), replicado de estadisticas.web.js v2.5.3, que es como se
 *         calcularon siempre esas filas.
 *     Misma cifra que el Informe del día y que Estadísticas v2.6.0.
 *
 *   · AGREGACIÓN. Reutiliza claveGrupo (dia, mes, diaSemana, staff, tipoPago,
 *     cliente) y añade el eje `servicio`. Cada grupo trae bruto Y comisión.
 *
 *   NOTA. El modo `conversion` sigue cruzando reservas contra
 *   PaymentReservations por KRI_<id>. Las citas externas de
 *   KamisuiteReservations no casan ahí (su pago es EXT_ en la otra colección)
 *   y por tanto aparecen como reservadas y no cobradas. NO se toca en esta
 *   versión: requiere decisión de producto.
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

const VERSION = '2.1.2';
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
const MAX_DOC_CHARS = 12000;

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

// v1.5.0 — Circuito de externos. Dos ledgers separados por asepsia jurídica.
const C_COBROS_EXT   = 'PagoreservasExternos'; // cobros externos V2 (EXT_<reservaId>)
const C_EXT_LEGACY   = 'SvExternalRecords';    // registros externos V1 (histórico)
const C_EXT_SERVICES = 'ExternalServices';     // catálogo de comisiones

// v2.0.0 — Dominios nuevos. Nombres verificados contra los backends que los
// escriben (especialesVentaLogic, stockLogic, timeClockLogic,
// cashRegisterLogic, facturacionSalonLogic).
const C_VOUCHERS     = 'KamisuiteVouchers';
const C_REDEMPTIONS  = 'KamisuiteVoucherRedemptions';
const C_PRIME        = 'KamisuitePrimeMemberships';
const C_PROMOCARDS   = 'KamisuitePromoCards';
const C_CAMPANAS     = 'KamisuitePromoCampaigns';
const C_PROD_CONFIG  = 'KamisuiteProductsConfig';
const C_STOCK_MOVES  = 'KamisuiteStockMoves';
const C_WAREHOUSE    = 'KamisuiteWarehouse';
const C_TIMECLOCK    = 'TimeClockRecords';
const C_CASH_REG     = 'CashRegister';
const C_CASH_MOV     = 'CashMovements';
const C_INVOICES     = 'Invoices';
const C_SOURCES      = 'AkiraSources';         // índice de fuentes (CMS-first)

// v2.1.0 — Ficha técnica y expediente de cuidado.
// KamisuiteClientRecords: campos según la bitácora del 10-Ago-2026 y el
// contrato de clientRecordsLogic v1.0.1 / fichaClienteLogic v1.9.13.
// Care*: campos verificados en careProfileLogic v1.3.0, hairAssessmentLogic
// y salonPhotoLogic (los tres backends que escriben esas filas).
const C_CLIENT_RECORDS = 'KamisuiteClientRecords';
const C_CARE_PROFILE   = 'ClientCareProfile';
const C_CARE_VISIT     = 'CareVisitRecord';

// ── Constantes de dominio (verificadas en producción) ──
const PREFIJO_PAGO     = 'KRI_';       // PaymentReservations.bookingId = KRI_<reservaId>
const PREFIJO_PAGO_EXT = 'EXT_';       // PagoreservasExternos.bookingId = EXT_<reservaId>
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

/** Normaliza una fila de KamisuiteReservations a la forma que usa el motor. */
function normalizarReserva(r) {
  const fecha = fechaISOenMadrid(r.fechaReserva);
  const fasesArr = jsonIn(r.fases, 'items');
  // PROCESO = fases con ocupa:false. NO ocupan al estilista (Conceptos
  // Fundacionales §1). Se separan para poder medir ocupación real.
  let minOcupa = 0, minProceso = 0;
  for (const f of fasesArr) {
    const dur = Number(f && f.durationMin != null ? f.durationMin : (f && f.duracion) || 0) || 0;
    if (f && f.ocupa === false) minProceso += dur;
    else minOcupa += dur;
  }
  return {
    id: r._id,
    fecha,
    dow: dowMadrid(r.fechaReserva),
    family: r.family || '',
    group: r.group || '',
    status: r.status || '',
    precio: Number(r.precioTotal) || 0,
    duracion: Number(r.duracionTotal) || 0,
    minOcupa,
    minProceso,
    staffId: r.staffId || '',
    staffName: r.staffName || '',
    cliente: r.clientName || '',
    contactId: r.contactId || '',
    telefono: r.clientPhone || '',
    origenRecepcion: r.origenRecepcion === true,
    servicios: r.serviciosDetail || '',
    titulo: r.title || ''
  };
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
    const n = String(f.staffName).toLowerCase();
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
  let filas = raw.map(normalizarReserva);

  // Recorte exacto por día de Madrid (la query va en UTC y puede desbordar).
  if (f.desde) filas = filas.filter(r => r.fecha >= f.desde);
  if (f.hasta) filas = filas.filter(r => r.fecha <= f.hasta);

  // Canceladas fuera salvo petición explícita (patrón de producción).
  if (!f.incluirCanceladas) filas = filas.filter(r => r.status !== STATUS_CANCELADA);
  // BLOQUEO no es actividad comercial: fuera salvo que se pida.
  if (!f.incluirBloqueos) filas = filas.filter(r => r.family !== FAMILY_BLOQUEO);
  if (f.status) filas = filas.filter(r => r.status === f.status);

  filas = aplicarFiltros(filas, f, 'dow');

  const res = agregar(filas, 'precio', f.agruparPor);
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más registros de los que se pueden leer de una vez. Advierte al usuario de que las cifras son parciales y sugiérele acotar el periodo.';
  }
  res.minutosOcupados = filas.reduce((s, r) => s + r.minOcupa, 0);
  res.minutosProceso  = filas.reduce((s, r) => s + r.minProceso, 0);
  res.clientesUnicos  = new Set(filas.map(r => r.contactId || r.cliente).filter(Boolean)).size;
  res.muestra = filas.slice(0, 40).map(r => ({
    fecha: r.fecha, family: r.family, staff: r.staffName, cliente: r.cliente,
    precio: r.precio, duracion: r.duracion, status: r.status,
    origen: r.origenRecepcion ? 'recepción' : 'web', servicios: r.servicios
  }));
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
  // Filtros de cobro que también aplican al servicio (staff, día, cliente…).
  // family/group se filtran DESPUÉS, a nivel de servicio individual.
  cobros = aplicarFiltros(cobros, { ...f, family: undefined, group: undefined }, 'dowPago');

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
        _catalogado: group !== ''
      });
    }
  }

  // Filtro por categoría (group) a nivel de SERVICIO, no de cobro.
  if (gruposPedidos) {
    servicios = servicios.filter(s => gruposPedidos.indexOf(normalizarGroup(s.group)) !== -1);
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

  filas = aplicarFiltros(filas, f, 'dowPago');

  const res = agregar(filas, 'importe', f.agruparPor);
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más registros de los que se pueden leer de una vez. Advierte al usuario de que las cifras son parciales y sugiérele acotar el periodo.';
  }
  res.clientesUnicos = new Set(filas.map(r => r.contactId || r.cliente).filter(Boolean)).size;
  res.muestra = filas.slice(0, 40).map(r => ({
    fechaPago: r.fechaPago, importe: r.importe, tipoPago: r.tipoPago,
    staff: r.staff, cliente: r.cliente, descripcion: r.descripcion
  }));
  return res;
}

// ── MODO 3: CONVERSIÓN (el delta reservado → cobrado) ──────────────────────
// Ninguna colección sola responde esto. El cruce es por bookingId=KRI_<id>.
async function consultarConversion(f) {
  const fReservas = { ...f, agruparPor: 'ninguno' };
  let q = wixData.query(C_RESERVAS);
  if (f.desde) q = q.ge('fechaReserva', new Date(`${f.desde}T00:00:00.000Z`));
  if (f.hasta) q = q.le('fechaReserva', new Date(`${f.hasta}T23:59:59.999Z`));
  const rawR = await findAll(q, f.limite);

  let reservas = rawR.map(normalizarReserva);
  if (f.desde) reservas = reservas.filter(r => r.fecha >= f.desde);
  if (f.hasta) reservas = reservas.filter(r => r.fecha <= f.hasta);
  reservas = reservas.filter(r => r.family !== FAMILY_BLOQUEO);
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

  const canceladas = reservas.filter(r => r.status === STATUS_CANCELADA);
  const vivas      = reservas.filter(r => r.status !== STATUS_CANCELADA);
  const cobradas   = vivas.filter(r => cobradoPorReserva[r.id] != null);
  const sinCobrar  = vivas.filter(r => cobradoPorReserva[r.id] == null);

  const valorComprometido = vivas.reduce((s, r) => s + r.precio, 0);
  const valorCobrado      = cobradas.reduce((s, r) => s + (cobradoPorReserva[r.id] || 0), 0);
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
        mapa[k].cobrado += cobradoPorReserva[r.id];
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
    fecha: r.fecha, cliente: r.cliente, staff: r.staffName,
    family: r.family, precio: r.precio, status: r.status
  }));
  return res;
}

// ── MODO 4: EXTERNOS (v1.5.0) ──────────────────────────────────────────────
//
// Los servicios externos NO están en PaymentReservations. Viven en su propio
// ledger, PagoreservasExternos, y antes de la migración en SvExternalRecords.
// Este modo unifica ambos sin duplicar y devuelve bruto Y comisión.
//
// El ingreso del salón en un externo es la COMISIÓN. La venta bruta es del
// profesional externo. Por eso nunca se suma al modo cobros: se consulta aparte.

/** Mapa de comisiones. Se cachea con el mismo TTL que el mapa de catálogo. */
let _mapaComExt = null;
let _mapaComExtTs = 0;

async function _getMapasComisionExterna() {
  const ahora = Date.now();
  if (_mapaComExt && (ahora - _mapaComExtTs) < _MAPA_TTL_MS) return _mapaComExt;

  // porEmpleado: displayName(UPPER) → %  (ruta V2, patrón cierreExternosLogic v1.1.0)
  // porServicio: serviceName(UPPER) → %  (ruta histórica, patrón estadisticas v2.5.3)
  const mapas = { porEmpleado: {}, porServicio: {}, fallback: 0 };

  try {
    const res = await wixData.query(C_EXT_SERVICES)
      .eq('activeStatus', true)
      .limit(100)
      .find(AUTH);

    const catalogo = res.items || [];

    // Puente staffResourceId → displayName con una sola query a StaffConfig.
    const resourceIds = [];
    for (const it of catalogo) {
      const rid = it.staffResourceId;
      if (typeof rid === 'string' && rid.length > 0) resourceIds.push(rid);
    }

    let displayNamePorResourceId = {};
    if (resourceIds.length) {
      try {
        const st = await wixData.query(C_STAFF)
          .hasSome('wixResourceId', resourceIds)
          .limit(100)
          .find(AUTH);
        for (const s of (st.items || [])) {
          const rid = s.wixResourceId;
          if (typeof rid === 'string' && rid.length > 0) {
            const dn = s.displayName || s.canonicalName || '';
            if (dn) displayNamePorResourceId[rid] = dn;
          }
        }
      } catch (eSt) {
        console.warn(`${TAG} _getMapasComisionExterna StaffConfig:`, eSt.message);
      }
    }

    for (const it of catalogo) {
      const pct = Number(it.commissionPercentage || 0);

      // Ruta V2 — por empleado.
      const rid = it.staffResourceId;
      const displayName = (typeof rid === 'string' && rid.length > 0)
        ? (displayNamePorResourceId[rid] || '')
        : '';
      if (displayName) {
        const k = displayName.trim().toUpperCase();
        if (k) mapas.porEmpleado[k] = pct;
      } else {
        const contact = String(it.contactPerson || '').trim().toUpperCase();
        if (contact) mapas.porEmpleado[contact] = pct;
      }

      // Ruta histórica — por nombre de servicio.
      const svc = String(it.serviceName || '').trim().toUpperCase();
      if (svc) mapas.porServicio[svc] = pct;
      if (mapas.fallback === 0 && pct > 0) mapas.fallback = pct;
    }
  } catch (e) {
    console.warn(`${TAG} _getMapasComisionExterna fallo:`, e.message);
  }

  _mapaComExt = mapas;
  _mapaComExtTs = ahora;
  return mapas;
}

/**
 * Nombre del servicio del primer token de `descripcion`.
 * Formato que escribe marcarPagadoReserva: "Manicura (25€), Pedicura (45€)".
 * Copia literal del helper de cierreExternosLogic v1.1.0.
 */
function _nombreServicioExterno(descripcion) {
  const primerToken = String(descripcion || '').split(',')[0].trim();
  if (!primerToken) return '';
  const idxParen = primerToken.lastIndexOf('(');
  return idxParen > 0 ? primerToken.slice(0, idxParen).trim() : primerToken;
}

/** Normaliza una fila de PagoreservasExternos (ledger V2). */
function normalizarCobroExterno(p) {
  const bid = p.bookingId || '';
  return {
    id: p._id,
    bookingId: bid,
    reservaId: bid.indexOf(PREFIJO_PAGO_EXT) === 0 ? bid.substring(PREFIJO_PAGO_EXT.length) : '',
    fechaPago: fechaISOenMadrid(p.fechaPago),
    dowPago: dowMadrid(p.fechaPago),
    fechaReserva: fechaISOenMadrid(p.fechaReserva),
    importe: Number(p.importeTotal) || 0,
    tipoPago: p.tipoPago || '',
    staff: p.staff || '',
    descripcion: p.descripcion || '',
    servicio: _nombreServicioExterno(p.descripcion) || 'Servicio externo',
    cliente: p.nombreCliente || '',
    origen: 'v2',
    comision: 0
  };
}

/**
 * Normaliza una fila de SvExternalRecords (histórico V1).
 * Campos verificados en externosLogic v1.1.5: clientName, category, modality,
 * totalPrice, date, status, contactId. NO tiene campo de profesional.
 */
function normalizarExternoLegacy(r) {
  return {
    id: r._id,
    bookingId: `${PREFIJO_PAGO_EXT}${r._id}`,
    reservaId: r._id,
    fechaPago: fechaISOenMadrid(r.date),
    dowPago: dowMadrid(r.date),
    fechaReserva: fechaISOenMadrid(r.date),
    importe: Number(r.totalPrice) || 0,
    tipoPago: '',
    staff: '',
    descripcion: r.modality || r.category || '',
    servicio: r.modality || r.category || 'Servicio externo',
    categoria: r.category || '',
    cliente: r.clientName || '',
    contactId: r.contactId || '',
    origen: 'historico',
    comision: 0
  };
}

/** Agregación propia: bruto Y comisión en el total y en cada grupo. */
function _agregarExternos(filas, agruparPor) {
  const bruto = filas.reduce((s, r) => s + (Number(r.importe) || 0), 0);
  const comi = filas.reduce((s, r) => s + (Number(r.comision) || 0), 0);
  const count = filas.length;

  const base = {
    numRegistros: count,
    ventaBrutaExterna: round2(bruto),
    comisionSalon: round2(comi),
    // importeTotal se mantiene por coherencia con el resto de modos: es el
    // bruto. El ingreso del salón es comisionSalon.
    importeTotal: round2(bruto),
    ticketMedio: count > 0 ? round2(bruto / count) : 0
  };
  if (!agruparPor || agruparPor === 'ninguno') return base;

  const mapa = {};
  for (const r of filas) {
    const k = agruparPor === 'servicio'
      ? (r.servicio || '(sin servicio)')
      : claveGrupo(r, agruparPor);
    if (k === null) continue;
    if (!mapa[k]) mapa[k] = { grupo: k, numRegistros: 0, bruto: 0, comision: 0 };
    mapa[k].numRegistros++;
    mapa[k].bruto += Number(r.importe) || 0;
    mapa[k].comision += Number(r.comision) || 0;
  }
  base.desglose = Object.values(mapa)
    .map(g => ({
      grupo: g.grupo,
      numRegistros: g.numRegistros,
      ventaBrutaExterna: round2(g.bruto),
      comisionSalon: round2(g.comision),
      importeTotal: round2(g.bruto),
      ticketMedio: g.numRegistros > 0 ? round2(g.bruto / g.numRegistros) : 0
    }))
    .sort((a, b) => b.ventaBrutaExterna - a.ventaBrutaExterna);
  return base;
}

async function consultarExternos(f) {
  const mapas = await _getMapasComisionExterna();

  // ── Ledger V2: PagoreservasExternos por fechaPago ──
  let filasV2 = [];
  let truncadoV2 = false;
  try {
    let qv2 = wixData.query(C_COBROS_EXT);
    if (f.desde) qv2 = qv2.ge('fechaPago', new Date(`${f.desde}T00:00:00.000Z`));
    if (f.hasta) qv2 = qv2.le('fechaPago', new Date(`${f.hasta}T23:59:59.999Z`));
    qv2 = qv2.ascending('fechaPago');

    const rawV2 = await findAll(qv2, f.limite);
    if (rawV2._truncado) truncadoV2 = true;

    filasV2 = rawV2.map(normalizarCobroExterno);
    if (f.desde) filasV2 = filasV2.filter(r => r.fechaPago >= f.desde);
    if (f.hasta) filasV2 = filasV2.filter(r => r.fechaPago <= f.hasta);
  } catch (eV2) {
    // Salón sin circuito de externos: la colección puede no existir.
    console.warn(`${TAG} consultarExternos ledger V2 no disponible:`, eV2.message);
  }

  // bookingIds vistos: sirven para no contar dos veces el histórico.
  const bookingIdsV2 = {};
  for (const r of filasV2) if (r.bookingId) bookingIdsV2[r.bookingId] = true;

  for (const r of filasV2) {
    const k = String(r.staff || '').trim().toUpperCase();
    const pct = (k && mapas.porEmpleado[k] !== undefined) ? mapas.porEmpleado[k] : 0;
    r.comision = round2(r.importe * pct / 100);
  }

  // ── Histórico V1: SvExternalRecords PAGADO por `date`, sin gemela en V2 ──
  let filasV1 = [];
  let truncadoV1 = false;
  try {
    let qv1 = wixData.query(C_EXT_LEGACY).eq('status', 'PAGADO');
    if (f.desde) qv1 = qv1.ge('date', new Date(`${f.desde}T00:00:00.000Z`));
    if (f.hasta) qv1 = qv1.le('date', new Date(`${f.hasta}T23:59:59.999Z`));
    qv1 = qv1.ascending('date');

    const rawV1 = await findAll(qv1, f.limite);
    if (rawV1._truncado) truncadoV1 = true;

    let candidatas = rawV1.map(normalizarExternoLegacy);
    if (f.desde) candidatas = candidatas.filter(r => r.fechaPago >= f.desde);
    if (f.hasta) candidatas = candidatas.filter(r => r.fechaPago <= f.hasta);

    // Paso 1: fuera las que ya han entrado por el ledger V2 en este periodo.
    candidatas = candidatas.filter(r => !bookingIdsV2[r.bookingId]);

    // Paso 2: fuera las que tienen gemela en PagoreservasExternos aunque su
    // cobro caiga fuera del periodo (si no, se contarían en dos informes).
    if (candidatas.length) {
      const conGemela = {};
      const ids = candidatas.map(r => r.bookingId);
      for (let i = 0; i < ids.length; i += 50) {
        const bloque = ids.slice(i, i + 50);
        try {
          const gem = await wixData.query(C_COBROS_EXT)
            .hasSome('bookingId', bloque)
            .limit(500)
            .find(AUTH);
          for (const g of (gem.items || [])) {
            const bid = String(g.bookingId || '');
            if (bid) conGemela[bid] = true;
          }
        } catch (eGem) {
          console.warn(`${TAG} consultarExternos gemelas:`, eGem.message);
        }
      }
      candidatas = candidatas.filter(r => !conGemela[r.bookingId]);
    }

    for (const r of candidatas) {
      const catUpper = String(r.categoria || '').trim().toUpperCase();
      let pct = mapas.porServicio[catUpper] !== undefined ? mapas.porServicio[catUpper] : 0;
      if (pct === 0) {
        const partes = catUpper.split('+').map(p => p.trim());
        for (const parte of partes) {
          if (mapas.porServicio[parte] !== undefined) { pct = mapas.porServicio[parte]; break; }
        }
        if (pct === 0 && mapas.fallback > 0) pct = mapas.fallback;
      }
      r.comision = round2(r.importe * pct / 100);
    }

    filasV1 = candidatas;
  } catch (eV1) {
    // Un salón que nunca tuvo externos V1 no tiene la colección: no es error.
    console.warn(`${TAG} consultarExternos histórico no disponible:`, eV1.message);
  }

  let filas = filasV2.concat(filasV1);
  filas = aplicarFiltros(filas, f, 'dowPago');

  const res = _agregarExternos(filas, f.agruparPor);

  if (truncadoV2 || truncadoV1) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más registros de los que se pueden leer de una vez. Advierte al usuario de que las cifras son parciales y sugiérele acotar el periodo.';
  }

  res.registrosHistoricos = filasV1.length;
  if (filasV1.length > 0) {
    res.notaHistorico = 'Parte de los registros vienen del histórico anterior a la migración y no tienen profesional asignado: no se pueden desglosar por empleado.';
  }
  res.clientesUnicos = new Set(filas.map(r => r.cliente).filter(Boolean)).size;
  res.muestra = filas.slice(0, 40).map(r => ({
    fecha: r.fechaPago, servicio: r.servicio, staff: r.staff || '(histórico)',
    cliente: r.cliente, ventaBruta: r.importe, comision: r.comision,
    tipoPago: r.tipoPago, origen: r.origen
  }));
  return res;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOTORES TRANSACCIONALES v2.0.0 — BONOS · ALMACÉN · FICHAJES · CAJA · FACTURAS
// ═══════════════════════════════════════════════════════════════════════════
//
// Todos siguen el mismo contrato que los modos previos: query por rango,
// recorte exacto por día de Madrid, aplicarFiltros, agregación, muestra.
// Cada uno declara su EJE DE FECHA propio, porque cada dominio tiene el suyo.

/** Rango [desde,hasta] en Date UTC, patrón idéntico al resto del archivo. */
function _rangoUTC(f) {
  return {
    ini: f.desde ? new Date(`${f.desde}T00:00:00.000Z`) : null,
    fin: f.hasta ? new Date(`${f.hasta}T23:59:59.999Z`) : null
  };
}

// ── MODO: BONOS (fidelización) ─────────────────────────────────────────────
//
// El dato que ninguna pantalla da hoy: el PASIVO. Un bono vendido es servicio
// cobrado y todavía DEBIDO. Mientras quedan usos, el salón tiene una deuda en
// servicio. Se calcula prorrateando lo pagado por los usos que restan.
async function consultarBonos(f) {
  const { ini, fin } = _rangoUTC(f);
  const hoyISO = fechaISOenMadrid(new Date());

  // ── Bonos emitidos en el rango (issueDate) ──
  let q = wixData.query(C_VOUCHERS);
  if (ini) q = q.ge('issueDate', ini);
  if (fin) q = q.le('issueDate', fin);
  q = q.ascending('issueDate');

  const raw = await findAll(q, f.limite);
  let bonos = raw.map(b => {
    const total = Number(b.totalUses) || 0;
    const rest = Number(b.remainingUses) || 0;
    const pagado = Number(b.paidPrice) || 0;
    const expira = fechaISOenMadrid(b.expirationDate);
    return {
      id: b._id,
      codigo: b.code || '',
      cliente: b.clientName || '',
      contactId: b.contactId || '',
      servicio: b.serviceLabel || '',
      fecha: fechaISOenMadrid(b.issueDate),
      fechaPago: fechaISOenMadrid(b.issueDate),
      dowPago: dowMadrid(b.issueDate),
      expiracion: expira,
      importe: pagado,
      precioTarifa: Number(b.retailPrice) || 0,
      usosTotales: total,
      usosRestantes: rest,
      usosConsumidos: Math.max(0, total - rest),
      // Pasivo: parte proporcional de lo cobrado que aún no se ha prestado.
      pasivo: total > 0 ? round2(pagado * rest / total) : 0,
      caducado: !!(expira && expira < hoyISO),
      status: b.status || '',
      metodoPago: b.paymentMethod || '',
      tipoPago: b.paymentMethod || '',
      staff: '',
      tipo: 'BONO'
    };
  });

  if (f.desde) bonos = bonos.filter(r => r.fecha >= f.desde);
  if (f.hasta) bonos = bonos.filter(r => r.fecha <= f.hasta);
  bonos = aplicarFiltros(bonos, f, 'dowPago');

  const res = agregar(bonos, 'importe', f.agruparPor);
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más registros de los que se pueden leer de una vez. Advierte al usuario y sugiere acotar el periodo.';
  }

  res.bonosEmitidos = bonos.length;
  res.importeCobradoBonos = round2(bonos.reduce((s, r) => s + r.importe, 0));
  res.usosTotales = bonos.reduce((s, r) => s + r.usosTotales, 0);
  res.usosConsumidos = bonos.reduce((s, r) => s + r.usosConsumidos, 0);
  res.usosPendientes = bonos.reduce((s, r) => s + r.usosRestantes, 0);
  res.tasaConsumoPct = res.usosTotales > 0
    ? round2((res.usosConsumidos / res.usosTotales) * 100) : 0;
  res.pasivoPendiente = round2(bonos.reduce((s, r) => s + r.pasivo, 0));
  res.explicacionPasivo = 'pasivoPendiente = servicio ya cobrado y todavía NO prestado (parte proporcional de los bonos con usos restantes). Es una deuda en servicio, no un ingreso disponible.';
  res.caducadosConSaldo = bonos.filter(r => r.caducado && r.usosRestantes > 0).length;
  res.importeCaducadoSinConsumir = round2(
    bonos.filter(r => r.caducado && r.usosRestantes > 0).reduce((s, r) => s + r.pasivo, 0)
  );

  // ── Canjes del rango (redeemDate). Miden actividad, no emisión. ──
  try {
    let qr = wixData.query(C_REDEMPTIONS);
    if (ini) qr = qr.ge('redeemDate', ini);
    if (fin) qr = qr.le('redeemDate', fin);
    const rawR = await findAll(qr, f.limite);
    const canjes = (rawR || []).filter(r => {
      const d = fechaISOenMadrid(r.redeemDate);
      if (f.desde && d < f.desde) return false;
      if (f.hasta && d > f.hasta) return false;
      return true;
    });
    res.canjesEnPeriodo = canjes.length;
    res.ahorroClientesPorCanjes = round2(
      canjes.reduce((s, r) => s + (Number(r.amountSaved) || 0), 0)
    );
    res.notaCanjes = 'ahorroClientesPorCanjes es el valor de tarifa consumido con bonos en el periodo: NO es caja nueva, ese dinero se cobró al emitir el bono.';
  } catch (eR) {
    console.warn(`${TAG} consultarBonos canjes:`, eR.message);
  }

  // ── PRIME y tarjetas promocionales emitidas en el rango ──
  try {
    let qp = wixData.query(C_PRIME);
    if (ini) qp = qp.ge('issueDate', ini);
    if (fin) qp = qp.le('issueDate', fin);
    const rawP = await findAll(qp, f.limite);
    const primes = (rawP || []).filter(p => {
      const d = fechaISOenMadrid(p.issueDate);
      if (!d) return false;
      if (f.desde && d < f.desde) return false;
      if (f.hasta && d > f.hasta) return false;
      return true;
    });
    res.membresiasPrimeEmitidas = primes.length;
    res.importePrime = round2(primes.reduce((s, p) => s + (Number(p.paidPrice) || 0), 0));
    res.primeActivasHoy = primes.filter(p => {
      const e = fechaISOenMadrid(p.expirationDate);
      return String(p.status || '').toUpperCase() === 'ACTIVA' && (!e || e >= hoyISO);
    }).length;
  } catch (eP) {
    console.warn(`${TAG} consultarBonos prime:`, eP.message);
  }

  try {
    let qc = wixData.query(C_PROMOCARDS);
    if (ini) qc = qc.ge('issueDate', ini);
    if (fin) qc = qc.le('issueDate', fin);
    const rawC = await findAll(qc, f.limite);
    const cards = (rawC || []).filter(c => {
      const d = fechaISOenMadrid(c.issueDate);
      if (!d) return false;
      if (f.desde && d < f.desde) return false;
      if (f.hasta && d > f.hasta) return false;
      return true;
    });
    res.tarjetasPromoEmitidas = cards.length;
    res.importeTarjetasPromo = round2(cards.reduce((s, c) => s + (Number(c.paidPrice) || 0), 0));
    res.tarjetasRegalo = cards.filter(c => c.isGift === true).length;
  } catch (eC) {
    console.warn(`${TAG} consultarBonos tarjetas:`, eC.message);
  }

  res.muestra = bonos.slice(0, 40).map(r => ({
    fecha: r.fecha, codigo: r.codigo, cliente: r.cliente, servicio: r.servicio,
    pagado: r.importe, usos: `${r.usosConsumidos}/${r.usosTotales}`,
    expira: r.expiracion, status: r.status, pasivo: r.pasivo
  }));
  return res;
}

// ── MODO: ALMACÉN (consumo real) ───────────────────────────────────────────
// La FOTO de stock es configuración (fuente `productos`). Esto es el LIBRO:
// qué se movió, cuánto y quién. Eje de fecha: `date`.
async function consultarAlmacen(f) {
  const { ini, fin } = _rangoUTC(f);

  let q = wixData.query(C_STOCK_MOVES);
  if (ini) q = q.ge('date', ini);
  if (fin) q = q.le('date', fin);
  q = q.ascending('date');

  const raw = await findAll(q, f.limite);
  let filas = (raw || []).map(m => ({
    id: m._id,
    fecha: fechaISOenMadrid(m.date),
    fechaPago: fechaISOenMadrid(m.date),
    dow: dowMadrid(m.date),
    dowPago: dowMadrid(m.date),
    producto: m.productName || '',
    servicio: m.productName || '',
    tipoMovimiento: m.moveType || '',
    motivo: m.reason || '',
    unidades: Number(m.quantity) || 0,
    staff: m.staffName || '',
    staffName: m.staffName || '',
    notas: m.notes || '',
    importe: 0   // el coste se resuelve abajo contra el almacén
  }));

  if (f.desde) filas = filas.filter(r => r.fecha >= f.desde);
  if (f.hasta) filas = filas.filter(r => r.fecha <= f.hasta);
  filas = aplicarFiltros(filas, f, 'dow');

  // Coste unitario desde KamisuiteWarehouse (type='producto' lleva unitCost).
  const costes = {};
  try {
    const qw = wixData.query(C_WAREHOUSE).limit(500);
    const rawW = await findAll(qw, 1000);
    for (const p of (rawW || [])) {
      const n = normalizarTexto(p.productName);
      if (n && typeof p.unitCost === 'number') costes[n] = p.unitCost;
    }
  } catch (eW) {
    console.warn(`${TAG} consultarAlmacen costes:`, eW.message);
  }
  for (const r of filas) {
    const c = costes[normalizarTexto(r.producto)];
    if (typeof c === 'number') r.importe = round2(r.unidades * c);
  }

  const res = agregar(filas, 'importe', f.agruparPor === 'servicio' ? 'servicio' : f.agruparPor);
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más movimientos de los que se pueden leer de una vez. Advierte al usuario y sugiere acotar el periodo.';
  }
  res.movimientos = filas.length;
  res.unidadesMovidas = filas.reduce((s, r) => s + r.unidades, 0);
  res.costeTotalMovido = round2(filas.reduce((s, r) => s + r.importe, 0));
  res.notaCoste = 'El coste sale del unitCost del almacén. Si un producto no lo tiene configurado, su coste cuenta como 0.';

  const porTipo = {};
  for (const r of filas) {
    const k = r.tipoMovimiento || '(sin tipo)';
    if (!porTipo[k]) porTipo[k] = { tipo: k, movimientos: 0, unidades: 0, coste: 0 };
    porTipo[k].movimientos++;
    porTipo[k].unidades += r.unidades;
    porTipo[k].coste += r.importe;
  }
  res.porTipoMovimiento = Object.values(porTipo)
    .map(t => ({ ...t, coste: round2(t.coste) }))
    .sort((a, b) => b.unidades - a.unidades);

  res.muestra = filas.slice(0, 40).map(r => ({
    fecha: r.fecha, producto: r.producto, tipo: r.tipoMovimiento,
    motivo: r.motivo, unidades: r.unidades, coste: r.importe, staff: r.staff
  }));
  return res;
}

// ── MODO: FICHAJES (presencia real) ────────────────────────────────────────
// TimeClockRecords guarda EVENTOS (entrada/salida/pausa/vuelta), no jornadas.
// Las horas se reconstruyen emparejando entrada→salida y restando pausas.
// isVoided marca los anulados: fuera siempre.
async function consultarFichajes(f) {
  const { ini, fin } = _rangoUTC(f);

  let q = wixData.query(C_TIMECLOCK);
  if (ini) q = q.ge('timestamp', ini);
  if (fin) q = q.le('timestamp', fin);
  q = q.ascending('timestamp');

  const raw = await findAll(q, f.limite);
  let eventos = (raw || [])
    .filter(e => e.isVoided !== true)
    .map(e => ({
      id: e._id,
      staffId: e.staffId || '',
      staff: e.staffName || '',
      staffName: e.staffName || '',
      tipo: e.eventType || '',
      ts: e.timestamp ? new Date(e.timestamp).getTime() : 0,
      fecha: e.dateIso || fechaISOenMadrid(e.timestamp),
      dow: dowMadrid(e.timestamp),
      dowPago: dowMadrid(e.timestamp),
      autoClose: e.autoClose === true
    }));

  if (f.desde) eventos = eventos.filter(r => r.fecha >= f.desde);
  if (f.hasta) eventos = eventos.filter(r => r.fecha <= f.hasta);
  eventos = aplicarFiltros(eventos, f, 'dow');

  // Reconstrucción de jornadas: una por empleado y día.
  const jornadas = {};
  const ordenados = eventos.slice().sort((a, b) => a.ts - b.ts);
  for (const e of ordenados) {
    const k = `${e.staffId || e.staff}|${e.fecha}`;
    if (!jornadas[k]) {
      jornadas[k] = {
        staff: e.staff, staffName: e.staff, fecha: e.fecha, dow: e.dow, dowPago: e.dow,
        _entrada: 0, _pausa: 0, minutos: 0, minutosPausa: 0,
        cerrada: false, autoCerrada: false, importe: 0
      };
    }
    const j = jornadas[k];
    if (e.tipo === 'entrada') { j._entrada = e.ts; }
    else if (e.tipo === 'salida') {
      if (j._entrada) { j.minutos += Math.round((e.ts - j._entrada) / 60000); j._entrada = 0; j.cerrada = true; }
      if (e.autoClose) j.autoCerrada = true;
    }
    else if (e.tipo === 'pausa') { j._pausa = e.ts; }
    else if (e.tipo === 'vuelta') {
      if (j._pausa) { j.minutosPausa += Math.round((e.ts - j._pausa) / 60000); j._pausa = 0; }
    }
  }

  const filas = Object.values(jornadas).map(j => {
    const netos = Math.max(0, j.minutos - j.minutosPausa);
    return {
      staff: j.staff, staffName: j.staffName, fecha: j.fecha, dow: j.dow, dowPago: j.dow,
      minutosPresencia: netos,
      horasPresencia: round2(netos / 60),
      minutosPausa: j.minutosPausa,
      jornadaCerrada: j.cerrada,
      autoCerrada: j.autoCerrada,
      importe: round2(netos / 60)   // agregable: horas
    };
  });

  const res = agregar(filas, 'importe', f.agruparPor);
  if (res.importeTotal != null) { res.horasTotales = res.importeTotal; delete res.importeTotal; }
  if (res.ticketMedio != null) { res.mediaHorasPorJornada = res.ticketMedio; delete res.ticketMedio; }
  if (Array.isArray(res.desglose)) {
    res.desglose = res.desglose.map(g => ({
      grupo: g.grupo, jornadas: g.numRegistros,
      horas: g.importeTotal, mediaHorasPorJornada: g.ticketMedio
    }));
  }
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más fichajes de los que se pueden leer de una vez. Advierte al usuario y sugiere acotar el periodo.';
  }
  res.jornadas = filas.length;
  res.eventosLeidos = eventos.length;
  res.jornadasSinCerrar = filas.filter(j => !j.jornadaCerrada).length;
  res.jornadasAutoCerradas = filas.filter(j => j.autoCerrada).length;
  res.notaFichajes = 'Las horas se reconstruyen emparejando entrada con salida y descontando pausas. Una jornada sin salida registrada cuenta 0 horas: por eso jornadasSinCerrar puede explicar un total bajo. Los fichajes anulados quedan excluidos.';
  res.muestra = filas.slice(0, 40).map(j => ({
    fecha: j.fecha, staff: j.staff, horas: j.horasPresencia,
    pausaMin: j.minutosPausa, cerrada: j.jornadaCerrada, autoCerrada: j.autoCerrada
  }));
  return res;
}

// ── MODO: CAJA (arqueo) ────────────────────────────────────────────────────
// CashRegister = una fila por día. Eje de fecha: registerDate.
async function consultarCaja(f) {
  const { ini, fin } = _rangoUTC(f);

  let q = wixData.query(C_CASH_REG);
  if (ini) q = q.ge('registerDate', ini);
  if (fin) q = q.le('registerDate', fin);
  q = q.ascending('registerDate');

  const raw = await findAll(q, f.limite);
  let filas = (raw || []).map(c => ({
    id: c._id,
    fecha: fechaISOenMadrid(c.registerDate),
    fechaPago: fechaISOenMadrid(c.registerDate),
    dow: dowMadrid(c.registerDate),
    dowPago: dowMadrid(c.registerDate),
    fondoInicial: Number(c.openingBalance) || 0,
    cobrosEfectivo: Number(c.cashPaymentsTotal) || 0,
    entradasManuales: Number(c.manualEntriesTotal) || 0,
    salidasManuales: Number(c.manualExitsTotal) || 0,
    retiradas: Number(c.withdrawalsTotal) || 0,
    efectivoEsperado: Number(c.expectedCash) || 0,
    efectivoContado: Number(c.countedCash) || 0,
    descuadre: Number(c.difference) || 0,
    notaDescuadre: c.differenceNote || '',
    estado: c.status || '',
    cerradaPor: c.closedBy || '',
    staff: c.closedBy || '',
    importe: Number(c.difference) || 0
  }));

  if (f.desde) filas = filas.filter(r => r.fecha >= f.desde);
  if (f.hasta) filas = filas.filter(r => r.fecha <= f.hasta);
  filas = aplicarFiltros(filas, f, 'dow');

  const res = agregar(filas, 'importe', f.agruparPor);
  if (res.importeTotal != null) { res.descuadreAcumulado = res.importeTotal; delete res.importeTotal; }
  if (res.ticketMedio != null) delete res.ticketMedio;
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más días de los que se pueden leer de una vez. Advierte al usuario y sugiere acotar el periodo.';
  }

  res.diasConCaja = filas.length;
  res.diasCerrados = filas.filter(c => String(c.estado).toLowerCase() === 'closed').length;
  res.diasAbiertos = filas.filter(c => String(c.estado).toLowerCase() === 'open').length;
  res.cobrosEfectivoTotal = round2(filas.reduce((s, c) => s + c.cobrosEfectivo, 0));
  res.retiradasTotal = round2(filas.reduce((s, c) => s + c.retiradas, 0));
  res.diasConDescuadre = filas.filter(c => Math.abs(c.descuadre) > 0.009).length;
  res.mayorDescuadre = filas.reduce((m, c) => Math.abs(c.descuadre) > Math.abs(m) ? c.descuadre : m, 0);
  res.notaDescuadre = 'El descuadre solo tiene sentido en días CERRADOS con recuento hecho. Un día abierto o sin contar aparece con descuadre 0 sin que eso signifique que cuadra.';

  res.muestra = filas.slice(0, 40).map(c => ({
    fecha: c.fecha, fondoInicial: c.fondoInicial, efectivo: c.cobrosEfectivo,
    esperado: c.efectivoEsperado, contado: c.efectivoContado,
    descuadre: c.descuadre, estado: c.estado, cerradaPor: c.cerradaPor
  }));
  return res;
}

// ── MODO: FACTURACIÓN (documentos emitidos) ────────────────────────────────
// Invoices: tickets y facturas con su desglose fiscal. Eje: issueDate.
// Los campos Verifactu ya existen y hoy informan 'no_aplica'.
async function consultarFacturacion(f) {
  const { ini, fin } = _rangoUTC(f);

  let q = wixData.query(C_INVOICES);
  if (ini) q = q.ge('issueDate', ini);
  if (fin) q = q.le('issueDate', fin);
  q = q.ascending('issueDate');

  const raw = await findAll(q, f.limite);
  let filas = (raw || []).map(d => ({
    id: d._id,
    numero: d.invoiceNumber || '',
    serie: d.seriesCode || '',
    modo: d.modo || '',
    fecha: fechaISOenMadrid(d.issueDate),
    fechaPago: fechaISOenMadrid(d.issueDate),
    dow: dowMadrid(d.issueDate),
    dowPago: dowMadrid(d.issueDate),
    cliente: d.clientName || '',
    nifCliente: d.clientVatId || '',
    concepto: d.concept || '',
    base: Number(d.baseAmount) || 0,
    tipoIva: Number(d.vatRate) || 0,
    cuotaIva: Number(d.vatAmount) || 0,
    importe: Number(d.totalAmount) || 0,
    tipoPago: d.paymentMethod || '',
    estado: d.status || '',
    rectificaA: d.rectifiesInvoiceNumber || '',
    aeatStatus: d.aeatStatus || '',
    tieneHash: !!(d.currentHash && String(d.currentHash).length > 0),
    staff: ''
  }));

  if (f.desde) filas = filas.filter(r => r.fecha >= f.desde);
  if (f.hasta) filas = filas.filter(r => r.fecha <= f.hasta);
  filas = aplicarFiltros(filas, f, 'dow');

  const res = agregar(filas, 'importe', f.agruparPor);
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más documentos de los que se pueden leer de una vez. Advierte al usuario y sugiere acotar el periodo.';
  }

  res.documentosEmitidos = filas.length;
  res.baseImponibleTotal = round2(filas.reduce((s, d) => s + d.base, 0));
  res.cuotaIvaTotal = round2(filas.reduce((s, d) => s + d.cuotaIva, 0));
  res.totalFacturado = round2(filas.reduce((s, d) => s + d.importe, 0));
  res.rectificativas = filas.filter(d => d.rectificaA).length;

  const porModo = {};
  for (const d of filas) {
    const k = d.modo || '(sin tipo)';
    if (!porModo[k]) porModo[k] = { tipo: k, documentos: 0, total: 0 };
    porModo[k].documentos++;
    porModo[k].total += d.importe;
  }
  res.porTipoDocumento = Object.values(porModo)
    .map(t => ({ ...t, total: round2(t.total) }))
    .sort((a, b) => b.total - a.total);

  // Verifactu: informativo. Hoy 'no_aplica' en todas las filas.
  const conHash = filas.filter(d => d.tieneHash).length;
  res.verifactu = {
    documentosConHuella: conHash,
    documentosSinHuella: filas.length - conHash,
    nota: conHash === 0
      ? 'Verifactu todavía no está activo: ningún documento lleva huella ni ha sido remitido a la AEAT. Es lo esperado hoy.'
      : 'Hay documentos con huella Verifactu generada.'
  };

  res.muestra = filas.slice(0, 40).map(d => ({
    fecha: d.fecha, numero: d.numero, tipo: d.modo, cliente: d.cliente,
    base: d.base, iva: d.cuotaIva, total: d.importe, estado: d.estado,
    rectificaA: d.rectificaA
  }));
  return res;
}

// ── MODO: FICHA TÉCNICA (v2.1.0) ───────────────────────────────────────────
//
// KamisuiteClientRecords. Documentación de OFICIO del servicio: fórmulas de
// tinte, códigos de color, productos y tiempos aplicados, notas de trabajo.
// Sirve para repetir o corregir el trabajo en la próxima visita, igual que la
// ficha de un taller. Modelo inmutable: una fila por anotación, nunca se
// sobrescribe; retirar es active=false.
//
// El filtro de `active` va EN MEMORIA a propósito: una fila sin el campo
// informado no debe desaparecer por un .eq(active,true). Mismo criterio que
// clientRecordsLogic v1.0.1 y fichaClienteLogic v1.9.13.
async function consultarFicha(f) {
  const { ini, fin } = _rangoUTC(f);

  let q = wixData.query(C_CLIENT_RECORDS);
  if (ini) q = q.ge('recordDate', ini);
  if (fin) q = q.le('recordDate', fin);
  q = q.descending('recordDate');

  const raw = await findAll(q, f.limite);

  // Normalización COPIADA de clientRecordsLogic v1.0.1 (leerAnotaciones):
  // fallback de fecha a _createdDate, tipo y origen en mayúsculas con sus
  // defectos, y descarte de las filas sin texto.
  const TIPO_DEFECTO_FICHA = 'GENERAL';
  const ORIGEN_DEFECTO_FICHA = 'RECEPCION';

  let filas = (raw || [])
    .filter(r => r && r.active !== false)
    .map(r => {
      const fechaBase = r.recordDate || r._createdDate;
      const tipo = String(r.recordType || '').toUpperCase() || TIPO_DEFECTO_FICHA;
      return {
        id: r._id,
        fecha: fechaISOenMadrid(fechaBase),
        fechaPago: fechaISOenMadrid(fechaBase),
        dow: dowMadrid(fechaBase),
        dowPago: dowMadrid(fechaBase),
        tipo,
        servicio: tipo,
        texto: String(r.recordText || ''),
        cliente: r.clientName || '',
        contactId: r.contactId || '',
        telefono: r.clientPhone || '',
        autor: r.author || '',
        staff: r.author || '',
        staffName: r.author || '',
        reservaId: r.bookingId || '',
        procedencia: String(r.source || '').toUpperCase() || ORIGEN_DEFECTO_FICHA,
        importe: 1   // agregable: cuenta anotaciones
      };
    })
    .filter(r => r.texto);   // una anotación sin texto no es una anotación

  if (f.desde) filas = filas.filter(r => r.fecha >= f.desde);
  if (f.hasta) filas = filas.filter(r => r.fecha <= f.hasta);

  // Filtro por tipo de anotación. Reutiliza `group` (COLOR/TRATAMIENTO/GENERAL).
  if (f.group) {
    const tipos = (Array.isArray(f.group) ? f.group : [f.group]).map(t => normalizarTexto(t));
    filas = filas.filter(r => tipos.indexOf(normalizarTexto(r.tipo)) !== -1);
  }
  filas = aplicarFiltros(filas, f, 'dow');

  const res = agregar(filas, 'importe', f.agruparPor);
  if (res.importeTotal != null) { res.anotaciones = res.importeTotal; delete res.importeTotal; }
  if (res.ticketMedio != null) delete res.ticketMedio;
  if (Array.isArray(res.desglose)) {
    res.desglose = res.desglose.map(g => ({ grupo: g.grupo, anotaciones: g.numRegistros }));
  }
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más anotaciones de las que se pueden leer de una vez. Advierte al usuario y sugiere acotar el periodo.';
  }

  const porTipo = {};
  for (const r of filas) {
    const k = r.tipo || '(sin tipo)';
    porTipo[k] = (porTipo[k] || 0) + 1;
  }
  res.porTipo = Object.keys(porTipo)
    .map(k => ({ tipo: k, anotaciones: porTipo[k] }))
    .sort((a, b) => b.anotaciones - a.anotaciones);

  const porOrigen = {};
  for (const r of filas) {
    const k = r.procedencia || '(sin origen)';
    porOrigen[k] = (porOrigen[k] || 0) + 1;
  }
  res.porOrigen = Object.keys(porOrigen)
    .map(k => ({ origen: k, anotaciones: porOrigen[k] }))
    .sort((a, b) => b.anotaciones - a.anotaciones);

  res.clientesConAnotaciones = new Set(
    filas.map(r => r.contactId || r.cliente).filter(Boolean)
  ).size;

  // El texto es el valor de esta fuente: es la fórmula. Se sirve entero.
  res.muestra = filas.slice(0, 40).map(r => ({
    fecha: r.fecha, cliente: r.cliente, tipo: r.tipo,
    texto: r.texto, autor: r.autor, origen: r.procedencia
  }));
  return res;
}

// ── MODO: CARE (Cuidado y Salud) ───────────────────────────────────────────
//
// ClientCareProfile (1 fila por cliente) + CareVisitRecord (1 por visita y
// zona) + CareMedia (fotos). Módulo DISTINTO de la ficha técnica: aquí vive
// el expediente evolutivo con diagnóstico por zonas y fotos antes/después.
// `diagnosis` es JSON serializado; se parsea igual que en consoleIA v3.5.8.
async function consultarCare(f) {
  const { ini, fin } = _rangoUTC(f);

  let q = wixData.query(C_CARE_VISIT);
  if (ini) q = q.ge('visitDate', ini);
  if (fin) q = q.le('visitDate', fin);
  q = q.descending('visitDate');

  const raw = await findAll(q, f.limite);

  let filas = (raw || []).map(v => {
    let diag = null;
    if (v.diagnosis) {
      try {
        const d = typeof v.diagnosis === 'string' ? JSON.parse(v.diagnosis) : v.diagnosis;
        diag = {
          nivelDano: d.nivelDano,
          problemas: d.problemas,
          observaciones: typeof d.observaciones === 'string' ? d.observaciones.substring(0, 200) : d.observaciones,
          recomendaciones: d.recomendacionesTratamiento,
          productos: d.recomendacionesProductos
        };
      } catch (_) { /* diagnóstico no estructurado: se ignora */ }
    }
    return {
      id: v._id,
      fecha: fechaISOenMadrid(v.visitDate),
      fechaPago: fechaISOenMadrid(v.visitDate),
      dow: dowMadrid(v.visitDate),
      dowPago: dowMadrid(v.visitDate),
      contactId: v.contactId || '',
      zona: v.zone || '',
      servicio: v.zone || '',
      diagnostico: diag,
      nivelDano: diag && diag.nivelDano != null ? diag.nivelDano : null,
      problemas: diag && diag.problemas ? diag.problemas : null,
      productosRecomendados: v.productsRecommended || '',
      reservaId: v.bookingId || '',
      staff: v.staffId || '',
      procedencia: v.source || '',
      tieneFoto: !!(v.visitImage && String(v.visitImage).length > 0),
      importe: 1   // agregable: cuenta visitas de cuidado
    };
  });

  if (f.desde) filas = filas.filter(r => r.fecha >= f.desde);
  if (f.hasta) filas = filas.filter(r => r.fecha <= f.hasta);

  // Filtro por zona (hair / nails / lashes / skin) vía `group`.
  if (f.group) {
    const zonas = (Array.isArray(f.group) ? f.group : [f.group]).map(z => normalizarTexto(z));
    filas = filas.filter(r => zonas.indexOf(normalizarTexto(r.zona)) !== -1);
  }
  filas = aplicarFiltros(filas, f, 'dow');

  const res = agregar(filas, 'importe', f.agruparPor);
  if (res.importeTotal != null) { res.visitasCuidado = res.importeTotal; delete res.importeTotal; }
  if (res.ticketMedio != null) delete res.ticketMedio;
  if (Array.isArray(res.desglose)) {
    res.desglose = res.desglose.map(g => ({ grupo: g.grupo, visitas: g.numRegistros }));
  }
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más visitas de cuidado de las que se pueden leer de una vez. Advierte al usuario y sugiere acotar el periodo.';
  }

  const porZona = {};
  for (const r of filas) {
    const k = r.zona || '(sin zona)';
    porZona[k] = (porZona[k] || 0) + 1;
  }
  res.porZona = Object.keys(porZona)
    .map(k => ({ zona: k, visitas: porZona[k] }))
    .sort((a, b) => b.visitas - a.visitas);

  const porDano = {};
  for (const r of filas) {
    if (r.nivelDano == null) continue;
    const k = String(r.nivelDano);
    porDano[k] = (porDano[k] || 0) + 1;
  }
  res.porNivelDano = Object.keys(porDano)
    .map(k => ({ nivelDano: k, visitas: porDano[k] }))
    .sort((a, b) => b.visitas - a.visitas);

  res.clientesConExpediente = new Set(filas.map(r => r.contactId).filter(Boolean)).size;
  res.visitasConFoto = filas.filter(r => r.tieneFoto).length;
  res.visitasConDiagnostico = filas.filter(r => r.diagnostico).length;

  // Notas del perfil base (una fila por cliente). Solo si se acota a un cliente.
  if (f.cliente || f.contactId) {
    try {
      const ids = Array.from(new Set(filas.map(r => r.contactId).filter(Boolean))).slice(0, 50);
      if (ids.length) {
        const perf = await wixData.query(C_CARE_PROFILE)
          .hasSome('contactId', ids)
          .limit(50)
          .find(AUTH);
        res.perfiles = (perf.items || []).map(p => ({
          contactId: p.contactId,
          notas: p.notes || '',
          seguimientoRequerido: p.followUpRequired === true
        }));
      }
    } catch (eP) {
      console.warn(`${TAG} consultarCare perfiles:`, eP.message);
    }
  }

  res.muestra = filas.slice(0, 40).map(r => ({
    fecha: r.fecha, zona: r.zona, nivelDano: r.nivelDano,
    problemas: r.problemas, productosRecomendados: r.productosRecomendados,
    origen: r.procedencia, tieneFoto: r.tieneFoto
  }));
  return res;
}

/** Router del motor. Único punto de entrada de la herramienta. */
async function ejecutarConsulta(filtros) {
  const f = filtros || {};
  const modo = f.modo || 'reservas';
  const t0 = Date.now();
  let datos;
  if (modo === 'cobros')            datos = await consultarCobros(f);
  else if (modo === 'conversion')   datos = await consultarConversion(f);
  else if (modo === 'servicios')    datos = await consultarServicios(f);
  else if (modo === 'externos')     datos = await consultarExternos(f);
  else if (modo === 'bonos')        datos = await consultarBonos(f);
  else if (modo === 'almacen')      datos = await consultarAlmacen(f);
  else if (modo === 'fichajes')     datos = await consultarFichajes(f);
  else if (modo === 'caja')         datos = await consultarCaja(f);
  else if (modo === 'facturacion')  datos = await consultarFacturacion(f);
  else if (modo === 'ficha')        datos = await consultarFicha(f);
  else if (modo === 'care')         datos = await consultarCare(f);
  else                              datos = await consultarReservas(f);
  console.log(`${TAG} consulta modo=${modo} desde=${f.desde || '-'} hasta=${f.hasta || '-'} family=${f.family || '-'} group=${f.group || '-'} dow=[${(f.diasSemana || []).join(',')}] agrupa=${f.agruparPor || '-'} → ${Date.now() - t0}ms`);
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
// El salón tiene 53 colecciones propias. Abrirlas todas de golpe degradaría
// las respuestas y quemaría tokens: cada fuente es contexto que el modelo debe
// digerir. Se arranca con 5 y se amplía cuando Jal lo pida.
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
//   campos        — WHITELIST. Solo estos llegan al modelo. Lo no declarado
//                   no viaja: ahorra tokens y evita fugas.
//   objetos       — { campo: claveDesenvuelto } → jsonIn (patrón producción)
//   sensibles     — campos que NUNCA llegan al modelo aunque estén en `campos`
//   transform     — (fila) => fila. Traducción de formatos ilegibles.
//   filaUnica     — true si la colección tiene una sola fila (SalonConfig)
//   loader        — async () => filas[]. Para fuentes que NO son CMS sino API
//                   nativa de Wix (Contacts, Stores, Loyalty…). Si se declara,
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
 * Loader del CRM de Wix (Wix Contacts).
 *
 * Es la ÚNICA fuente que NO es una colección CMS: es una app nativa de Wix.
 * Por eso el registro admite `loader`: una función que devuelve las filas ya
 * normalizadas. El resto del motor (whitelist, sensibles, búsqueda) se aplica
 * igual. Añadir mañana otra fuente basada en API (Stores, Bookings, Loyalty)
 * = declarar su loader. La arquitectura no cambia.
 *
 * CONTRATO VERIFICADO en producción (pagecode_recepcionPRO v2.1.5 línea 247):
 *   cargarTodosContactos() → { ok: true, clientes: [{ contactId, nombreCompleto, email, telefono }] }
 * NO devuelve un array pelado. `consoleIA` v3.5.8 hace `todosRaw?.clientes`.
 *
 * ⚠️ El teléfono es el ÚNICO identificador fiable de cliente en KAMISUITE.
 * NUNCA usar email ni contactId como clave única (Conceptos Fundacionales).
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

/**
 * Registro de fuentes de configuración.
 * AMPLIAR AQUÍ = añadir una entrada. Nada más.
 */
const FUENTES_CONFIG = {

  servicios: {
    coleccion: 'ServiceCatalog',
    dominio: 'COMERCIAL',
    alias: ['servicio', 'servicios', 'precio', 'tarifa', 'catalogo', 'duracion', 'fases'],
    descripcion: 'Catálogo de servicios del salón: precio de tarifa, duración, familia, grupo, fases técnicas, complementos, variantes, bonos y descuentos promocionales configurados. Úsalo para saber a qué precio ESTÁ un servicio (tarifa), no cuánto se cobró (eso son los cobros).',
    filtroDefecto: { active: true },
    orden: 'order',
    limite: 300,
    campos: [
      'label', 'price', 'duration', 'minProceso', 'family', 'group', 'group1',
      'tipo', 'uso', 'claseServicio', 'ordenFases', 'mandatory', 'hasVariants',
      'bonoActivo', 'bonoNumero', 'bonoDescuento', 'descuentoActivo',
      'descuentoPromo', 'cobroporPeso', 'precioGramo', 'advancePayment',
      'advancePercent', 'descripcion', 'setupUid'
    ],
    objetos: { mapeoFases: 'items', complementos: 'items', variantes: 'items' },
    sensibles: []
  },

  personal: {
    coleccion: 'StaffConfig',
    dominio: 'PERSONAL',
    alias: ['empleado', 'empleados', 'staff', 'profesional', 'horario', 'plantilla'],
    descripcion: 'Profesionales del salón: horario semanal de trabajo, horas semanales, porcentaje de comisión, si es personal externo, y nivel de acceso. Úsalo para saber cuándo trabaja alguien o cuál es su capacidad horaria.',
    filtroDefecto: { active: true },
    limite: 60,
    campos: [
      'canonicalName', 'displayName', 'workingHoursSessionIds', 'isExternal',
      'externalModule', 'commissionPercentage', 'locationName', 'notes', 'accessLevel'
    ],
    objetos: {},
    // pinCode NUNCA llega al modelo: es el PIN de acceso a Recepción PRO.
    sensibles: ['pinCode'],
    transform: _transformHorario
  },

  salon: {
    coleccion: 'SalonConfig',
    dominio: 'SALON',
    alias: ['salon', 'iva', 'horario de apertura', 'datos fiscales', 'modulos'],
    descripcion: 'Configuración general del salón: nombre, IVA aplicable, horarios de apertura, módulos activos (tienda, fidelización, WhatsApp), datos fiscales y de contacto.',
    filaUnica: true,
    limite: 1,
    campos: [
      'brandName', 'legalName', 'address', 'phone', 'tier', 'vatRate',
      'hoursMonday', 'hoursTuesday', 'hoursWednesday', 'hoursThursday',
      'hoursFriday', 'hoursSaturday', 'hoursSunday', 'closingGraceMin',
      'defaultProfessional', 'externalStaffName', 'externalStaffArea',
      'shopActive', 'loyaltyActive', 'waActive', 'whatsappPro', 'emailActive',
      'usersActivation', 'widgetSkin'
    ],
    objetos: {},
    // masterPin y pinMetaNActual son credenciales. Nunca al modelo.
    sensibles: ['masterPin', 'pinMetaNActual', 'newnumbercommandMeta']
  },

  productos: {
    coleccion: 'KamisuiteWarehouse',
    dominio: 'ALMACEN',
    alias: ['producto', 'productos', 'stock', 'inventario', 'almacen', 'existencias'],
    descripcion: 'Almacén de productos: nombre, tipo, coste unitario, cantidad en stock y stock mínimo. Úsalo para consultas de inventario, valor del almacén o productos bajo mínimos.',
    filtroDefecto: { active: true },
    orden: 'productName',
    limite: 300,
    campos: ['productName', 'type', 'unitCost', 'quantity', 'minStock'],
    objetos: [],
    sensibles: []
  },

  clientes: {
    fuenteApi: 'Wix Contacts (CRM)',
    dominio: 'CLIENTES',
    alias: ['cliente', 'clientes', 'telefono', 'email', 'contacto', 'ficha de contacto'],
    descripcion: 'Ficha de contacto de los clientes del salón: nombre completo, teléfono y email. Úsalo cuando pidan los datos de contacto de una persona ("dame el teléfono de X", "el email de Y"). SIEMPRE con `busqueda`: son cientos de contactos. Para el HISTORIAL de visitas o gasto de un cliente usa consultar_datos_salon con el filtro cliente, no esta fuente.',
    loader: _loaderClientes,
    requiereBusqueda: true,
    limite: 25,
    campos: ['nombreCompleto', 'telefono', 'email'],
    objetos: {},
    // contactId es un UUID interno: no aporta nada al modelo y gasta tokens.
    sensibles: ['contactId']
  },

  externos: {
    coleccion: 'ExternalServices',
    dominio: 'EXTERNOS',
    alias: ['externo', 'externos', 'colaborador', 'comision', 'comisiones', 'uñas', 'estetica'],
    descripcion: 'Catálogo de servicios externos (los que presta personal no propio del salón) y el porcentaje de comisión que el salón retiene de cada uno.',
    filtroDefecto: { activeStatus: true },
    limite: 60,
    campos: ['serviceName', 'contactPerson', 'commissionPercentage'],
    objetos: {},
    sensibles: []
  },

  // ── v2.0.0 ──
  productosConfig: {
    coleccion: 'KamisuiteProductsConfig',
    dominio: 'FIDELIZACION',
    alias: ['politica de bonos', 'validez', 'caducidad', 'prime', 'configuracion de bonos'],
    descripcion: 'Política comercial de bonos, tarjeta PRIME y tarjetas promocionales: meses de validez, precios y si los bonos exigen ser PRIME. Es la CONFIGURACIÓN, no las ventas.',
    filaUnica: true,
    limite: 1,
    campos: [
      'voucherValidityMonths', 'vouchersSkipPrime', 'primeAnnualPrice',
      'primeDurationMonths', 'primeActive', 'vouchersActive', 'promoCardsActive'
    ],
    objetos: {},
    sensibles: []
  },

  campanas: {
    coleccion: 'KamisuitePromoCampaigns',
    dominio: 'FIDELIZACION',
    alias: ['campaña', 'campañas', 'promocion', 'promociones', 'tarjeta regalo', 'gift card'],
    descripcion: 'Campañas promocionales configuradas: servicio al que aplican, precio de campaña, precio de mercado y fechas de vigencia. Para las tarjetas VENDIDAS usa el modo bonos.',
    limite: 60,
    campos: ['name', 'serviceLabel', 'serviceSetupUid', 'retailPrice', 'promoPrice', 'startDate', 'endDate', 'active'],
    objetos: {},
    sensibles: []
  }

  // ── PARA AÑADIR UNA FUENTE NUEVA ──
  // Copiar el patrón de arriba. NADA MÁS que tocar: el input_schema, el
  // prompt del modelo y el router se generan solos desde este objeto.
  // Desde v2.0.0, además, basta con dar de alta la fila en AkiraSources para
  // publicarla o retirarla por salón sin desplegar.
  //
  // ───────────────────────────────────────────────────────────────────────
  // §FICHA TÉCNICA — QUÉ ES (corrección de Jal, 12-Ago-2026)
  // ───────────────────────────────────────────────────────────────────────
  // v2.0.0 dejó fuera KamisuiteClientRecords tratándola como dato de salud.
  // Era FALSO y v2.1.0 lo corrige: la FICHA TÉCNICA tiene UN SOLO propósito,
  // registrar la información TÉCNICA DEL SERVICIO —fórmula de tinte, código
  // de color, productos y tiempos aplicados, notas de trabajo— para poder
  // repetir o corregir el trabajo en la próxima visita. Es documentación de
  // oficio, como la ficha de un taller. No es historial clínico ni requiere
  // trato especial: está en modo `ficha`, sin recortes.
  //
  // Cuidado y Salud (ClientCareProfile / CareVisitRecord / CareMedia) es un
  // MÓDULO DISTINTO, con su propio propósito: expediente evolutivo por zonas
  // con diagnóstico y fotos. Está en modo `care`. No confundir ambos.
  //
  // AKIRA es una herramienta INTERNA del salón, con acceso restringido por
  // accessLevel, que consulta la misma persona que ya tiene estos datos en
  // pantalla. Preguntar a AKIRA no abre ningún canal que no estuviera ya
  // abierto. AKIRA V1 (consoleIA, categoría 'cuidadoysalud') ya los servía.
  //
  // Diferidas hasta que Jal las pida:
  //   ClientLopdSignatures · CommunicationLog · MarketingCampaigns
  //   B2BProfiles · HairSalonServices · ChangeLogServices
};

/**
 * Ejecuta una lectura de configuración. Genérica: NO conoce ninguna colección.
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
      error: `La fuente "${clave}" necesita un término de búsqueda (nombre, teléfono o email).`
    };
  }

  // ── Obtención: loader (API externa) o query CMS declarativa ──
  let raw;
  if (typeof def.loader === 'function') {
    raw = await def.loader();
  } else {
    let q = wixData.query(def.coleccion);
    for (const [campo, valor] of Object.entries(def.filtroDefecto || {})) {
      q = q.eq(campo, valor);
    }
    if (p.filtro && typeof p.filtro === 'object') {
      for (const [campo, valor] of Object.entries(p.filtro)) {
        // Solo campos declarados: evita filtrar por lo que no se expone.
        if ((def.campos || []).indexOf(campo) !== -1) q = q.eq(campo, valor);
      }
    }
    if (def.orden) q = q.ascending(def.orden);
    raw = await findAll(q, def.limite || 200);
  }

  // ── Proyección: whitelist + OBJECT + sensibles + transform ──
  const sensibles = new Set(def.sensibles || []);
  let filas = raw.map(item => {
    const out = {};
    for (const campo of (def.campos || [])) {
      if (sensibles.has(campo)) continue;          // nunca al modelo
      const v = item[campo];
      if (v === undefined || v === null || v === '') continue;
      out[campo] = v;
    }
    // Campos OBJECT envueltos {items:[...]} → jsonIn (patrón producción)
    for (const [campo, clave] of Object.entries(def.objetos || {})) {
      if (sensibles.has(campo)) continue;
      const arr = jsonIn(item[campo], clave);
      if (arr.length > 0) out[campo] = arr;
    }
    return def.transform ? def.transform(out) : out;
  });

  // ── Búsqueda libre sobre los campos ya proyectados ──
  if (p.busqueda) {
    const norm = (s) => String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const needle = norm(p.busqueda).trim();
    // Si buscan un teléfono, comparar solo dígitos: en CRM está como
    // "+34 617 37 89 84" y lo teclean como "617378984".
    const soloDigitos = needle.replace(/[^\d]/g, '');
    const esTelefono = soloDigitos.length >= 6;

    const match = filas.filter(f => {
      const blob = norm(JSON.stringify(f));
      if (blob.indexOf(needle) !== -1) return true;
      if (esTelefono && blob.replace(/[^\d]/g, '').indexOf(soloDigitos) !== -1) return true;
      return false;
    });

    if (match.length > 0) {
      filas = match;
    } else if (def.requiereBusqueda) {
      // Sin match en una fuente que exige búsqueda, devolver TODO sería
      // volcar el CRM entero. Mejor decir la verdad: no se ha encontrado.
      console.log(`${TAG} config fuente=${clave} busqueda="${p.busqueda}" → 0 resultados`);
      return {
        fuente: clave,
        numRegistros: 0,
        datos: [],
        nota: `No se ha encontrado ningún registro que coincida con "${p.busqueda}".`
      };
    }
    // En fuentes pequeñas (catálogo, personal), sin match se devuelve todo:
    // mejor contexto de más que respuesta vacía por una búsqueda mal formulada.
  }

  // Techo duro tras filtrar: protege el contexto del modelo.
  if (def.limite && filas.length > def.limite) filas = filas.slice(0, def.limite);

  console.log(`${TAG} config fuente=${clave} filas=${filas.length} → ${Date.now() - t0}ms`);

  if (def.filaUnica) {
    return { fuente: clave, coleccion: def.coleccion, datos: filas[0] || null };
  }
  return { fuente: clave, coleccion: def.coleccion, numRegistros: filas.length, datos: filas };
}

/**
 * Definición de la herramienta, GENERADA desde el registro.
 * Añadir una fuente al registro la hace visible al modelo automáticamente:
 * el enum y las descripciones salen de aquí, no de un literal.
 */
function _buildToolConfig(indiceFuentes) {
  // v2.0.0 — el enum respeta el índice: una fuente desactivada en AkiraSources
  // desaparece de la herramienta, no solo del prompt. Si no hay índice (fallo
  // de CMS en el arranque), se usan todas las embebidas.
  let claves = Object.keys(FUENTES_CONFIG);
  if (Array.isArray(indiceFuentes) && indiceFuentes.length > 0) {
    const activas = {};
    for (const f of indiceFuentes) if (f.tipo === 'config') activas[f.key] = true;
    const filtradas = claves.filter(k => activas[k]);
    if (filtradas.length > 0) claves = filtradas;
  }
  // El listado va en UNA línea por fuente: la ficha completa la da
  // describir_fuente, no este enum.
  const listado = claves
    .map(k => {
      const f = FUENTES_CONFIG[k];
      const req = f.requiereBusqueda ? ' [REQUIERE el parámetro `busqueda`]' : '';
      return `· "${k}"${req}: ${f.descripcion}`;
    })
    .join('\n');
  const conBusqueda = claves.filter(k => FUENTES_CONFIG[k].requiereBusqueda);

  return {
    name: 'consultar_configuracion_salon',
    description:
      'Consulta cómo está CONFIGURADO el salón: catálogo de servicios y sus precios de tarifa, ' +
      'horarios del personal, ajustes generales, almacén y comisiones. Estos datos NO tienen fecha: ' +
      'describen el estado actual, no lo que ocurrió en un periodo.\n\n' +
      'Combínala con consultar_datos_salon cuando la pregunta cruce configuración y actividad ' +
      '(por ejemplo: comparar el precio de tarifa de un servicio con lo que se está cobrando, ' +
      'o las horas contratadas de un profesional con las que tiene ocupadas).\n\n' +
      'Fuentes disponibles:\n' + listado,
    input_schema: {
      type: 'object',
      properties: {
        fuente: {
          type: 'string',
          enum: claves,
          description: 'Qué configuración leer.'
        },
        busqueda: {
          type: 'string',
          description: 'Texto libre para acotar: nombre de un servicio, de un profesional o de un cliente; también vale un teléfono o email. ' +
            (conBusqueda.length > 0
              ? `OBLIGATORIO en: ${conBusqueda.join(', ')} (son demasiados registros para devolverlos todos). `
              : '') +
            'En el resto de fuentes es opcional: si se omite, devuelve todo.'
        }
      },
      required: ['fuente']
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// v2.0.0 — CATÁLOGO DE MODOS TRANSACCIONALES
// ═══════════════════════════════════════════════════════════════════════════
//
// Cada modo declara aquí su ficha. El enum de la herramienta, el índice del
// prompt y describir_fuente salen TODOS de este objeto: una sola verdad.
// Añadir un modo = una entrada aquí + su función en el router. Nada más.

const MODOS_DATOS = {
  reservas: {
    dominio: 'AGENDA',
    alias: ['reserva', 'reservas', 'cita', 'citas', 'agenda', 'ocupacion', 'huecos', 'prevision'],
    resumen: 'Lo COMPROMETIDO: todo lo agendado, pasado y futuro. Incluye cancelaciones y no-shows.',
    ejeFecha: 'fechaReserva',
    campos: ['fecha', 'family', 'group', 'staff', 'cliente', 'precio', 'duracion', 'status', 'origen', 'minutosOcupados', 'minutosProceso'],
    ejes: ['staff', 'family', 'group', 'dia', 'diaSemana', 'mes', 'cliente', 'origen', 'status'],
    avisos: 'BLOQUEO y canceladas quedan fuera salvo que se pidan. minutosOcupados NO incluye el tiempo de PROCESO: el profesional está libre durante él.'
  },
  cobros: {
    dominio: 'DINERO',
    alias: ['cobro', 'cobros', 'facturacion', 'ingresos', 'ventas', 'caja del dia', 'metodo de pago', 'ticket medio'],
    resumen: 'Lo CONSUMADO: dinero realmente cobrado del salón. NO incluye servicios externos.',
    ejeFecha: 'fechaPago',
    campos: ['fechaPago', 'importe', 'tipoPago', 'staff', 'cliente', 'descripcion'],
    ejes: ['staff', 'dia', 'diaSemana', 'mes', 'tipoPago', 'cliente'],
    avisos: 'Los servicios externos NO están aquí: van en el modo externos. Sumarlos requiere pedir los dos.'
  },
  conversion: {
    dominio: 'DINERO',
    alias: ['conversion', 'no show', 'no-show', 'fuga', 'sin cobrar', 'perdido'],
    resumen: 'El DELTA entre reservado y cobrado: tasa de conversión, no-shows y fugas de caja.',
    ejeFecha: 'fechaReserva',
    campos: ['reservas', 'cobradas', 'tasaConversionPct', 'comprometido', 'cobrado', 'perdido'],
    ejes: ['staff', 'family', 'group', 'mes'],
    avisos: 'Cruza contra el ledger propio. Las citas externas no casan y aparecen como no cobradas: no uses este modo para juzgar a un profesional externo.'
  },
  servicios: {
    dominio: 'COMERCIAL',
    alias: ['servicio', 'servicios hechos', 'cuantos cortes', 'cuantos tintes', 'que se hizo'],
    resumen: 'Cuenta SERVICIOS INDIVIDUALES cobrados, incluidos los que van de complemento. Abarca todo el histórico.',
    ejeFecha: 'fechaPago',
    campos: ['servicio', 'group', 'cantidad', 'importe'],
    ejes: ['group', 'servicio', 'mes', 'dia', 'staff'],
    avisos: 'Una reserva de color puede contener un corte: este modo lo cuenta como corte, el modo reservas no.'
  },
  externos: {
    dominio: 'EXTERNOS',
    alias: ['externo', 'externos', 'colaborador', 'uñas', 'manicura', 'pedicura', 'pestañas', 'depilacion', 'comision'],
    resumen: 'Servicios prestados por personal NO propio. Devuelve venta bruta Y comisión del salón. Incluye histórico.',
    ejeFecha: 'fechaPago',
    campos: ['fechaPago', 'servicio', 'staff', 'cliente', 'ventaBrutaExterna', 'comisionSalon', 'tipoPago'],
    ejes: ['staff', 'servicio', 'dia', 'diaSemana', 'mes', 'tipoPago', 'cliente'],
    avisos: 'El ingreso del salón es la COMISIÓN, no el bruto. Nunca sumes el bruto a la facturación propia. Las filas del histórico no llevan profesional.'
  },
  bonos: {
    dominio: 'FIDELIZACION',
    alias: ['bono', 'bonos', 'pack', 'packs', 'sesiones', 'prime', 'tarjeta regalo', 'canje', 'canjes', 'saldo'],
    resumen: 'Bonos, PRIME y tarjetas promocionales: emisión, consumo, caducidad y PASIVO pendiente.',
    ejeFecha: 'issueDate (emisión) · redeemDate (canjes)',
    campos: ['codigo', 'cliente', 'servicio', 'pagado', 'usosTotales', 'usosRestantes', 'expiracion', 'status', 'pasivoPendiente', 'canjesEnPeriodo'],
    ejes: ['cliente', 'dia', 'diaSemana', 'mes', 'tipoPago'],
    avisos: 'pasivoPendiente es servicio COBRADO y aún NO prestado: deuda, no ingreso disponible. El ahorro por canjes no es caja nueva: ese dinero entró al emitir el bono.'
  },
  almacen: {
    dominio: 'ALMACEN',
    alias: ['consumo', 'gasto de producto', 'movimiento', 'movimientos', 'cubito', 'entrada de material', 'merma'],
    resumen: 'Libro de MOVIMIENTOS de almacén: qué producto se movió, cuánto, por qué y quién. Para el stock actual usa la configuración.',
    ejeFecha: 'date',
    campos: ['fecha', 'producto', 'tipoMovimiento', 'motivo', 'unidades', 'coste', 'staff'],
    ejes: ['servicio', 'staff', 'dia', 'mes', 'diaSemana'],
    avisos: 'El coste sale del unitCost configurado en el almacén. Un producto sin coste configurado suma 0.'
  },
  fichajes: {
    dominio: 'PERSONAL',
    alias: ['fichaje', 'fichajes', 'fichar', 'horas', 'presencia', 'entrada y salida', 'absentismo', 'jornada'],
    resumen: 'Horas REALES de presencia reconstruidas de los fichajes, frente al horario configurado.',
    ejeFecha: 'timestamp',
    campos: ['fecha', 'staff', 'horasPresencia', 'minutosPausa', 'jornadaCerrada', 'autoCerrada'],
    ejes: ['staff', 'dia', 'diaSemana', 'mes'],
    avisos: 'Una jornada sin salida registrada cuenta 0 horas. Revisa jornadasSinCerrar antes de concluir que alguien trabajó poco.'
  },
  caja: {
    dominio: 'DINERO',
    alias: ['caja', 'arqueo', 'descuadre', 'cuadre', 'fondo', 'efectivo contado', 'cierre de caja'],
    resumen: 'Arqueo diario: fondo inicial, efectivo esperado, contado y descuadre.',
    ejeFecha: 'registerDate',
    campos: ['fecha', 'fondoInicial', 'cobrosEfectivo', 'efectivoEsperado', 'efectivoContado', 'descuadre', 'estado', 'cerradaPor'],
    ejes: ['dia', 'diaSemana', 'mes', 'staff'],
    avisos: 'El descuadre solo significa algo en días CERRADOS con recuento. Un día abierto sale con descuadre 0 sin cuadrar realmente.'
  },
  facturacion: {
    dominio: 'FISCAL',
    alias: ['factura', 'facturas', 'ticket', 'tickets', 'iva', 'base imponible', 'rectificativa', 'verifactu', 'aeat', 'hacienda'],
    resumen: 'Documentos fiscales emitidos: tickets y facturas, con base, cuota de IVA y estado Verifactu.',
    ejeFecha: 'issueDate',
    campos: ['numero', 'serie', 'modo', 'cliente', 'base', 'cuotaIva', 'importe', 'estado', 'rectificaA', 'aeatStatus'],
    ejes: ['dia', 'mes', 'tipoPago', 'cliente'],
    avisos: 'No todo cobro genera documento: solo los emitidos. Verifactu aún no está activo, así que ningún documento lleva huella; es lo esperado.'
  },
  ficha: {
    dominio: 'FICHA TECNICA',
    alias: ['ficha', 'ficha tecnica', 'formula', 'formulas', 'tinte', 'color', 'codigo de color', 'que le hice', 'que lleva', 'anotacion', 'anotaciones'],
    resumen: 'FICHA TÉCNICA del servicio: fórmulas de tinte, códigos de color, productos y tiempos aplicados y notas de trabajo. Documentación de oficio para repetir o corregir el trabajo en la próxima visita.',
    ejeFecha: 'recordDate',
    campos: ['fecha', 'cliente', 'tipo', 'texto', 'autor', 'origen', 'reservaId'],
    ejes: ['cliente', 'staff', 'servicio', 'dia', 'mes', 'diaSemana'],
    avisos: 'El tipo (COLOR / TRATAMIENTO / GENERAL) se filtra con `group`. La ficha del cliente es UNA SOLA: se leen todas las filas sin filtrar por origen, porque lo que anota Recepción PRO se ve en el CRM y al revés; `origen` (RECEPCION / CRM / CLIENTE) registra procedencia, no segrega. Modelo inmutable: una fila por anotación, nunca se sobrescribe; las retiradas no aparecen. El TEXTO es el valor: es la fórmula, sírvelo entero y literal, sin resumirlo ni reinterpretarlo. Esta fuente no lleva importes.'
  },
  care: {
    dominio: 'CUIDADO Y SALUD',
    alias: ['cuidado', 'cuidado y salud', 'expediente', 'diagnostico', 'valoracion', 'nivel de daño', 'cabello', 'uñas', 'pestañas', 'piel', 'antes y despues'],
    resumen: 'Expediente de Cuidado y Salud: visitas por zona (hair, nails, lashes, skin) con diagnóstico, nivel de daño, productos recomendados y fotos.',
    ejeFecha: 'visitDate',
    campos: ['fecha', 'zona', 'nivelDano', 'problemas', 'productosRecomendados', 'origen', 'tieneFoto', 'notas del perfil'],
    ejes: ['cliente', 'servicio', 'dia', 'mes', 'diaSemana'],
    avisos: 'La zona se filtra con `group` (hair, nails, lashes, skin). Es un módulo DISTINTO de la ficha técnica: aquí está el expediente evolutivo, no la fórmula del servicio. Las notas del perfil base solo se devuelven si se acota a un cliente.'
  }
};

const MODOS_CLAVES = Object.keys(MODOS_DATOS);

// ═══════════════════════════════════════════════════════════════════════════
// v2.0.0 — ÍNDICE DE FUENTES (CMS-first, con el registro embebido de fallback)
// ═══════════════════════════════════════════════════════════════════════════
//
// El prompt lleva SOLO el índice: dominio, clave, una frase y los alias. Los
// campos NO viajan: se piden con describir_fuente cuando hacen falta.
//
// La colección AkiraSources permite añadir/activar/desactivar fuentes sin
// desplegar. Si no existe o está vacía, se usa lo embebido: AKIRA nunca se
// queda sin fuentes por un fallo de CMS.

let _indiceCache = null;
let _indiceCacheTs = 0;

function _indiceEmbebido() {
  const filas = [];
  for (const k of MODOS_CLAVES) {
    const m = MODOS_DATOS[k];
    filas.push({
      key: k, tipo: 'dato', dominio: m.dominio,
      resumen: m.resumen, alias: (m.alias || []).join(', '), activo: true
    });
  }
  for (const k of Object.keys(FUENTES_CONFIG)) {
    const c = FUENTES_CONFIG[k];
    filas.push({
      key: k, tipo: 'config', dominio: c.dominio || 'OTROS',
      resumen: c.descripcion || '', alias: (c.alias || []).join(', '), activo: true
    });
  }
  return filas;
}

async function _getIndiceFuentes() {
  const ahora = Date.now();
  if (_indiceCache && (ahora - _indiceCacheTs) < _MAPA_TTL_MS) return _indiceCache;

  let filas = _indiceEmbebido();

  try {
    const res = await wixData.query(C_SOURCES)
      .eq('activo', true)
      .ascending('dominio')
      .limit(200)
      .find(AUTH);

    const items = res.items || [];
    if (items.length > 0) {
      // El CMS manda: sustituye el resumen/alias/dominio de las claves que
      // conozca y desactiva las que no estén. Las claves desconocidas se
      // ignoran (no hay motor que las lea).
      const porKey = {};
      for (const it of items) {
        const k = String(it.key || '').trim();
        if (k) porKey[k] = it;
      }
      filas = filas
        .filter(f => porKey[f.key])
        .map(f => {
          const it = porKey[f.key];
          return {
            ...f,
            dominio: it.dominio || f.dominio,
            resumen: it.resumen || f.resumen,
            alias: it.alias || f.alias
          };
        });
      console.log(`${TAG} índice desde AkiraSources: ${filas.length} fuentes activas`);
    }
  } catch (e) {
    // Colección inexistente en este salón: se usa lo embebido. No es error.
    console.warn(`${TAG} AkiraSources no disponible, usando índice embebido:`, e.message);
  }

  _indiceCache = filas;
  _indiceCacheTs = ahora;
  return filas;
}

/** Índice compacto para el prompt: agrupado por dominio, una línea por fuente. */
function _formatearIndice(filas) {
  const porDominio = {};
  for (const f of filas) {
    const d = f.dominio || 'OTROS';
    if (!porDominio[d]) porDominio[d] = [];
    porDominio[d].push(f);
  }
  const out = [];
  for (const d of Object.keys(porDominio).sort()) {
    out.push(`[${d}]`);
    for (const f of porDominio[d]) {
      const via = f.tipo === 'dato'
        ? `consultar_datos_salon modo="${f.key}"`
        : `consultar_configuracion_salon fuente="${f.key}"`;
      const alias = f.alias ? ` — se dice: ${f.alias}` : '';
      out.push(`  · ${via}: ${f.resumen}${alias}`);
    }
  }
  return out.join('\n');
}

/** Ficha completa de una fuente. Es lo que devuelve describir_fuente. */
async function describirFuente(params) {
  const clave = String((params || {}).fuente || '').trim();
  const filas = await _getIndiceFuentes();
  const activas = filas.map(f => f.key);

  if (!clave || activas.indexOf(clave) === -1) {
    return {
      error: `Fuente "${clave}" no disponible.`,
      fuentesDisponibles: activas
    };
  }

  const m = MODOS_DATOS[clave];
  if (m) {
    return {
      fuente: clave,
      tipo: 'dato',
      herramienta: 'consultar_datos_salon',
      comoLlamar: `consultar_datos_salon con modo="${clave}"`,
      dominio: m.dominio,
      resumen: m.resumen,
      ejeDeFecha: m.ejeFecha,
      camposDevueltos: m.campos,
      ejesDeAgrupacion: m.ejes,
      avisos: m.avisos
    };
  }

  const c = FUENTES_CONFIG[clave];
  if (c) {
    return {
      fuente: clave,
      tipo: 'configuracion',
      herramienta: 'consultar_configuracion_salon',
      comoLlamar: `consultar_configuracion_salon con fuente="${clave}"`,
      dominio: c.dominio || 'OTROS',
      resumen: c.descripcion,
      ejeDeFecha: null,
      camposDevueltos: c.campos || [],
      requiereBusqueda: !!c.requiereBusqueda,
      avisos: c.requiereBusqueda
        ? 'Son demasiados registros: hay que pasar el parámetro `busqueda`.'
        : 'No tiene fecha: describe el estado actual, no un periodo.'
    };
  }

  return { error: `Fuente "${clave}" sin ficha.`, fuentesDisponibles: activas };
}

const TOOL_DESCRIBIR = {
  name: 'describir_fuente',
  description:
    'Devuelve la FICHA de una fuente: qué campos trae, por qué fecha se filtra, ' +
    'por qué ejes se puede desglosar y qué avisos tiene. Úsala cuando el índice ' +
    'no te baste para saber si una fuente responde la pregunta, o antes de pedir ' +
    'un desglose por un eje del que no estés seguro. Es barata: no devuelve datos ' +
    'del negocio, solo la descripción de la fuente.',
  input_schema: {
    type: 'object',
    properties: {
      fuente: {
        type: 'string',
        description: 'Clave de la fuente tal y como aparece en el ÍNDICE DE FUENTES del system.'
      }
    },
    required: ['fuente']
  }
};

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
        // v2.0.0 — enum y descripción GENERADOS desde MODOS_DATOS. Añadir un
        // modo allí lo publica aquí solo. Las descripciones largas ya no
        // viven en el prompt: están en describir_fuente.
        enum: MODOS_CLAVES,
        description:
          'Qué leer. Resumen de cada modo:\n' +
          MODOS_CLAVES.map(k => `· ${k}: ${MODOS_DATOS[k].resumen}`).join('\n') +
          '\nSi dudas de los campos o ejes de un modo, llama antes a describir_fuente.'
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
      staffName: { type: 'string', description: 'Filtra por nombre de profesional (coincidencia parcial).' },
      diasSemana: {
        type: 'array', items: { type: 'number' },
        description: 'Días de la semana: 0=domingo, 1=lunes … 6=sábado. Ej: [1,2] = lunes y martes.'
      },
      origen: { type: 'string', enum: ['web', 'recepcion'], description: 'Canal de la reserva. Solo modo reservas/conversion.' },
      tipoPago: { type: 'string', description: 'Método de pago (efectivo, tarjeta…). Solo modos cobros y externos.' },
      cliente: { type: 'string', description: 'Nombre de cliente (coincidencia parcial).' },
      agruparPor: {
        type: 'string',
        enum: ['ninguno', 'staff', 'family', 'group', 'dia', 'diaSemana', 'mes', 'tipoPago', 'cliente', 'origen', 'status', 'servicio'],
        description: 'Eje de desglose del resultado. "group" desglosa por categoría. "servicio" desglosa por nombre de servicio (modos servicios y externos). "ninguno" devuelve solo los totales.'
      },
      incluirCanceladas: { type: 'boolean', description: 'Por defecto false. true para analizar cancelaciones.' },
      incluirBloqueos: { type: 'boolean', description: 'Por defecto false. true solo para analizar bloqueos de agenda.' }
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
async function _callClaudeConHerramientas(model, apiKey, systemBlocks, messages, timeoutMs, indiceFuentes) {
  const startMs = Date.now();
  const convo = messages.slice();
  let cacheStats = { hit: 0, create: 0, input: 0, output: 0 };
  let consultas = 0;

  // v2.0.0: 5 vueltas. describir_fuente puede añadir un salto antes de los
  // datos, y una pregunta que cruza dominios encadena varias consultas.
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const data = await _postAnthropic(apiKey, {
      model,
      max_tokens: MAX_TOKENS,
      system: systemBlocks,
      tools: [TOOL_CONSULTAR, _buildToolConfig(indiceFuentes), TOOL_DESCRIBIR],
      messages: convo
    }, timeoutMs, model);

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
        } else if (tu.name === 'describir_fuente') {
          out = await describirFuente(tu.input || {});
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

async function _callClaudeConFallback(apiKey, systemBlocks, messages, indiceFuentes) {
  try {
    const r = await _callClaudeConHerramientas(MODEL_PRIMARY, apiKey, systemBlocks, messages, PRIMARY_TIMEOUT_MS, indiceFuentes);
    return { ...r, modeloUsado: MODEL_PRIMARY };
  } catch (err1) {
    console.warn(`${TAG} Sonnet falló, cayendo a Haiku: ${err1.message}`);
    try {
      const r = await _callClaudeConHerramientas(MODEL_FALLBACK, apiKey, systemBlocks, messages, FALLBACK_TIMEOUT_MS, indiceFuentes);
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

async function _getAlignment() {
  try {
    const res = await wixData.query(C_ALIGNMENT)
      .eq('status', 'publicado')
      .descending('publicationDate')
      .limit(1)
      .find(AUTH);
    return res.items.length > 0 ? res.items[0] : null;
  } catch (e) {
    console.warn(`${TAG} _getAlignment fallo:`, e.message);
    return null;
  }
}

async function _getDocumentos() {
  try {
    const res = await wixData.query(C_DOCUMENTS)
      .eq('activo', true)
      .ascending('orden')
      .limit(50)
      .find(AUTH);
    return res.items || [];
  } catch (e) {
    console.warn(`${TAG} _getDocumentos fallo:`, e.message);
    return [];
  }
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
  const { config, documentos, salon, staff, familias, groups, fechas, indiceFuentes, modo } = ctx;
  const stable = [];

  // ── IDENTIDAD ──
  const brand = (salon && salon.brandName) || 'el salón';
  if (config && config.promptBase) {
    stable.push(config.promptBase);
  } else {
    stable.push(
      `Eres AKIRA, la inteligencia artificial de gestión de ${brand}, integrada en KAMISUITE. ` +
      `Trabajas en modo CONSULTOR: eres un consultor de negocio permanente para la propiedad del salón. ` +
      `Analizas el rendimiento real del negocio, detectas tendencias y anomalías, y das conclusiones ` +
      `accionables. Hablas en español, con criterio profesional y sin rodeos.`
    );
  }

  if (modo) stable.push(`MODO ACTIVO: ${String(modo).toUpperCase()}.`);

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
  const ctxSalon = ['--- CONTEXTO DEL SALÓN ---'];
  if (salon) {
    if (salon.brandName) ctxSalon.push(`Nombre comercial: ${salon.brandName}`);
    if (salon.legalName) ctxSalon.push(`Razón social: ${salon.legalName}`);
    if (salon.addressUSER || salon.address) ctxSalon.push(`Dirección: ${salon.addressUSER || salon.address}`);
    if (salon.vatRate != null) ctxSalon.push(`IVA aplicable: ${salon.vatRate}%`);
  }
  if (staff && staff.length > 0) {
    ctxSalon.push('Profesionales activos: ' +
      staff.map(s => s.displayName || s.canonicalName).filter(Boolean).join(', '));
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
  if (ctxSalon.length > 1) stable.push(ctxSalon.join('\n'));

  // ── CÓMO FUNCIONA EL NEGOCIO (Conceptos Fundacionales, no negociable) ──
  stable.push([
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
    '4. EXTERNOS (modo "externos") — los servicios que presta personal NO propio del',
    '   salón (uñas, pestañas, depilación…). Se llevan en un ledger aparte y NO están',
    '   incluidos en el modo cobros. De un servicio externo, el salón NO ingresa la',
    '   venta: ingresa una COMISIÓN sobre ella. Por eso este modo devuelve las dos',
    '   cifras, ventaBrutaExterna y comisionSalon, y son cosas distintas.',
    '',
    'PROCESO: en coloración y tratamientos, el producto actúa sobre el cabello durante',
    'un tiempo en el que el profesional queda LIBRE y puede atender a otra clienta. Ese',
    'tiempo NO ocupa agenda. Por eso "minutosOcupados" y "minutosProceso" se devuelven',
    'por separado: la ocupación real del profesional es minutosOcupados, nunca la',
    'duración total. Es la razón de ser de KAMISUITE y ningún competidor lo hace.',
    '',
    'origenRecepcion distingue si la reserva la creó el salón (recepción) o la clienta',
    'desde la web. Las reservas de familia BLOQUEO no son actividad comercial: son',
    'huecos bloqueados en agenda, y quedan excluidas salvo que se pidan explícitamente.'
  ].join('\n'));

  // ── ÍNDICE DE FUENTES (v2.0.0) ──
  // Una línea por fuente, agrupada por dominio, con los alias que usa la gente
  // del salón. Los CAMPOS no viajan aquí: se piden con describir_fuente.
  if (Array.isArray(indiceFuentes) && indiceFuentes.length > 0) {
    stable.push(
      '--- ÍNDICE DE FUENTES ---\n' +
      'Esto es TODO lo que AKIRA puede consultar. Elige la fuente por su dominio y por\n' +
      'las palabras que la gente usa ("se dice:"). Si no estás seguro de los campos o\n' +
      'de los ejes de desglose de una fuente, llama primero a describir_fuente.\n\n' +
      _formatearIndice(indiceFuentes)
    );
  }

  // ── REGLAS DE USO DE LA HERRAMIENTA ──
  stable.push([
    '--- REGLAS DE TRABAJO (INQUEBRANTABLES) ---',
    '1. NUNCA des una cifra que no venga de una herramienta. No calcules sumas,',
    '   medias ni porcentajes de cabeza: pídelos y nárralos. Los cálculos ya',
    '   vienen hechos en la respuesta.',
    '1b. Tienes TRES herramientas y son complementarias:',
    '   · consultar_datos_salon → qué PASÓ o pasará. Tiene fecha. Elige el',
    '     `modo` según el dominio (agenda, dinero, fidelización, almacén,',
    '     personal, fiscal).',
    '   · consultar_configuracion_salon → cómo está MONTADO el salón (precios',
    '     de tarifa, horarios del personal, almacén, política de bonos). NO',
    '     tiene fecha.',
    '   · describir_fuente → la FICHA de una fuente: campos, eje de fecha,',
    '     ejes de desglose y avisos. No devuelve datos del negocio y es barata.',
    '     Úsala cuando el ÍNDICE no te baste para decidir, en vez de probar a',
    '     ciegas o de dar por hecho un campo que quizá no exista.',
    '   Cuando la pregunta cruce varios dominios, llama a las que hagan falta.',
    '   Ejemplos de cruce: precio de tarifa contra lo cobrado de verdad; horas',
    '   de horario contra horas realmente fichadas; coste de producto contra',
    '   ingreso del servicio que lo consume.',
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
    '   reserva de otra categoría). Elige el modo según lo que se pregunta.',
    '10. EXTERNOS. Cualquier pregunta sobre servicios externos o sobre un',
    '   profesional externo va al modo "externos". El modo cobros NO los',
    '   contiene: si lo usas para eso, darás cero y será falso.',
    '10b. Al responder de externos da SIEMPRE las dos cifras y distínguelas sin',
    '   ambigüedad: la venta bruta (lo que pagó la clienta, que no es ingreso',
    '   del salón) y la comisión (lo que el salón se queda de verdad). Si te',
    '   preguntan "cuánto ha facturado" un externo, la respuesta útil es la',
    '   comisión, mencionando el bruto del que sale.',
    '10c. NUNCA sumes la venta bruta externa a la facturación del salón: la',
    '   inflarías. Si te piden el total del negocio, suma cobros propios +',
    '   comisión de externos, y dilo explícitamente.',
    '10d. El modo externos incluye el histórico anterior a la migración. Esas',
    '   filas antiguas no llevan profesional asignado, así que un desglose por',
    '   empleado de periodos antiguos puede salir incompleto: si la respuesta',
    '   trae notaHistorico, trasládalo.',
    '11. BONOS Y PASIVO. Un bono vendido es servicio COBRADO y todavía DEBIDO.',
    '   El campo pasivoPendiente es esa deuda en servicio: NO es dinero',
    '   disponible ni ingreso del periodo. Y el ahorro por canjes tampoco es',
    '   caja nueva: ese dinero entró el día que se vendió el bono. Cuando',
    '   informes de bonos, separa siempre lo cobrado por emisión de lo',
    '   consumido en servicio.',
    '12. NO MEZCLES DOMINIOS EN UN TOTAL. Cobros propios, comisión de externos,',
    '   emisión de bonos y documentos fiscales miden cosas distintas y se',
    '   solapan entre sí (un bono se cobra una vez y se consume después; una',
    '   factura documenta un cobro que ya está en cobros). Si te piden "el',
    '   total del negocio", di de qué se compone en vez de sumar cifras que',
    '   contarían dos veces lo mismo.',
    '13. Cada fuente trae sus propios avisos (notaCoste, notaFichajes,',
    '   notaDescuadre, notaCanjes…). Son advertencias sobre cómo leer el dato:',
    '   si el resultado trae uno y afecta a tu conclusión, dilo.',
    '14. FICHA TÉCNICA (modo "ficha"). Es la documentación de OFICIO del',
    '   servicio: la fórmula de tinte, el código de color, los productos y',
    '   tiempos aplicados y las notas de trabajo. Sirve para repetir o',
    '   corregir el trabajo en la siguiente visita, igual que la ficha de un',
    '   taller. Cuando te pregunten "qué le hice", "qué fórmula lleva" o "qué',
    '   color usamos", ese es el modo. Sirve el TEXTO ENTERO Y LITERAL: es la',
    '   fórmula, y resumirla o reinterpretarla la inutiliza. El tipo (COLOR,',
    '   TRATAMIENTO, GENERAL) se filtra con `group`.',
    '14b. CUIDADO Y SALUD (modo "care") es un módulo DISTINTO: expediente',
    '   evolutivo por zonas (hair, nails, lashes, skin) con diagnóstico,',
    '   nivel de daño, productos recomendados y fotos. No lo confundas con la',
    '   ficha técnica ni mezcles sus datos: son dos cosas separadas.'
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

  // ── CONOCIMIENTO (AkiraDocuments: normativa + metodología) ──
  if (documentos && documentos.length > 0) {
    const bloques = ['--- CONOCIMIENTO DE REFERENCIA ---'];
    bloques.push('Este material es tu criterio experto: interpretación de ratios, metodología de gestión y normativa aplicable. Intégralo con naturalidad; no lo cites textualmente.');
    let chars = 0;
    for (const d of documentos) {
      const contenido = d.contenido || '';
      if (chars + contenido.length > MAX_DOC_CHARS) {
        const queda = MAX_DOC_CHARS - chars;
        if (queda > 200) bloques.push(`[${d.tipo || 'documento'}] ${d.titulo || 'Documento'}\n${contenido.substring(0, queda)}…`);
        break;
      }
      bloques.push(`[${d.tipo || 'documento'}] ${d.titulo || 'Documento'}\n${contenido}`);
      chars += contenido.length;
    }
    stable.push(bloques.join('\n\n'));
  }

  // ── VOLÁTIL: fechas (cambian cada día → fuera de la caché) ──
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

async function _getHistorial(sessionId) {
  const res = await wixData.query(C_MESSAGES)
    .eq('sessionRef', sessionId)
    .ascending('orden')
    .limit(HISTORY_LIMIT * 2)
    .find(AUTH);
  return (res.items || []).map(m => ({
    role: m.rol === 'user' ? 'user' : 'assistant',
    content: m.contenido
  }));
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

    const [config, documentos, salon, staff, familias, groups, indiceFuentes] = await Promise.all([
      _getAlignment(),
      _getDocumentos(),
      _getSalonConfig(),
      _getStaff(),
      _getFamilias(),
      _getGroups(),
      _getIndiceFuentes()      // v2.0.0 — índice de fuentes (CMS-first)
    ]);

    const fechas = resolverFechas();
    const prepMs = Date.now() - tIn;
    console.log(`${TAG} PREP ${prepMs}ms: align=${config ? 'OK' : 'null'} docs=${documentos.length} staff=${staff.length} fams=${familias.length} groups=${groups.length}`);

    const apiKey = await apiKeyPromise;
    if (!apiKey) {
      return { ok: false, error: 'Configuración incompleta: falta el secret KAMISUITE.' };
    }

    const systemBlocks = _buildSystemBlocks({
      config, documentos, salon, staff, familias, groups, fechas,
      indiceFuentes, modo: modo || 'consultor'
    });

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
      r = await _callClaudeConFallback(apiKey, systemBlocks, messages, indiceFuentes);
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
      const [config, salon] = await Promise.all([_getAlignment(), _getSalonConfig()]);
      // Cada visita arranca en welcome (lección CATHOVIA v1.5.3).
      return {
        ok: true,
        sessionId: null,
        brandName: (salon && salon.brandName) || '',
        widgetSkin: (salon && salon.widgetSkin) || 'niebla',
        logoUrl: (salon && salon.logoUrl) || '',
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
