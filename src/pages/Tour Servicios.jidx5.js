import wixData from "wix-data";

/* ═══════════════════════════════════════════════════════════════
 * KAMISUITE — TOUR DE SERVICIOS (Page Code)
 *
 * VERSIÓN: 1.1.0
 * FECHA:   22 de julio de 2026
 *
 * Repeater:          #repeater2
 * Botón:             #button42
 * Dataset servicios: #dataset1
 *
 * ServiceCatalog.group
 *          ↓
 * HairSalonServices.groupCatalog   (admite varios separados por coma)
 *          ↓
 * HairSalonServices → Servicios (Item)
 *
 * ---------------------------------------------------------------
 * CHANGELOG
 * ---------------------------------------------------------------
 * v1.1.0 (22-jul-2026)
 *   · FIX: la correspondencia se hacía contra HairSalonServices.title
 *     (nombre de marketing). El vínculo real con ServiceCatalog.group
 *     es el campo groupCatalog. Solo coincidían por casualidad las
 *     categorías cuyo title y groupCatalog eran equivalentes
 *     (Depilación, Coloración, Spa Capilar); el resto de botones
 *     quedaban deshabilitados.
 *   · FIX: groupCatalog admite VARIOS grupos separados por coma
 *     (ej. "CABALLERO, NIÑOS" · "CORTESMUJER,NIÑAS"). Se replica el
 *     patrón canónico de widgetPublicoLogic.getServiciosCategoria:
 *         String(gc).split(',').map(s => s.trim()).filter(Boolean)
 *     Cada token genera su propia entrada en el mapa apuntando al
 *     mismo enlace dinámico de la categoría.
 *
 * v1.0.0
 *   · Versión inicial documentada en el Cuaderno de Bitácora
 *     "Tour de Servicios → Categorías".
 * ═══════════════════════════════════════════════════════════════ */

const VERSION = "1.1.0";
const TAG = "[Tour Servicios]";

const COLECCION_CATEGORIAS = "HairSalonServices";

const CAMPO_GRUPO_SERVICIO = "group";
const CAMPO_GRUPO_CATEGORIA = "groupCatalog";


$w.onReady(function () {

    console.log(`${TAG} Page code v${VERSION}`);

    /*
     * Carga una sola vez todas las categorías y sus enlaces
     * dinámicos. No modifica ninguna colección.
     */
    const mapaCategoriasPromise = cargarMapaCategorias();


    /*
     * Configura los elementos nuevos que Wix pueda crear
     * posteriormente en el repeater.
     */
    $w("#repeater2").onItemReady(($item, servicio) => {

        mapaCategoriasPromise
            .then((mapaCategorias) => {

                configurarBotonServicio(
                    $item,
                    servicio,
                    mapaCategorias
                );
            })
            .catch((error) => {

                console.error(
                    `${TAG} Error preparando un nuevo elemento:`,
                    {
                        servicio: servicio?.title || servicio?._id,
                        error
                    }
                );
            });
    });


    /*
     * Cuando el dataset ha terminado de cargar y ha rellenado
     * el repeater, recorremos TODOS los elementos existentes.
     *
     * Esta parte evita que algunos botones queden deshabilitados.
     */
    $w("#dataset1").onReady(async () => {

        try {

            const mapaCategorias =
                await mapaCategoriasPromise;

            $w("#repeater2").forEachItem(
                ($item, servicio) => {

                    configurarBotonServicio(
                        $item,
                        servicio,
                        mapaCategorias
                    );
                }
            );

            console.log(
                `${TAG} Todos los botones del repeater han sido procesados`
            );

        } catch (error) {

            console.error(
                `${TAG} Error general configurando los botones:`,
                error
            );
        }
    });
});


/* ═══════════════════════════════════════════════════════════════
 * CONFIGURAR EL BOTÓN DE UN SERVICIO
 * ═══════════════════════════════════════════════════════════════ */

