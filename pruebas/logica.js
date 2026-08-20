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
    const utc = tz === 'UTC';
    const y  = utc ? fecha.getUTCFullYear() : fecha.getFullYear();
    const mo = dosD((utc ? fecha.getUTCMonth() : fecha.getMonth()) + 1);
    const d  = dosD(utc ? fecha.getUTCDate() : fecha.getDate());
    const h  = dosD(utc ? fecha.getUTCHours() : fecha.getHours());
    const mi = dosD(utc ? fecha.getUTCMinutes() : fecha.getMinutes());
    const sg = dosD(utc ? fecha.getUTCSeconds() : fecha.getSeconds());
    return patron
      .replace('yyyy', y).replace('MM', mo).replace('dd', d)
      .replace('HH', h).replace('mm', mi).replace('ss', sg)
      .replace(/'/g, '');   // los literales del patron van entre comillas simples
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
  return { getValues: () => { CONTADOR.hojas++; return m; } };
};
HojaFalsa.prototype.appendRow = function (fila) { this.m.push(fila); };
HojaFalsa.prototype.getLastRow = function () { return this.m.length; };
HojaFalsa.prototype.getLastColumn = function () { return this.m[0].length; };
HojaFalsa.prototype.getRange = function (f, c, nf, nc) {
  const m = this.m;
  return {
    setValue: v => { m[f - 1][c - 1] = v; },
    clearContent: () => {
      for (let i = 0; i < (nf || 1); i++) {
        if (!m[f - 1 + i]) continue;
        for (let j = 0; j < (nc || 1); j++) m[f - 1 + i][c - 1 + j] = '';
      }
      // Quita las filas que se hayan quedado vacias del todo
      for (let i = m.length - 1; i >= 1; i--) {
        if (m[i].every(v => v === '' || v === undefined)) m.splice(i, 1);
      }
    },
    getValue: () => m[f - 1][c - 1],
    getValues: () => {
      const salida = [];
      for (let i = 0; i < (nf || 1); i++) salida.push((m[f - 1 + i] || []).slice(c - 1, c - 1 + (nc || 1)));
      return salida;
    },
    setValues: filas => {
      // Escribe solo dentro del rango pedido, como hace Sheets de verdad
      filas.forEach((fila, i) => {
        while (m.length < f + i) m.push([]);
        const destino = m[f - 1 + i];
        fila.forEach((valor, j) => { destino[c - 1 + j] = valor; });
      });
      return { setFontWeight: () => ({ setBackground: () => ({ setFontColor: () => {} }) }) };
    }
  };
};

const HOJAS = {};
global.SpreadsheetApp = {
  openById: () => ({ getSheetByName: n => HOJAS[n] || null, getUrl: () => 'https://hoja' })
};

