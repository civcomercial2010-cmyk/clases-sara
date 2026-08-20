/**
 * Alta, consulta y cambios de estado de las reservas.
 * Estados: pendiente -> confirmada | rechazada | cancelada
 */

/**
 * Crea una solicitud de una o varias horas de golpe.
 *
 * El alumno elige los huecos que quiera, escribe su nombre y su móvil una sola vez y
 * todas las horas entran juntas. Cada una es una reserva independiente que Sara
 * confirma o rechaza por separado, pero comparten grupo para que él las vea juntas.
 *
 * Si mientras rellenaba sus datos alguien le ha quitado una hora, se guardan las que
 * sigan libres y se le dice cuáles no han podido ser. Es preferible a perderlo todo.
 */
function crearReserva(datos) {
  var nombre   = String(datos.nombre || '').trim();
  var telefono = String(datos.telefono || '').trim();
  var notas    = String(datos.notas || '').trim().substring(0, 300);

  if (nombre.length < 3)        return { ok: false, error: 'Escribe tu nombre y apellido.' };
  if (!esMovilValido(telefono)) return { ok: false, error: 'Revisa el número de móvil.' };

  var huecos = datos.huecos;
  if (!huecos || !huecos.length) {
    // Compatibilidad con la forma antigua, de una sola hora
    if (datos.fecha && datos.hora_inicio) {
      huecos = [{ fecha: datos.fecha, hora_inicio: datos.hora_inicio }];
    } else {
      return { ok: false, error: 'No has elegido ninguna hora.' };
    }
  }

  var maximo = configNum('max_horas_por_reserva', 6);
  if (huecos.length > maximo) {
    return { ok: false, error: 'Puedes pedir hasta ' + maximo + ' horas de una vez.' };
  }

  var minHoras = configNum('antelacion_minima_horas', 6);
  var limite   = ahora().getTime() + minHoras * 3600 * 1000;

  // Validaciones que no necesitan tocar la hoja: fuera del bloqueo
  var pedidos = [];
  for (var i = 0; i < huecos.length; i++) {
    var fecha = String(huecos[i].fecha || '').trim();
    var hora  = aHoraHHMM(huecos[i].hora_inicio || '');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) {
      return { ok: false, error: 'Alguna de las horas elegidas no es válida.' };
    }
    if (aDate(fecha, hora).getTime() < limite) {
      return {
        ok: false,
        motivo: 'antelacion',
        error: 'Para el ' + fechaLarga(fecha) + ' a las ' + hora + ' quedan menos de ' +
               minHoras + ' horas. Escríbele a Sara por WhatsApp para consultarle.',
        telefono_sara: config('telefono_sara', '')
      };
    }
    pedidos.push({ fecha: fecha, hora: hora });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { ok: false, error: 'El sistema está ocupado. Inténtalo de nuevo en unos segundos.' };
  }

  try {
    var hoja     = getHoja(HOJA_RESERVAS);
    var sello    = Utilities.formatDate(ahora(), TZ, 'yyyy-MM-dd HH:mm:ss');
    var marca    = Utilities.formatDate(ahora(), TZ, 'yyyyMMddHHmmss');
    var grupo    = 'G' + marca + '-' + generarCodigo().substring(0, 4);
    var movil    = normalizarTelefono(telefono);
    var creadas  = [];
    var fallidas = [];
    var filas    = [];

    for (var p = 0; p < pedidos.length; p++) {
      var comprobacion = huecoSigueLibre_(pedidos[p].fecha, pedidos[p].hora);
      if (!comprobacion.ok) {
        fallidas.push({
          fecha: pedidos[p].fecha,
          etiqueta_fecha: fechaLarga(pedidos[p].fecha),
          hora_inicio: pedidos[p].hora,
          error: comprobacion.error
        });
        continue;
      }

      var codigo = generarCodigo();
      // El sufijo aleatorio evita que dos reservas hechas en el mismo segundo
      // compartan identificador y Sara acabe confirmando la que no era.
      var id = 'R' + marca + '-' + generarCodigo().substring(0, 4);

      filas.push([id, sello, pedidos[p].fecha, pedidos[p].hora, comprobacion.tramo.hora_fin,
                  'pendiente', nombre, movil, notas, codigo, sello, 'NO', '', grupo]);

      creadas.push({
        id: id, codigo: codigo, grupo: grupo,
        fecha: pedidos[p].fecha, hora_inicio: pedidos[p].hora,
        hora_fin: comprobacion.tramo.hora_fin, estado: 'pendiente',
        nombre: nombre, telefono: movil, notas: notas,
        etiqueta_fecha: fechaLarga(pedidos[p].fecha)
      });
    }

    if (!creadas.length) {
      return { ok: false, error: fallidas.length ? fallidas[0].error : 'No se pudo reservar.' };
    }

    // Una sola escritura para todas las horas: es lo que más tarda de la operación
    hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
    olvidarDisponibilidad();

    avisarSaraNuevaSolicitud(creadas);

    return {
      ok: true,
      reserva: creadas[0],       // compatibilidad
      reservas: creadas,
      fallidas: fallidas,
      codigo: creadas[0].codigo,
      grupo: grupo
    };

  } catch (e) {
    return { ok: false, error: 'No se ha podido guardar la reserva. Inténtalo de nuevo.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Consulta pública por código. Devuelve también las demás horas pedidas a la vez,
 * para que con un solo código el alumno vea toda su solicitud.
 */
function consultarPorCodigo(codigo) {
  codigo = String(codigo || '').trim().toUpperCase();
  if (codigo.length !== 6) return { ok: false, error: 'Código no válido.' };

  var fila = buscarPorCodigo_(codigo);
  if (!fila) return { ok: false, error: 'No encontramos ninguna reserva con ese código.' };

  var grupo = String(fila.grupo || '').trim();
  var hermanas = [];
  if (grupo) {
    filasComoObjetos(getHoja(HOJA_RESERVAS)).forEach(function (otra) {
      if (String(otra.grupo || '').trim() === grupo) hermanas.push(reservaPublica_(otra));
    });
  }
  if (!hermanas.length) hermanas = [reservaPublica_(fila)];

  return { ok: true, reserva: reservaPublica_(fila), reservas: hermanas };
}

/** Cancelación por parte del alumno, usando su código. */
function cancelarPorCodigo(codigo) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { ok: false, error: 'El sistema está ocupado. Inténtalo de nuevo.' };
  }

  try {
    var fila = buscarPorCodigo_(String(codigo || '').trim().toUpperCase());
    if (!fila) return { ok: false, error: 'No encontramos ninguna reserva con ese código.' };

    var estado = String(fila.estado).trim();
    if (estado !== 'pendiente' && estado !== 'confirmada') {
      return { ok: false, error: 'Esa reserva ya no está activa.' };
    }

    var fecha  = aFechaISO(fila.fecha);
    var hora   = aHoraHHMM(fila.hora_inicio);
    var margen = aDate(fecha, hora).getTime() - ahora().getTime();
    var tardia = margen < configNum('cancelacion_horas', 24) * 3600 * 1000;

    actualizarEstado_(fila._fila, 'cancelada',
      tardia ? 'Cancelada por el alumno (tardía)' : 'Cancelada por el alumno');
    avisarSaraCancelacion(reservaCompleta_(fila), tardia);

    return { ok: true, cancelacion_tardia: tardia };
  } finally {
    lock.releaseLock();
  }
}

