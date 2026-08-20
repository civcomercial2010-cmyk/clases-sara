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

/**
 * El evento dice de un vistazo lo que hace falta saber sin abrir nada: de quién es
 * la clase, si es de campo o de circulación y dónde se da.
 */
function tituloDeClase(reserva) {
  return 'Clase · ' + reserva.nombre + (reserva.tipo ? ' · ' + reserva.tipo : '');
}

function crearEvento_(cal, reserva) {
  try {
    var evento = cal.createEvent(
      tituloDeClase(reserva),
      aDate(reserva.fecha, reserva.hora_inicio),
      aDate(reserva.fecha, reserva.hora_fin),
      {
        location: ubicacionDeEscuela(reserva.escuela),
        description: (reserva.tipo ? 'Clase de ' + reserva.tipo + '\n' : '') +
                     (reserva.escuela ? 'Autoescuela: ' + reserva.escuela + '\n' : '') +
                     'Móvil: ' + reserva.telefono +
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

/**
 * El camino de vuelta: lo que Sara cambia en el calendario, al sistema.
 *
 * Si mueve una clase de hora arrastrándola, la reserva se mueve con ella. Si borra
 * el evento, la clase se libera y esa hora vuelve a ofrecerse. Para Sara el
 * calendario es la agenda de verdad, así que manda él.
 *
 * Se hace con una sola consulta al calendario, comparando con lo que dice la hoja.
 */
function traerCambiosDelCalendario() {
  var cal;
  try {
    cal = calendarioDeClases_();
  } catch (e) {
    return { ok: false, error: 'No se pudo abrir el calendario.' };
  }

  var hoy   = hoyISO();
  var filas = filasComoObjetos(getHoja(HOJA_RESERVAS)).filter(function (fila) {
    return String(fila.estado).trim() === 'confirmada' &&
           String(fila.evento_id || '').trim() !== '' &&
           aFechaISO(fila.fecha) >= hoy;
  });

  if (!filas.length) return { ok: true, movidas: [], liberadas: [] };

  var fechas = filas.map(function (f) { return aFechaISO(f.fecha); }).sort();
  var desde  = aDate(fechas[0], '00:00');
  var hasta  = sumarDias(aDate(fechas[fechas.length - 1], '00:00'), 1);

  var porId = {};
  cal.getEvents(desde, hasta).forEach(function (ev) { porId[ev.getId()] = ev; });

  var hoja      = getHoja(HOJA_RESERVAS);
  var ocupados  = indexarDesdeFilas_(filasComoObjetos(hoja));
  var movidas   = [];
  var liberadas = [];

  filas.forEach(function (fila) {
    var idEvento = String(fila.evento_id).trim();
    var evento   = porId[idEvento];
    var reserva  = reservaCompleta_(fila);

    /*
     * Si no aparece en el rango consultado, todavía puede existir: Sara habrá
     * arrastrado la clase a otra semana. Antes de darla por borrada se pregunta por
     * ella directamente, que si no estaríamos liberando una clase que sigue en pie.
     */
    if (!evento) {
      try {
        var suelto = cal.getEventById(idEvento);
        if (suelto) evento = suelto;
      } catch (e) { /* ya no existe */ }
    }

    // Ya no está en el calendario: Sara lo ha borrado
    if (!evento) {
      escribirEstado_(fila, 'cancelada', 'Quitada desde el calendario');
      hoja.getRange(fila._fila, indiceCol_('evento_id')).setValue('');
      liberadas.push(reserva);
      return;
    }

    var nuevaFecha = aFechaISO(evento.getStartTime());
    var nuevaHora  = aHoraHHMM(evento.getStartTime());
    var nuevoFin   = aHoraHHMM(evento.getEndTime());

    if (nuevaFecha === reserva.fecha && nuevaHora === reserva.hora_inicio &&
        nuevoFin === reserva.hora_fin) return;   // sigue donde estaba

    // Si al moverla pisa otra clase, se deja como estaba y se avisa
    if (chocaConOtra_(ocupados, reserva, nuevaFecha, nuevaHora, nuevoFin)) {
      movidas.push({ reserva: reserva, error: 'chocaba con otra clase' });
      return;
    }

    hoja.getRange(fila._fila, indiceCol_('fecha'), 1, 3)
        .setValues([[nuevaFecha, nuevaHora, nuevoFin]]);
    hoja.getRange(fila._fila, indiceCol_('actualizado_en'))
        .setValue(Utilities.formatDate(ahora(), TZ, 'yyyy-MM-dd HH:mm:ss'));

    movidas.push({
      reserva: reserva,
      fecha: nuevaFecha, hora_inicio: nuevaHora, hora_fin: nuevoFin
    });
  });

  if (movidas.length || liberadas.length) olvidarDisponibilidad();
  return { ok: true, movidas: movidas, liberadas: liberadas };
}

/** ¿La clase movida se solapa con otra reserva activa que no sea ella misma? */
function chocaConOtra_(ocupados, reserva, fecha, horaInicio, horaFin) {
  var lista = ocupados[fecha] || [];
  var inicio = enMinutos(horaInicio);
  var fin    = enMinutos(horaFin);

  var propioInicio = enMinutos(reserva.hora_inicio);
  var propioFin    = enMinutos(reserva.hora_fin);

  for (var i = 0; i < lista.length; i++) {
    // La suya propia no cuenta
    if (fecha === reserva.fecha &&
        lista[i].inicio === propioInicio && lista[i].fin === propioFin) continue;
    if (inicio < lista[i].fin && fin > lista[i].inicio) return true;
  }
  return false;
}

/**
 * Los dos sentidos de una vez: primero se recoge lo que Sara cambió en el
 * calendario y después se apunta lo que falte de la hoja.
 */
function sincronizarTodo() {
  var vuelta = traerCambiosDelCalendario();
  var ida    = sincronizarTodaLaAgenda();

  return {
    ok: true,
    movidas: (vuelta.movidas || []).length,
    liberadas: (vuelta.liberadas || []).length,
    creados: ida.creados || 0,
    borrados: ida.borrados || 0
  };
}

// --- Revisión automática ----------------------------------------------------

var FUNCION_AUTOMATICA = 'revisionAutomatica';

/**
 * Cada cuarto de hora, el sistema se pone al día solo.
 *
 * Sin esto, lo que Sara cambia en su calendario no se recoge hasta que abre el
 * panel: si borra una clase el martes por la noche y no vuelve hasta el jueves, esa
 * hora no se ofrece a nadie durante dos días. Con el disparador, en quince minutos
 * como mucho está disponible.
 *
 * Lo monta instalar(), así que no hay que acordarse de nada.
 */
function activarRevisionAutomatica() {
  desactivarRevisionAutomatica();   // nunca dos a la vez

  ScriptApp.newTrigger(FUNCION_AUTOMATICA)
    .timeBased()
    .everyMinutes(15)
    .create();

  var mensaje = 'Revisión automática activada: cada 15 minutos.';
  Logger.log(mensaje);
  return mensaje;
}

function desactivarRevisionAutomatica() {
  var quitados = 0;
  ScriptApp.getProjectTriggers().forEach(function (disparador) {
    if (disparador.getHandlerFunction() === FUNCION_AUTOMATICA) {
      ScriptApp.deleteTrigger(disparador);
      quitados++;
    }
  });
  return quitados;
}

/** ¿Está puesta la revisión automática? Lo usa el diagnóstico. */
function revisionAutomaticaActiva() {
  try {
    return ScriptApp.getProjectTriggers().some(function (d) {
      return d.getHandlerFunction() === FUNCION_AUTOMATICA;
    });
  } catch (e) {
    return false;
  }
}

/**
 * Lo que ejecuta el disparador. Nunca debe reventar: si algo falla, se apunta en el
 * registro y se vuelve a intentar en el siguiente cuarto de hora.
 */
function revisionAutomatica() {
  try {
    var resultado = sincronizarTodo();
    var hubo = resultado.movidas || resultado.liberadas ||
               resultado.creados || resultado.borrados;

    if (hubo) {
      Logger.log('Revisión automática: ' +
                 resultado.movidas + ' movidas, ' + resultado.liberadas + ' liberadas, ' +
                 resultado.creados + ' apuntadas, ' + resultado.borrados + ' quitadas.');
    }
    return resultado;
  } catch (e) {
    Logger.log('La revisión automática ha fallado: ' + e.message);
    return { ok: false, error: e.message };
  }
}