function configurarBotonServicio(
    $item,
    servicio,
    mapaCategorias
) {

    const boton = $item("#button42");

    /*
     * Se deshabilita únicamente durante la configuración
     * del elemento concreto.
     */
    boton.disable();

    const grupoOriginal =
        servicio?.[CAMPO_GRUPO_SERVICIO];

    const grupoNormalizado =
        normalizarTexto(grupoOriginal);

    if (!grupoNormalizado) {

        console.warn(
            `${TAG} Servicio sin campo group:`,
            {
                servicio: servicio?.title,
                id: servicio?._id
            }
        );

        return;
    }

    const enlaceCategoria =
        mapaCategorias.get(grupoNormalizado);

    if (!enlaceCategoria) {

        console.warn(
            `${TAG} No existe categoría equivalente:`,
            {
                servicio: servicio?.title,
                group: grupoOriginal,
                groupNormalizado: grupoNormalizado
            }
        );

        return;
    }

    /*
     * Se asigna la URL dinámica real de la categoría.
     */
    boton.link = enlaceCategoria;
    boton.enable();

    console.log(
        `${TAG} Botón configurado:`,
        {
            servicio: servicio?.title,
            group: grupoOriginal,
            destino: enlaceCategoria
        }
    );
}


/* ═══════════════════════════════════════════════════════════════
 * CARGAR MAPA DE CATEGORÍAS
 *
 * Una categoría de HairSalonServices puede agrupar VARIOS valores
 * de ServiceCatalog.group, separados por coma en groupCatalog.
 *
 * Ejemplos reales (Hair-Times):
 *   "CABALLERO, NIÑOS"    → /servicios/hombre
 *   "CORTESMUJER,NIÑAS"   → /servicios/corte-mujer
 *
 * Por eso el mapa se construye con una entrada por cada token,
 * todas apuntando al mismo enlace dinámico.
 *
 * El criterio de troceo replica literalmente el que ya usa
 * widgetPublicoLogic.getServiciosCategoria en producción.
 * ═══════════════════════════════════════════════════════════════ */

async function cargarMapaCategorias() {

    const resultado = await wixData
        .query(COLECCION_CATEGORIAS)
        .limit(100)
        .find();

    const mapaCategorias = new Map();

    resultado.items.forEach((categoria) => {

        const grupoCatalogo =
            categoria[CAMPO_GRUPO_CATEGORIA];

        const enlaceDinamico =
            obtenerEnlaceDinamicoItem(categoria);

        if (!grupoCatalogo) {

            console.warn(
                `${TAG} Categoría sin groupCatalog:`,
                {
                    categoria: categoria.title,
                    id: categoria._id
                }
            );

            return;
        }

        if (!enlaceDinamico) {

            console.warn(
                `${TAG} Categoría sin enlace dinámico ITEM:`,
                {
                    categoria: categoria.title,
                    id: categoria._id
                }
            );

            return;
        }

        /*
         * Patrón canónico de troceo (widgetPublicoLogic).
         */
        const grupos = String(grupoCatalogo)
            .split(",")
            .map((valor) => valor.trim())
            .filter(Boolean);

        grupos.forEach((grupo) => {

            const clave = normalizarTexto(grupo);

            if (!clave) {
                return;
            }

            mapaCategorias.set(
                clave,
                enlaceDinamico
            );

            console.log(
                `${TAG} Grupo incorporado al mapa:`,
                {
                    categoria: categoria.title,
                    grupo: grupo,
                    clave: clave,
                    enlace: enlaceDinamico
                }
            );
        });
    });

    console.log(
        `${TAG} Total de grupos en el mapa:`,
        mapaCategorias.size
    );

    return mapaCategorias;
}


/* ═══════════════════════════════════════════════════════════════
 * LOCALIZAR EL ENLACE DINÁMICO ITEM
 * ═══════════════════════════════════════════════════════════════ */

function obtenerEnlaceDinamicoItem(categoria) {

    const campoEncontrado =
        Object.entries(categoria)
            .find(([, valor]) => {

                return (
                    typeof valor === "string" &&
                    valor.startsWith("/servicios/") &&
                    valor !== "/servicios/"
                );
            });

    return campoEncontrado
        ? campoEncontrado[1]
        : null;
}


/* ═══════════════════════════════════════════════════════════════
 * NORMALIZACIÓN DE LOS NOMBRES
 * ═══════════════════════════════════════════════════════════════ */

function normalizarTexto(valor) {

    return String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}