// --- Acciones de Sara ------------------------------------------------------

function confirmarReserva(id) {
  var fila = buscarPorId_(id);
  if (!fila) return { ok: false, error: 'Reserva no encontrada.' };
  if (String(fila.estado).trim() !== 'pendiente') {
    return { ok: false, error: 'Esa reserva ya no está pendiente.' };
  }
  actualizarEstado_(fila._fila, 'confirmada', '');
  return { ok: true, reserva: reservaCompleta_(buscarPorId_(id)) };
}

function rechazarReserva(id, motivo) {
  var fila = buscarPorId_(id);
  if (!fila) return { ok: false, error: 'Reserva no encontrada.' };
  if (String(fila.estado).trim() !== 'pendiente') {
    return { ok: false, error: 'Esa reserva ya no está pendiente.' };
  }
  actualizarEstado_(fila._fila, 'rechazada', String(motivo || '').substring(0, 200));
  return { ok: true, reserva: reservaCompleta_(buscarPorId_(id)) };
}

/** Sara anula una clase ya confirmada. */
function anularReserva(id, motivo) {
  var fila = buscarPorId_(id);
  if (!fila) return { ok: false, error: 'Reserva no encontrada.' };
  actualizarEstado_(fila._fila, 'cancelada', String(motivo || 'Anulada por Sara').substring(0, 200));
  return { ok: true, reserva: reservaCompleta_(buscarPorId_(id)) };
}

