/**
 * Cálculo de huecos libres.
 *
 * LIBRE = horario base del día
 *         − eventos del calendario "Clases – disponibilidad"
 *         − reservas pendientes o confirmadas
 *         − franjas dentro de la antelación mínima  (se muestran como "urgente")
 */

/**
 * Devuelve los días con sus franjas desde hoy hasta el final de la semana que viene.
 *
 * No son "catorce días", sino semanas naturales: lo que queda de esta semana más la
 * siguiente entera. Así un viernes se ven dos días y la semana que viene completa,
 * en vez de un trozo suelto de tres semanas distintas.
 */
function obtenerDisponibilidad() {
  // Consultar la hoja y el calendario cuesta unos tres segundos, y varios alumnos
  // mirando a la vez piden exactamente lo mismo. Se guarda medio minuto; al reservar
  // se vuelve a comprobar contra los datos reales, así que nadie pilla un hueco muerto.
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('disponibilidad');
  if (guardado) return JSON.parse(guardado);

  var respuesta = calcularDisponibilidad_();
  cache.put('disponibilidad', JSON.stringify(respuesta), 30);
  return respuesta;
}

/** Se llama al reservar, cancelar o cambiar el estado de una reserva. */
function olvidarDisponibilidad() {
  CacheService.getScriptCache().remove('disponibilidad');
}

function calcularDisponibilidad_() {
  var minHoras  = configNum('antelacion_minima_horas', 6);
  var ahoraTs   = ahora().getTime();
  var limiteTs  = ahoraTs + minHoras * 3600 * 1000;

  var desde     = ahora();
  var diaHoy    = diaSemanaIso(desde);      // 1 = lunes … 7 = domingo
  var semanasExtra = configNum('semanas_vista', 2) - 1;
  var totalDias = (7 - diaHoy) + (semanasExtra * 7) + 1;
  var hasta     = sumarDias(desde, totalDias);

  var horario  = leerHorarioBase_();
  var ocupados = leerEventosOcupados_(desde, hasta);
  var reservas = indexarReservasActivas_();

  var dias = [];
  for (var i = 0; i < totalDias; i++) {
    var dia     = sumarDias(desde, i);
    var fecha   = Utilities.formatDate(dia, TZ, 'yyyy-MM-dd');
    var diaSem  = diaSemanaIso(dia);
    var tramos  = horario[diaSem] || [];
    if (tramos.length === 0) continue;

    var franjas = [];
    for (var t = 0; t < tramos.length; t++) {
      var hi = tramos[t].hora_inicio;
      var hf = tramos[t].hora_fin;
      var inicio = aDate(fecha, hi).getTime();
      var fin    = aDate(fecha, hf).getTime();

      if (fin <= ahoraTs) continue;                                  // ya pasó
      if (estaReservado_(reservas, fecha, hi, hf)) continue;          // ocupada por reserva
      if (solapaConOcupado_(ocupados, inicio, fin)) continue;        // Sara la bloqueó

      franjas.push({
        hora_inicio: hi,
        hora_fin: hf,
        estado: inicio < limiteTs ? 'urgente' : 'libre'
      });
    }

    if (franjas.length > 0) {
      dias.push({
        fecha: fecha,
        etiqueta: fechaLarga(fecha),
        dia_nombre: nombreDia(diaSem),
        dia_num: dia.getDate(),
        es_hoy: fecha === hoyISO(),
        // 0 = lo que queda de esta semana, 1 = la semana que viene, etc.
        semana: Math.floor((i + diaHoy - 1) / 7),
        franjas: franjas
      });
    }
  }

  return {
    dias: dias,
    antelacion_minima_horas: minHoras,
    cancelacion_horas: configNum('cancelacion_horas', 24),
    max_por_reserva: configNum('max_horas_por_reserva', 20),
    separacion_minima: configNum('separacion_minima_minutos', 60),
    telefono_sara: config('telefono_sara', ''),
    nombre_sitio: config('nombre_sitio', 'Clases con Sara')
  };
}

/**
 * Contexto compartido para validar varias horas de una vez.
 *
 * Comprobar cada hora por separado significaba preguntar al calendario de Google una
 * vez por hora, y eso cuesta más de un segundo cada vez: siete horas tardaban veinte
 * segundos. Aquí se lee todo una sola vez para el rango completo y después las
 * comprobaciones se hacen en memoria.
 */
function crearContexto_(fechas) {
  var ordenadas = fechas.slice().sort();
  var desde = aDate(ordenadas[0], '00:00');
  var hasta = sumarDias(aDate(ordenadas[ordenadas.length - 1], '00:00'), 1);
  var filas = filasComoObjetos(getHoja(HOJA_RESERVAS));

  return {
    horario:    leerHorarioBase_(),
    ocupados:   leerEventosOcupados_(desde, hasta),
    filas:      filas,
    reservadas: indexarDesdeFilas_(filas)
  };
}

