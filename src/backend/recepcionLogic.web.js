// =====================================================
// KAMISUITE - Backend recepcionLogic.web RecepciÃƒÂ³n (BÃƒÂºsqueda Clientes)
// =====================================================
// VERSION: 2.2.0
// FECHA: 27 de octubre de 2026
//
// Carga completa de contactos para cache en frontend
//
// CAMBIOS v2.2.0:
// - NEW: CIF/NIF y razón social del cliente en alta y edición de
//   Recepción PRO. Van a dos campos personalizados del contacto:
//   'custom.cif' y 'custom.razon-social' (claves leídas en Hair-Times el
//   27-oct-2026). Sirven para autónomos y empresas. El campo de Wix
//   Facturas (invoices.vatId) NO se usa.
//   · crearContacto y editarContacto aceptan `cif` y `razonSocial`
//     opcionales. Se guardan en una escritura APARTE, después del alta o
//     de la edición, con el patrón READ-MERGE-UPDATE de
//     actualizarContactoCRM (fichaClienteLogic). Si esa escritura falla,
//     el cliente queda creado/editado igual y la respuesta lo indica en
//     `datosFiscales: { ok:false }`.
//   · En editarContacto, `cif`/`razonSocial` undefined = no se tocan.
//   · NEW leerDatosFiscales({ contactId }) → { ok, cif, razonSocial }.
//     Permissions.SiteMember. Si 'custom.cif' está vacío lee el segundo
//     campo "CIF" del panel ('custom.cif-empresa').
//   · Los datos fiscales NO entran en cargarTodosContactos: esa lista es
//     Permissions.Anyone y la consumen muchos módulos.
// - Los errores de crearContacto/editarContacto llevan `error.code`
//   (DUPLICATE_EMAIL, DUPLICATE_PHONE, DUPLICATE, ERROR) para que la
//   pantalla muestre un mensaje en español y nunca el texto de Wix.
// - Nada más cambia: cargarTodosContactos, getContacto y el formato de
//   `cliente` quedan idénticos.
//
// CAMBIOS v2.1.0:
// - NEW: editarContacto() — edita nombre, apellido, email, telefono
//   de un contacto existente en Wix CRM. Primera vez que KAMISUITE
//   permite editar clientes desde el frontend (independencia de Wix panel).
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';

const VERSION = '2.2.0';
const TAG = `[Recepcion][${VERSION}]`;

// v2.2.0 — Datos fiscales en campos personalizados del contacto.
// Claves leídas en Hair-Times el 27-oct-2026 (definiciones de campos de
// Wix Contacts). El CIF se escribe siempre en CIF_KEY. CIF_KEY_RESPALDO es
// el otro campo "CIF" del panel: solo se lee, si CIF_KEY está vacío.
const CIF_KEY = 'custom.cif';
const CIF_KEY_RESPALDO = 'custom.cif-empresa';
const RAZON_SOCIAL_KEY = 'custom.razon-social';

// =====================================================
// UTILIDADES
// =====================================================

function safeErr(e) {
  const out = { name: e?.name || 'Error', message: e?.message || String(e) };
  if (e?.details) out.details = e.details;
  return out;
}

function formatearContacto(contact) {
  const infoName = contact?.info?.name || {};
  const nombre = infoName.first || contact?.name?.first || contact?.firstName || '';
  const apellido = infoName.last || contact?.name?.last || contact?.lastName || '';
  
  const emailsArray = contact?.info?.emails || contact?.emails || [];
  const emails = Array.isArray(emailsArray) ? emailsArray : [];
  const email = emails[0]?.email || emails[0] || contact?.primaryEmail || '';
  
  const phonesArray = contact?.info?.phones || contact?.phones || [];
  const phones = Array.isArray(phonesArray) ? phonesArray : [];
  const telefono = phones[0]?.phone || phones[0] || contact?.primaryPhone || '';
  
  return {
    contactId: contact._id || contact.id,
    nombre: String(nombre).trim(),
    apellido: String(apellido).trim(),
    nombreCompleto: `${nombre} ${apellido}`.trim(),
    email: String(email).trim(),
    telefono: String(telefono).trim()
  };
}