function marcarAvisado(id) {
  var fila = buscarPorId_(id);
  if (!fila) return { ok: false, error: 'Reserva no encontrada.' };
  getHoja(HOJA_RESERVAS).getRange(fila._fila, indiceCol_('avisado')).setValue('SI');
  return { ok: true };
}

/** Todo lo que el panel de Sara necesita en una sola llamada. */
function datosPanel() {
  var hoy   = hoyISO();
  var filas = filasComoObjetos(getHoja(HOJA_RESERVAS));

  var pendientes = [], proximas = [], recientes = [];

  filas.forEach(function (fila) {
    if (!fila.id) return;
    var r      = reservaCompleta_(fila);
    var estado = r.estado;

    if (estado === 'pendiente' && r.fecha >= hoy) {
      pendientes.push(r);
    } else if (estado === 'confirmada' && r.fecha >= hoy) {
      proximas.push(r);
    } else {
      recientes.push(r);
    }
  });

  var porFechaHora = function (a, b) {
    return (a.fecha + a.hora_inicio) < (b.fecha + b.hora_inicio) ? -1 : 1;
  };
  pendientes.sort(porFechaHora);
  proximas.sort(porFechaHora);
  recientes.sort(function (a, b) { return porFechaHora(b, a); });

  return {
    ok: true,
    pendientes: pendientes,
    proximas: proximas,
    recientes: recientes.slice(0, 25),
    config: {
      nombre_sitio: config('nombre_sitio', 'Clases con Sara'),
      url_publica: config('url_publica', ''),
      telefono_sara: config('telefono_sara', ''),
      calendar_id: config('calendar_id', ''),
      antelacion_minima_horas: configNum('antelacion_minima_horas', 6),
      // El panel compone los mensajes con estas plantillas, para que el texto
      // sea el mismo que enviaría una futura API de WhatsApp.
      plantillas: plantillasWhatsApp()
    }
  };
}

// --- Internas --------------------------------------------------------------

function indiceCol_(nombre) {
  return COLS_RESERVAS.indexOf(nombre) + 1;
}

function actualizarEstado_(numFila, estado, motivo) {
  olvidarDisponibilidad(); // una hora rechazada o anulada vuelve a estar libre
  var hoja = getHoja(HOJA_RESERVAS);
  hoja.getRange(numFila, indiceCol_('estado')).setValue(estado);
  hoja.getRange(numFila, indiceCol_('actualizado_en'))
      .setValue(Utilities.formatDate(ahora(), TZ, 'yyyy-MM-dd HH:mm:ss'));
  if (motivo) hoja.getRange(numFila, indiceCol_('motivo_rechazo')).setValue(motivo);
  hoja.getRange(numFila, indiceCol_('avisado')).setValue('NO');
}

function buscarPorCodigo_(codigo) {
  var filas = filasComoObjetos(getHoja(HOJA_RESERVAS));
  for (var i = filas.length - 1; i >= 0; i--) {
    if (String(filas[i].codigo).trim().toUpperCase() === codigo) return filas[i];
  }
  return null;
}

function buscarPorId_(id) {
  id = String(id || '').trim();
  var filas = filasComoObjetos(getHoja(HOJA_RESERVAS));
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].id).trim() === id) return filas[i];
  }
  return null;
}

function reservaCompleta_(fila) {
  var fecha = aFechaISO(fila.fecha);
  return {
    id: String(fila.id).trim(),
    codigo: String(fila.codigo).trim(),
    grupo: String(fila.grupo || '').trim(),
    fecha: fecha,
    etiqueta_fecha: fechaLarga(fecha),
    hora_inicio: aHoraHHMM(fila.hora_inicio),
    hora_fin: aHoraHHMM(fila.hora_fin),
    estado: String(fila.estado).trim(),
    nombre: String(fila.nombre).trim(),
    telefono: String(fila.telefono).trim(),
    notas: String(fila.notas || '').trim(),
    motivo_rechazo: String(fila.motivo_rechazo || '').trim(),
    avisado: String(fila.avisado).trim().toUpperCase() === 'SI',
    creado_en: String(fila.creado_en).trim()
  };
}

/** Versión sin datos de contacto, para respuestas públicas. */
function reservaPublica_(fila) {
  var r = reservaCompleta_(fila);
  return {
    codigo: r.codigo,
    fecha: r.fecha,
    etiqueta_fecha: r.etiqueta_fecha,
    hora_inicio: r.hora_inicio,
    hora_fin: r.hora_fin,
    estado: r.estado,
    nombre: r.nombre.split(' ')[0],
    motivo_rechazo: r.motivo_rechazo
  };
}
