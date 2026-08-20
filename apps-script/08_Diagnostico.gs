/**
 * Revisión del sistema.
 *
 * Ejecutar diagnostico() desde el editor cuando algo no cuadre. No cambia nada:
 * solo mira y cuenta lo que encuentra. El resultado sale en el registro de ejecución.
 */

function diagnostico() {
  var lineas = ['REVISIÓN DEL SISTEMA', '===================='];

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
  var vistosId = {}, vistosCodigo = {};
  var idsRepetidos = [], codigosRepetidos = [], sinId = [], estadosRaros = [];
  var choques = {}, dobles = [];
  var validos = { pendiente: 1, confirmada: 1, rechazada: 1, cancelada: 1 };

  filas.forEach(function (fila) {
    var id     = String(fila.id || '').trim();
    var codigo = String(fila.codigo || '').trim();
    var estado = String(fila.estado || '').trim();

    if (!id) { sinId.push(fila._fila); return; }

    porEstado[estado] = (porEstado[estado] || 0) + 1;
    if (!validos[estado]) estadosRaros.push('fila ' + fila._fila + ': "' + estado + '"');

    if (vistosId[id]) idsRepetidos.push(id); else vistosId[id] = true;
    if (codigo) {
      if (vistosCodigo[codigo]) codigosRepetidos.push(codigo); else vistosCodigo[codigo] = true;
    }

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
  apuntarProblema_(lineas, codigosRepetidos, 'códigos repetidos');
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
              ' bloqueos en los próximos 14 días');

  return lineas;
}

function apuntarProblema_(lineas, lista, texto) {
  if (!lista.length) return;
  lineas.push('  PROBLEMA ' + lista.length + ' ' + texto + ': ' + lista.slice(0, 10).join(', '));
}