// v2.2.0 — CIF y razón social de un contacto obtenido con getContact.
// wix-crm-backend devuelve info.extendedFields como objeto plano
// { clave: valor } (mismo uso que clienteAreaLogic y fichaClienteLogic).
function leerDatosFiscalesDeContacto(contact) {
  const ef = contact?.info?.extendedFields || {};
  const cif = String(ef[CIF_KEY] || ef[CIF_KEY_RESPALDO] || '').trim();
  const razonSocial = String(ef[RAZON_SOCIAL_KEY] || '').trim();
  return { cif, razonSocial };
}

// v2.2.0 — Guarda CIF y/o razón social en el contacto.
// Escritura APARTE de la de nombre/teléfono/email: si Wix la rechaza, el
// alta o la edición ya están guardadas. Patrón READ-MERGE-UPDATE de
// actualizarContactoCRM (fichaClienteLogic): getContact → revision →
// updateContact({ contactId, revision }, { extendedFields }, { suppressAuth }).
// datos: { cif?, razonSocial? } — undefined = no se toca; '' = se vacía.
// Devuelve { ok, sinCambios?, error? }.
async function guardarDatosFiscales(contactId, datos) {
  const ext = {};
  if (datos.cif !== undefined) ext[CIF_KEY] = String(datos.cif || '').trim();
  if (datos.razonSocial !== undefined) ext[RAZON_SOCIAL_KEY] = String(datos.razonSocial || '').trim();
  if (!Object.keys(ext).length) return { ok: true, sinCambios: true };

  try {
    const elevatedGet = elevate(contacts.getContact);
    const current = await elevatedGet(contactId);
    if (!current || !current.revision) {
      throw new Error('Contacto no encontrado o sin revision');
    }

    const actual = current?.info?.extendedFields || {};

    // Vaciar el CIF vacía también el campo de respaldo si tiene valor; si
    // no, al volver a leer el contacto el CIF reaparecería.
    if (ext[CIF_KEY] === '' && String(actual[CIF_KEY_RESPALDO] || '').trim()) {
      ext[CIF_KEY_RESPALDO] = '';
    }

    // No reescribir lo que ya tiene ese mismo valor.
    Object.keys(ext).forEach(k => {
      if (String(actual[k] || '').trim() === ext[k]) delete ext[k];
    });
    if (!Object.keys(ext).length) return { ok: true, sinCambios: true };

    const elevatedUpdate = elevate(contacts.updateContact);
    await elevatedUpdate(
      { contactId, revision: current.revision },
      { extendedFields: ext },
      { suppressAuth: true }
    );
    console.log(`${TAG} Datos fiscales guardados: ${contactId} | ${Object.keys(ext).join(',')}`);
    return { ok: true };
  } catch (e) {
    console.error(`${TAG} Error guardando datos fiscales de ${contactId}:`, e);
    return { ok: false, error: safeErr(e) };
  }
}

// v2.2.0 — Clasifica el error de Wix al crear/editar un contacto para que
// la pantalla muestre un mensaje propio. El texto de Wix incluye
// 'DUPLICATE_CONTACT_EXISTS' y 'duplicateEmail' / 'duplicatePhone' (log
// real de Recepción PRO del 17-sep-2026 y de fichaClienteLogic del 06-jul).
function codigoErrorContacto(e) {
  let txt = String(e?.message || '');
  try { txt += ' ' + JSON.stringify(e?.details || {}); } catch (_) { /* sin details */ }
  if (txt.indexOf('DUPLICATE_CONTACT_EXISTS') === -1) return 'ERROR';
  if (txt.indexOf('duplicateEmail') !== -1) return 'DUPLICATE_EMAIL';
  if (txt.indexOf('duplicatePhone') !== -1) return 'DUPLICATE_PHONE';
  return 'DUPLICATE';
}

