/**
 * Alta, consulta y cambios de estado de las reservas.
 * Estados: pendiente -> confirmada | rechazada | cancelada
 *
 * Todo se hace leyendo la hoja una sola vez por operación. Leerla o escribirla cuesta
 * varias décimas de segundo cada vez, y hacerlo una vez por clase era lo que volvía
 * lentas tanto la reserva como la confirmación.
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

  var maximo = configNum('max_horas_por_reserva', 20);
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
    // Una sola lectura de la hoja y una sola consulta al calendario para todas las horas
    var ctx = crearContexto_(pedidos.map(function (p) { return p.fecha; }));

    var seguidas = validarSeguidas_(pedidos, telefono, ctx.filas, ctx);
    if (!seguidas.ok) return seguidas;

    var hoja     = getHoja(HOJA_RESERVAS);
    var sello    = Utilities.formatDate(ahora(), TZ, 'yyyy-MM-dd HH:mm:ss');
    var marca    = Utilities.formatDate(ahora(), TZ, 'yyyyMMddHHmmss');
    var grupo    = 'G' + marca + '-' + generarCodigo().substring(0, 4);
    var movil    = normalizarTelefono(telefono);
    var creadas  = [];
    var fallidas = [];
    var filas    = [];

    for (var p = 0; p < pedidos.length; p++) {
      var comprobacion = huecoLibreEn_(ctx, pedidos[p].fecha, pedidos[p].hora);
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
      // Se apunta ya, para que dos huecos iguales en la misma petición no se dupliquen
      if (!ctx.reservadas[pedidos[p].fecha]) ctx.reservadas[pedidos[p].fecha] = [];
      ctx.reservadas[pedidos[p].fecha].push({
        inicio: enMinutos(pedidos[p].hora),
        fin: enMinutos(comprobacion.tramo.hora_fin)
      });

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

    // Una sola escritura para todas las horas
    hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
    olvidarDisponibilidad();

    // El correo a Sara no se envía aquí: tarda casi un segundo y el alumno estaría
    // esperando por algo que no le afecta. Lo pide la página con la acción 'avisar'.

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
 * Nadie puede encadenar más de dos clases seguidas el mismo día: tres horas al volante
 * sin descanso no dan más aprendizaje y dejan sin huecos al resto.
 *
 * Cuentan también las clases que ese alumno ya tenga pedidas ese día, buscadas por su
 * móvil, para que no se salte la regla haciendo dos solicitudes seguidas.
 *
 * Horas sueltas del mismo día sí valen: 09:00 y 10:00 por la mañana y 16:00 por la
 * tarde son dos seguidas más una aparte, y eso está permitido.
 */
function validarSeguidas_(pedidos, telefono, filas, ctx) {
  var maximo = configNum('max_horas_seguidas', 2);
  var movil  = normalizarTelefono(telefono);
  var porDia = {};

  // Se comparan minutos, no horas: una clase de 90 minutos empieza a y media
  function apuntar(fecha, inicio, fin) {
    if (!porDia[fecha]) porDia[fecha] = {};
    porDia[fecha][inicio] = { inicio: enMinutos(inicio), fin: enMinutos(fin) };
  }

  pedidos.forEach(function (p) {
    apuntar(p.fecha, p.hora, finDeTramo_(ctx, p.fecha, p.hora));
  });

  (filas || filasComoObjetos(getHoja(HOJA_RESERVAS))).forEach(function (fila) {
    var estado = String(fila.estado).trim();
    if (estado !== 'pendiente' && estado !== 'confirmada') return;
    if (String(fila.telefono).trim() !== movil) return;
    var fecha = aFechaISO(fila.fecha);
    if (!porDia[fecha]) return;
    apuntar(fecha, aHoraHHMM(fila.hora_inicio), aHoraHHMM(fila.hora_fin));
  });

  var fechas = Object.keys(porDia);
  for (var i = 0; i < fechas.length; i++) {
    var bloques = Object.keys(porDia[fechas[i]]).map(function (k) { return porDia[fechas[i]][k]; });
    bloques.sort(function (a, b) { return a.inicio - b.inicio; });
    var racha = 1;

    for (var h = 1; h < bloques.length; h++) {
      // Seguidas = una empieza justo cuando acaba la anterior
      racha = (bloques[h].inicio === bloques[h - 1].fin) ? racha + 1 : 1;

      if (racha > maximo) {
        return {
          ok: false,
          motivo: 'seguidas',
          error: 'No se pueden dar más de ' + maximo + ' clases seguidas el mismo día. ' +
                 'Revisa el ' + fechaLarga(fechas[i]) + ': deja un hueco entre medias o ' +
                 'reparte las horas en otro día.'
        };
      }
    }
  }

  return { ok: true };
}

