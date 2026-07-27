// =====================================================
// KAMISUITE - Page Code: CMS Import
// =====================================================
// Pagina: nueva pagina admin en HT (ej. KAMISUITE | CMS Import)
// Elemento: #htmlCmsImport (HtmlComponent)
// Backend: cmsImportLogic.web.js v1.0.0
// Version: 1.0.0
// =====================================================

import { analizarImport, ejecutarLote } from 'backend/cmsImportLogic.web';

const TAG = '[CMSImportPage v1.0.0]';

$w.onReady(function () {

  $w('#htmlCmsImport').onMessage(async (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    const send = function(type, data) {
      $w('#htmlCmsImport').postMessage(Object.assign({ type: type }, data));
    };

    if (msg.type === 'ready') {
      send('readyAck', { payload: { ok: true } });
      return;
    }

    if (msg.type === 'analizar') {
      console.log(TAG + ' Analizar spec');
      try {
        const res = await analizarImport({ spec: msg.spec });
        send(res && res.ok ? 'analizarData' : 'error', { payload: res });
      } catch (e) {
        send('error', { payload: { ok: false, error: e.message } });
      }
      return;
    }

    if (msg.type === 'ejecutarLote') {
      console.log(TAG + ' Ejecutar lote (' + (msg.items || []).length + ' items)');
      try {
        const res = await ejecutarLote({ items: msg.items });
        send(res && res.ok ? 'loteData' : 'error', { payload: res });
      } catch (e) {
        send('error', { payload: { ok: false, error: e.message } });
      }
      return;
    }
  });

});