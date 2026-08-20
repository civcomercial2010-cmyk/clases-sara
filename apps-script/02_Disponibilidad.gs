/**
 * Cálculo de huecos libres.
 *
 * LIBRE = horario base del día
 *         − eventos del calendario "Clases – disponibilidad"
 *         − reservas pendientes o confirmadas
 *         − franjas dentro de la antelación mínima  (se muestran como "urgente")
 */

/** Devuelve los días con sus franjas para las próximas semanas_vista semanas. */
function obtenerDisponibilidad() {
  var semanas   = configNum('semanas_vista', 2);
  var minHoras  = configNum('antelacion_minima_horas', 6);
  var ahoraTs   = ahora().getTime();
  var limiteTs  = ahoraTs + minHoras * 3600 * 1000;

  var desde = ahora();
  var hasta = sumarDias(desde, semanas * 7);

  var horario  = leerHorarioBase_();
  var ocupados = leerEventosOcupados_(desde, hasta);
  var reservas = indexarReservasActivas_();

  var dias = [];
  for (var i = 0; i < semanas * 7; i++) {
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
      if (reservas[fecha + ' ' + hi]) continue;                      // ocupada por reserva
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
        franjas: franjas
      });
    }
  }

  return {
    dias: dias,
    antelacion_minima_horas: minHoras,
    telefono_sara: config('telefono_sara', ''),
    nombre_sitio: config('nombre_sitio', 'Clases con Sara')
  };
}

/** { 1: [{hora_inicio, hora_fin}, ...], ... } solo tramos activos. */
function leerHorarioBase_() {
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

/** { 'YYYY-MM-DD HH:MM': true } para reservas pendientes o confirmadas. */
function indexarReservasActivas_() {
  var indice = {};
  filasComoObjetos(getHoja(HOJA_RESERVAS)).forEach(function (fila) {
    var estado = String(fila.estado).trim();
    if (estado !== 'pendiente' && estado !== 'confirmada') return;
    indice[aFechaISO(fila.fecha) + ' ' + aHoraHHMM(fila.hora_inicio)] = true;
  });
  return indice;
}

/** ¿Sigue libre este hueco concreto? Se vuelve a comprobar al reservar. */
function huecoSigueLibre_(fecha, horaInicio) {
  var horario = leerHorarioBase_();
  var diaSem  = diaSemanaIso(aDate(fecha, '00:00'));
  var tramos  = horario[diaSem] || [];

  var tramo = null;
  for (var i = 0; i < tramos.length; i++) {
    if (tramos[i].hora_inicio === horaInicio) { tramo = tramos[i]; break; }
  }
  if (!tramo) return { ok: false, error: 'Esa hora no está dentro del horario de clases.' };

  var inicio = aDate(fecha, tramo.hora_inicio);
  var fin    = aDate(fecha, tramo.hora_fin);

  if (fin.getTime() <= ahora().getTime()) {
    return { ok: false, error: 'Esa hora ya ha pasado.' };
  }

  var ocupados = leerEventosOcupados_(inicio, fin);
  if (solapaConOcupado_(ocupados, inicio.getTime(), fin.getTime())) {
    return { ok: false, error: 'Sara ya no tiene libre esa hora.' };
  }

  if (indexarReservasActivas_()[fecha + ' ' + horaInicio]) {
    return { ok: false, error: 'Justo acaban de reservar esa hora. Elige otra, por favor.' };
  }

  return { ok: true, tramo: tramo };
}
