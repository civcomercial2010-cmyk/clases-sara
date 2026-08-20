/**
 * Reparación y limpieza.
 *
 * Herramientas para ejecutar a mano desde el editor cuando algo se ha descuadrado.
 * No forman parte del día a día: están aquí para el día malo.
 *
 * El orden para recuperarse de una duplicación descontrolada es siempre el mismo:
 *
 *   1. pararTodo()           corta la revisión automática, deja de crecer
 *   2. repararHoja()         deja las columnas en su sitio
 *   3. limpiarDuplicados()   borra las copias, en la hoja y en el calendario
 *   4. sincronizarTodaLaAgenda()  vuelve a vincular cada clase con su evento
 *   5. activarRevisionAutomatica()   vuelve a arrancar
 */

/** Corta la revisión automática. Lo primero cuando algo se está desbocando. */
function pararTodo() {
  var quitados = desactivarRevisionAutomatica();
  var mensaje = quitados
    ? 'Revisión automática parada. Nada volverá a tocarse solo hasta que ejecutes activarRevisionAutomatica().'
    : 'No había ninguna revisión automática activa.';
  Logger.log(mensaje);
  return mensaje;
}

/**
 * Deja la hoja de reservas con las columnas que toca, en el orden que toca.
 *
 * Cada dato viaja por su nombre, así que nada se mezcla aunque las columnas estén
 * desordenadas o sobren. Las que ya no se usan se descartan, y antes se guarda una
 * copia entera de la hoja por si acaso.
 */
function repararHoja() {
  var hoja  = getHoja(HOJA_RESERVAS);
  var datos = hoja.getDataRange().getValues();
  var cabecera = datos[0].map(function (c) { return String(c).trim(); });

  var enOrden = cabecera.length === COLS_RESERVAS.length &&
                COLS_RESERVAS.every(function (col, i) { return cabecera[i] === col; });

  if (enOrden) {
    var nada = 'Las columnas ya están en su sitio. No hay nada que reparar.';
    Logger.log(nada);
    return nada;
  }

  var sobran = cabecera.filter(function (col) {
    return col && COLS_RESERVAS.indexOf(col) === -1;
  });

  // Copia de seguridad antes de tocar nada
  var ss = getSpreadsheet();
  var copia = 'Copia ' + Utilities.formatDate(ahora(), TZ, 'yyyy-MM-dd HHmm');
  hoja.copyTo(ss).setName(copia);

  var filas = datos.slice(1).map(function (fila) {
    var obj = {};
    cabecera.forEach(function (col, i) { obj[col] = fila[i]; });
    return COLS_RESERVAS.map(function (col) {
      return obj[col] !== undefined ? obj[col] : '';
    });
  });

  hoja.clear();
  hoja.getRange(1, 1, 1, COLS_RESERVAS.length).setValues([COLS_RESERVAS])
      .setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
  hoja.setFrozenRows(1);
  hoja.getRange('C:E').setNumberFormat('@');

  if (filas.length) {
    hoja.getRange(2, 1, filas.length, COLS_RESERVAS.length).setValues(filas);
  }

  ocultarColumnasTecnicas_(hoja);
  olvidarCabecera_();
  olvidarDisponibilidad();

  var informe = 'Hoja reparada. ' + filas.length + ' reservas conservadas.' +
                (sobran.length ? '\nColumnas retiradas: ' + sobran.join(', ') + '.' : '') +
                '\nCopia de seguridad en la pestaña "' + copia + '".';
  Logger.log(informe);
  return informe;
}

/**
 * Borra las copias sobrantes de una misma clase, en la hoja y en el calendario.
 *
 * Dos clases son la misma si coinciden el día, la hora de inicio y el alumno. De cada
 * grupo se conserva la más antigua, que es la de verdad; las demás son las que fue
 * dejando el fallo. En el calendario, igual: mismo día, misma hora y mismo título.
 *
 * Se puede ejecutar las veces que haga falta. Si hay muchísimo que borrar puede que
 * se quede a medias por tiempo: se vuelve a ejecutar y sigue donde lo dejó.
 */
