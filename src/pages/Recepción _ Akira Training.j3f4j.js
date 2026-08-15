// =====================================================
// KAMISUITE — Page Code: Entrenador AKIRA
// Página: /kamisuite-entrenador
// =====================================================
// VERSION: 1.2.0
// FECHA: 15 Agosto 2026
//
// CAMBIOS v1.1.0 → v1.2.0: la rama 'ready' reenvía `modo` (plano). El widget
//   v1.2.0 lo manda al arrancar y cada vez que se cambia de pestaña Asesor /
//   Ayuda, y el backend v1.2.0 devuelve el borrador y la publicada de ESE
//   plano. Sin este reenvío, el selector de plano cargaría siempre ASESOR.
//
// CAMBIOS v1.0.0 → v1.1.0: la rama 'createDocument' reenvía `modo` (plano de
//   utilidad: asesor|ayuda|asistente). El backend akiraEntrenador v1.1.0 ya lo
//   aceptaba, pero este archivo no lo pasaba: todo documento creado desde el
//   Entrenador se guardaba como ASESOR por defecto, sin forma de marcarlo como
//   AYUDA. Requiere el widget 'Entrenador AKIRA v1.1.0', que añade el select.
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

const TAG = '[PageCode_Entrenador][1.2.0]';

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
        const res = await cargarConfigEntrenador({ modo: msg.modo });
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
          modo: msg.modo,
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
