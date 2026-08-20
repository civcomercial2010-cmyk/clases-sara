/**
 * Revisión del sistema.
 *
 * Ejecutar diagnostico() desde el editor cuando algo no cuadre. No cambia nada:
 * solo mira y cuenta lo que encuentra. El resultado sale en el registro de ejecución.
 */

function diagnostico() {
  var lineas = ['REVISIÓN DEL SISTEMA', '===================='];

  lineas = lineas.concat(revisarArchivos_());
  lineas = lineas.concat(revisarConfig_());
  lineas = lineas.concat(revisarHoja_());
  lineas = lineas.concat(revisarReservas_());
  lineas = lineas.concat(revisarHorario_());
  lineas = lineas.concat(revisarCalendario_());

  var informe = lineas.join('\n');
  Logger.log(informe);
  return informe;
}

function revisarConfig_() {
  var lineas = ['', 'CONFIGURACIÓN'];
  var obligatorias = {
    email_admin: 'nadie podrá entrar al panel',
    telefono_sara: 'los alumnos no podrán escribirle',
    calendar_id: 'no se leerán sus bloqueos y se ofrecerán horas ocupadas',
    url_publica: 'los mensajes saldrán sin el enlace de reservas',
    url_api: 'no se podrá ofrecer el añadir al calendario'
  };

  Object.keys(obligatorias).forEach(function (clave) {
    var valor = config(clave, '');
    lineas.push(valor
      ? '  OK    ' + clave + ' = ' + valor
      : '  FALTA ' + clave + ' · ' + obligatorias[clave]);
  });

  return lineas;
}

function revisarHoja_() {
  var lineas = ['', 'HOJA DE RESERVAS'];
  var hoja = getHoja(HOJA_RESERVAS);
  var cabecera = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0];

  COLS_RESERVAS.forEach(function (col, i) {
    if (cabecera.indexOf(col) === -1) {
      lineas.push('  FALTA la columna "' + col + '" · vuelve a ejecutar instalar()');
    } else if (cabecera.indexOf(col) !== i) {
      lineas.push('  AVISO la columna "' + col + '" está en otra posición (' +
                  (cabecera.indexOf(col) + 1) + ' en vez de ' + (i + 1) + ')');
    }
  });

  if (lineas.length === 2) lineas.push('  OK    las ' + COLS_RESERVAS.length + ' columnas están en su sitio');
  return lineas;
}

function revisarReservas_() {
  var lineas = ['', 'RESERVAS'];
  var filas = filasComoObjetos(getHoja(HOJA_RESERVAS));
  var hoy = hoyISO();

  var porEstado = {};
  var vistosId = {};
  var idsRepetidos = [], sinId = [], estadosRaros = [];
  var choques = {}, dobles = [];
  var validos = { pendiente: 1, confirmada: 1, rechazada: 1, cancelada: 1 };

  filas.forEach(function (fila) {
    var id     = String(fila.id || '').trim();
    var estado = String(fila.estado || '').trim();

    if (!id) { sinId.push(fila._fila); return; }

    porEstado[estado] = (porEstado[estado] || 0) + 1;
    if (!validos[estado]) estadosRaros.push('fila ' + fila._fila + ': "' + estado + '"');

    if (vistosId[id]) idsRepetidos.push(id); else vistosId[id] = true;

    // Dos reservas activas a la misma hora serían una doble reserva
    if (estado === 'pendiente' || estado === 'confirmada') {
      var hueco = aFechaISO(fila.fecha) + ' ' + aHoraHHMM(fila.hora_inicio);
      if (choques[hueco]) dobles.push(hueco); else choques[hueco] = true;
    }
  });

  lineas.push('  Total: ' + filas.length + ' filas');
  Object.keys(porEstado).forEach(function (estado) {
    lineas.push('    ' + (estado || '(vacío)') + ': ' + porEstado[estado]);
  });

  apuntarProblema_(lineas, idsRepetidos, 'identificadores repetidos');
  apuntarProblema_(lineas, sinId, 'filas sin identificador');
  apuntarProblema_(lineas, estadosRaros, 'estados desconocidos');
  apuntarProblema_(lineas, dobles, 'HORAS CON DOS RESERVAS ACTIVAS');

  var futuras = filas.filter(function (f) {
    var estado = String(f.estado).trim();
    return (estado === 'pendiente' || estado === 'confirmada') && aFechaISO(f.fecha) >= hoy;
  });
  lineas.push('  Activas de hoy en adelante: ' + futuras.length);

  return lineas;
}

