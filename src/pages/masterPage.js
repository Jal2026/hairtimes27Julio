// =====================================================
// KAMISUITE — masterPage.js (código común a todas las páginas)
// =====================================================
// VERSION: 1.0.1
// FECHA: 20 de noviembre de 2026
//
// v1.0.1 — Mostrar/ocultar el chat de AKIRA ('#f6B6E28D52B24De6Aab3Ff2Ccad8E2291')
//   envuelto en try/catch, patrón literal de "Recepción _ Control Acceso de
//   Personal" (línea 32). En un salón sin ese elemento (Latifa Atnan) cada
//   página daba "TypeError: $w(...).show is not a function". Misma lógica:
//   en 'appmobile' se oculta, en el resto se muestra.
// v1.0.0 — Versión sin cabecera, heredada.
// =====================================================

import wixLocation from 'wix-location';

$w.onReady(function () {
  const path = wixLocation.path.join('/');

  if (path === 'appmobile') {
    try { $w('#f6B6E28D52B24De6Aab3Ff2Ccad8E2291').hide(); } catch (e) {}
  } else {
    try { $w('#f6B6E28D52B24De6Aab3Ff2Ccad8E2291').show(); } catch (e) {}
  }
});