let EVENTOS = [];
global.CONTADOR = { calendario: 0, hojas: 0 };
global.CalendarApp = {
  getCalendarById: () => ({
    getEvents: (desde, hasta) => (CONTADOR.calendario++, EVENTOS.filter(e => e.fin > desde && e.inicio < hasta)).map(e => ({
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
['00_Base', '02_Disponibilidad', '03_Reservas', '04_Avisos', '06_Calendario', '07_Horario'].forEach(function (nombre) {
  vm.runInThisContext(fs.readFileSync(path.join(RAIZ, nombre + '.gs'), 'utf8'), { filename: nombre });
});

// ---------- Datos de partida ----------

// Horario real: clases de 90 minutos, L-J 08:30-13:00 y 14:00-18:30, V hasta las 17:00
const filasHorario = [['dia_semana', 'hora_inicio', 'hora_fin', 'activo']];
const enMin = h => Number(h.split(':')[0]) * 60 + Number(h.split(':')[1]);
const deMin = m => dosD(Math.floor(m / 60)) + ':' + dosD(m % 60);
function tramos90(dia, desde, hasta) {
  let ini = enMin(desde);
  while (ini + 90 <= enMin(hasta)) {
    filasHorario.push([dia, deMin(ini), deMin(ini + 90), 'SI']);
    ini += 90;
  }
}
for (let dia = 1; dia <= 5; dia++) {
  tramos90(dia, '08:30', '13:00');
  tramos90(dia, '14:00', dia === 5 ? '17:00' : '18:30');
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
  ['max_horas_por_reserva', '20', ''],
  ['max_horas_seguidas', '2', ''],
  ['cancelacion_horas', '24', ''],
  ['avisar_por_email', 'NO', ''],
  ['url_publica', 'https://ejemplo.github.io/clases-sara/', '']
]);

HOJAS['Reservas'] = new HojaFalsa([
  ['id', 'creado_en', 'fecha', 'hora_inicio', 'hora_fin', 'estado', 'nombre', 'telefono',
   'notas', 'codigo', 'actualizado_en', 'avisado', 'motivo_rechazo', 'grupo']
]);

// La disponibilidad se guarda medio minuto; en las pruebas hay que olvidarla a mano
function limpiarCache() {
  Object.keys(cacheFalsa).forEach(function (k) { delete cacheFalsa[k]; });
}

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
  comprobar('el viernes acaba a las 17:00 (ultima franja 15:30)', ultimaV === '15:30', ultimaV);
}
const miercoles = disp.dias.filter(d => diaSemanaIso(aDate(d.fecha, '00:00')) === 3);
if (miercoles.length) {
  const tieneManana = miercoles[miercoles.length - 1].franjas.some(f => f.hora_inicio === '08:30');
  comprobar('el miércoles por la mañana está abierto', tieneManana);
}
comprobar('no hay pausa de comida a las 13:00',
          disp.dias.every(d => d.franjas.every(f => f.hora_inicio !== '13:00')));
comprobar('las clases duran 90 minutos',
          disp.dias.every(d => d.franjas.every(f => enMin(f.hora_fin) - enMin(f.hora_inicio) === 90)));
comprobar('el dia empieza a las 08:30',
          disp.dias.every(d => d.franjas[0].hora_inicio >= '08:30'));

console.log('\n== El calendario tapa horas ==');
const diaPrueba = disp.dias.find(d => d.franjas.some(f => f.estado === 'libre') && d.fecha > hoyISO());
const franjaPrueba = diaPrueba.franjas.find(f => f.estado === 'libre');
EVENTOS = [{ inicio: aDate(diaPrueba.fecha, franjaPrueba.hora_inicio),
             fin: aDate(diaPrueba.fecha, franjaPrueba.hora_fin) }];
limpiarCache();
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

limpiarCache();
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

limpiarCache();
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

comprobar('las pendientes van agrupadas por alumno',
          panel.pendientes[0].reservas !== undefined && panel.pendientes[0].total === 1);

const conf = confirmarReserva(r3.reserva.id);
comprobar('confirma', conf.ok === true, JSON.stringify(conf));
const repetir = confirmarReserva(r3.reserva.id);
comprobar('confirmar dos veces no es un error, pero no cambia nada',
          repetir.ok === true && repetir.sin_cambios === true, JSON.stringify(repetir));

const panel2 = datosPanel();
comprobar('pasa a proximas', panel2.proximas.length === 1 && panel2.pendientes.length === 0);

const texto = textoWhatsAppAlumno(panel2.proximas[0].reservas);
comprobar('el mensaje lleva la hora de inicio y de fin',
          /de \d{2}:\d{2} a \d{2}:\d{2}/.test(texto), texto);
comprobar('el mensaje no empieza saludando', texto.indexOf('Hola') !== 0, texto);
comprobar('el mensaje no deja marcadores sin rellenar', texto.indexOf('{') === -1, texto);

const textoRechazo = textoWhatsAppAlumno(panel2.proximas[0].reservas, 'tengo examen', 'rechazada');
comprobar('el rechazo incluye el motivo y el enlace',
          textoRechazo.indexOf('tengo examen') !== -1 && textoRechazo.indexOf('github.io') !== -1,
          textoRechazo);

console.log('== Semanas naturales ==');
limpiarCache();
disp = obtenerDisponibilidad();
const semanasVistas = {};
disp.dias.forEach(d => { semanasVistas[d.semana] = true; });
comprobar('solo esta semana y la siguiente', Object.keys(semanasVistas).length <= 2,
          JSON.stringify(Object.keys(semanasVistas)));
const ultimoDia = disp.dias[disp.dias.length - 1];
comprobar('no se pasa del domingo que viene', ultimoDia.semana <= 1, ultimoDia.fecha);

console.log('== Varias horas de una vez ==');
limpiarCache();
disp = obtenerDisponibilidad();
const trio = [];
disp.dias.forEach(d => d.franjas.forEach(f => {
  if (f.estado === 'libre' && trio.length < 3) trio.push({ fecha: d.fecha, hora_inicio: f.hora_inicio });
}));

const multi = crearReserva({ nombre: 'Pau Font', telefono: '672519', huecos: trio });
comprobar('crea las tres de golpe', multi.ok && multi.reservas.length === 3,
          JSON.stringify(multi.error || (multi.reservas || []).length));
comprobar('todas comparten grupo', multi.ok && multi.reservas.every(r => r.grupo === multi.grupo));
comprobar('cada una tiene su codigo', multi.ok && new Set(multi.reservas.map(r => r.codigo)).size === 3);

const consultaGrupo = consultarPorCodigo(multi.reservas[1].codigo);
comprobar('un solo codigo devuelve las tres horas',
          consultaGrupo.ok && consultaGrupo.reservas.length === 3,
          JSON.stringify((consultaGrupo.reservas || []).length));

comprobar('el movil de Andorra queda bien guardado',
          multi.reservas[0].telefono === '376672519', multi.reservas[0].telefono);

limpiarCache();
disp = obtenerDisponibilidad();
let siguenLibres = 0;
disp.dias.forEach(d => d.franjas.forEach(f => {
  trio.forEach(t => { if (t.fecha === d.fecha && t.hora_inicio === f.hora_inicio) siguenLibres++; });
}));
comprobar('las tres desaparecen del listado', siguenLibres === 0, siguenLibres + ' siguen');

const repetida = crearReserva({ nombre: 'Otro Alumno', telefono: '672520', huecos: [trio[0]] });
comprobar('no deja repetir una hora ya pedida', repetida.ok === false, JSON.stringify(repetida));

console.log('== Maximo dos clases seguidas ==');
limpiarCache();
disp = obtenerDisponibilidad();

// Un dia con al menos tres horas seguidas por la manana
let diaLargo = null;
disp.dias.forEach(d => {
  if (diaLargo) return;
  const manana = d.franjas.filter(f => f.estado === 'libre' && f.hora_inicio < '13:00');
  if (manana.length >= 3 &&
      enMin(manana[1].hora_inicio) === enMin(manana[0].hora_fin) &&
      enMin(manana[2].hora_inicio) === enMin(manana[1].hora_fin)) {
    diaLargo = { fecha: d.fecha, horas: manana.map(f => f.hora_inicio) };
  }
});

if (!diaLargo) {
  console.log('  (sin dias con tres horas seguidas libres, se omite)');
} else {
  const tresSeguidas = diaLargo.horas.slice(0, 3).map(h => ({ fecha: diaLargo.fecha, hora_inicio: h }));
  const rechazo = crearReserva({ nombre: 'Marc Roca', telefono: '672530', huecos: tresSeguidas });
  comprobar('rechaza tres horas seguidas', rechazo.ok === false && rechazo.motivo === 'seguidas',
            JSON.stringify(rechazo));

  const dosSeguidas = diaLargo.horas.slice(0, 2).map(h => ({ fecha: diaLargo.fecha, hora_inicio: h }));
  const aceptado = crearReserva({ nombre: 'Marc Roca', telefono: '672530', huecos: dosSeguidas });
  comprobar('acepta dos seguidas', aceptado.ok === true, JSON.stringify(aceptado.error));

  // La tercera, en otra solicitud y con el mismo movil, tampoco cuela
  const tercera = crearReserva({
    nombre: 'Marc Roca', telefono: '672530',
    huecos: [{ fecha: diaLargo.fecha, hora_inicio: diaLargo.horas[2] }]
  });
  comprobar('no cuela la tercera en otra solicitud', tercera.ok === false, JSON.stringify(tercera));

  // Otro alumno si puede coger esa tercera hora
  const otro = crearReserva({
    nombre: 'Nuria Camps', telefono: '672540',
    huecos: [{ fecha: diaLargo.fecha, hora_inicio: diaLargo.horas[2] }]
  });
  comprobar('otro alumno si puede cogerla', otro.ok === true, JSON.stringify(otro.error));
}

// Dos por la manana y una por la tarde no son seguidas: la pausa de comida las separa
limpiarCache();
disp = obtenerDisponibilidad();
let diaMixto = null;
disp.dias.forEach(d => {
  if (diaMixto) return;
  const manana = d.franjas.filter(f => f.estado === 'libre' && f.hora_inicio < '13:00');
  const tarde  = d.franjas.filter(f => f.estado === 'libre' && f.hora_inicio >= '14:00');
  if (manana.length >= 2 && tarde.length >= 1 &&
      enMin(manana[1].hora_inicio) === enMin(manana[0].hora_fin)) {
    diaMixto = { fecha: d.fecha, huecos: [manana[0], manana[1], tarde[0]] };
  }
});

if (diaMixto) {
  const mixto = crearReserva({
    nombre: 'Laia Prat', telefono: '672550',
    huecos: diaMixto.huecos.map(f => ({ fecha: diaMixto.fecha, hora_inicio: f.hora_inicio }))
  });
  comprobar('dos por la manana y una por la tarde si valen', mixto.ok === true,
            JSON.stringify(mixto.error));
}

console.log('== Coste de una reserva de 7 horas ==');
limpiarCache();
disp = obtenerDisponibilidad();
const siete = [];
disp.dias.forEach(d => {
  const l = d.franjas.filter(f => f.estado === 'libre');
  if (l.length >= 2 && siete.length < 7) {
    siete.push({ fecha: d.fecha, hora_inicio: l[0].hora_inicio });
    if (siete.length < 7) siete.push({ fecha: d.fecha, hora_inicio: l[1].hora_inicio });
  }
});
CONTADOR.calendario = 0; CONTADOR.hojas = 0;
const gasto = crearReserva({ nombre: 'Medida Coste', telefono: '672560', huecos: siete });
console.log('  huecos pedidos:      ' + siete.length);
console.log('  consultas calendario:' + CONTADOR.calendario);
console.log('  lecturas de hoja:    ' + CONTADOR.hojas);
console.log('  resultado:           ' + (gasto.ok ? gasto.reservas.length + ' creadas' : gasto.error));
comprobar('el calendario se consulta una vez, no una por hora', CONTADOR.calendario <= 1,
          CONTADOR.calendario + ' consultas');
comprobar('la hoja se lee pocas veces', CONTADOR.hojas <= 4, CONTADOR.hojas + ' lecturas');

console.log('== Coste de confirmar tres clases a la vez ==');
const panelAntes = datosPanel();
const grupoAlumno = panelAntes.pendientes.filter(g => g.total >= 2)[0] || panelAntes.pendientes[0];
if (grupoAlumno) {
  const idsGrupo = grupoAlumno.reservas.map(r => r.id);
  CONTADOR.calendario = 0; CONTADOR.hojas = 0;
  const conjunta = cambiarEstado(idsGrupo, 'confirmada', '');
  console.log('  clases confirmadas:  ' + (conjunta.reservas || []).length);
  console.log('  lecturas de hoja:    ' + CONTADOR.hojas);
  comprobar('confirma todas de una vez', conjunta.ok && conjunta.reservas.length === idsGrupo.length,
            JSON.stringify(conjunta.error));
  comprobar('confirmar no relee la hoja por cada clase', CONTADOR.hojas <= idsGrupo.length + 1,
            CONTADOR.hojas + ' lecturas');

  const mensaje = textoWhatsAppAlumno(conjunta.reservas, '', 'confirmada');
  const lineas = mensaje.split(String.fromCharCode(10)).filter(l => l.indexOf(String.fromCharCode(8226)) === 0);

  comprobar('un solo mensaje con todas las clases', lineas.length === idsGrupo.length,
            lineas.length + ' lineas para ' + idsGrupo.length + ' clases');
}

console.log('== Archivo de calendario ==');
setConfig('url_api', 'https://script.google.com/macros/s/PRUEBA/exec');
const panelIcs = datosPanel();
const confirmadaIcs = panelIcs.proximas[0];
if (confirmadaIcs) {
  const ics = generarIcs(confirmadaIcs.reservas[0].codigo);
  comprobar('genera el archivo', !!ics && ics.indexOf('BEGIN:VCALENDAR') === 0);
  comprobar('avisa una hora antes', ics.indexOf('TRIGGER:-PT1H') !== -1);
  comprobar('una entrada por clase confirmada',
            ics.split('BEGIN:VEVENT').length - 1 === confirmadaIcs.total,
            (ics.split('BEGIN:VEVENT').length - 1) + ' entradas para ' + confirmadaIcs.total);
  comprobar('las horas van en UTC', /DTSTART:\d{8}T\d{6}Z/.test(ics));

  const conEnlace = textoWhatsAppAlumno(confirmadaIcs.reservas, '', 'confirmada');
  comprobar('el mensaje ofrece el calendario', conEnlace.indexOf('accion=ics') !== -1, conEnlace);
}

console.log('== Sara cambia sus horarios ==');
const cambio = guardarHorario({
  duracion: 90,
  dias: {
    1: { activo: true, manana: ['08:30', '13:00'], tarde: ['14:00', '18:30'] },
    2: { activo: true, manana: ['08:30', '13:00'], tarde: ['14:00', '18:30'] },
    3: { activo: true, manana: ['08:30', '13:00'], tarde: ['14:00', '18:30'] },
    4: { activo: true, manana: ['08:30', '13:00'], tarde: ['14:00', '18:30'] },
    5: { activo: true, manana: ['08:30', '13:00'], tarde: ['14:00', '17:00'] },
    6: { activo: false, manana: ['', ''], tarde: ['', ''] },
    7: { activo: false, manana: ['', ''], tarde: ['', ''] }
  }
});
comprobar('guarda el horario', cambio.ok === true, JSON.stringify(cambio.error));
comprobar('genera 29 clases a la semana', cambio.tramos === 29, cambio.tramos + ' tramos');

limpiarCache();
const trasCambio = leerHorarioBase_();
comprobar('el lunes empieza a las 08:30', trasCambio[1][0].hora_inicio === '08:30',
          trasCambio[1][0].hora_inicio);
comprobar('el lunes tiene 3 clases de manana y 3 de tarde', trasCambio[1].length === 6,
          trasCambio[1].length + ' tramos');
comprobar('el viernes tiene 5', trasCambio[5].length === 5, trasCambio[5].length + ' tramos');
comprobar('la manana acaba a las 13:00', trasCambio[1][2].hora_fin === '13:00',
          trasCambio[1][2].hora_fin);
comprobar('el sabado sigue cerrado', trasCambio[6] === undefined);

const aUnaHora = guardarHorario({
  duracion: 60,
  dias: { 1: { activo: true, manana: ['09:00', '12:00'], tarde: ['', ''] } }
});
limpiarCache();
const deUnaHora = leerHorarioBase_();
comprobar('cambia la duracion a una hora', aUnaHora.ok && deUnaHora[1].length === 3,
          JSON.stringify(aUnaHora.error || deUnaHora[1].length));
comprobar('y solo quedan los dias que dejo abiertos', deUnaHora[2] === undefined);

comprobar('rechaza una duracion imposible',
          guardarHorario({ duracion: 0, dias: {} }).ok === false);
comprobar('rechaza un horario sin ninguna franja',
          guardarHorario({ duracion: 90, dias: { 1: { activo: true, manana: ['10:00', '10:30'], tarde: ['', ''] } } }).ok === false);

// Se deja como estaba para no romper las pruebas que vengan despues
guardarHorario(HORARIO_POR_DEFECTO);

console.log('== Respuestas del panel a medio camino ==');

// El caso real que fallaba: un alumno con clases pendientes Y clases confirmadas
const panelMixto = datosPanel();
const conPendientes = panelMixto.pendientes[0];
const conProximas = panelMixto.proximas[0];

if (conPendientes && conProximas && conPendientes.telefono === conProximas.telefono) {
  comprobar('un alumno puede estar en las dos listas a la vez', true);
}

const inexistente = cambiarEstado(['R00000000000000-XXXX'], 'confirmada', '');
comprobar('avisa cuando el panel manda ids que ya no existen',
          inexistente.ok === false && inexistente.error.indexOf('Actualizar') !== -1,
          JSON.stringify(inexistente));

if (conProximas) {
  const yaConfirmada = cambiarEstado([conProximas.reservas[0].id], 'confirmada', '');
  comprobar('confirmar algo ya confirmado no rompe nada',
            yaConfirmada.ok === true && yaConfirmada.sin_cambios === true,
            JSON.stringify(yaConfirmada));

  const anulada = cambiarEstado([conProximas.reservas[0].id], 'cancelada', 'Prueba');
  comprobar('una clase confirmada si se puede anular', anulada.ok === true,
            JSON.stringify(anulada.error));

  const reconfirmar = cambiarEstado([conProximas.reservas[0].id], 'confirmada', '');
  comprobar('y despues no se puede reconfirmar, con el motivo claro',
            reconfirmar.ok === false && reconfirmar.error.indexOf('cancelada') !== -1,
            JSON.stringify(reconfirmar));
}

// Mezclar una valida con una imposible: se hace lo que se puede
const panelTrasAnular = datosPanel();
if (panelTrasAnular.pendientes.length) {
  const pendiente = panelTrasAnular.pendientes[0].reservas[0];
  const mezcla = cambiarEstado([pendiente.id, 'R00000000000000-XXXX'], 'confirmada', '');
  comprobar('con ids mezclados confirma la que puede',
            mezcla.ok === true && mezcla.reservas.length === 1, JSON.stringify(mezcla));
}

console.log('== Clases viejas de otra duracion ==');
// Sara cambio las clases de 60 a 90 minutos. Una reserva antigua de 09:00 a 10:00
// tiene que seguir tapando el tramo nuevo de 08:30 a 10:00.
limpiarCache();
disp = obtenerDisponibilidad();
const diaFuturo = disp.dias.filter(d =>
  d.franjas.some(f => f.hora_inicio === '08:30') &&
  d.franjas.some(f => f.hora_inicio === '10:00'))[0];

if (diaFuturo) {
  HOJAS['Reservas'].appendRow([
    'R-VIEJA-1', '2026-01-01 10:00:00', diaFuturo.fecha, '09:00', '10:00', 'confirmada',
    'Alumno Antiguo', '376600111', '', 'VIEJA1', '2026-01-01 10:00:00', 'SI', '', 'G-VIEJO'
  ]);

  limpiarCache();
  disp = obtenerDisponibilidad();
  const mismoDia = disp.dias.filter(d => d.fecha === diaFuturo.fecha)[0];
  const sigue0830 = mismoDia && mismoDia.franjas.some(f => f.hora_inicio === '08:30');

  comprobar('una clase de 09:00 tapa el tramo de 08:30 a 10:00', !sigue0830,
            'el tramo de 08:30 sigue ofreciendose');

  const intento = crearReserva({
    nombre: 'Intruso Prueba', telefono: '672599',
    huecos: [{ fecha: diaFuturo.fecha, hora_inicio: '08:30' }]
  });
  comprobar('y tampoco deja reservarlo por la fuerza', intento.ok === false,
            JSON.stringify(intento));

  const siguiente = mismoDia && mismoDia.franjas.some(f => f.hora_inicio === '10:00');
  comprobar('pero el tramo de 10:00, que no choca, sigue libre', siguiente === true);
}

console.log('\n' + (fallos === 0 ? 'TODO CORRECTO' : fallos + ' PRUEBAS FALLIDAS'));
process.exit(fallos === 0 ? 0 : 1);