function revisarHorario_() {
  var lineas = ['', 'HORARIO'];
  var horario = leerHorarioBase_();
  var total = 0;

  for (var d = 1; d <= 7; d++) {
    var tramos = horario[d] || [];
    total += tramos.length;
    if (!tramos.length) continue;

    var duraciones = {};
    tramos.forEach(function (t) {
      duraciones[enMinutos(t.hora_fin) - enMinutos(t.hora_inicio)] = true;
    });

    lineas.push('  ' + nombreDia(d) + ': ' + tramos.length + ' clases · ' +
                tramos[0].hora_inicio + ' a ' + tramos[tramos.length - 1].hora_fin +
                ' · de ' + Object.keys(duraciones).join(' y ') + ' minutos');
  }

  if (!total) lineas.push('  FALTA no hay ninguna franja. Sara no puede recibir reservas.');

  // Clases activas que no encajan con el horario de ahora
  var sueltas = [];
  filasComoObjetos(getHoja(HOJA_RESERVAS)).forEach(function (fila) {
    var estado = String(fila.estado).trim();
    if (estado !== 'pendiente' && estado !== 'confirmada') return;
    var fecha = aFechaISO(fila.fecha);
    if (fecha < hoyISO()) return;

    var tramos = horario[diaSemanaIso(aDate(fecha, '00:00'))] || [];
    var hora = aHoraHHMM(fila.hora_inicio);
    var encaja = tramos.some(function (t) { return t.hora_inicio === hora; });
    if (!encaja) sueltas.push(fecha + ' ' + hora);
  });

  if (sueltas.length) {
    lineas.push('  AVISO ' + sueltas.length + ' clases activas ya no encajan en el horario actual:');
    lineas.push('        ' + sueltas.slice(0, 10).join(', '));
    lineas.push('        Se mantienen y Sara puede responderlas con normalidad.');
  }

  return lineas;
}

function revisarCalendario_() {
  var lineas = ['', 'CALENDARIO'];
  var calId = config('calendar_id', '');
  if (!calId) {
    lineas.push('  FALTA sin calendario configurado');
    return lineas;
  }

  var cal = CalendarApp.getCalendarById(calId);
  if (!cal) {
    lineas.push('  ERROR no se puede abrir el calendario. ¿Se ha borrado o se ha perdido el acceso?');
    return lineas;
  }

  var desde = ahora();
  var hasta = sumarDias(desde, 14);
  var eventos = cal.getEvents(desde, hasta);
  lineas.push('  OK    "' + cal.getName() + '" con ' + eventos.length +
              ' eventos en los próximos 14 días');

  lineas.push(revisionAutomaticaActiva()
    ? '  OK    revisión automática puesta, cada 15 minutos'
    : '  AVISO sin revisión automática. Lo que cambies en el calendario no se ' +
      'recogerá hasta que abras el panel. Se pone con activarRevisionAutomatica()');

  return lineas;
}

function apuntarProblema_(lineas, lista, texto) {
  if (!lista.length) return;
  lineas.push('  PROBLEMA ' + lista.length + ' ' + texto + ': ' + lista.slice(0, 10).join(', '));
}

/**
 * Archiva las reservas antiguas en otra pestaña.
 *
 * La hoja se lee entera en cada consulta, así que cuanto más corta, más rápido va
 * todo. Se conserva el histórico completo en 'Historico', que nadie consulta al vuelo.
 *
 * Ejecutar de vez en cuando, por ejemplo al empezar el curso. Por defecto archiva
 * lo de hace más de seis meses.
 */
