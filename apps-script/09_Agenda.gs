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

/**
 * Cuántas clases o eventos puede tocar una sola revisión.
 *
 * Un fallo lógico en un proceso que se repite cada quince minutos no da un error: da
 * un calendario con cientos de copias de la misma clase. Con este tope, lo peor que
 * puede pasar es que haga falta pulsar dos veces, y Sara recibe un aviso de que algo
 * no cuadra en lugar de descubrirlo cuando ya es un desastre.
 */
var MAX_POR_VUELTA = 20;

/** Avisa a Sara de que algo se ha desbocado, como mucho una vez por hora. */
function avisarDelTope_(quehacer) {
  Logger.log('TOPE alcanzado al ' + quehacer + ': se han parado los cambios.');

  var cache = CacheService.getScriptCache();
  if (cache.get('aviso_tope')) return;
  cache.put('aviso_tope', '1', 3600);

  var destino = primerEmailAdmin_();
  if (!destino) return;

  enviarEmail_(destino,
    'Revisa tus clases: algo no cuadra',
    'Al ' + quehacer + ' han salido más de ' + MAX_POR_VUELTA + ' cambios de golpe, ' +
    'así que se han parado por seguridad.\n\n' +
    'Suele significar que la hoja y el calendario se han desincronizado. ' +
    'Ejecuta diagnostico() desde el editor para ver qué pasa.');
}

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

  /*
   * Bajo el mismo cierre que la revisión automática. Sin él, entre crear el evento y
   * apuntar su id en la hoja cabía una revisión entera: veía un evento firmado que
   * ninguna fila conocía, lo daba por huérfano y lo borraba. La clase recién
   * confirmada se quedaba apuntando a un evento en la papelera y, un cuarto de hora
   * después, se cancelaba sola con el WhatsApp de confirmación ya enviado.
   */
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { ok: false, error: 'Ocupado, se apuntará en la próxima revisión.', ocupado: true };
  }
  try {
    return sincronizarAgendaSinCierre_(lista);
  } finally {
    lock.releaseLock();
  }
}