/** Hora de fin del tramo, según el horario. Si no se encuentra, se asume una hora. */
function finDeTramo_(ctx, fecha, horaInicio) {
  var horario = (ctx && ctx.horario) || leerHorarioBase_();
  var tramos = horario[diaSemanaIso(aDate(fecha, '00:00'))] || [];
  for (var i = 0; i < tramos.length; i++) {
    if (tramos[i].hora_inicio === horaInicio) return tramos[i].hora_fin;
  }
  return deMinutos(enMinutos(horaInicio) + 60);
}

/**
 * Consulta pública por código. Devuelve también las demás horas pedidas a la vez,
 * para que con un solo código el alumno vea toda su solicitud.
 */
function consultarPorCodigo(codigo) {
  codigo = String(codigo || '').trim().toUpperCase();
  if (codigo.length !== 6) return { ok: false, error: 'Código no válido.' };

  var filas = filasComoObjetos(getHoja(HOJA_RESERVAS));
  var fila  = null;
  for (var i = filas.length - 1; i >= 0; i--) {
    if (String(filas[i].codigo).trim().toUpperCase() === codigo) { fila = filas[i]; break; }
  }
  if (!fila) return { ok: false, error: 'No encontramos ninguna reserva con ese código.' };

  var grupo = String(fila.grupo || '').trim();
  var hermanas = grupo
    ? filas.filter(function (f) { return String(f.grupo || '').trim() === grupo; })
           .map(reservaPublica_)
    : [reservaPublica_(fila)];

  return { ok: true, reserva: reservaPublica_(fila), reservas: hermanas };
}

/*
 * El alumno no anula clases. Si no puede venir habla con Sara y es ella quien libera
 * la hora desde su panel: asi nadie deja un hueco muerto a ultima hora sin avisar, y
 * Sara se entera siempre de lo que pasa con su dia.
 */

// --- Acciones de Sara ------------------------------------------------------

/**
 * Confirma, rechaza o anula varias reservas de una vez, que es como Sara trabaja:
 * un alumno le pide tres horas y las responde juntas.
 */
function cambiarEstado(ids, nuevoEstado, motivo) {
  var lista = [].concat(ids || []).filter(Boolean);
  if (!lista.length) return { ok: false, error: 'No has elegido ninguna clase.' };

  var pedidos = {};
  lista.forEach(function (id) { pedidos[String(id).trim()] = true; });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return { ok: false, error: 'El sistema esta ocupado. Intentalo de nuevo.' };
  }

  try {
    var filas = filasComoObjetos(getHoja(HOJA_RESERVAS));
    var afectadas = [];
    var yaEstaban = [];
    var bloqueadas = [];
    var encontradas = 0;

    filas.forEach(function (fila) {
      if (!pedidos[String(fila.id).trim()]) return;
      encontradas++;

      var estado = String(fila.estado).trim();

      // Repetir lo ya hecho no es un error: Sara pudo tocar dos veces
      if (estado === nuevoEstado) { yaEstaban.push(fila); return; }

      var sePuede = (nuevoEstado === 'cancelada')
        ? (estado === 'pendiente' || estado === 'confirmada')
        : (estado === 'pendiente');

      if (!sePuede) { bloqueadas.push(estado); return; }
      afectadas.push(fila);
    });

    if (!encontradas) {
      return { ok: false, error: 'No encontramos esas clases. Pulsa Actualizar y vuelve a intentarlo.' };
    }

    if (!afectadas.length && !yaEstaban.length) {
      return {
        ok: false,
        error: 'No se puede: ' + (bloqueadas.length === 1
          ? 'esa clase esta como ' + bloqueadas[0] + '.'
          : 'esas clases estan como ' + bloqueadas.join(', ') + '.')
      };
    }

    afectadas.forEach(function (fila) {
      escribirEstado_(fila, nuevoEstado, motivo);
    });
    if (afectadas.length) olvidarDisponibilidad();

    /*
     * Se devuelven todas las clases que quedan en el estado pedido, no solo las que
     * han cambiado ahora. Si Sara marca tres y una ya estaba confirmada de antes,
     * el mensaje al alumno tiene que hablar de las tres: ella marco tres.
     */
    var resultado = afectadas.concat(yaEstaban).map(function (fila) {
      var copia = reservaCompleta_(fila);
      copia.estado = nuevoEstado;
      if (motivo) copia.motivo_rechazo = motivo;
      return copia;
    });

    resultado.sort(function (a, b) {
      return (a.fecha + a.hora_inicio) < (b.fecha + b.hora_inicio) ? -1 : 1;
    });

    return {
      ok: true,
      sin_cambios: afectadas.length === 0,
      cambiadas: afectadas.length,
      ignoradas: bloqueadas.length,
      reservas: resultado
    };

  } finally {
    lock.releaseLock();
  }
}