function limpiarDuplicados() {
  var lineas = ['LIMPIEZA DE DUPLICADOS', '======================'];
  lineas = lineas.concat(limpiarFilasDuplicadas_());
  lineas = lineas.concat(limpiarEventosDuplicados_());

  olvidarDisponibilidad();

  var informe = lineas.join('\n');
  Logger.log(informe);
  return informe;
}

function limpiarFilasDuplicadas_() {
  var lineas = ['', 'EN LA HOJA'];
  var hoja  = getHoja(HOJA_RESERVAS);
  var filas = filasComoObjetos(hoja);

  var vistos = {};
  var sobran = [];

  filas.forEach(function (fila) {
    var estado = String(fila.estado).trim();
    if (estado !== 'pendiente' && estado !== 'confirmada') return;

    var clave = aFechaISO(fila.fecha) + ' ' + aHoraHHMM(fila.hora_inicio) + ' ' +
                String(fila.nombre || '').trim().toLowerCase();

    if (vistos[clave]) sobran.push(fila); else vistos[clave] = fila;
  });

  if (!sobran.length) {
    lineas.push('  No hay reservas duplicadas.');
    return lineas;
  }

  /*
   * Se reescribe la hoja entera de una vez en lugar de ir borrando fila a fila.
   * Borrar cientos de filas de una en una tarda más de los seis minutos que Apps
   * Script concede, y se quedaría a medias justo cuando más falta hace.
   */
  var fuera = {};
  sobran.forEach(function (fila) { fuera[fila._fila] = true; });

  var cabecera = cabeceraReservas_();
  var buenas = filas
    .filter(function (fila) { return !fuera[fila._fila]; })
    .map(function (fila) {
      return cabecera.map(function (col) {
        return fila[col] !== undefined ? fila[col] : '';
      });
    });

  var ultima = hoja.getLastRow();
  if (ultima > 1) hoja.getRange(2, 1, ultima - 1, cabecera.length).clearContent();
  if (buenas.length) {
    hoja.getRange(2, 1, buenas.length, cabecera.length).setValues(buenas);
  }

  lineas.push('  Borradas ' + sobran.length + ' reservas duplicadas.');
  lineas.push('  Quedan ' + buenas.length + ' filas, con ' +
              Object.keys(vistos).length + ' clases activas distintas.');
  return lineas;
}

function limpiarEventosDuplicados_() {
  var lineas = ['', 'EN EL CALENDARIO'];

  var cal;
  try {
    cal = calendarioDeClases_();
  } catch (e) {
    lineas.push('  No se pudo abrir el calendario.');
    return lineas;
  }

  var desde = sumarDias(ahora(), -1);
  var hasta = sumarDias(ahora(), 120);

  var vistos = {};
  var sobran = [];

  cal.getEvents(desde, hasta).forEach(function (evento) {
    if (evento.isAllDayEvent()) return;
    if (!esTituloDeClase_(evento.getTitle())) return;   // los bloqueos no se tocan

    var clave = evento.getTitle() + ' · ' +
                Utilities.formatDate(evento.getStartTime(), TZ, 'yyyy-MM-dd HH:mm');

    if (vistos[clave]) sobran.push(evento); else vistos[clave] = true;
  });

  if (!sobran.length) {
    lineas.push('  No hay eventos duplicados.');
    return lineas;
  }

  var borrados = 0;
  var arranque = ahora().getTime();
  var quedan = 0;

  for (var i = 0; i < sobran.length; i++) {
    // Apps Script corta a los seis minutos: se para antes y se avisa
    if (ahora().getTime() - arranque > 240000) { quedan = sobran.length - i; break; }
    try {
      sobran[i].deleteEvent();
      borrados++;
    } catch (e) { /* ya no estaba */ }
  }

  lineas.push('  Borrados ' + borrados + ' eventos duplicados.');
  lineas.push('  Quedan ' + Object.keys(vistos).length + ' clases distintas en el calendario.');
  if (quedan) {
    lineas.push('  AVISO faltan ' + quedan + ' por borrar. Vuelve a ejecutar limpiarDuplicados().');
  }

  return lineas;
}
