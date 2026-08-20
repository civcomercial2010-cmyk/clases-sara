/**
 * Horario semanal de Sara.
 *
 * La hoja HorarioBase guarda los tramos ya calculados, que es lo que consulta el
 * sistema. Pero Sara no debería tener que escribir tramo a tramo: aquí se guarda
 * su horario en forma sencilla (a qué hora empieza y acaba cada mañana y cada
 * tarde, y cuánto dura una clase) y desde ahí se generan los tramos.
 *
 * Así puede cambiar la duración de las clases o alargar una tarde desde su panel,
 * en el móvil, sin tocar la hoja de cálculo.
 */

var HORARIO_POR_DEFECTO = {
  duracion: 90,
  dias: {
    '1': { activo: true, manana: ['08:30', '13:00'], tarde: ['14:00', '18:30'] },
    '2': { activo: true, manana: ['08:30', '13:00'], tarde: ['14:00', '18:30'] },
    '3': { activo: true, manana: ['08:30', '13:00'], tarde: ['14:00', '18:30'] },
    '4': { activo: true, manana: ['08:30', '13:00'], tarde: ['14:00', '18:30'] },
    '5': { activo: true, manana: ['08:30', '13:00'], tarde: ['14:00', '17:00'] },
    '6': { activo: false, manana: ['', ''], tarde: ['', ''] },
    '7': { activo: false, manana: ['', ''], tarde: ['', ''] }
  }
};

/** Lo que el panel necesita para pintar el editor. */
function leerHorarioEditable() {
  var guardado = config('horario_config', '');
  if (!guardado) return clonar_(HORARIO_POR_DEFECTO);

  try {
    var leido = JSON.parse(guardado);
    if (!leido.dias) return clonar_(HORARIO_POR_DEFECTO);
    // Rellena los días que falten, por si la configuración viene de una versión vieja
    for (var d = 1; d <= 7; d++) {
      if (!leido.dias[d]) leido.dias[d] = clonar_(HORARIO_POR_DEFECTO.dias[d]);
    }
    if (!leido.duracion) leido.duracion = HORARIO_POR_DEFECTO.duracion;
    return leido;
  } catch (e) {
    return clonar_(HORARIO_POR_DEFECTO);
  }
}

/**
 * Guarda el horario de Sara y regenera los tramos de la hoja.
 * Las clases ya reservadas no se tocan: si una queda fuera del horario nuevo,
 * sigue en pie y Sara decide qué hacer con ella.
 */
function guardarHorario(nuevo) {
  var duracion = Math.round(Number(nuevo && nuevo.duracion) || 0);
  if (duracion < 15 || duracion > 480) {
    return { ok: false, error: 'La duración debe estar entre 15 y 480 minutos.' };
  }

  var dias = (nuevo && nuevo.dias) || {};
  var limpio = { duracion: duracion, dias: {} };
  var tramos = [];

  for (var d = 1; d <= 7; d++) {
    var dia = dias[d] || dias[String(d)] || { activo: false };
    var manana = normalizarTramo_(dia.manana);
    var tarde  = normalizarTramo_(dia.tarde);
    var activo = !!dia.activo && (manana || tarde);

    limpio.dias[d] = {
      activo: activo,
      manana: manana || ['', ''],
      tarde: tarde || ['', '']
    };
    if (!activo) continue;

    if (manana) tramos = tramos.concat(generarTramos_(d, manana[0], manana[1], duracion));
    if (tarde)  tramos = tramos.concat(generarTramos_(d, tarde[0], tarde[1], duracion));
  }

  if (!tramos.length) {
    return { ok: false, error: 'No queda ninguna franja. Revisa las horas.' };
  }

  escribirHorarioBase_(tramos);
  setConfig('horario_config', JSON.stringify(limpio));
  setConfig('duracion_minutos', String(duracion));

  CacheService.getScriptCache().remove('horario');
  olvidarDisponibilidad();

  return { ok: true, tramos: tramos.length, horario: limpio };
}

/** ['08:30','13:00'] si el tramo es válido, o null. */
function normalizarTramo_(tramo) {
  if (!tramo || tramo.length < 2) return null;
  var inicio = aHoraHHMM(String(tramo[0] || '').trim());
  var fin    = aHoraHHMM(String(tramo[1] || '').trim());

  if (!/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fin)) return null;
  if (enMinutos(fin) <= enMinutos(inicio)) return null;
  return [inicio, fin];
}

/** Parte un rango en clases seguidas de la duración indicada. */
function generarTramos_(dia, inicio, fin, duracion) {
  var salida = [];
  var desde  = enMinutos(inicio);
  var hasta  = enMinutos(fin);

  while (desde + duracion <= hasta) {
    salida.push([dia, deMinutos(desde), deMinutos(desde + duracion), 'SI']);
    desde += duracion;
  }
  return salida;
}

function escribirHorarioBase_(tramos) {
  var hoja = getHoja(HOJA_HORARIO);
  var ultima = hoja.getLastRow();
  if (ultima > 1) hoja.getRange(2, 1, ultima - 1, 4).clearContent();
  hoja.getRange(2, 1, tramos.length, 4).setValues(tramos);
}

function clonar_(objeto) {
  return JSON.parse(JSON.stringify(objeto));
}
