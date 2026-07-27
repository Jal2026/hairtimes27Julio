// =====================================================
// Page Code — Dump Reservas V1 (v3)
// Elemento: #boton
// (La caja #txtReservasBookings queda sin uso)
//
// Patrón LITERAL de pagecode_recepcionPRO_v2_1_5.js líneas 605-610:
//   wixLocation.to(`https://www.hair-times.com/_functions/descargarExcel?...`)
// URL absoluta, dominio verificado en el propio http-functions.js (líneas 5-7).
//
// Rango: 04/07/2026 → 03/10/2026 (mismo del listado bookingshairtimesa4deJulio2026.txt)
// =====================================================

import wixLocation from 'wix-location';

$w.onReady(function () {
    $w('#boton').onClick(() => {
        const desdeISO = '2026-07-04T00:00:00.000Z';
        const hastaISO = '2026-10-03T23:59:59.000Z';

        const url = `https://www.hair-times.com/_functions/dumpReservasV1?desdeISO=${encodeURIComponent(desdeISO)}&hastaISO=${encodeURIComponent(hastaISO)}`;

        console.log('[DumpReservasV1] Descargando:', url);
        wixLocation.to(url);
    });
});