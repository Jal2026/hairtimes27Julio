// ╔══════════════════════════════════════════════════════════════════╗
// ║  crmToolsLogic.web.js — Herramientas CRM                      ║
// ║  KAMISUITE · v1.1.0                                            ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// FUNCIÓN: Herramientas de mantenimiento y enriquecimiento del CRM.
// Primera función: clasificación demográfica masiva (sexo por nombre).
//
// DISEÑO: Backend independiente. No toca ningún backend existente.
// Llamado desde pagecode_ficha_cliente.js vía botón externo.
//
// DEPENDENCIAS:
//   - wix-crm-backend (contacts: queryContacts, updateContact,
//     labelContact, findOrCreateLabel)
//   - wix-auth (elevate)
//   - Anthropic Claude API (secret KAMISUITE)
//
// CHANGELOG:
//   v1.1.0 (19-Ago-2026) — Detector de contactos duplicados.
//     - NEW detectarDuplicadosCRM: recorre TODOS los contactos y los
//       agrupa por teléfono, por email y por nombre completo.
//       Alimenta la pestaña "Duplicados" del CRM.
//     - Sin cambios en contarContactosSinSexo, clasificarBatchSexo ni
//       _clasificarNombresConClaude.
//   v1.0.0 (26-May-2026) — Versión inicial
//     - clasificarBatchSexo: procesa N contactos (offset+limit),
//       clasifica por nombre con Claude, escribe campo custom.sexo
//       y aplica label HOMBRE/MUJER/INFANTIL.
//     - contarContactosSinSexo: cuenta cuántos faltan por clasificar.
// ═══════════════════════════════════════════════════════════════════

import { Permissions, webMethod } from 'wix-web-module';
import { contacts } from 'wix-crm-backend';
import { elevate } from 'wix-auth';
import { fetch } from 'wix-fetch';
import { getSecret } from 'wix-secrets-backend';

const VERSION = '1.1.0';
const TAG = '[CrmTools v1.1.0]';

// ═══════════════════════════════════════════════════════════════════
// contarContactosSinSexo
// Cuenta cuántos contactos NO tienen el campo custom.sexo relleno.
// Devuelve { total, sinSexo, conSexo } para que el pagecode muestre
// el estado antes de lanzar la clasificación.
// ═══════════════════════════════════════════════════════════════════

