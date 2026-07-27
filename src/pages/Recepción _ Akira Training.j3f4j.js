// =====================================================
// KAMISUITE — Page Code: Entrenador AKIRA
// Página: /kamisuite-entrenador
// =====================================================
// VERSION: 1.0.0
// FECHA: 23 Abril 2026
//
// Elemento: #htmlEntrenadorAkira (HtmlComponent)
// Acceso: Solo administrador/dueño del salón
//
// Patrón EGAEL: puente entre widget entrenador y backend.
// Sin lógica propia — solo routing de mensajes.
// =====================================================

import {
  cargarConfigEntrenador,
  guardarAlignment,
  publicarAlignment,
  testAkira,
  generarPromptAkira,
  crearDocumento,
  toggleDocumento,
  eliminarDocumento
} from 'backend/akiraEntrenador.web';

const TAG = '[PageCode_Entrenador][1.0.0]';

$w.onReady(function () {
  console.log(`${TAG} onReady`);

  $w('#htmlEntrenadorAkira').onMessage(async (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    const send = function (type, data) {
      $w('#htmlEntrenadorAkira').postMessage(Object.assign({ type: type }, data));
    };

    console.log(`${TAG} Mensaje: ${msg.type}`);

    // ── Widget arranca: cargar config ──
    if (msg.type === 'ready') {
      try {
        const res = await cargarConfigEntrenador();
        send('configLoaded', { payload: res });
      } catch (e) {
        send('error', { payload: { error: e.message } });
      }
      return;
    }

    // ── Guardar borrador ──
    if (msg.type === 'saveConfig') {
      try {
        const res = await guardarAlignment({ config: msg.config });
        send('configSaved', { payload: res });
      } catch (e) {
        send('error', { payload: { error: e.message } });
      }
      return;
    }

    // ── Publicar ──
    if (msg.type === 'publishConfig') {
      try {
        const res = await publicarAlignment({ alignmentId: msg.alignmentId });
        send('configPublished', { payload: res });
      } catch (e) {
        send('error', { payload: { error: e.message } });
      }
      return;
    }

    // ── Test de respuesta ──
    if (msg.type === 'testPrompt') {
      try {
        const res = await testAkira({ message: msg.message, configOverride: msg.configOverride });
        send('testResult', { payload: res });
      } catch (e) {
        send('error', { payload: { error: e.message } });
      }
      return;
    }

    // ── Generar prompt con IA ──
    if (msg.type === 'generatePrompt') {
      try {
        const res = await generarPromptAkira({ descripcion: msg.descripcion });
        send('promptGenerated', { payload: res });
      } catch (e) {
        send('error', { payload: { error: e.message } });
      }
      return;
    }

    // ── CRUD Documentos ──
    if (msg.type === 'createDocument') {
      try {
        const res = await crearDocumento({
          titulo: msg.titulo,
          tipo: msg.tipo,
          contenido: msg.contenido,
          resumen: msg.resumen
        });
        send('documentCreated', { payload: res });
      } catch (e) {
        send('error', { payload: { error: e.message } });
      }
      return;
    }

    if (msg.type === 'toggleDocument') {
      try {
        const res = await toggleDocumento({ documentoId: msg.documentoId, activo: msg.activo });
        send('documentToggled', { payload: res });
      } catch (e) {
        send('error', { payload: { error: e.message } });
      }
      return;
    }

    if (msg.type === 'deleteDocument') {
      try {
        const res = await eliminarDocumento({ documentoId: msg.documentoId });
        send('documentDeleted', { payload: res, documentoId: msg.documentoId });
      } catch (e) {
        send('error', { payload: { error: e.message } });
      }
      return;
    }
  });
});