/**
 * Las clases confirmadas, en el calendario de Sara.
 *
 * Cada vez que confirma una clase se le crea un evento en su Google Calendar, y si
 * después la libera, el evento desaparece. Así ve su día en el calendario de siempre,
 * junto a todo lo demás, sin tener que entrar al panel.
 *
 * Va en un calendario aparte del de disponibilidad: aquel dice cuándo NO puede dar
 * clase y este dice qué clases tiene. Mezclarlos haría que un evento borrado a mano
 * cambiara las horas que se ofrecen, y eso es justo lo que no queremos.
 *
 * El panel pide esto en segundo plano, con Sara ya viendo el resultado en pantalla:
 * crear un evento tarda casi un segundo y no tiene por qué esperarlo.
 */

var NOMBRE_CALENDAR_CLASES = 'Clases con alumnos';

function calendarioDeClases_() {
  var id = config('calendar_clases_id', '');
  if (id) {
    var guardado = CalendarApp.getCalendarById(id);
    if (guardado) return guardado;
  }

  var existentes = CalendarApp.getCalendarsByName(NOMBRE_CALENDAR_CLASES);
  if (existentes && existentes.length) {
    setConfig('calendar_clases_id', existentes[0].getId());
    return existentes[0];
  }

  var nuevo = CalendarApp.createCalendar(NOMBRE_CALENDAR_CLASES, {
    summary: 'Clases confirmadas con tus alumnos',
    timeZone: TZ,
    color: CalendarApp.Color.BLUE
  });
  setConfig('calendar_clases_id', nuevo.getId());
  return nuevo;
}

/**
 * Pone al día el calendario con las clases indicadas: crea las que falten y borra
 * las de lo que ya no está confirmado. Devuelve lo que ha hecho.
 */
function sincronizarAgenda(ids) {
  var lista = [].concat(ids || []).filter(Boolean);
  if (!lista.length) return { ok: false, error: 'Falta la clase.' };

  var pedidos = {};
  lista.forEach(function (id) { pedidos[String(id).trim()] = true; });

  var cal;
  try {
    cal = calendarioDeClases_();
  } catch (e) {
    Logger.log('No se pudo abrir el calendario de clases: ' + e.message);
    return { ok: false, error: 'No se pudo abrir el calendario.' };
  }

  var hoja    = getHoja(HOJA_RESERVAS);
  var columna = indiceCol_('evento_id');
  var creados = 0, borrados = 0;

  filasComoObjetos(hoja).forEach(function (fila) {
    if (!pedidos[String(fila.id).trim()]) return;

    var estado  = String(fila.estado).trim();
    var evento  = String(fila.evento_id || '').trim();
    var reserva = reservaCompleta_(fila);

    if (estado === 'confirmada') {
      if (evento) return;                       // ya estaba en el calendario
      var nuevo = crearEvento_(cal, reserva);
      if (nuevo) {
        hoja.getRange(fila._fila, columna).setValue(nuevo);
        creados++;
      }
    } else if (evento) {
      if (borrarEvento_(cal, evento)) borrados++;
      hoja.getRange(fila._fila, columna).setValue('');
    }
  });

  return { ok: true, creados: creados, borrados: borrados };
}

function crearEvento_(cal, reserva) {
  try {
    var evento = cal.createEvent(
      'Clase · ' + reserva.nombre,
      aDate(reserva.fecha, reserva.hora_inicio),
      aDate(reserva.fecha, reserva.hora_fin),
      {
        description: 'Móvil: ' + reserva.telefono +
                     (reserva.notas ? '\nNota: ' + reserva.notas : '') +
                     '\nReserva ' + reserva.codigo
      }
    );
    evento.addPopupReminder(60);
    return evento.getId();
  } catch (e) {
    Logger.log('No se pudo crear el evento: ' + e.message);
    return '';
  }
}

function borrarEvento_(cal, eventoId) {
  try {
    var evento = cal.getEventById(eventoId);
    if (evento) { evento.deleteEvent(); return true; }
  } catch (e) {
    Logger.log('No se pudo borrar el evento: ' + e.message);
  }
  return false;
}

/**
 * Repasa todo lo confirmado de hoy en adelante y lo deja igualado con el calendario.
 * Se ejecuta a mano si alguna vez se descuadra, o desde el panel con el botón de
 * poner al día la agenda.
 */
function sincronizarTodaLaAgenda() {
  var hoy = hoyISO();
  var ids = filasComoObjetos(getHoja(HOJA_RESERVAS))
    .filter(function (fila) {
      if (!fila.id) return false;
      var estado = String(fila.estado).trim();
      var tieneEvento = String(fila.evento_id || '').trim() !== '';
      if (aFechaISO(fila.fecha) < hoy) return false;
      // Solo lo que esté descuadrado
      return (estado === 'confirmada' && !tieneEvento) || (estado !== 'confirmada' && tieneEvento);
    })
    .map(function (fila) { return String(fila.id).trim(); });

  if (!ids.length) return { ok: true, creados: 0, borrados: 0, mensaje: 'Ya estaba todo al día.' };
  return sincronizarAgenda(ids);
}