export const contarContactosSinSexo = webMethod(
  Permissions.SiteMember,
  async () => {
    console.log(TAG, 'contarContactosSinSexo');
    try {
      const queryFn = elevate(contacts.queryContacts);
      let total = 0;
      let conSexo = 0;
      let cursor = null;
      let hasMore = true;

      while (hasMore) {
        let result;
        if (cursor) {
          result = await cursor.next();
        } else {
          result = await queryFn().limit(100).find({ suppressAuth: true });
        }

        const items = result.items || [];
        total += items.length;

        for (const c of items) {
          const sexo = c.info?.extendedFields?.['custom.sexo'];
          if (sexo && sexo.trim() !== '') conSexo++;
        }

        hasMore = result.hasNext();
        if (hasMore) cursor = result;
      }

      const sinSexo = total - conSexo;
      console.log(TAG, `Total: ${total}, Con sexo: ${conSexo}, Sin sexo: ${sinSexo}`);
      return { ok: true, total, conSexo, sinSexo };

    } catch (err) {
      console.error(TAG, 'Error contarContactosSinSexo:', err.message);
      return { ok: false, error: err.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// clasificarBatchSexo
// Procesa un batch de contactos SIN sexo asignado:
//   1. Query contactos paginado (offset/limit)
//   2. Filtra los que no tienen custom.sexo
//   3. Envía nombres a Claude para clasificar M/F/desconocido
//   4. Escribe custom.sexo + aplica label HOMBRE/MUJER
//   5. Devuelve { procesados, clasificados, errores, hayMas }
//
// El pagecode llama esta función en loop hasta que hayMas === false.
// ═══════════════════════════════════════════════════════════════════

export const clasificarBatchSexo = webMethod(
  Permissions.SiteMember,
  async ({ offset = 0, batchSize = 10 }) => {
    console.log(TAG, `clasificarBatchSexo offset=${offset} batch=${batchSize}`);

    try {
      // ── Paso 1: Obtener label keys ──
      const findLabel = elevate(contacts.findOrCreateLabel);
      const [labelH, labelM, labelI] = await Promise.all([
        findLabel('HOMBRE'),
        findLabel('MUJER'),
        findLabel('INFANTIL')
      ]);
      const labelKeys = {
        M: labelH.label.key,
        F: labelM.label.key,
        I: labelI.label.key
      };

      // ── Paso 2: Query contactos ──
      const queryFn = elevate(contacts.queryContacts);
      const result = await queryFn()
        .limit(batchSize)
        .skip(offset)
        .find({ suppressAuth: true });

      const items = result.items || [];
      if (items.length === 0) {
        return { ok: true, procesados: 0, clasificados: 0, errores: 0, hayMas: false, offset };
      }

      // ── Paso 3: Filtrar los que ya tienen sexo ──
      const sinSexo = items.filter(c => {
        const sexo = c.info?.extendedFields?.['custom.sexo'];
        return !sexo || sexo.trim() === '';
      });

      if (sinSexo.length === 0) {
        // Todos en este batch ya tienen sexo, seguir con siguiente
        return {
          ok: true, procesados: items.length, clasificados: 0, errores: 0,
          hayMas: items.length === batchSize,
          offset: offset + items.length
        };
      }

      // ── Paso 4: Preparar nombres para Claude ──
      const nombresParaClasificar = sinSexo.map(c => ({
        id: c._id,
        revision: c.revision,
        firstName: c.info?.name?.first || '',
        fullName: `${c.info?.name?.first || ''} ${c.info?.name?.last || ''}`.trim()
      }));

      // ── Paso 5: Llamar a Claude para clasificar ──
      const clasificaciones = await _clasificarNombresConClaude(
        nombresParaClasificar.map(n => n.firstName || n.fullName)
      );

      // ── Paso 6: Aplicar clasificaciones ──
      let clasificados = 0;
      let errores = 0;
      const updateFn = elevate(contacts.updateContact);
      const labelFn = elevate(contacts.labelContact);

      for (let i = 0; i < nombresParaClasificar.length; i++) {
        const contacto = nombresParaClasificar[i];
        const cls = clasificaciones[i] || 'desconocido';

        if (cls === 'desconocido') continue;

        try {
          // Escribir campo custom.sexo — firma de guardarNotaSalon
          const sexoValue = cls === 'M' ? 'Hombre' : 'Mujer';
          await updateFn(
            { contactId: contacto.id, revision: contacto.revision },
            { extendedFields: { 'custom.sexo': sexoValue } },
            { suppressAuth: true }
          );

          // Aplicar label — firma plana: (contactId, [labelKeys], options)
          const lk = cls === 'M' ? labelKeys.M : labelKeys.F;
          await labelFn(
            contacto.id,
            [lk],
            { suppressAuth: true }
          );

          clasificados++;
        } catch (err) {
          console.error(TAG, `Error actualizando ${contacto.id} (${contacto.fullName}):`, err.message);
          errores++;
        }
      }

      const nuevoOffset = offset + items.length;
      const hayMas = items.length === batchSize;

      console.log(TAG, `Batch: ${items.length} leídos, ${sinSexo.length} sin sexo, ${clasificados} clasificados, ${errores} errores`);
      return { ok: true, procesados: items.length, clasificados, errores, hayMas, offset: nuevoOffset };

    } catch (err) {
      console.error(TAG, 'Error clasificarBatchSexo:', err.message);
      return { ok: false, error: err.message, procesados: 0, clasificados: 0, errores: 0, hayMas: false, offset };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// _clasificarNombresConClaude (función interna)
// Envía un array de nombres a Claude Sonnet y pide clasificación
// M/F/desconocido para cada uno.
// Devuelve array del mismo tamaño con 'M', 'F' o 'desconocido'.
// ═══════════════════════════════════════════════════════════════════

async function _clasificarNombresConClaude(nombres) {
  if (!nombres.length) return [];

  try {
    const apiKey = await getSecret('KAMISUITE');

    const prompt = `Eres un clasificador de nombres propios por sexo/género para una base de datos de una peluquería en España.

Para cada nombre de la lista, responde SOLO con una letra:
- M = nombre masculino
- F = nombre femenino
- D = no se puede determinar (nombre ambiguo, empresa, iniciales, vacío)

Responde EXACTAMENTE una línea por nombre, solo la letra (M, F o D), sin explicaciones, sin numeración, sin nada más.

Lista de nombres:
${nombres.map((n, i) => `${i + 1}. ${n || '(vacío)'}`).join('\n')}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';

    // Parsear respuesta: una letra por línea
    const lineas = text.trim().split('\n').map(l => l.trim().toUpperCase());
    const resultado = nombres.map((_, i) => {
      const letra = lineas[i] || 'D';
      if (letra === 'M') return 'M';
      if (letra === 'F') return 'F';
      return 'desconocido';
    });

    console.log(TAG, `Claude clasificó ${nombres.length} nombres: ${resultado.filter(r => r !== 'desconocido').length} identificados`);
    return resultado;

  } catch (err) {
    console.error(TAG, 'Error llamando a Claude:', err.message);
    // Si falla Claude, devolver todos como desconocido
    return nombres.map(() => 'desconocido');
  }
}
// ═══════════════════════════════════════════════════════════════════
// detectarDuplicadosCRM — v1.1.0
// Recorre TODOS los contactos y devuelve los grupos con más de un
// contacto que comparten teléfono, email o nombre completo.
//
// POR QUÉ EL TELÉFONO ES EL CRITERIO PRINCIPAL:
//   Wix Contacts NO permite crear dos contactos con el mismo email:
//   createContact lo rechaza siempre. Con el mismo TELÉFONO sí deja,
//   lanzando DUPLICATE_CONTACT_EXISTS que el operador puede saltar con
//   "Crear igualmente" (allowDuplicates:true) desde el propio CRM
//   (fichaClienteLogic v1.9.11 / widget v1.7.4). Por eso el duplicado
//   real de este sistema es, casi siempre, un teléfono repetido.
//   Los grupos por email existen igualmente porque un contacto puede
//   tener VARIOS emails y coincidir con el secundario de otro.
//
// PAGINACIÓN: skip/limit de 1.000 con tope de seguridad en 10.000,
//   copiado literalmente de cargarTodosContactos (recepcionLogic.web.js),
//   que es la misma función con la que el CRM llena su caché. Así el
//   detector ve exactamente el mismo universo que el buscador.
//
// INDEXADO: se leen TODOS los emails y TODOS los teléfonos de cada
//   contacto, no solo el primero. El extractor de emails replica
//   extraerEmailsContacto de reminderLogic v1.5.0 (info.emails como
//   array o {items}, c.emails, primaryEmail, loginEmail,
//   primaryInfo.email). El de teléfonos sigue la misma forma.
//
// NORMALIZACIÓN DE TELÉFONO: se queda con los dígitos y compara los
//   ÚLTIMOS 9. Es lo que hace equivalentes "+34 600 11 22 33",
//   "0034600112233" y "600112233". Nueve porque es la longitud del
//   número nacional español. Un número extranjero de menos de 9 dígitos
//   se compara entero.
//
// Payload: { incluirNombres } — opcional, por defecto true.
//   Los grupos por NOMBRE son ruidosos (homónimos reales) y se marcan
//   con criterio 'NOMBRE' para que la UI los pueda separar.
//
// Devuelve:
//   { ok, version, totalContactos, truncado, grupos: [
//       { criterio:'TELEFONO'|'EMAIL'|'NOMBRE', valor, total,
//         contactos:[{ contactId, nombreCompleto, email, telefono }] }
//     ] }
//
// SOLO LECTURA. Esta función no modifica ni borra nada.
// ═══════════════════════════════════════════════════════════════════

const DUP_PAGE_SIZE  = 1000;
const DUP_TOPE_TOTAL = 10000;

function _dupNormalizarTelefono(v) {
  const digitos = String(v || '').replace(/\D/g, '');
  if (!digitos) return '';
  return digitos.length > 9 ? digitos.slice(-9) : digitos;
}

function _dupNormalizarNombre(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // fuera acentos
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Réplica del extractor de reminderLogic v1.5.0.
function _dupExtraerEmails(c) {
  const out = new Set();

  const push = (raw) => {
    const e = String((raw && raw.email) || raw || '').toLowerCase().trim();
    if (e) out.add(e);
  };
  const recorrer = (fuente) => {
    if (!fuente) return;
    const lista = Array.isArray(fuente)
      ? fuente
      : Array.isArray(fuente.items) ? fuente.items : [];
    for (const entry of lista) push(entry);
  };

  recorrer(c?.info?.emails);
  recorrer(c?.emails);
  push(c?.primaryEmail);
  push(c?.loginEmail);
  push(c?.primaryInfo?.email);

  return [...out];
}

function _dupExtraerTelefonos(c) {
  const out = new Set();

  const push = (raw) => {
    const t = _dupNormalizarTelefono((raw && raw.phone) || raw || '');
    if (t) out.add(t);
  };
  const recorrer = (fuente) => {
    if (!fuente) return;
    const lista = Array.isArray(fuente)
      ? fuente
      : Array.isArray(fuente.items) ? fuente.items : [];
    for (const entry of lista) push(entry);
  };

  recorrer(c?.info?.phones);
  recorrer(c?.phones);
  push(c?.primaryPhone);
  push(c?.primaryInfo?.phone);

  return [...out];
}

// Mismo shape que formatearContacto de recepcionLogic, para que la UI
// del CRM pinte los duplicados igual que pinta los resultados de búsqueda.
function _dupFormatear(c) {
  const infoName = c?.info?.name || {};
  const nombre   = infoName.first || c?.name?.first || c?.firstName || '';
  const apellido = infoName.last  || c?.name?.last  || c?.lastName  || '';

  const emails = _dupExtraerEmails(c);

  const phonesArray = c?.info?.phones || c?.phones || [];
  const phones = Array.isArray(phonesArray) ? phonesArray : [];
  const telefono = phones[0]?.phone || phones[0] || c?.primaryPhone || '';

  return {
    contactId: c._id || c.id,
    nombre: String(nombre).trim(),
    apellido: String(apellido).trim(),
    nombreCompleto: `${nombre} ${apellido}`.trim(),
    email: String(emails[0] || '').trim(),
    telefono: String(telefono).trim()
  };
}

export const detectarDuplicadosCRM = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const incluirNombres = !(payload && payload.incluirNombres === false);

    console.log(TAG, `detectarDuplicadosCRM — incluirNombres=${incluirNombres}`);

    try {
      // ── 1. Cargar todos los contactos ──────────────────────────────
      const queryFn = elevate(contacts.queryContacts);
      const todos = [];
      let skip = 0;
      let hasMore = true;
      let truncado = false;

      while (hasMore) {
        const result = await queryFn()
          .skip(skip)
          .limit(DUP_PAGE_SIZE)
          .find({ suppressAuth: true });

        const items = result?.items || [];
        todos.push(...items);

        if (items.length < DUP_PAGE_SIZE) {
          hasMore = false;
        } else {
          skip += DUP_PAGE_SIZE;
        }

        if (skip >= DUP_TOPE_TOTAL) {
          console.warn(TAG, `Tope de seguridad alcanzado (${DUP_TOPE_TOTAL})`);
          truncado = true;
          hasMore = false;
        }
      }

      console.log(TAG, `Contactos leídos: ${todos.length}`);

      // ── 2. Indexar ─────────────────────────────────────────────────
      const porTelefono = new Map();
      const porEmail    = new Map();
      const porNombre   = new Map();

      const ficha = new Map();   // contactId → objeto formateado

      for (const c of todos) {
        const id = c._id || c.id;
        if (!id) continue;
        if (!ficha.has(id)) ficha.set(id, _dupFormatear(c));

        for (const tel of _dupExtraerTelefonos(c)) {
          if (!porTelefono.has(tel)) porTelefono.set(tel, new Set());
          porTelefono.get(tel).add(id);
        }

        for (const mail of _dupExtraerEmails(c)) {
          if (!porEmail.has(mail)) porEmail.set(mail, new Set());
          porEmail.get(mail).add(id);
        }

        if (incluirNombres) {
          const f = _dupFormatear(c);
          const nom = _dupNormalizarNombre(f.nombreCompleto);
          // Un nombre de una sola letra no identifica a nadie.
          if (nom && nom.length > 2) {
            if (!porNombre.has(nom)) porNombre.set(nom, new Set());
            porNombre.get(nom).add(id);
          }
        }
      }

      // ── 3. Construir grupos ────────────────────────────────────────
      // Un mismo par de contactos puede coincidir por teléfono Y por
      // email Y por nombre. Se emite una sola vez, con el criterio más
      // fuerte: TELEFONO > EMAIL > NOMBRE. La huella es el conjunto de
      // contactIds ordenado.
      const grupos = [];
      const huellasVistas = new Set();

      const volcar = (mapa, criterio) => {
        for (const [valor, setIds] of mapa.entries()) {
          if (setIds.size < 2) continue;

          const ids = [...setIds].sort();
          const huella = ids.join('|');
          if (huellasVistas.has(huella)) continue;
          huellasVistas.add(huella);

          grupos.push({
            criterio,
            valor,
            total: ids.length,
            contactos: ids.map(id => ficha.get(id)).filter(Boolean)
          });
        }
      };

      volcar(porTelefono, 'TELEFONO');
      volcar(porEmail,    'EMAIL');
      if (incluirNombres) volcar(porNombre, 'NOMBRE');

      // Los más poblados primero; a igualdad, teléfono antes que email
      // y email antes que nombre.
      const peso = { TELEFONO: 0, EMAIL: 1, NOMBRE: 2 };
      grupos.sort((a, b) =>
        (peso[a.criterio] - peso[b.criterio]) || (b.total - a.total)
      );

      const resumen = {
        telefono: grupos.filter(g => g.criterio === 'TELEFONO').length,
        email:    grupos.filter(g => g.criterio === 'EMAIL').length,
        nombre:   grupos.filter(g => g.criterio === 'NOMBRE').length
      };

      console.log(
        TAG,
        `Duplicados: ${grupos.length} grupos ` +
        `(tel=${resumen.telefono}, email=${resumen.email}, nombre=${resumen.nombre}) ` +
        `sobre ${todos.length} contactos`
      );

      return {
        ok: true,
        version: VERSION,
        totalContactos: todos.length,
        truncado,
        resumen,
        grupos
      };

    } catch (err) {
      console.error(TAG, 'Error detectarDuplicadosCRM:', err.message);
      return { ok: false, version: VERSION, error: err.message, grupos: [] };
    }
  }
);