function archivarAntiguas(meses) {
  var limite = Utilities.formatDate(sumarDias(ahora(), -30 * (meses || 6)), TZ, 'yyyy-MM-dd');
  var hoja   = getHoja(HOJA_RESERVAS);
  var filas  = filasComoObjetos(hoja);

  var viejas = filas.filter(function (fila) {
    return fila.id && aFechaISO(fila.fecha) < limite;
  });

  if (!viejas.length) {
    var nada = 'No hay nada anterior al ' + limite + ' que archivar.';
    Logger.log(nada);
    return nada;
  }

  var ss = getSpreadsheet();
  var historico = ss.getSheetByName('Historico');
  if (!historico) {
    historico = ss.insertSheet('Historico');
    historico.getRange(1, 1, 1, COLS_RESERVAS.length).setValues([COLS_RESERVAS])
             .setFontWeight('bold').setBackground('#5b6472').setFontColor('#ffffff');
    historico.setFrozenRows(1);
    historico.getRange('C:E').setNumberFormat('@');
  }

  var ancho = COLS_RESERVAS.length;
  var datos = viejas.map(function (fila) {
    return COLS_RESERVAS.map(function (col) { return fila[col] !== undefined ? fila[col] : ''; });
  });

  historico.getRange(historico.getLastRow() + 1, 1, datos.length, ancho).setValues(datos);

  // De abajo arriba, para que los números de fila no bailen al ir borrando
  viejas.sort(function (a, b) { return b._fila - a._fila; });
  viejas.forEach(function (fila) { hoja.deleteRow(fila._fila); });

  olvidarDisponibilidad();

  var resumen = viejas.length + ' reservas anteriores al ' + limite +
                ' movidas a la pestaña Historico. Quedan ' + (filas.length - viejas.length) +
                ' en la hoja de trabajo.';
  Logger.log(resumen);
  return resumen;
}

/**
 * Comprueba que están todos los archivos del proyecto.
 *
 * Al pegar el código a mano es fácil dejarse uno, y entonces algo falla en el peor
 * momento con un críptico "no está definida". Esto lo dice antes y con nombres.
 *
 * Si se añade una función importante a un archivo, conviene apuntarla aquí.
 */
function revisarArchivos_() {
  var lineas = ['', 'ARCHIVOS DEL PROYECTO'];

  var esperado = {
    '00_Base':         ['getHoja', 'config', 'aDate', 'fechaCercana', 'enMinutos', 'normalizarTelefono'],
    '01_Instalar':     ['instalar', 'asegurarColumnas_', 'bloquearMiercolesManana'],
    '02_Disponibilidad': ['obtenerDisponibilidad', 'crearContexto_', 'huecoLibreEn_', 'estaReservado_'],
    '03_Reservas':     ['crearReserva', 'cambiarEstado', 'datosPanel', 'marcarTipo', 'validarSeguidas_'],
    '04_Avisos':       ['plantillasWhatsApp', 'textoWhatsAppAlumno', 'avisarDeReservas'],
    '05_Api':          ['doGet', 'enrutar_', 'claveDelPanel_', 'enlaceDelPanel'],
    '06_Escuelas':     ['listaDeEscuelas', 'escuelaValida', 'listaDeTipos', 'ubicacionDeEscuela'],
    '07_Horario':      ['leerHorarioEditable', 'guardarHorario'],
    '08_Diagnostico':  ['diagnostico', 'archivarAntiguas'],
    '09_Agenda':       ['sincronizarAgenda', 'sincronizarTodaLaAgenda',
                        'traerCambiosDelCalendario', 'sincronizarTodo',
                        'revisionAutomatica', 'activarRevisionAutomatica',
                        'importarClasesDelCalendario'],
    '10_Resumen':      ['actualizarResumen', 'asegurarHojaResumen_']
  };

  var faltan = [];
  Object.keys(esperado).forEach(function (archivo) {
    var perdidas = esperado[archivo].filter(function (nombre) {
      return typeof globalThis[nombre] !== 'function';
    });

    if (perdidas.length) {
      faltan.push(archivo);
      lineas.push('  FALTA ' + archivo + ' · no está o quedó a medias (' +
                  perdidas.join(', ') + ')');
    }
  });

  if (!faltan.length) {
    lineas.push('  OK    los 10 archivos están completos');
  } else {
    lineas.push('        Pégalos de nuevo desde el repositorio y vuelve a publicar.');
  }

  return lineas;
}
