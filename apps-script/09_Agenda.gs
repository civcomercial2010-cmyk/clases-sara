/**
 * Las clases confirmadas, en el calendario de Sara.
 *
 * Cada vez que confirma una clase se le crea un evento en el calendario
 * "Clases – disponibilidad", el mismo donde ella tapa las horas que no puede dar.
 * Si después libera la hora, el evento desaparece.
 *
 * Todo en un único calendario, que es el que ya tiene compartido y a la vista. Como
 * ese calendario también se lee para saber qué horas están tapadas, una clase
 * confirmada queda doblemente protegida: por su reserva y por su evento. No estorba,
 * y si algún día la hoja y el calendario se descuadraran, gana el que más protege.
 *
 * El panel pide esto en segundo plano, con Sara ya viendo el resultado en pantalla:
 * crear un evento tarda casi un segundo y no tiene por qué esperarlo.
 */

function calendarioDeClases_() {
  var id = config('calendar_id', '');
  if (!id) throw new Error('Sin calendario configurado. Ejecuta instalar().');

  var cal = CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('CALENDARIO_INACCESIBLE');
  return cal;
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
    Logger.log('No se pudo abrir el calendario: ' + e.message);
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

  if (creados || borrados) olvidarDisponibilidad();
  return { ok: true, creados: creados, borrados: borrados };
}

/** El título lleva el nombre del alumno, para distinguirlo de lo que Sara tapa a mano. */
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
 * Se ejecuta desde el botón del panel, o a mano si alguna vez se descuadra.
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