function confirmarReserva(id)        { return cambiarEstado(id, 'confirmada', ''); }
function rechazarReserva(id, motivo) { return cambiarEstado(id, 'rechazada', motivo); }
function anularReserva(id, motivo)   { return cambiarEstado(id, 'cancelada', motivo || 'Anulada por Sara'); }

function marcarAvisado(ids) {
  var lista = [].concat(ids || []).filter(Boolean);
  if (!lista.length) return { ok: false, error: 'Falta la reserva.' };

  var pedidos = {};
  lista.forEach(function (id) { pedidos[String(id).trim()] = true; });

  var hoja = getHoja(HOJA_RESERVAS);
  var columna = indiceCol_('avisado');

  filasComoObjetos(hoja).forEach(function (fila) {
    if (pedidos[String(fila.id).trim()]) hoja.getRange(fila._fila, columna).setValue('SI');
  });
  return { ok: true };
}

/**
 * Todo lo que el panel necesita, en una sola llamada y ya agrupado por alumno:
 * Sara ve "Marta Ruiz · 3 clases" y las responde juntas.
 */
function datosPanel() {
  var hoy   = hoyISO();
  var filas = filasComoObjetos(getHoja(HOJA_RESERVAS));

  var pendientes = [], proximas = [], recientes = [];

  filas.forEach(function (fila) {
    if (!fila.id) return;
    var r = reservaCompleta_(fila);

    if (r.estado === 'pendiente' && r.fecha >= hoy)        pendientes.push(r);
    else if (r.estado === 'confirmada' && r.fecha >= hoy)  proximas.push(r);
    else                                                   recientes.push(r);
  });

  recientes.sort(function (a, b) {
    return (a.fecha + a.hora_inicio) < (b.fecha + b.hora_inicio) ? 1 : -1;
  });

  return {
    ok: true,
    pendientes: agruparPorAlumno_(pendientes),
    proximas: agruparPorAlumno_(proximas),
    recientes: recientes.slice(0, 25),
    config: {
      nombre_sitio: config('nombre_sitio', 'Clases con Sara'),
      url_publica: config('url_publica', ''),
      url_api: config('url_api', ''),
      telefono_sara: config('telefono_sara', ''),
      calendar_id: config('calendar_id', ''),
      antelacion_minima_horas: configNum('antelacion_minima_horas', 6),
      horario: leerHorarioEditable(),
      // El panel compone los mensajes con estas plantillas, para que el texto sea
      // el mismo que enviaría una futura API de WhatsApp.
      plantillas: plantillasWhatsApp()
    }
  };
}

/** [{ telefono, nombre, notas, reservas: [...] }] ordenado por la clase más próxima. */
function agruparPorAlumno_(reservas) {
  var porTelefono = {};

  reservas.forEach(function (r) {
    if (!porTelefono[r.telefono]) {
      porTelefono[r.telefono] = {
        telefono: r.telefono,
        nombre: r.nombre,
        notas: '',
        reservas: []
      };
    }
    var grupo = porTelefono[r.telefono];
    grupo.reservas.push(r);
    if (r.notas && grupo.notas.indexOf(r.notas) === -1) {
      grupo.notas = grupo.notas ? grupo.notas + ' · ' + r.notas : r.notas;
    }
  });

  var salida = Object.keys(porTelefono).map(function (tel) {
    var grupo = porTelefono[tel];
    grupo.reservas.sort(function (a, b) {
      return (a.fecha + a.hora_inicio) < (b.fecha + b.hora_inicio) ? -1 : 1;
    });
    grupo.primera = grupo.reservas[0].fecha + grupo.reservas[0].hora_inicio;
    grupo.total = grupo.reservas.length;
    return grupo;
  });

  salida.sort(function (a, b) { return a.primera < b.primera ? -1 : 1; });
  return salida;
}

// --- Internas --------------------------------------------------------------

function indiceCol_(nombre) {
  return COLS_RESERVAS.indexOf(nombre) + 1;
}

/**
 * Escribe el cambio de estado de una fila con una sola llamada.
 * Antes eran tres escrituras sueltas por reserva, y cada una cuesta lo suyo.
 */
function escribirEstado_(fila, estado, motivo) {
  var hoja    = getHoja(HOJA_RESERVAS);
  var desde   = indiceCol_('estado');                     // de 'estado' hasta 'grupo'
  var ancho   = COLS_RESERVAS.length - desde + 1;
  var valores = hoja.getRange(fila._fila, desde, 1, ancho).getValues()[0];

  valores[0] = estado;
  valores[indiceCol_('actualizado_en') - desde] =
    Utilities.formatDate(ahora(), TZ, 'yyyy-MM-dd HH:mm:ss');
  valores[indiceCol_('avisado') - desde] = 'NO';
  if (motivo) valores[indiceCol_('motivo_rechazo') - desde] = motivo;

  hoja.getRange(fila._fila, desde, 1, ancho).setValues([valores]);
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
