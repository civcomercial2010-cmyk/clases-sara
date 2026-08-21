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
 * confirma o rechaza por separado.
 *
 * Si mientras rellenaba sus datos alguien le ha quitado una hora, se guardan las que
 * sigan libres y se le dice cuáles no han podido ser. Es preferible a perderlo todo.
 */
function crearReserva(datos) {
  var nombre   = String(datos.nombre || '').trim();
  var telefono = String(datos.telefono || '').trim();
  var notas    = String(datos.notas || '').trim().substring(0, 300);
  var escuela  = escuelaValida(datos.escuela);

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

    // Si el enlace no traia autoescuela, se hereda la de sus clases anteriores.
    // Tiene que resolverse antes de comprobar los huecos: de ella depende si hay
    // que contar el rato de ir de una autoescuela a otra.
    if (!escuela) escuela = escuelaDelAlumno_(telefono, ctx.filas);
    ctx.escuela = escuela;

    var seguidas = validarSeguidas_(pedidos, telefono, ctx.filas, ctx);
    if (!seguidas.ok) return seguidas;

    var hoja     = getHoja(HOJA_RESERVAS);
    var sello    = Utilities.formatDate(ahora(), TZ, 'yyyy-MM-dd HH:mm:ss');
    var marca    = Utilities.formatDate(ahora(), TZ, 'yyyyMMddHHmmss');
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

      // El sufijo aleatorio evita que dos reservas hechas en el mismo segundo
      // compartan identificador y Sara acabe confirmando la que no era.
      var id = 'R' + marca + '-' + sufijoAleatorio().substring(0, 4);

      filas.push(filaParaHoja_({
        id: id, creado_en: sello,
        fecha: pedidos[p].fecha, hora_inicio: pedidos[p].hora,
        hora_fin: comprobacion.tramo.hora_fin, estado: 'pendiente',
        nombre: nombre, telefono: movil, notas: notas,
        actualizado_en: sello, avisado: 'NO', escuela: escuela
      }));
      // Se apunta ya, para que dos huecos iguales en la misma petición no se dupliquen
      if (!ctx.reservadas[pedidos[p].fecha]) ctx.reservadas[pedidos[p].fecha] = [];
      ctx.reservadas[pedidos[p].fecha].push({
        inicio: enMinutos(pedidos[p].hora),
        fin: enMinutos(comprobacion.tramo.hora_fin),
        escuela: escuela
      });
      ctx.reservadas[pedidos[p].fecha].sort(function (a, b) { return a.inicio - b.inicio; });

      creadas.push({
        id: id,
        fecha: pedidos[p].fecha, hora_inicio: pedidos[p].hora,
        hora_fin: comprobacion.tramo.hora_fin, estado: 'pendiente',
        nombre: nombre, telefono: movil, notas: notas, escuela: escuela,
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
      ids: creadas.map(function (r) { return r.id; })
    };

  } catch (e) {
    return { ok: false, error: 'No se ha podido guardar la reserva. Inténtalo de nuevo.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Entre dos clases del mismo alumno y el mismo día tiene que haber un rato de por
 * medio: al volante se aprende poco encadenando horas, y así queda hueco para los
 * demás. Con clases de hora y media y una separación mínima de una hora, quien
 * quiera dos en un día las coge por la mañana y por la tarde.
 *
 * Cuentan también las clases que ese alumno ya tenga pedidas ese día, buscadas por
 * su móvil, para que no se salte la regla partiendo la solicitud en dos.
 */
function validarSeguidas_(pedidos, telefono, filas, ctx) {
  var separacion = configNum('separacion_minima_minutos', 60);
  if (separacion <= 0) return { ok: true };

  var movil  = normalizarTelefono(telefono);
  var porDia = {};

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

    for (var h = 1; h < bloques.length; h++) {
      var hueco = bloques[h].inicio - bloques[h - 1].fin;
      if (hueco < separacion) {
        return {
          ok: false,
          motivo: 'seguidas',
          error: 'No puedes coger dos clases tan seguidas. Entre una y otra tiene que ' +
                 'haber al menos ' + textoDeSeparacion_(separacion) + '. Revisa el ' +
                 fechaLarga(fechas[i]) + '.'
        };
      }
    }
  }

  return { ok: true };
}

/** '1 hora', '1 hora y media', '45 minutos'. */
function textoDeSeparacion_(minutos) {
  if (minutos < 60) return minutos + ' minutos';
  if (minutos === 60) return '1 hora';
  if (minutos === 90) return '1 hora y media';
  var horas = Math.round((minutos / 60) * 10) / 10;
  return String(horas).replace('.', ',') + ' horas';
}

/** Hora de fin del tramo, según el horario. Si no se encuentra, se asume una hora. */
/**
 * A qué hora acaba una clase que empieza a la hora indicada.
 * Todas duran lo mismo; Sara puede recortarla después, al confirmar.
 */
function finDeTramo_(ctx, fecha, horaInicio) {
  return deMinutos(enMinutos(horaInicio) + configNum('duracion_minutos', 90));
}

/**
 * Las clases de un alumno, buscadas por su móvil.
 *
 * Antes cada reserva llevaba un código que el alumno tenía que guardar. Sobraba: su
 * teléfono ya lo identifica, lo tiene siempre a mano y no hay nada que apuntar.
 */
function consultarPorTelefono(telefono) {
  var movil = normalizarTelefono(telefono);
  if (!esMovilValido(movil)) return { ok: false, error: 'Revisa el número de móvil.' };

  var hoy = hoyISO();
  var suyas = filasComoObjetos(getHoja(HOJA_RESERVAS))
    .filter(function (fila) {
      if (String(fila.telefono).trim() !== movil) return false;
      // Lo de hace más de una semana ya no le sirve de nada
      return aFechaISO(fila.fecha) >= Utilities.formatDate(sumarDias(ahora(), -7), TZ, 'yyyy-MM-dd');
    })
    .map(reservaPublica_)
    .sort(function (a, b) {
      return (a.fecha + a.hora_inicio) < (b.fecha + b.hora_inicio) ? -1 : 1;
    });

  if (!suyas.length) {
    return { ok: false, error: 'No encontramos clases con ese móvil.' };
  }
  return { ok: true, reservas: suyas };
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
/**
 * tipos es opcional: { idDeLaClase: 'Campo' }. Se guarda a la vez que el estado,
 * porque Sara elige campo o circulación en el mismo gesto de confirmar y el dato
 * tiene que estar antes de que la clase salte al calendario.
 */
function cambiarEstado(ids, nuevoEstado, motivo, tipos) {
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
      var tipo = tipos ? tipoValido(tipos[String(fila.id).trim()]) : '';
      if (tipo) {
        fila.tipo = tipo;
        getHoja(HOJA_RESERVAS).getRange(fila._fila, indiceCol_('tipo')).setValue(tipo);
      }
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

/**
 * Marca una clase como campo o calle. Sara lo hace desde su panel, cuando quiera:
 * antes de darla si ya lo sabe, o al acabar el dia. Con la cadena vacia se borra.
 */
function marcarTipo(ids, tipo) {
  var nombre = tipoValido(tipo);
  if (!nombre && String(tipo || '').trim() !== '') {
    return { ok: false, error: 'Ese tipo de clase no está en la lista.' };
  }
  tipo = nombre;

  var lista = [].concat(ids || []).filter(Boolean);
  if (!lista.length) return { ok: false, error: 'Falta la clase.' };

  var pedidos = {};
  lista.forEach(function (id) { pedidos[String(id).trim()] = true; });

  var hoja = getHoja(HOJA_RESERVAS);
  var columna = indiceCol_('tipo');
  var tocadas = 0;

  filasComoObjetos(hoja).forEach(function (fila) {
    if (!pedidos[String(fila.id).trim()]) return;
    hoja.getRange(fila._fila, columna).setValue(tipo);
    tocadas++;
  });

  if (!tocadas) return { ok: false, error: 'No encontramos esa clase.' };
  return { ok: true, tipo: tipo, tocadas: tocadas };
}

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
 * Las clases confirmadas que ya han terminado pasan a 'realizada'.
 *
 * Sara necesita distinguir de un vistazo lo que tiene por delante de lo que ya dio,
 * y a fin de mes son estas las que cuenta para sus comisiones. Lo hace sola la
 * revisión de cada cuarto de hora, así que nadie tiene que acordarse de nada.
 *
 * El evento del calendario NO se toca: la clase se dio y tiene que quedar en su
 * agenda. Quien borra eventos es el paso de sincronizar, y por eso allí 'realizada'
 * está excluida expresamente.
 */
function marcarRealizadas() {
  var hoja    = getHoja(HOJA_RESERVAS);
  var ahoraTs = ahora().getTime();
  var hoy     = hoyISO();
  var tocadas = 0;

  filasComoObjetos(hoja).forEach(function (fila) {
    if (String(fila.estado).trim() !== 'confirmada') return;

    var fecha = aFechaISO(fila.fecha);
    if (!fecha || fecha > hoy) return;                 // todavía está por llegar

    var fin = aDate(fecha, aHoraHHMM(fila.hora_fin) || '23:59').getTime();
    if (fin > ahoraTs) return;                         // aún no ha terminado

    escribirEstado_(fila, 'realizada', '');
    tocadas++;
  });

  if (tocadas) olvidarDisponibilidad();
  return { ok: true, realizadas: tocadas };
}

/**
 * Todo lo que el panel necesita, en una sola llamada.
 *
 * Las pendientes van agrupadas por alumno, que es como Sara las responde: marca las
 * tres de Marta y le manda un solo WhatsApp. Las próximas van en orden de agenda, de
 * la más cercana a la más lejana, porque eso es lo que mira cada mañana.
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

  /*
   * Las dos listas van en orden de reloj, la de antes primero.
   *
   * Las pendientes estuvieron agrupadas por alumno para poder mandarle un solo
   * WhatsApp con todas sus clases. Eso se conserva, pero lo hace el panel al
   * confirmar: junta por persona lo que Sara haya marcado, vengan del día que vengan.
   * Así la lista se lee como una agenda y el alumno sigue recibiendo un único aviso.
   */
  function porReloj(a, b) {
    return (a.fecha + a.hora_inicio) < (b.fecha + b.hora_inicio) ? -1 : 1;
  }
  pendientes.sort(porReloj);
  proximas.sort(porReloj);

  recientes.sort(function (a, b) {
    return (a.fecha + a.hora_inicio) < (b.fecha + b.hora_inicio) ? 1 : -1;
  });

  return {
    ok: true,
    pendientes: pendientes,
    proximas: proximas,
    recientes: recientes.slice(0, 25),
    config: {
      // Para saber de un vistazo si lo publicado es lo último que se pegó
      version: VERSION_CODIGO,
      nombre_sitio: config('nombre_sitio', 'Clases con Sara'),
      // Sara ve su propio titulo: el suyo y el del alumno no tienen por que ser el mismo
      nombre_panel: config('nombre_panel', 'Clases con Sarita'),
      url_publica: config('url_publica', ''),
      url_api: config('url_api', ''),
      telefono_sara: config('telefono_sara', ''),
      calendar_id: config('calendar_id', ''),
      antelacion_minima_horas: configNum('antelacion_minima_horas', 6),
      // Con esto el panel sabe qué ratos libres dan para una clase y para quién
      duracion_minima: configNum('duracion_minima_minutos', 45),
      traslado: configNum('traslado_minutos', 25),
      horario: leerHorarioEditable(),
      escuelas: listaDeEscuelas(),
      tipos: listaDeTipos(),
      enlaces_escuela: enlacesPorEscuela(),
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
    // Las clases que Sara apunta a mano pueden venir sin móvil: entonces manda
    // el nombre, para no juntar en una sola tarjeta a dos alumnos distintos
    var clave = r.telefono || ('n:' + r.nombre.toLowerCase());

    if (!porTelefono[clave]) {
      porTelefono[clave] = {
        clave: clave,
        telefono: r.telefono,
        nombre: r.nombre,
        notas: '',
        reservas: []
      };
    }
    var grupo = porTelefono[clave];
    grupo.reservas.push(r);
    if (r.notas && grupo.notas.indexOf(r.notas) === -1) {
      grupo.notas = grupo.notas ? grupo.notas + ' · ' + r.notas : r.notas;
    }
  });

  var salida = Object.keys(porTelefono).map(function (clave) {
    var grupo = porTelefono[clave];
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

/**
 * Dónde está de verdad cada columna, leído de la cabecera de la hoja.
 *
 * Antes esto se calculaba contando posiciones en COLS_RESERVAS, dando por supuesto
 * que la hoja tenía exactamente esas columnas y en ese orden. El día que la hoja tuvo
 * una columna de más, todas las escrituras se corrieron un sitio sin avisar: el
 * identificador del evento se guardaba en la casilla de al lado, el sistema no lo
 * encontraba nunca y volvía a crear el evento en cada revisión, cada quince minutos.
 *
 * La hoja manda. Si falta una columna se para en seco, que es infinitamente mejor
 * que seguir escribiendo en el sitio equivocado.
 */
var _cabecera = null;

function cabeceraReservas_() {
  if (_cabecera) return _cabecera;
  var hoja = getHoja(HOJA_RESERVAS);
  _cabecera = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1))
                  .getValues()[0]
                  .map(function (c) { return String(c).trim(); });
  return _cabecera;
}

/** Tras tocar la cabecera hay que volver a leerla. */
function olvidarCabecera_() { _cabecera = null; }

function indiceCol_(nombre) {
  var donde = cabeceraReservas_().indexOf(nombre);
  if (donde === -1) {
    throw new Error('A la hoja de reservas le falta la columna "' + nombre +
                    '". Ejecuta repararHoja() desde el editor.');
  }
  return donde + 1;
}

/**
 * Monta una fila con cada valor en su columna, sea cual sea el orden de la hoja.
 * Nunca escribir filas como una lista de valores a pelo: si la hoja tiene una
 * columna de más, se descuadra entera.
 */
function filaParaHoja_(valores) {
  return cabeceraReservas_().map(function (col) {
    return valores[col] !== undefined ? valores[col] : '';
  });
}

/**
 * Escribe el cambio de estado de una fila con una sola llamada.
 * Antes eran tres escrituras sueltas por reserva, y cada una cuesta lo suyo.
 */
function escribirEstado_(fila, estado, motivo) {
  var hoja     = getHoja(HOJA_RESERVAS);
  var cabecera = cabeceraReservas_();
  var desde    = indiceCol_('estado');                    // de 'estado' hasta el final
  var ancho    = cabecera.length - desde + 1;
  var valores  = hoja.getRange(fila._fila, desde, 1, ancho).getValues()[0];

  function poner(col, valor) {
    var donde = cabecera.indexOf(col);
    if (donde !== -1 && donde >= desde - 1) valores[donde - (desde - 1)] = valor;
  }

  poner('estado', estado);
  poner('actualizado_en', Utilities.formatDate(ahora(), TZ, 'yyyy-MM-dd HH:mm:ss'));
  poner('avisado', 'NO');
  if (motivo) poner('motivo_rechazo', motivo);

  hoja.getRange(fila._fila, desde, 1, ancho).setValues([valores]);
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
    fecha: fecha,
    etiqueta_fecha: fechaLarga(fecha),
    // Como se lo diría Sara por WhatsApp: 'mañana viernes 21, de 08:30 a 10:00'
    cuando: fechaCercana(fecha) + ', de ' + aHoraHHMM(fila.hora_inicio) +
            ' a ' + aHoraHHMM(fila.hora_fin),
    hora_inicio: aHoraHHMM(fila.hora_inicio),
    hora_fin: aHoraHHMM(fila.hora_fin),
    estado: String(fila.estado).trim(),
    nombre: String(fila.nombre).trim(),
    telefono: String(fila.telefono).trim(),
    notas: String(fila.notas || '').trim(),
    motivo_rechazo: String(fila.motivo_rechazo || '').trim(),
    tipo: String(fila.tipo || '').trim(),
    escuela: String(fila.escuela || '').trim(),
    avisado: String(fila.avisado).trim().toUpperCase() === 'SI',
    creado_en: String(fila.creado_en).trim()
  };
}

/** Versión sin datos de contacto, para respuestas públicas. */
function reservaPublica_(fila) {
  var r = reservaCompleta_(fila);
  return {
    fecha: r.fecha,
    etiqueta_fecha: r.etiqueta_fecha,
    hora_inicio: r.hora_inicio,
    hora_fin: r.hora_fin,
    estado: r.estado,
    nombre: r.nombre.split(' ')[0],
    motivo_rechazo: r.motivo_rechazo,
    // Para que el evento de calendario del alumno diga que clase es y donde
    tipo: r.tipo,
    escuela: r.escuela,
    ubicacion: ubicacionDeEscuela(r.escuela)
  };
}
