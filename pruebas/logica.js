/*
 * Pruebas de la lógica de disponibilidad y reservas.
 *
 * Cargan los archivos .gs reales sobre una imitación mínima de los servicios de
 * Google (hoja de cálculo, calendario, correo) y comprueban el comportamiento
 * sin tocar nada real.
 *
 *   node pruebas/logica.js
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..', 'apps-script');

// ---------- Stubs de Google ----------

function dosD(n) { return ('0' + n).slice(-2); }

global.Utilities = {
  formatDate: function (fecha, tz, patron) {
    const y = fecha.getFullYear(), mo = dosD(fecha.getMonth() + 1), d = dosD(fecha.getDate());
    const h = dosD(fecha.getHours()), mi = dosD(fecha.getMinutes()), s = dosD(fecha.getSeconds());
    return patron
      .replace('yyyy', y).replace('MM', mo).replace('dd', d)
      .replace('HH', h).replace('mm', mi).replace('ss', s);
  }
};
global.Logger = { log: function (m) { console.log('   [log] ' + m); } };

const cacheFalsa = {};
global.CacheService = {
  getScriptCache: () => ({
    get: k => cacheFalsa[k] || null,
    put: (k, v) => { cacheFalsa[k] = v; },
    remove: k => { delete cacheFalsa[k]; }
  })
};

global.PropertiesService = {
  getScriptProperties: () => ({ getProperty: () => 'ID_FALSO', setProperty: () => {} })
};

global.LockService = {
  getScriptLock: () => ({ waitLock: () => true, releaseLock: () => {} })
};

global.MailApp = { sendEmail: (a, b) => console.log('   [email a ' + a + '] ' + b) };
global.Session = { getActiveUser: () => ({ getEmail: () => 'sara@example.com' }),
                   getEffectiveUser: () => ({ getEmail: () => 'sara@example.com' }) };

function HojaFalsa(matriz) {
  this.m = matriz;
}
HojaFalsa.prototype.getDataRange = function () {
  const m = this.m;
  return { getValues: () => m };
};
HojaFalsa.prototype.appendRow = function (fila) { this.m.push(fila); };
HojaFalsa.prototype.getRange = function (f, c) {
  const m = this.m;
  return { setValue: v => { m[f - 1][c - 1] = v; }, getValue: () => m[f - 1][c - 1] };
};

const HOJAS = {};
global.SpreadsheetApp = {
  openById: () => ({ getSheetByName: n => HOJAS[n] || null, getUrl: () => 'https://hoja' })
};

let EVENTOS = [];
global.CalendarApp = {
  getCalendarById: () => ({
    getEvents: (desde, hasta) => EVENTOS.filter(e => e.fin > desde && e.inicio < hasta).map(e => ({
      isAllDayEvent: () => !!e.todoElDia,
      getStartTime: () => e.inicio,
      getEndTime: () => e.fin,
      getAllDayStartDate: () => e.inicio,
      getAllDayEndDate: () => e.fin
    }))
  })
};

// ---------- Cargar el código real ----------

const vm = require('vm');
const contexto = global;
['00_Base', '02_Disponibilidad', '03_Reservas', '04_Avisos'].forEach(function (nombre) {
  vm.runInThisContext(fs.readFileSync(path.join(RAIZ, nombre + '.gs'), 'utf8'), { filename: nombre });
});

// ---------- Datos de partida ----------

// Horario: L-J 09-13 y 14-19, V 09-13 y 14-17
const filasHorario = [['dia_semana', 'hora_inicio', 'hora_fin', 'activo']];
for (let dia = 1; dia <= 5; dia++) {
  const ultima = dia === 5 ? 16 : 18;
  for (let h = 9; h <= 12; h++) filasHorario.push([dia, dosD(h) + ':00', dosD(h + 1) + ':00', 'SI']);
  for (let t = 14; t <= ultima; t++) filasHorario.push([dia, dosD(t) + ':00', dosD(t + 1) + ':00', 'SI']);
}
HOJAS['HorarioBase'] = new HojaFalsa(filasHorario);

HOJAS['Config'] = new HojaFalsa([
  ['clave', 'valor', 'descripcion'],
  ['nombre_sitio', 'Clases con Sara', ''],
  ['email_admin', 'sara@example.com', ''],
  ['telefono_sara', '34600111222', ''],
  ['calendar_id', 'cal_falso', ''],
  ['antelacion_minima_horas', '6', ''],
  ['semanas_vista', '2', ''],
  ['cancelacion_horas', '24', ''],
  ['avisar_por_email', 'NO', ''],
  ['url_publica', 'https://ejemplo.github.io/clases-sara/', '']
]);

HOJAS['Reservas'] = new HojaFalsa([
  ['id', 'creado_en', 'fecha', 'hora_inicio', 'hora_fin', 'estado', 'nombre', 'telefono',
   'notas', 'codigo', 'actualizado_en', 'avisado', 'motivo_rechazo']
]);

// ---------- Pruebas ----------

let fallos = 0;
function comprobar(descripcion, condicion, extra) {
  if (condicion) {
    console.log('  OK   ' + descripcion);
  } else {
    fallos++;
    console.log('  FALLA ' + descripcion + (extra ? '  → ' + extra : ''));
  }
}

console.log('\n== Helpers ==');
comprobar('aHoraHHMM normaliza 9:00', aHoraHHMM('9:00') === '09:00', aHoraHHMM('9:00'));
comprobar('aHoraHHMM recorta segundos', aHoraHHMM('14:00:00') === '14:00');
comprobar('normalizarTelefono añade prefijo', normalizarTelefono('600 11 12 22') === '34600111222',
          normalizarTelefono('600 11 12 22'));
comprobar('normalizarTelefono respeta el prefijo', normalizarTelefono('+34600111222') === '34600111222');
comprobar('esMovilValido rechaza corto', esMovilValido('123') === false);
comprobar('aDate construye bien', aDate('2026-08-21', '10:00').getHours() === 10);
comprobar('diaSemanaIso: 2026-08-21 es viernes', diaSemanaIso(aDate('2026-08-21', '00:00')) === 5);
comprobar('fechaLarga en español', fechaLarga('2026-08-21') === 'Viernes, 21 de agosto',
          fechaLarga('2026-08-21'));

console.log('\n== Disponibilidad ==');
let disp = obtenerDisponibilidad();
comprobar('devuelve días', disp.dias.length > 0, disp.dias.length + ' días');
comprobar('no incluye sábados ni domingos',
          disp.dias.every(d => [6, 7].indexOf(diaSemanaIso(aDate(d.fecha, '00:00'))) === -1));

const viernes = disp.dias.filter(d => diaSemanaIso(aDate(d.fecha, '00:00')) === 5);
if (viernes.length) {
  const ultimaV = viernes[viernes.length - 1].franjas.map(f => f.hora_inicio).pop();
  comprobar('el viernes acaba a las 17:00 (última franja 16:00)', ultimaV === '16:00', ultimaV);
}
const miercoles = disp.dias.filter(d => diaSemanaIso(aDate(d.fecha, '00:00')) === 3);
if (miercoles.length) {
  const tieneManana = miercoles[miercoles.length - 1].franjas.some(f => f.hora_inicio === '09:00');
  comprobar('el miércoles por la mañana está abierto', tieneManana);
}
comprobar('no hay pausa de comida a las 13:00',
          disp.dias.every(d => d.franjas.every(f => f.hora_inicio !== '13:00')));

console.log('\n== El calendario tapa horas ==');
const diaPrueba = disp.dias.find(d => d.franjas.some(f => f.estado === 'libre') && d.fecha > hoyISO());
const franjaPrueba = diaPrueba.franjas.find(f => f.estado === 'libre');
EVENTOS = [{ inicio: aDate(diaPrueba.fecha, franjaPrueba.hora_inicio),
             fin: aDate(diaPrueba.fecha, franjaPrueba.hora_fin) }];
disp = obtenerDisponibilidad();
let diaTras = disp.dias.find(d => d.fecha === diaPrueba.fecha);
comprobar('la hora tapada desaparece',
          !diaTras || !diaTras.franjas.some(f => f.hora_inicio === franjaPrueba.hora_inicio));

console.log('\n== Reservar ==');
EVENTOS = [];
disp = obtenerDisponibilidad();
const objetivo = disp.dias.find(d => d.franjas.some(f => f.estado === 'libre'));
const hueco = objetivo.franjas.find(f => f.estado === 'libre');

let r = crearReserva({ nombre: 'Ana Pérez', telefono: '600111222',
                       fecha: objetivo.fecha, hora_inicio: hueco.hora_inicio, notas: 'Aparcar' });
comprobar('la reserva se crea', r.ok === true, r.error);
comprobar('devuelve un código de 6', r.ok && r.reserva.codigo.length === 6);
comprobar('nace pendiente', r.ok && r.reserva.estado === 'pendiente');

let r2 = crearReserva({ nombre: 'Luis Gómez', telefono: '600333444',
                        fecha: objetivo.fecha, hora_inicio: hueco.hora_inicio });
comprobar('no deja reservar dos veces la misma hora', r2.ok === false, JSON.stringify(r2));

disp = obtenerDisponibilidad();
diaTras = disp.dias.find(d => d.fecha === objetivo.fecha);
comprobar('la hora reservada ya no aparece libre',
          !diaTras || !diaTras.franjas.some(f => f.hora_inicio === hueco.hora_inicio));

console.log('\n== Validaciones ==');
comprobar('rechaza nombre corto',
          crearReserva({ nombre: 'Al', telefono: '600111222', fecha: objetivo.fecha,
                         hora_inicio: '09:00' }).ok === false);
comprobar('rechaza móvil inválido',
          crearReserva({ nombre: 'Ana Pérez', telefono: '12', fecha: objetivo.fecha,
                         hora_inicio: '09:00' }).ok === false);

const dentroDe2h = new Date(Date.now() + 2 * 3600 * 1000);
const rUrgente = crearReserva({
  nombre: 'Ana Pérez', telefono: '600111222',
  fecha: Utilities.formatDate(dentroDe2h, TZ, 'yyyy-MM-dd'),
  hora_inicio: dosD(dentroDe2h.getHours()) + ':00'
});
comprobar('bloquea por poca antelación', rUrgente.ok === false && rUrgente.motivo === 'antelacion',
          JSON.stringify(rUrgente));

console.log('\n== Consultar y cancelar ==');
const consulta = consultarPorCodigo(r.reserva.codigo);
comprobar('encuentra por código', consulta.ok === true, JSON.stringify(consulta));
comprobar('no expone el teléfono', consulta.ok && consulta.reserva.telefono === undefined);

const cancelacion = cancelarPorCodigo(r.reserva.codigo);
comprobar('cancela', cancelacion.ok === true, JSON.stringify(cancelacion));

disp = obtenerDisponibilidad();
diaTras = disp.dias.find(d => d.fecha === objetivo.fecha);
comprobar('tras cancelar la hora vuelve a estar libre',
          diaTras && diaTras.franjas.some(f => f.hora_inicio === hueco.hora_inicio));

console.log('\n== Panel de Sara ==');
const r3 = crearReserva({ nombre: 'Marta Ruiz', telefono: '600555666',
                          fecha: objetivo.fecha, hora_inicio: hueco.hora_inicio });
const panel = datosPanel();
comprobar('lista pendientes', panel.pendientes.length === 1, JSON.stringify(panel.pendientes.length));
comprobar('incluye las plantillas', !!panel.config.plantillas.confirmada);

const conf = confirmarReserva(r3.reserva.id);
comprobar('confirma', conf.ok === true, JSON.stringify(conf));
comprobar('no se puede confirmar dos veces', confirmarReserva(r3.reserva.id).ok === false);

const panel2 = datosPanel();
comprobar('pasa a próximas', panel2.proximas.length === 1 && panel2.pendientes.length === 0);

const texto = textoWhatsAppAlumno(panel2.proximas[0]);
comprobar('el mensaje lleva el nombre', texto.indexOf('Marta') !== -1, texto);
comprobar('el mensaje no deja marcadores sin rellenar', texto.indexOf('{') === -1, texto);

const textoRechazo = textoWhatsAppAlumno(
  Object.assign({}, panel2.proximas[0], { estado: 'rechazada' }), 'tengo examen');
comprobar('el rechazo incluye el motivo y el enlace',
          textoRechazo.indexOf('tengo examen') !== -1 && textoRechazo.indexOf('github.io') !== -1,
          textoRechazo);

console.log('\n' + (fallos === 0 ? 'TODO CORRECTO' : fallos + ' PRUEBAS FALLIDAS'));
process.exit(fallos === 0 ? 0 : 1);
