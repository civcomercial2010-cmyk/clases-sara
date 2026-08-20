/**
 * Archivo de calendario para el alumno.
 *
 * Cuando Sara confirma una clase, el alumno puede añadirla a su calendario con un
 * aviso una hora antes. Se le entrega un archivo .ics en vez de un enlace a Google
 * Calendar porque el enlace no permite fijar el recordatorio: se quedaría con el que
 * cada uno tenga por defecto, que muchas veces es ninguno. El .ics lo abren tanto
 * Google Calendar como el calendario del iPhone.
 *
 * Solo entran las clases confirmadas: no tiene sentido apuntar en la agenda algo que
 * Sara todavía no ha aceptado.
 */

function generarIcs(codigo) {
  var fila = buscarPorCodigo_(String(codigo || '').trim().toUpperCase());
  if (!fila) return null;

  // Todas las clases confirmadas de ese alumno, aunque las pidiera en tandas distintas
  var movil = String(fila.telefono).trim();
  var hoy   = hoyISO();

  var confirmadas = filasComoObjetos(getHoja(HOJA_RESERVAS)).filter(function (f) {
    return String(f.telefono).trim() === movil &&
           String(f.estado).trim() === 'confirmada' &&
           aFechaISO(f.fecha) >= hoy;
  });
  if (!confirmadas.length) return null;

  var lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clases con Sara//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  var sello = enUtc_(ahora());
  confirmadas.forEach(function (f) {
    var fecha = aFechaISO(f.fecha);
    var inicio = aDate(fecha, aHoraHHMM(f.hora_inicio));
    var fin    = aDate(fecha, aHoraHHMM(f.hora_fin));

    lineas.push(
      'BEGIN:VEVENT',
      'UID:' + String(f.codigo).trim() + '@clases-sara',
      'DTSTAMP:' + sello,
      'DTSTART:' + enUtc_(inicio),
      'DTEND:' + enUtc_(fin),
      'SUMMARY:Clase de conducir con Sara',
      'DESCRIPTION:' + escaparIcs_('Reserva ' + String(f.codigo).trim() +
                                   '. Si no puedes venir, avisa a Sara con antelación.'),
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Clase de conducir dentro de una hora',
      'END:VALARM',
      'END:VEVENT'
    );
  });

  lineas.push('END:VCALENDAR');
  return lineas.join('\r\n');   // el formato exige finales de línea CRLF
}

function enUtc_(fecha) {
  return Utilities.formatDate(fecha, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
}

function escaparIcs_(texto) {
  return String(texto)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Enlace que descarga el archivo. Vacío si no hay API configurada en la hoja. */
function enlaceCalendario(codigo) {
  var base = config('url_api', '');
  if (!base) return '';
  return base + '?accion=ics&codigo=' + encodeURIComponent(codigo);
}