function sincronizarAgendaSinCierre_(lista) {
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

  var tope = false;

  filasComoObjetos(hoja).forEach(function (fila) {
    if (tope) return;
    if (!pedidos[String(fila.id).trim()]) return;

    var estado  = String(fila.estado).trim();
    var evento  = String(fila.evento_id || '').trim();
    var reserva = reservaCompleta_(fila);

    // Lo que ya se dio se queda en la agenda de Sara, pase lo que pase
    if (estado === 'realizada') return;

    if (estado === 'confirmada') {
      if (evento) return;                       // ya estaba en el calendario
      if (creados >= MAX_POR_VUELTA) { tope = true; return; }

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

  if (tope) avisarDelTope_('apuntar clases en el calendario');
  if (creados || borrados) olvidarDisponibilidad();
  return { ok: true, creados: creados, borrados: borrados, tope: tope };
}

/**
 * El evento dice de un vistazo lo que hace falta saber sin abrir nada: de quién es
 * la clase, si es de campo o de circulación y dónde se da.
 */
function tituloDeClase(reserva) {
  return 'Clase · ' + reserva.nombre + (reserva.tipo ? ' · ' + reserva.tipo : '');
}

/**
 * Firma invisible que llevan los eventos creados por el sistema.
 *
 * Es la red de seguridad contra el peor fallo posible: que el sistema no reconozca
 * sus propios eventos, los dé por clases apuntadas a mano, los importe como reservas
 * nuevas y a esas les cree otro evento, sin fin. Aunque se pierda el vínculo por la
 * hoja, esta marca lo delata igual.
 */
var FIRMA_AUTOMATICA = '[clase-del-sistema]';

function esEventoDelSistema_(evento) {
  try {
    return String(evento.getDescription() || '').indexOf(FIRMA_AUTOMATICA) !== -1;
  } catch (e) {
    return false;
  }
}

function crearEvento_(cal, reserva) {
  try {
    var inicio = aDate(reserva.fecha, reserva.hora_inicio);
    var fin    = aDate(reserva.fecha, reserva.hora_fin);
    var titulo = tituloDeClase(reserva);

    /*
     * Antes de crear nada, mirar si ya está. Si la hoja perdió el vínculo con el
     * evento, crear otro sin comprobarlo llena el calendario de copias de la misma
     * clase. Aquí se recupera el que ya existe en lugar de duplicarlo.
     */
    var existentes = cal.getEvents(inicio, fin);
    for (var i = 0; i < existentes.length; i++) {
      if (existentes[i].getTitle() === titulo &&
          existentes[i].getStartTime().getTime() === inicio.getTime()) {
        return existentes[i].getId();
      }
    }

    var evento = cal.createEvent(titulo, inicio, fin, {
      location: ubicacionDeEscuela(reserva.escuela),
      description: (reserva.tipo ? 'Clase de ' + reserva.tipo + '\n' : '') +
                   (reserva.escuela ? 'Autoescuela: ' + reserva.escuela + '\n' : '') +
                   (reserva.telefono ? 'Móvil: ' + reserva.telefono : '') +
                   (reserva.notas ? '\nNota: ' + reserva.notas : '') +
                   '\n\n' + FIRMA_AUTOMATICA
    });
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

      /*
       * Una clase ya dada se queda en el calendario. Sin esta línea, en cuanto pasara
       * a 'realizada' el sistema vería "no está confirmada pero tiene evento" y se lo
       * borraría: Sara perdería de su agenda las clases que acaba de dar.
       */
      if (estado === 'realizada') return false;

      // Solo lo que esté descuadrado
      return (estado === 'confirmada' && !tieneEvento) || (estado !== 'confirmada' && tieneEvento);
    })
    .map(function (fila) { return String(fila.id).trim(); });

  if (!ids.length) return { ok: true, creados: 0, borrados: 0, mensaje: 'Ya estaba todo al día.' };
  // Se llama desde sincronizarTodo, que ya tiene el cierre cogido
  return sincronizarAgendaSinCierre_(ids);
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
  var hoja  = getHoja(HOJA_RESERVAS);
  var todas = filasComoObjetos(hoja);

  var filas = todas.filter(function (fila) {
    return String(fila.estado).trim() === 'confirmada' &&
           String(fila.evento_id || '').trim() !== '' &&
           aFechaISO(fila.fecha) >= hoy;
  });

  if (!filas.length) return { ok: true, movidas: [], liberadas: [], conflictos: [] };

  var fechas = filas.map(function (f) { return aFechaISO(f.fecha); }).sort();
  var desde  = aDate(fechas[0], '00:00');
  var hasta  = sumarDias(aDate(fechas[fechas.length - 1], '00:00'), 1);

  /*
   * Un evento repetido (una serie) devuelve el mismo id en todas sus instancias, así
   * que no se puede saber cuál de ellas corresponde a una fila. Esas se dejan en paz:
   * ni se mueven ni se liberan por lo que diga el calendario.
   */
  var porId = {}, repetidos = {};
  cal.getEvents(desde, hasta).forEach(function (ev) {
    var id = ev.getId();
    if (porId[id]) repetidos[id] = true;
    porId[id] = ev;
  });

  var movidas    = [];
  var liberadas  = [];
  var conflictos = [];

  filas.forEach(function (fila) {
    var idEvento = String(fila.evento_id).trim();
    if (repetidos[idEvento]) return;

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
        if (suelto && sigueEnElCalendario_(cal, suelto)) evento = suelto;
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

    /*
     * Sara ha movido la clase. Lo que haya debajo decide:
     *
     *  · Otra clase confirmada o ya dada: no caben las dos. El calendario se devuelve
     *    a como estaba y se le avisa por correo. Dejarlo movido en el calendario y
     *    quieto en la hoja era tener dos verdades para siempre, y el panel diciendo
     *    "1 movida" en cada apertura.
     *  · Solicitudes pendientes: Sara no las ve en su calendario, así que no podía
     *    saber que estaban. Gana su clase: las pendientes se rechazan y el alumno lo
     *    ve en "Mis clases". A Sara se le avisa por correo para que les escriba.
     */
    var encima = quienHayEn_(todas, reserva.id, nuevaFecha, nuevaHora, nuevoFin);
    var firmes = encima.filter(function (o) { return o.estado !== 'pendiente'; });

    if (firmes.length) {
      try {
        evento.setTime(aDate(reserva.fecha, reserva.hora_inicio), aDate(reserva.fecha, reserva.hora_fin));
      } catch (e) {
        Logger.log('No se pudo devolver el evento a su sitio: ' + e.message);
      }
      conflictos.push({
        reserva: reserva, fecha: nuevaFecha, hora_inicio: nuevaHora, hora_fin: nuevoFin,
        con: firmes.map(function (o) { return o.nombre + ' (' + o.hora_inicio + '–' + o.hora_fin + ')'; }).join(', ')
      });
      return;
    }

    encima.forEach(function (pendiente) {
      escribirEstado_(pendiente.fila, 'rechazada', 'Sara ha ocupado esa hora con otra clase');
      conflictos.push({
        reserva: reservaCompleta_(pendiente.fila), rechazada: true,
        por: reserva.nombre + ' (' + nuevaFecha + ' ' + nuevaHora + ')'
      });
    });

    // Cada dato en su columna, aunque no estén pegadas
    escribirCampos_(fila, {
      fecha: nuevaFecha,
      hora_inicio: nuevaHora,
      hora_fin: nuevoFin,
      actualizado_en: Utilities.formatDate(ahora(), TZ, 'yyyy-MM-dd HH:mm:ss')
    });

    movidas.push({
      reserva: reserva,
      fecha: nuevaFecha, hora_inicio: nuevaHora, hora_fin: nuevoFin
    });
  });

  if (conflictos.length) avisarDeConflictos_(conflictos);
  if (movidas.length || liberadas.length || conflictos.length) olvidarDisponibilidad();
  return { ok: true, movidas: movidas, liberadas: liberadas, conflictos: conflictos };
}

/**
 * ¿Este evento sigue vivo, o está en la papelera?
 *
 * Cuando Sara borra un evento, Google lo guarda treinta días en la papelera y
 * getEventById lo sigue devolviendo como si nada. Así las clases que quitaba del
 * calendario seguían confirmadas en el panel y tapando la hora a los alumnos. El
 * listado por fechas, en cambio, no enseña lo borrado: si el evento no sale en la
 * lista de su propia hora, es que ya no está.
 */
function sigueEnElCalendario_(cal, evento) {
  try {
    var id = evento.getId();
    return cal.getEvents(evento.getStartTime(), evento.getEndTime()).some(function (ev) {
      return ev.getId() === id;
    });
  } catch (e) {
    return false;
  }
}

/**
 * Las reservas activas que ocupan ese tramo, sin contar la propia.
 * Cada una con su fila, para poder cambiarla de estado.
 */
function quienHayEn_(filas, idPropio, fecha, horaInicio, horaFin) {
  var inicio = enMinutos(horaInicio);
  var fin    = enMinutos(horaFin);
  var salida = [];

  filas.forEach(function (fila) {
    if (String(fila.id).trim() === String(idPropio).trim()) return;
    var estado = String(fila.estado).trim();
    if (estado !== 'pendiente' && estado !== 'confirmada' && estado !== 'realizada') return;
    if (aFechaISO(fila.fecha) !== fecha) return;

    var ini = enMinutos(aHoraHHMM(fila.hora_inicio));
    var fn  = enMinutos(aHoraHHMM(fila.hora_fin));
    if (!(fn > ini)) fn = ini + 60;
    if (inicio < fn && fin > ini) {
      salida.push({
        fila: fila, estado: estado, nombre: String(fila.nombre).trim(),
        hora_inicio: aHoraHHMM(fila.hora_inicio), hora_fin: aHoraHHMM(fila.hora_fin)
      });
    }
  });
  return salida;
}

/**
 * Lo que el calendario no puede decirle a Sara, se lo dice el correo: qué clase no
 * pudo moverse y con quién chocaba, o qué solicitudes se han rechazado al mover
 * una clase encima. Una vez por cada caso, para no repetirse en cada revisión.
 */
function avisarDeConflictos_(conflictos) {
  var cache = CacheService.getScriptCache();
  var lineas = [];

  conflictos.forEach(function (c) {
    var huella = 'conflicto_' + c.reserva.id + '_' + (c.fecha || '') + (c.rechazada ? '_r' : '');
    if (cache.get(huella)) return;
    cache.put(huella, '1', 21600);

    if (c.rechazada) {
      lineas.push('· La solicitud de ' + c.reserva.nombre + ' (' + c.reserva.cuando +
                  ') se ha rechazado porque has movido encima la clase de ' + c.por +
                  '. Escríbele para que elija otra hora' +
                  (c.reserva.telefono ? ': ' + c.reserva.telefono : '') + '.');
    } else {
      lineas.push('· No se ha podido mover la clase de ' + c.reserva.nombre + ' al ' +
                  fechaCercana(c.fecha) + ' de ' + c.hora_inicio + ' a ' + c.hora_fin +
                  ': ya tienes a ' + c.con + '. El evento ha vuelto a ' + c.reserva.cuando + '.');
    }
  });

  if (!lineas.length) return;
  var destino = primerEmailAdmin_();
  if (!destino) return;

  enviarEmail_(destino, 'Revisa tu calendario: una clase chocaba con otra',
    'Al cuadrar tu calendario con las reservas ha pasado esto:\n\n' + lineas.join('\n\n') +
    '\n\nLa hoja y el calendario vuelven a estar de acuerdo; solo falta que avises a quien toque.');
}

/**
 * Eventos que puso el sistema y cuya clase ya no está en la hoja.
 *
 * Si Sara borra una línea del Sheet, su evento tiene que desaparecer del calendario y
 * esa hora volver a ofrecerse. Sin esto el evento se quedaba huérfano y, como el
 * calendario también se lee para saber qué horas están ocupadas, la hora seguía sin
 * ofrecerse a nadie y la clase acababa colándose otra vez en la hoja como si Sara la
 * hubiera apuntado a mano.
 *
 * Solo se tocan los eventos con la firma del sistema. Lo que Sara escriba directamente
 * en su calendario manda, y ahí no se entra: para quitar una de esas, se borra el
 * evento.
 */
function limpiarHuerfanos() {
  var cal;
  try {
    cal = calendarioDeClases_();
  } catch (e) {
    return { ok: false, error: 'No se pudo abrir el calendario.' };
  }

  var conocidos = {};
  filasComoObjetos(getHoja(HOJA_RESERVAS)).forEach(function (fila) {
    var id = String(fila.evento_id || '').trim();
    if (id) conocidos[id] = true;
  });

  var desde = ahora();
  var hasta = sumarDias(desde, configNum('semanas_vista', 2) * 7 + 7);

  var borrados = 0;
  var tope = false;

  cal.getEvents(desde, hasta).forEach(function (evento) {
    if (tope) return;
    if (!esEventoDelSistema_(evento)) return;
    if (conocidos[evento.getId()]) return;

    if (borrados >= MAX_POR_VUELTA) { tope = true; return; }
    try {
      evento.deleteEvent();
      borrados++;
    } catch (e) { /* ya no estaba */ }
  });

  if (tope) avisarDelTope_('quitar clases borradas de la hoja');
  if (borrados) olvidarDisponibilidad();
  return { ok: true, borrados: borrados };
}

/**
 * Los dos sentidos de una vez: primero se recoge lo que Sara cambió en el
 * calendario y después se apunta lo que falte de la hoja.
 */
function sincronizarTodo() {
  /*
   * Solo una a la vez. Esto lo llaman la revisión automática cada cuarto de hora y el
   * panel cada vez que Sara lo abre o toca algo. Dos a la vez leen la misma hoja antes
   * de que ninguna haya escrito, y las dos crean el mismo evento: duplicados de dos en
   * dos. Si ya hay una en marcha, esta se va: en un momento vuelve a tocar.
   */
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    return { ok: true, ocupado: true, movidas: 0, liberadas: 0, conflictos: 0,
             importadas: 0, descartadas: 0, creados: 0, borrados: 0 };
  }

  try {
    // Si el código nuevo trae una columna que la hoja aún no tiene, se añade aquí:
    // es el sitio por el que pasa todo cada cuarto de hora
    asegurarHojaAlDia_();

    // Primero lo que Sara haya movido: si una clase de hoy se ha pasado a la tarde,
    // marcarla como dada por la hora de antes sería darla por hecha sin darse
    var vuelta = traerCambiosDelCalendario();

    // Lo que ya ha terminado deja de ser "próximo" y pasa a contar para las comisiones
    var dadas = marcarRealizadas();

    // Antes de importar: si no, lo que Sara acaba de borrar de la hoja vuelve a entrar
    var huerfanos = limpiarHuerfanos();

    var apuntadas = importarClasesDelCalendario();
    var ida       = sincronizarTodaLaAgenda();

    return {
      ok: true,
      movidas: (vuelta.movidas || []).length,
      liberadas: (vuelta.liberadas || []).length,
      conflictos: (vuelta.conflictos || []).length,
      importadas: (apuntadas.importadas || []).length,
      descartadas: (apuntadas.descartadas || []).length,
      realizadas: dadas.realizadas || 0,
      creados: ida.creados || 0,
      borrados: (ida.borrados || 0) + (huerfanos.borrados || 0)
    };
  } finally {
    lock.releaseLock();
  }
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

    // Queda apuntado cuándo pasó: es lo que mira accion=salud para saber que vive
    try {
      PropertiesService.getScriptProperties().setProperty('ultima_revision',
        Utilities.formatDate(ahora(), TZ, 'yyyy-MM-dd HH:mm:ss'));
    } catch (e) { /* sin permiso de propiedades: no es grave */ }
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

// --- Clases que Sara apunta a mano en el calendario -------------------------

/**
 * Un evento que empieza por "Clase" es una clase, no un bloqueo.
 *
 * Sara no siempre recibe las clases por el enlace: un alumno la llama, se la apunta
 * en el calendario y listo. Esos eventos tapaban la hora pero eran invisibles para el
 * sistema, así que no salían en el panel ni contaban para sus comisiones.
 *
 * Ahora se dan de alta como clases confirmadas. Se reconocen por el título, que es
 * el mismo lenguaje que ya usa el sistema al crear los suyos: "Clase · Marta Ruiz".
 * Todo lo demás que haya en el calendario sigue siendo un simple bloqueo de agenda.
 */
function esTituloDeClase_(titulo) {
  return /^clase\b/i.test(String(titulo || '').trim());
}

/**
 * Saca el nombre y, si viene, el tipo: "Clase · Marta Ruiz · Campo".
 * También entiende "Clase Marta Ruiz" y "Clase: Marta Ruiz".
 */
function partirTituloDeClase_(titulo) {
  var limpio = String(titulo || '').trim().replace(/^clase\b/i, '').trim();
  limpio = limpio.replace(/^[·:\-–—]\s*/, '');

  var trozos = limpio.split(/\s*[·|]\s*/);
  var nombre = (trozos[0] || '').trim();
  var tipo   = trozos.length > 1 ? tipoValido(trozos[trozos.length - 1]) : '';

  return { nombre: nombre || 'Sin nombre', tipo: tipo };
}

/**
 * Busca un móvil en la descripción del evento. Si no lo hay, la clase entra sin él.
 *
 * Primero mira detrás de las palabras que suelen anunciarlo, para no confundirse con
 * cualquier otro número que Sara haya escrito. Un móvil de Andorra son seis dígitos,
 * así que no se puede exigir que sea largo.
 */
function movilEnTexto_(texto) {
  var limpio = String(texto || '');

  var etiquetado = limpio.match(/(?:m[oó]vil|tel[eé]fono|tel|whatsapp|wasap)\D{0,3}([\d\s.\-+]{6,})/i);
  if (etiquetado) {
    var conEtiqueta = normalizarTelefono(etiquetado[1]);
    if (esMovilValido(conEtiqueta)) return conEtiqueta;
  }

  // Sin etiqueta, vale el primer número que parezca un móvil
  var sueltos = limpio.match(/\+?\d[\d\s.\-]{4,}/g) || [];
  for (var i = 0; i < sueltos.length; i++) {
    var candidato = normalizarTelefono(sueltos[i]);
    if (esMovilValido(candidato)) return candidato;
  }
  return '';
}

/**
 * Da de alta como clases los eventos que Sara haya apuntado a mano.
 * Devuelve las que ha creado.
 */
function importarClasesDelCalendario() {
  var cal;
  try {
    cal = calendarioDeClases_();
  } catch (e) {
    return { ok: false, error: 'No se pudo abrir el calendario.' };
  }

  var desde = ahora();
  var hasta = sumarDias(desde, configNum('semanas_vista', 2) * 7 + 7);

  var filas = filasComoObjetos(getHoja(HOJA_RESERVAS));
  var conocidos = {};
  filas.forEach(function (fila) {
    var id = String(fila.evento_id || '').trim();
    if (id) conocidos[id] = true;
  });

  // Los huecos que ya tienen clase: no puede entrar otra encima
  var ocupados = indexarDesdeFilas_(filas);

  var nuevas = [];
  var resumen = [];
  var descartadas = [];
  var sello  = Utilities.formatDate(ahora(), TZ, 'yyyy-MM-dd HH:mm:ss');
  var marca  = Utilities.formatDate(ahora(), TZ, 'yyyyMMddHHmmss');
  var tope   = false;

  cal.getEvents(desde, hasta).forEach(function (evento) {
    if (tope) return;
    if (evento.isAllDayEvent()) return;              // un día entero no es una clase
    if (!esTituloDeClase_(evento.getTitle())) return;
    if (conocidos[evento.getId()]) return;           // ya la tenemos
    if (esEventoDelSistema_(evento)) return;         // lo creamos nosotros, no es de Sara

    var fecha  = aFechaISO(evento.getStartTime());
    var inicio = aHoraHHMM(evento.getStartTime());
    var fin    = aHoraHHMM(evento.getEndTime());
    var datos  = partirTituloDeClase_(evento.getTitle());

    /*
     * Una clase repetida (una serie) no se puede seguir: todas sus instancias
     * comparten el mismo id y el sistema no sabría cuál mover o liberar. Se avisa a
     * Sara para que las apunte de una en una, y se deja como bloqueo.
     */
    if (esSerie_(evento)) {
      conocidos[evento.getId()] = true;
      descartadas.push({ nombre: datos.nombre, fecha: fecha, hora_inicio: inicio, motivo: 'serie' });
      return;
    }

    /*
     * Lo que ya haya a esa hora decide. Una clase confirmada del mismo alumno es el
     * reflejo de esta en el calendario, no una clase nueva: sin esta comprobación,
     * cualquier vínculo roto entre hoja y calendario se convierte en filas
     * duplicadas sin freno. Una confirmada de otro alumno es un choque que Sara
     * tiene que saber. Y una solicitud pendiente, que Sara no ve en su calendario,
     * pierde contra lo que ella apunta a mano.
     */
    var encima = quienHayEn_(filas, '', fecha, inicio, fin);
    var firmes = encima.filter(function (o) { return o.estado !== 'pendiente'; });
    if (firmes.length) {
      var mismoAlumno = firmes.some(function (o) {
        return slugDeEscuela_(o.nombre) === slugDeEscuela_(datos.nombre);
      });
      if (!mismoAlumno) {
        descartadas.push({ nombre: datos.nombre, fecha: fecha, hora_inicio: inicio,
                           motivo: 'choque', con: firmes[0].nombre });
      }
      return;
    }
    if (solapaConOcupado_(ocupados[fecha] || [], enMinutos(inicio), enMinutos(fin)) && !encima.length) {
      return;   // ya ha entrado otra en esta misma vuelta
    }

    if (nuevas.length >= MAX_POR_VUELTA) { tope = true; return; }

    encima.forEach(function (pendiente) {
      escribirEstado_(pendiente.fila, 'rechazada', 'Sara ha ocupado esa hora con otra clase');
      pendiente.fila.estado = 'rechazada';
      descartadas.push({ nombre: pendiente.nombre, fecha: fecha, hora_inicio: pendiente.hora_inicio,
                         motivo: 'pendiente', por: datos.nombre,
                         telefono: String(pendiente.fila.telefono || '').trim(),
                         cuando: reservaCompleta_(pendiente.fila).cuando });
    });
    conocidos[evento.getId()] = true;
    var movilDelEvento = movilEnTexto_(evento.getDescription());

    nuevas.push(filaParaHoja_({
      id: 'R' + marca + '-' + sufijoAleatorio().substring(0, 4),
      creado_en: sello, fecha: fecha, hora_inicio: inicio, hora_fin: fin,
      estado: 'confirmada', nombre: datos.nombre,
      telefono: movilDelEvento,
      notas: 'Apuntada en el calendario',
      actualizado_en: sello, avisado: 'SI', tipo: datos.tipo,
      categoria: movilDelEvento ? categoriaDelAlumno_(movilDelEvento, filas) : '',
      evento_id: evento.getId()
    }));

    // Queda ocupado ya, para que dos eventos solapados no entren los dos
    if (!ocupados[fecha]) ocupados[fecha] = [];
    ocupados[fecha].push({ inicio: enMinutos(inicio), fin: enMinutos(fin) });
    resumen.push({ nombre: datos.nombre, fecha: fecha, hora_inicio: inicio });
  });

  if (tope) avisarDelTope_('importar clases del calendario');
  if (descartadas.length) avisarDeDescartes_(descartadas);
  if (!nuevas.length) return { ok: true, importadas: [], descartadas: descartadas };

  var hoja = getHoja(HOJA_RESERVAS);
  hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, nuevas[0].length).setValues(nuevas);
  olvidarDisponibilidad();

  return { ok: true, importadas: resumen, descartadas: descartadas, tope: tope };
}

/** ¿Es una instancia de un evento repetido? Si el calendario no sabe decirlo, no. */
function esSerie_(evento) {
  try {
    return typeof evento.isRecurringEvent === 'function' && evento.isRecurringEvent() === true;
  } catch (e) {
    return false;
  }
}

/**
 * Lo que no ha podido entrar desde el calendario, por correo y una sola vez: una
 * clase repetida, una clase encima de otra ya confirmada, o una solicitud pendiente
 * que se ha rechazado porque Sara apuntó una clase a mano en su hora.
 */
function avisarDeDescartes_(descartadas) {
  var NL = String.fromCharCode(10);
  var cache = CacheService.getScriptCache();
  var lineas = [];

  descartadas.forEach(function (d) {
    var huella = 'descarte_' + d.motivo + '_' + slugDeEscuela_(d.nombre) + '_' + d.fecha + '_' + d.hora_inicio;
    if (cache.get(huella)) return;
    cache.put(huella, '1', 21600);

    if (d.motivo === 'serie') {
      lineas.push('· "Clase ' + d.nombre + '" del ' + fechaCercana(d.fecha) + ' a las ' + d.hora_inicio +
                  ' es un evento repetido. Las clases repetidas no se pueden seguir: apúntalas ' +
                  'de una en una. Mientras tanto, esa hora queda tapada pero la clase no sale ' +
                  'en tu panel ni en el parte.');
    } else if (d.motivo === 'choque') {
      lineas.push('· "Clase ' + d.nombre + '" del ' + fechaCercana(d.fecha) + ' a las ' + d.hora_inicio +
                  ' no ha entrado: a esa hora ya tienes confirmada a ' + d.con + '.');
    } else {
      lineas.push('· La solicitud de ' + d.nombre + ' (' + d.cuando + ') se ha rechazado porque ' +
                  'has apuntado a mano a ' + d.por + ' a esa hora. Escríbele para que elija otra' +
                  (d.telefono ? ': ' + d.telefono : '') + '.');
    }
  });

  if (!lineas.length) return;
  var destino = primerEmailAdmin_();
  if (!destino) return;

  enviarEmail_(destino, 'Revisa tu calendario: una clase apuntada a mano no cuadra',
    'Al leer las clases que has apuntado en el calendario ha pasado esto:' + NL + NL +
    lineas.join(NL + NL));
}