/** ¿Está libre este hueco, según lo ya leído? Sin tocar la hoja ni el calendario. */
function huecoLibreEn_(ctx, fecha, horaInicio) {
  var tramos = ctx.horario[diaSemanaIso(aDate(fecha, '00:00'))] || [];

  var tramo = null;
  for (var i = 0; i < tramos.length; i++) {
    if (tramos[i].hora_inicio === horaInicio) { tramo = tramos[i]; break; }
  }
  if (!tramo) return { ok: false, error: 'Esa hora no está dentro del horario de clases.' };

  var inicio = aDate(fecha, tramo.hora_inicio).getTime();
  var fin    = aDate(fecha, tramo.hora_fin).getTime();

  if (fin <= ahora().getTime()) return { ok: false, error: 'Esa hora ya ha pasado.' };
  if (solapaConOcupado_(ctx.ocupados, inicio, fin)) {
    return { ok: false, error: 'Sara ya no tiene libre esa hora.' };
  }
  if (estaReservado_(ctx.reservadas, fecha, tramo.hora_inicio, tramo.hora_fin)) {
    return { ok: false, error: 'Justo acaban de reservar esa hora. Elige otra, por favor.' };
  }

  return { ok: true, tramo: tramo };
}

/** { 1: [{hora_inicio, hora_fin}, ...], ... } solo tramos activos. */
function leerHorarioBase_() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('horario');
  if (guardado) return JSON.parse(guardado);

  var porDia = {};
  filasComoObjetos(getHoja(HOJA_HORARIO)).forEach(function (fila) {
    var activo = String(fila.activo).trim().toUpperCase();
    if (activo !== 'SI' && activo !== 'SÍ' && activo !== 'TRUE' && activo !== '1') return;
    var dia = Number(fila.dia_semana);
    if (!dia) return;
    if (!porDia[dia]) porDia[dia] = [];
    porDia[dia].push({
      hora_inicio: aHoraHHMM(fila.hora_inicio),
      hora_fin: aHoraHHMM(fila.hora_fin)
    });
  });
  Object.keys(porDia).forEach(function (dia) {
    porDia[dia].sort(function (a, b) { return a.hora_inicio < b.hora_inicio ? -1 : 1; });
  });

  cache.put('horario', JSON.stringify(porDia), 300);
  return porDia;
}

/** Intervalos [inicio, fin) en milisegundos que Sara ha bloqueado en su calendario. */
function leerEventosOcupados_(desde, hasta) {
  var calId = config('calendar_id', '');
  if (!calId) return [];
  var cal = CalendarApp.getCalendarById(calId);
  if (!cal) return [];

  return cal.getEvents(desde, hasta).map(function (ev) {
    if (ev.isAllDayEvent()) {
      // Un evento de día completo tapa el día entero
      var ini = ev.getAllDayStartDate();
      var fin = ev.getAllDayEndDate();
      return { inicio: ini.getTime(), fin: fin.getTime() };
    }
    return { inicio: ev.getStartTime().getTime(), fin: ev.getEndTime().getTime() };
  });
}

function solapaConOcupado_(ocupados, inicio, fin) {
  for (var i = 0; i < ocupados.length; i++) {
    if (inicio < ocupados[i].fin && fin > ocupados[i].inicio) return true;
  }
  return false;
}

/**
 * Lo que ya está ocupado, por fecha y en minutos: { 'YYYY-MM-DD': [{inicio, fin}] }.
 *
 * Se guarda el intervalo entero y no solo la hora de inicio. Si Sara cambia la
 * duración de las clases, una reserva antigua de 09:00 a 10:00 tiene que seguir
 * tapando el tramo nuevo de 08:30 a 10:00; comparando solo la hora de inicio se
 * habrían podido meter dos alumnos a la vez en el coche.
 *
 * Solo mira de hoy en adelante: el histórico no ocupa ningún hueco futuro.
 */
function indexarReservasActivas_() {
  return indexarDesdeFilas_(filasComoObjetos(getHoja(HOJA_RESERVAS)));
}

function indexarDesdeFilas_(filas) {
  var indice = {};
  var hoy = hoyISO();

  filas.forEach(function (fila) {
    var estado = String(fila.estado).trim();
    if (estado !== 'pendiente' && estado !== 'confirmada') return;

    var fecha = aFechaISO(fila.fecha);
    if (fecha < hoy) return;

    var inicio = enMinutos(aHoraHHMM(fila.hora_inicio));
    var fin    = enMinutos(aHoraHHMM(fila.hora_fin));
    if (!(fin > inicio)) fin = inicio + 60;   // por si una fila vieja no tiene fin

    if (!indice[fecha]) indice[fecha] = [];
    indice[fecha].push({ inicio: inicio, fin: fin });
  });

  return indice;
}

/** ¿Choca este tramo con alguna reserva activa de ese día? */
function estaReservado_(indice, fecha, horaInicio, horaFin) {
  var ocupados = indice[fecha];
  if (!ocupados) return false;

  var inicio = enMinutos(horaInicio);
  var fin    = enMinutos(horaFin);

  for (var i = 0; i < ocupados.length; i++) {
    if (inicio < ocupados[i].fin && fin > ocupados[i].inicio) return true;
  }
  return false;
}

/** ¿Sigue libre este hueco concreto? Atajo para cuando solo hay uno. */
function huecoSigueLibre_(fecha, horaInicio) {
  return huecoLibreEn_(crearContexto_([fecha]), fecha, horaInicio);
}