// =====================================================
// CARGAR TODOS LOS CONTACTOS (para cachÃƒÂ©)
// =====================================================

export const cargarTodosContactos = webMethod(Permissions.Anyone, async () => {
  try {
    console.log(`${TAG} Ã°Å¸â€œÂ¥ Cargando TODOS los contactos...`);
    
    const elevatedQuery = elevate(contacts.queryContacts);
    const allContacts = [];
    let hasMore = true;
    let skip = 0;
    const pageSize = 1000;
    
    while (hasMore) {
      console.log(`${TAG} Ã°Å¸â€œâ€ž PÃƒÂ¡gina desde ${skip}...`);
      
      const result = await elevatedQuery()
        .skip(skip)
        .limit(pageSize)
        .find();
      
      const items = result?.items || [];
      allContacts.push(...items);
      
      console.log(`${TAG} Ã¢Å“â€¦ Obtenidos: ${items.length} (total acumulado: ${allContacts.length})`);
      
      if (items.length < pageSize) {
        hasMore = false;
      } else {
        skip += pageSize;
      }
      
      if (skip >= 10000) {
        console.warn(`${TAG} Ã¢Å¡Â Ã¯Â¸Â LÃƒÂ­mite de seguridad alcanzado (10,000)`);
        hasMore = false;
      }
    }
    
    console.log(`${TAG} Ã°Å¸â€œÅ  Total contactos cargados: ${allContacts.length}`);
    
    const clientes = allContacts
      .map(formatearContacto)
      .filter(c => c.nombre || c.apellido || c.email)
      .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
    
    console.log(`${TAG} Ã¢Å“â€¦ Contactos formateados: ${clientes.length}`);
    
    return {
      ok: true,
      version: VERSION,
      clientes,
      total: clientes.length
    };
    
  } catch (e) {
    console.error(`${TAG} Ã¢ÂÅ’ Error cargarTodosContactos:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// =====================================================
// OBTENER CONTACTO ESPECÃƒÂFICO
// =====================================================

export const getContacto = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const { contactId } = payload || {};
    
    console.log(`${TAG} Ã°Å¸â€œâ€¡ Obteniendo contacto: ${contactId}`);
    
    if (!contactId) {
      throw new Error('contactId requerido');
    }
    
    const elevatedGet = elevate(contacts.getContact);
    const contact = await elevatedGet(contactId);
    
    if (!contact) {
      throw new Error('Contacto no encontrado');
    }
    
    return {
      ok: true,
      version: VERSION,
      cliente: formatearContacto(contact)
    };
    
  } catch (e) {
    console.error(`${TAG} Ã¢ÂÅ’ Error getContacto:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// =====================================================
// CREAR CONTACTO (para clientes nuevos)
// =====================================================

export const crearContacto = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const { nombre, apellido, email, telefono, cif, razonSocial } = payload || {};
    
    console.log(`${TAG} Ã¢Å¾â€¢ Creando contacto: ${nombre} ${apellido}`);
    
    if (!nombre) {
      throw new Error('Nombre es requerido');
    }
    
    const contactInfo = {
      name: {
        first: String(nombre).trim(),
        last: String(apellido || '').trim()
      },
      emails: email ? [{ email: String(email).trim() }] : [],
      phones: telefono ? [{ phone: String(telefono).trim() }] : []
    };
    
    const elevatedCreate = elevate(contacts.createContact);
    const newContact = await elevatedCreate(contactInfo, { allowDuplicates: true, suppressAuth: true });
    
    const contactId = newContact?._id || newContact?.id;

    // v2.2.0 — CIF / razón social en escritura aparte (guardarDatosFiscales).
    let datosFiscales = null;
    const cifIn = String(cif || '').trim();
    const razonIn = String(razonSocial || '').trim();
    if (contactId && (cifIn || razonIn)) {
      datosFiscales = await guardarDatosFiscales(contactId, {
        cif: cifIn || undefined,
        razonSocial: razonIn || undefined
      });
    }
    
    console.log(`${TAG} Ã¢Å“â€¦ Contacto creado: ${contactId}`);
    
    return {
      ok: true,
      version: VERSION,
      contactId,
      datosFiscales,
      cliente: {
        contactId,
        nombre,
        apellido,
        nombreCompleto: `${nombre} ${apellido}`.trim(),
        email: email || '',
        telefono: telefono || ''
      }
    };
    
  } catch (e) {
    console.error(`${TAG} Ã¢ÂÅ’ Error crearContacto:`, e);
    // v2.2.0 — `code` para mostrar un mensaje propio en pantalla.
    return { ok: false, version: VERSION, error: { ...safeErr(e), code: codigoErrorContacto(e) } };
  }
});

// =====================================================
// EDITAR CONTACTO (v2.1.0)
// Actualiza nombre, apellido, email, telefono de un contacto CRM.
// Obtiene revision actual -> actualiza -> devuelve contacto formateado.
// =====================================================

export const editarContacto = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const { contactId, nombre, apellido, email, telefono, cif, razonSocial } = payload || {};

    console.log(`${TAG} editarContacto: ${contactId} -> ${nombre} ${apellido}`);

    if (!contactId) throw new Error('contactId requerido');
    if (!nombre) throw new Error('Nombre es requerido');

    // 1) Obtener contacto actual para revision
    const elevatedGet = elevate(contacts.getContact);
    const current = await elevatedGet(contactId);

    if (!current || !current.revision) {
      throw new Error('Contacto no encontrado o sin revision');
    }

    // 2) Construir datos de actualizacion
    const contactInfo = {
      name: {
        first: String(nombre).trim(),
        last: String(apellido || '').trim()
      }
    };

    const newEmail = String(email || '').trim();
    if (newEmail) {
      contactInfo.emails = [{ email: newEmail }];
    }

    const newPhone = String(telefono || '').trim();
    if (newPhone) {
      contactInfo.phones = [{ phone: newPhone }];
    }

    // 3) Actualizar
    const identifiers = { contactId, revision: current.revision };
    const elevatedUpdate = elevate(contacts.updateContact);
    const updated = await elevatedUpdate(identifiers, contactInfo, { suppressAuth: true });

    const result = updated?.contact || updated;
    console.log(`${TAG} Contacto editado: ${contactId}`);

    // v2.2.0 — CIF / razón social (undefined = no se tocan). Escritura
    // aparte, con la revision nueva que deja la edición anterior.
    let datosFiscales = null;
    if (cif !== undefined || razonSocial !== undefined) {
      datosFiscales = await guardarDatosFiscales(contactId, { cif, razonSocial });
    }

    return {
      ok: true,
      version: VERSION,
      datosFiscales,
      cliente: formatearContacto(result)
    };

  } catch (e) {
    console.error(`${TAG} Error editarContacto:`, e);
    // v2.2.0 — `code` para mostrar un mensaje propio en pantalla.
    return { ok: false, version: VERSION, error: { ...safeErr(e), code: codigoErrorContacto(e) } };
  }
});

// =====================================================
// LEER DATOS FISCALES (v2.2.0)
// CIF/NIF y razón social de un contacto, para rellenar «Editar cliente»
// y los formularios de factura de Recepción PRO.
// Permissions.SiteMember: solo usuarios con sesión (mismo nivel que
// facturacionSalonLogic, que también se llama desde Recepción PRO).
// =====================================================

export const leerDatosFiscales = webMethod(Permissions.SiteMember, async (payload) => {
  try {
    const { contactId } = payload || {};
    if (!contactId) throw new Error('contactId requerido');

    const elevatedGet = elevate(contacts.getContact);
    const contact = await elevatedGet(contactId);
    if (!contact) throw new Error('Contacto no encontrado');

    const { cif, razonSocial } = leerDatosFiscalesDeContacto(contact);
    return { ok: true, version: VERSION, contactId, cif, razonSocial };

  } catch (e) {
    console.error(`${TAG} Error leerDatosFiscales:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});
