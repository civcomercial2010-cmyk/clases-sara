/**
 * Base: acceso a la hoja de cálculo, configuración y helpers de fecha.
 * Todo lo demás depende de este archivo.
 */

var PROP_SHEET_ID = 'SHEET_ID';
var HOJA_RESERVAS = 'Reservas';
var HOJA_HORARIO  = 'HorarioBase';
var HOJA_CONFIG   = 'Config';
var TZ            = 'Europe/Madrid';

// 'grupo' une las horas pedidas de una sola vez: el alumno elige varias, rellena sus
// datos una vez y todas comparten grupo, aunque cada una se confirma por separado.
var COLS_RESERVAS = ['id', 'creado_en', 'fecha', 'hora_inicio', 'hora_fin', 'estado',
                     'nombre', 'telefono', 'notas', 'codigo', 'actualizado_en',
                     'avisado', 'motivo_rechazo', 'grupo'];

// --- Hoja de cálculo -------------------------------------------------------

// Abrir la hoja de cálculo cuesta cerca de medio segundo, y una sola petición la
// abre varias veces. Se guarda mientras dura la ejecución.
var _ss = null;
var _hojas = {};

function getSpreadsheet() {
  if (_ss) return _ss;
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
  if (!id) {
    throw new Error('Sin hoja de cálculo. Ejecuta instalar() una vez desde el editor.');
  }
  _ss = SpreadsheetApp.openById(id);
  return _ss;
}

function getHoja(nombre) {
  if (_hojas[nombre]) return _hojas[nombre];
  var hoja = getSpreadsheet().getSheetByName(nombre);
  if (!hoja) throw new Error('Falta la hoja "' + nombre + '". Vuelve a ejecutar instalar().');
  _hojas[nombre] = hoja;
  return hoja;
}

/** Devuelve las filas de una hoja como objetos, usando la fila 1 como cabecera. */
function filasComoObjetos(hoja) {
  var datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return [];
  var cabecera = datos[0];
  var salida = [];
  for (var i = 1; i < datos.length; i++) {
    var fila = {};
    for (var c = 0; c < cabecera.length; c++) {
      fila[cabecera[c]] = datos[i][c];
    }
    fila._fila = i + 1; // número de fila real en la hoja
    salida.push(fila);
  }
  return salida;
}

// --- Configuración ---------------------------------------------------------

function leerConfig() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('config');
  if (guardado) return JSON.parse(guardado);

  var conf = {};
  filasComoObjetos(getHoja(HOJA_CONFIG)).forEach(function (fila) {
    if (fila.clave) conf[String(fila.clave).trim()] = String(fila.valor).trim();
  });
  cache.put('config', JSON.stringify(conf), 60);
  return conf;
}

function config(clave, porDefecto) {
  var valor = leerConfig()[clave];
  return (valor === undefined || valor === '') ? porDefecto : valor;
}

function configNum(clave, porDefecto) {
  var valor = Number(config(clave, porDefecto));
  return isNaN(valor) ? porDefecto : valor;
}

function setConfig(clave, valor) {
  var hoja = getHoja(HOJA_CONFIG);
  var filas = filasComoObjetos(hoja);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].clave).trim() === clave) {
      hoja.getRange(filas[i]._fila, 2).setValue(valor);
      CacheService.getScriptCache().remove('config');
      return;
    }
  }
  hoja.appendRow([clave, valor, '']);
  CacheService.getScriptCache().remove('config');
}

// --- Fechas y horas --------------------------------------------------------

/** Normaliza a 'YYYY-MM-DD' tanto si viene Date como texto. */
function aFechaISO(valor) {
  if (valor instanceof Date) return Utilities.formatDate(valor, TZ, 'yyyy-MM-dd');
  return String(valor).trim().substring(0, 10);
}

/** Normaliza a 'HH:MM' tanto si viene Date como texto ('9:00', '09:00:00'). */
function aHoraHHMM(valor) {
  if (valor instanceof Date) return Utilities.formatDate(valor, TZ, 'HH:mm');
  var txt = String(valor).trim();
  var m = txt.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return txt;
  return ('0' + m[1]).slice(-2) + ':' + m[2];
}

/** 'HH:MM' -> minutos desde medianoche. Las clases ya no duran una hora exacta. */
function enMinutos(hora) {
  var partes = String(hora).split(':');
  return Number(partes[0]) * 60 + Number(partes[1] || 0);
}

function deMinutos(minutos) {
  var h = Math.floor(minutos / 60);
  var m = minutos % 60;
  return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
}

/** Construye un Date real a partir de 'YYYY-MM-DD' y 'HH:MM' en la zona del proyecto. */
function aDate(fechaISO, horaHHMM) {
  var f = fechaISO.split('-');
  var h = horaHHMM.split(':');
  return new Date(Number(f[0]), Number(f[1]) - 1, Number(f[2]), Number(h[0]), Number(h[1]), 0, 0);
}

function ahora() {
  return new Date();
}

function hoyISO() {
  return Utilities.formatDate(ahora(), TZ, 'yyyy-MM-dd');
}

function sumarDias(fecha, dias) {
  var d = new Date(fecha.getTime());
  d.setDate(d.getDate() + dias);
  return d;
}

/** 1 = lunes ... 7 = domingo */
function diaSemanaIso(fecha) {
  var d = fecha.getDay();
  return d === 0 ? 7 : d;
}

function nombreDia(n) {
  return ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][n] || '';
}

function nombreMes(n) {
  return ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
          'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][n] || '';
}

/** 'Jueves, 21 de agosto' */
function fechaLarga(fechaISO) {
  var d = aDate(fechaISO, '00:00');
  return nombreDia(diaSemanaIso(d)) + ', ' + d.getDate() + ' de ' + nombreMes(d.getMonth() + 1);
}

// --- Varios ----------------------------------------------------------------

/** Código corto que el alumno usa para consultar su reserva. Sin caracteres ambiguos. */
function generarCodigo() {
  var alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var salida = '';
  for (var i = 0; i < 6; i++) {
    salida += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  }
  return salida;
}

/**
 * Deja el móvil en dígitos y en formato internacional, como lo necesita wa.me.
 *
 * Andorra y España conviven: los móviles andorranos tienen 6 dígitos (+376) y los
 * españoles 9 (+34). Se distinguen por la longitud, y un número que ya venga con
 * prefijo se respeta tal cual.
 */
function normalizarTelefono(telefono) {
  var limpio = String(telefono || '').replace(/[^\d+]/g, '');
  var yaInternacional = limpio.charAt(0) === '+';
  limpio = limpio.replace(/\+/g, '');

  if (limpio.indexOf('00') === 0) {
    limpio = limpio.substring(2);
    yaInternacional = true;
  }
  if (yaInternacional) return limpio;

  // Ya trae prefijo: 376 + 6 dígitos, o 34 + 9 dígitos
  if (limpio.indexOf('376') === 0 && limpio.length === 9)  return limpio;
  if (limpio.indexOf('34')  === 0 && limpio.length === 11) return limpio;

  if (limpio.length === 6) return '376' + limpio; // móvil de Andorra
  if (limpio.length === 9) return '34'  + limpio; // móvil de España

  return limpio;
}

function esMovilValido(telefono) {
  var limpio = normalizarTelefono(telefono);
  return limpio.length >= 8 && limpio.length <= 15;
}
