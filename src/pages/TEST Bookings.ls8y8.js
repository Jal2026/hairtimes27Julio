import { leerReservasBookingsDesdeHoy } from "backend/bookingsReader.jsw";

$w.onReady(async function () {
  pintarResultado("Cargando reservas de Wix Bookings...");

  try {
    const resultado = await leerReservasBookingsDesdeHoy(3);

    if (!resultado?.reservas?.length) {
      pintarResultado("No se han encontrado reservas desde hoy hasta los próximos 3 meses.");
      prepararCsvParaDescarga([], "reservas-wix-bookings.csv");
      return;
    }

    const lineas = resultado.reservas.map((r, index) => {
      return [
        `${index + 1}. ${r.startDateMadrid || "Sin fecha"}`,
        `Cliente: ${r.clienteNombre || "Sin nombre"}`,
        `Servicio: ${r.servicio || "Sin servicio"}`,
        `Estado: ${r.status || "Sin estado"}`,
        `Teléfono: ${r.telefono || "-"}`,
        `Email: ${r.email || "-"}`,
        `Staff: ${r.staffNombre || "-"}`,
        `Booking ID: ${r.bookingId || "-"}`,
        "-----------------------------"
      ].join("\n");
    });

    const textoFinal = [
      `Reservas encontradas: ${resultado.total}`,
      `Rango: ${resultado.rango?.desdeUtc} → ${resultado.rango?.hastaUtc}`,
      "",
      ...lineas
    ].join("\n");

    pintarResultado(textoFinal);

    const csvFinal = crearCsvReservas(resultado.reservas);

    prepararCsvParaDescarga(
      csvFinal,
      crearNombreArchivoCsv()
    );

  } catch (error) {
    console.error("[BookingsReader][PageCode] ERROR:", error);
    pintarResultado(`ERROR leyendo reservas:\n${error.message || error}`);
  }
});

function crearCsvReservas(reservas) {
  const columnas = [
    "Fecha Madrid",
    "Fecha UTC",
    "Cliente",
    "Telefono",
    "Email",
    "Servicio",
    "Staff",
    "Estado",
    "Estado pago",
    "Participantes",
    "Booking ID",
    "Contact ID",
    "Service ID",
    "Staff ID"
  ];

  const filas = reservas.map((r) => {
    return [
      r.startDateMadrid || "",
      r.startDateUtc || "",
      r.clienteNombre || "",
      r.telefono || "",
      r.email || "",
      r.servicio || "",
      r.staffNombre || "",
      r.status || "",
      r.paymentStatus || "",
      r.totalParticipants || "",
      r.bookingId || "",
      r.contactId || "",
      r.serviceId || "",
      r.staffId || ""
    ];
  });

  return [
    columnas.map(valorCsv).join(";"),
    ...filas.map((fila) => fila.map(valorCsv).join(";"))
  ].join("\n");
}

function valorCsv(valor) {
  const texto = String(valor ?? "")
    .replace(/\r?\n|\r/g, " ")
    .replace(/"/g, '""');

  return `"${texto}"`;
}

function crearNombreArchivoCsv() {
  const ahora = new Date();

  const yyyy = ahora.getFullYear();
  const mm = String(ahora.getMonth() + 1).padStart(2, "0");
  const dd = String(ahora.getDate()).padStart(2, "0");
  const hh = String(ahora.getHours()).padStart(2, "0");
  const mi = String(ahora.getMinutes()).padStart(2, "0");

  return `reservas-wix-bookings-${yyyy}-${mm}-${dd}-${hh}${mi}.csv`;
}

function prepararCsvParaDescarga(csvFinal, filename) {
  try {
    $w("#htmlExportReservas").postMessage({
      type: "PREPARAR_CSV_RESERVAS",
      filename,
      csv: csvFinal
    });
  } catch (error) {
    console.error("[BookingsReader][PageCode] ERROR preparando CSV:", error);
  }
}

function pintarResultado(texto) {
  const el = $w("#txtReservasBookings");

  if ("text" in el) {
    el.text = texto;
    return;
  }

  if ("value" in el) {
    el.value = texto;
  }
}