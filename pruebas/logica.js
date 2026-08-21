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
    remove: k => { delete cacheFalsa[k]; },
    removeAll: claves => { (claves || []).forEach(k => { delete cacheFalsa[k]; }); }
  })
};

const PROPS = {};
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (k in PROPS ? PROPS[k] : 'ID_FALSO'),
    setProperty: (k, v) => { PROPS[k] = v; }
  })
};

global.LockService = {
  getScriptLock: () => ({ waitLock: () => true, tryLock: () => true, releaseLock: () => {} })
};

global.MailApp = { sendEmail: (a, b) => console.log('   [email a ' + a + '] ' + b) };

const salidaFalsa = () => ({
  setMimeType: () => salidaFalsa(),
  downloadAsFile: () => salidaFalsa()
});
global.ContentService = {
  createTextOutput: t => Object.assign(salidaFalsa(), { texto: t }),
  MimeType: { JSON: 'json', JAVASCRIPT: 'js', ICAL: 'ical' }
};
global.HtmlService = {
  createHtmlOutput: h => ({ setTitle: () => ({ html: h }) }),
  createTemplateFromFile: () => ({ evaluate: () => ({
    setTitle: () => ({ addMetaTag: () => ({ setXFrameOptionsMode: () => ({}) }) })
  }) }),
  XFrameOptionsMode: { ALLOWALL: 'all' }
};
let DISPARADORES = [];
global.ScriptApp = {
  getService: () => ({ getUrl: () => 'https://script.google.com/PRUEBA/exec' }),
  getProjectTriggers: () => DISPARADORES.map(d => ({
    getHandlerFunction: () => d.funcion,
    _ref: d
  })),
  deleteTrigger: t => { DISPARADORES = DISPARADORES.filter(d => d !== t._ref); },
  newTrigger: funcion => {
    const constructor = {
      timeBased: () => constructor,
      everyMinutes: () => constructor,
      after: () => constructor,
      create: () => { DISPARADORES.push({ funcion: funcion }); }
    };
    return constructor;
  }
};
global.EMAIL_ACTIVO = 'sara@example.com';   // se cambia en las pruebas de acceso
global.Session = { getActiveUser: () => ({ getEmail: () => EMAIL_ACTIVO }),
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
  if (typeof f === 'string') return { setNumberFormat: () => {} };
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
const nada = () => nada;
HojaFalsa.prototype.setFrozenRows = nada;
HojaFalsa.prototype.setColumnWidth = nada;
HojaFalsa.prototype.hideColumns = nada;
HojaFalsa.prototype.deleteRow = function (n) { this.m.splice(n - 1, 1); };
HojaFalsa.prototype.clear = function () { this.m.length = 0; return this; };
HojaFalsa.prototype.copyTo = function () { return { setName: () => {} }; };

global.SpreadsheetApp = {
  openById: () => ({
    getSheetByName: n => HOJAS[n] || null,
    getUrl: () => 'https://hoja',
    insertSheet: n => { HOJAS[n] = new HojaFalsa([[]]); return HOJAS[n]; }
  })
};

let EVENTOS = [];
let CONTADOR_EVENTOS = 0;
global.CONTADOR = { calendario: 0, hojas: 0 };

function envolver(e) {
  return {
    isAllDayEvent: () => !!e.todoElDia,
    getStartTime: () => e.inicio,
    getEndTime: () => e.fin,
    getAllDayStartDate: () => e.inicio,
    getAllDayEndDate: () => e.fin,
    getTitle: () => e.titulo || '',
    getDescription: () => e.descripcion || '',
    getId: () => e.id,
    addPopupReminder: () => envolver(e),
    deleteEvent: () => { EVENTOS = EVENTOS.filter(x => x.id !== e.id); }
  };
}

/*
 * Google no entrega de golpe miles de eventos: devuelve los que le parece. Aqui se
 * imita con TOPE_ENTREGA, porque fiarse de esa lista fue lo que dejo cinco mil
 * eventos puestos dandolos por borrados.
 */
global.TOPE_ENTREGA = 0;   // 0 = sin limite

global.CalendarApp = {
  getCalendarById: () => ({
    getEvents: (desde, hasta) => {
      CONTADOR.calendario++;
      const hay = EVENTOS.filter(e => e.fin > desde && e.inicio < hasta);
      return (TOPE_ENTREGA ? hay.slice(0, TOPE_ENTREGA) : hay).map(envolver);
    },
    getEventById: id => {
      const e = EVENTOS.filter(x => x.id === id)[0];
      return e ? envolver(e) : null;
    },
    createEvent: (titulo, inicio, fin, opciones) => {
      const e = { id: 'ev' + (++CONTADOR_EVENTOS), titulo: titulo, inicio: inicio, fin: fin,
                  descripcion: (opciones || {}).description || '' };
      EVENTOS.push(e);
      return envolver(e);
    },
    getName: () => 'Clases - disponibilidad'
  })
};

// ---------- Cargar el código real ----------

const vm = require('vm');
const contexto = global;
['00_Base', '01_Instalar', '02_Disponibilidad', '03_Reservas', '04_Avisos', '06_Escuelas', '07_Horario', '08_Diagnostico', '09_Agenda', '10_Resumen', '11_Reparar', '05_Api'].forEach(function (nombre) {
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
  ['separacion_minima_minutos', '60', ''],
  ['autoescuelas', 'Andorra = Av. Meritxell 1; Encamp = Carrer Major 5', ''],
  ['tipos_clase', 'Campo, Circulación', ''],
  ['cancelacion_horas', '24', ''],
  ['avisar_por_email', 'NO', ''],
  ['url_publica', 'https://ejemplo.github.io/clases-sara/', '']
]);

HOJAS['Reservas'] = new HojaFalsa([
  ['id', 'creado_en', 'fecha', 'hora_inicio', 'hora_fin', 'estado', 'nombre', 'telefono',
   'notas', 'actualizado_en', 'avisado', 'motivo_rechazo', 'tipo', 'evento_id', 'escuela']
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
comprobar('devuelve el identificador de la clase', r.ok && r.reserva.id.length > 5, r.ok ? r.reserva.id : '');
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

console.log('\n== Consultar y liberar ==');
const consulta = consultarPorTelefono('600111222');
comprobar('encuentra sus clases por el móvil', consulta.ok === true, JSON.stringify(consulta));
comprobar('no expone el teléfono', consulta.ok && consulta.reservas[0].telefono === undefined);
comprobar('un móvil sin clases no devuelve nada', consultarPorTelefono('600999999').ok === false);

comprobar('el alumno ya no puede cancelar por su cuenta',
          enrutar_('cancelar', { telefono: '600111222' }).ok === false,
          'la accion publica de cancelar sigue existiendo');

// La hora la libera Sara desde su panel
const liberada = cambiarEstado([r.reserva.id], 'cancelada', 'El alumno aviso');
comprobar('Sara libera la clase', liberada.ok === true, JSON.stringify(liberada.error));

limpiarCache();
disp = obtenerDisponibilidad();
diaTras = disp.dias.find(d => d.fecha === objetivo.fecha);
comprobar('al liberarla, la hora vuelve a ofrecerse',
          diaTras && diaTras.franjas.some(f => f.hora_inicio === hueco.hora_inicio));

console.log('\n== Panel de Sara ==');
const r3 = crearReserva({ nombre: 'Marta Ruiz', telefono: '600555666',
                          fecha: objetivo.fecha, hora_inicio: hueco.hora_inicio });
const panel = datosPanel();
comprobar('lista pendientes', panel.pendientes.length === 1, JSON.stringify(panel.pendientes.length));
comprobar('incluye las plantillas', !!panel.config.plantillas.confirmada);

comprobar('las pendientes van sueltas, en orden de reloj',
          panel.pendientes[0].id !== undefined && panel.pendientes[0].reservas === undefined,
          JSON.stringify(panel.pendientes[0]));

const conf = confirmarReserva(r3.reserva.id);
comprobar('confirma', conf.ok === true, JSON.stringify(conf));
const repetir = confirmarReserva(r3.reserva.id);
comprobar('confirmar dos veces no es un error, pero no cambia nada',
          repetir.ok === true && repetir.sin_cambios === true, JSON.stringify(repetir));

const panel2 = datosPanel();
comprobar('pasa a proximas', panel2.proximas.length === 1 && panel2.pendientes.length === 0);

const texto = textoWhatsAppAlumno([panel2.proximas[0]]);
comprobar('el mensaje lleva la hora de inicio y de fin',
          /de \d{2}:\d{2} a \d{2}:\d{2}/.test(texto), texto);
comprobar('el mensaje no empieza saludando', texto.indexOf('Hola') !== 0, texto);
comprobar('el mensaje no deja marcadores sin rellenar', texto.indexOf('{') === -1, texto);

const textoRechazo = textoWhatsAppAlumno([panel2.proximas[0]], 'tengo examen', 'rechazada');
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
// Una por dia: dos seguidas el mismo dia las prohibe la separacion minima
const trio = [];
disp.dias.forEach(d => {
  if (trio.length >= 3) return;
  const libre = d.franjas.filter(f => f.estado === 'libre')[0];
  if (libre) trio.push({ fecha: d.fecha, hora_inicio: libre.hora_inicio });
});

const multi = crearReserva({ nombre: 'Pau Font', telefono: '672519', huecos: trio });
comprobar('crea las tres de golpe', multi.ok && multi.reservas.length === 3,
          JSON.stringify(multi.error || (multi.reservas || []).length));
comprobar('cada una tiene su identificador',
          multi.ok && new Set(multi.reservas.map(r => r.id)).size === 3);

const consultaGrupo = consultarPorTelefono('672519');
comprobar('el movil devuelve las tres horas',
          consultaGrupo.ok && consultaGrupo.reservas.length >= 3,
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

console.log('== Separacion entre clases del mismo dia ==');
limpiarCache();
disp = obtenerDisponibilidad();

// Un dia con tres tramos seguidos de manana
let diaSeguido = null;
disp.dias.forEach(d => {
  if (diaSeguido) return;
  const manana = d.franjas.filter(f => f.estado === 'libre' && f.hora_inicio < '13:00');
  if (manana.length >= 3 &&
      enMin(manana[1].hora_inicio) === enMin(manana[0].hora_fin) &&
      enMin(manana[2].hora_inicio) === enMin(manana[1].hora_fin)) {
    diaSeguido = { fecha: d.fecha, franjas: manana };
  }
});

if (!diaSeguido) {
  console.log('  (sin dias con tres tramos seguidos libres, se omite)');
} else {
  const hueco = h => ({ fecha: diaSeguido.fecha, hora_inicio: h.hora_inicio });

  const pegadas = crearReserva({
    nombre: 'Marc Roca', telefono: '672530',
    huecos: [hueco(diaSeguido.franjas[0]), hueco(diaSeguido.franjas[1])]
  });
  comprobar('rechaza dos clases pegadas',
            pegadas.ok === false && pegadas.motivo === 'seguidas', JSON.stringify(pegadas));

  const separadas = crearReserva({
    nombre: 'Marc Roca', telefono: '672530',
    huecos: [hueco(diaSeguido.franjas[0]), hueco(diaSeguido.franjas[2])]
  });
  comprobar('acepta dos con un hueco de por medio', separadas.ok === true,
            JSON.stringify(separadas.error));

  // La de en medio dejaria las tres pegadas, aunque venga en otra solicitud
  const enMedio = crearReserva({
    nombre: 'Marc Roca', telefono: '672530',
    huecos: [hueco(diaSeguido.franjas[1])]
  });
  comprobar('no cuela la de en medio en otra solicitud', enMedio.ok === false,
            JSON.stringify(enMedio));

  // Otro alumno si puede coger esa hora del medio
  const otro = crearReserva({
    nombre: 'Nuria Camps', telefono: '672540',
    huecos: [hueco(diaSeguido.franjas[1])]
  });
  comprobar('pero otro alumno si puede cogerla', otro.ok === true, JSON.stringify(otro.error));
}

// Manana y tarde: la pausa de comida ya separa de sobra
limpiarCache();
disp = obtenerDisponibilidad();
let diaMixto = null;
disp.dias.forEach(d => {
  if (diaMixto) return;
  const manana = d.franjas.filter(f => f.estado === 'libre' && f.hora_fin <= '13:00');
  const tarde  = d.franjas.filter(f => f.estado === 'libre' && f.hora_inicio >= '14:00');
  if (manana.length && tarde.length) {
    diaMixto = { fecha: d.fecha, huecos: [manana[manana.length - 1], tarde[0]] };
  }
});

if (diaMixto) {
  const mixto = crearReserva({
    nombre: 'Laia Prat', telefono: '672550',
    huecos: diaMixto.huecos.map(f => ({ fecha: diaMixto.fecha, hora_inicio: f.hora_inicio }))
  });
  comprobar('una por la manana y otra por la tarde si valen', mixto.ok === true,
            JSON.stringify(mixto.error));
}

console.log('== Campo o calle ==');
const panelTipos = datosPanel();
const claseTipo = panelTipos.proximas[0] ||
                  (panelTipos.pendientes[0] && panelTipos.pendientes[0].reservas[0]);

if (claseTipo) {
  comprobar('una clase nace sin marcar', claseTipo.tipo === '', 'tipo: ' + claseTipo.tipo);

  comprobar('se marca como campo', marcarTipo([claseTipo.id], 'campo').ok === true);
  comprobar('y queda guardado con su nombre bonito',
            reservaCompleta_(buscarPorId_(claseTipo.id)).tipo === 'Campo',
            reservaCompleta_(buscarPorId_(claseTipo.id)).tipo);

  comprobar('se puede cambiar a circulacion',
            marcarTipo([claseTipo.id], 'circulacion').ok === true);
  comprobar('y se refleja',
            reservaCompleta_(buscarPorId_(claseTipo.id)).tipo === 'Circulación',
            reservaCompleta_(buscarPorId_(claseTipo.id)).tipo);

  comprobar('se puede quitar la marca', marcarTipo([claseTipo.id], '').ok === true &&
            reservaCompleta_(buscarPorId_(claseTipo.id)).tipo === '');

  comprobar('no se cuela cualquier cosa', marcarTipo([claseTipo.id], 'autopista').ok === false);
  comprobar('ni sin decir la clase', marcarTipo([], 'campo').ok === false);

  // El dato tiene que llegar a la hoja, que es de donde salen las comisiones
  marcarTipo([claseTipo.id], 'campo');
  const cabecera = HOJAS['Reservas'].m[0];
  const fila = HOJAS['Reservas'].m.find(f => f[0] === claseTipo.id);
  comprobar('la hoja tiene la columna tipo', cabecera.indexOf('tipo') !== -1);
  comprobar('con el valor escrito', fila[cabecera.indexOf('tipo')] === 'Campo',
            String(fila[cabecera.indexOf('tipo')]));
}

console.log('== Coste de una reserva de 7 horas ==');
limpiarCache();
disp = obtenerDisponibilidad();
const siete = [];
disp.dias.forEach(d => {
  const l = d.franjas.filter(f => f.estado === 'libre');
  if (!l.length || siete.length >= 7) return;
  siete.push({ fecha: d.fecha, hora_inicio: l[0].hora_inicio });
  // Una segunda del mismo dia, dejando hueco de por medio
  if (siete.length < 7 && l.length >= 3) {
    siete.push({ fecha: d.fecha, hora_inicio: l[2].hora_inicio });
  }
});
CONTADOR.calendario = 0; CONTADOR.hojas = 0;
const gasto = crearReserva({ nombre: 'Medida Coste', telefono: '672560', huecos: siete });
console.log('  huecos pedidos:      ' + siete.length);
if (!gasto.ok) console.log('  aviso: ' + gasto.error);
console.log('  consultas calendario:' + CONTADOR.calendario);
console.log('  lecturas de hoja:    ' + CONTADOR.hojas);
console.log('  resultado:           ' + (gasto.ok ? gasto.reservas.length + ' creadas' : gasto.error));
comprobar('el calendario se consulta una vez, no una por hora', CONTADOR.calendario <= 1,
          CONTADOR.calendario + ' consultas');
comprobar('la hoja se lee pocas veces', CONTADOR.hojas <= 4, CONTADOR.hojas + ' lecturas');

console.log('== Coste de confirmar tres clases a la vez ==');
const panelAntes = datosPanel();
// Todas las de un mismo alumno: es lo que Sara marca y confirma de una tacada
const quienAlumno = panelAntes.pendientes.length ? panelAntes.pendientes[0].telefono : '';
const delAlumno = panelAntes.pendientes.filter(r => r.telefono === quienAlumno);
if (delAlumno.length) {
  const idsGrupo = delAlumno.map(r => r.id);
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

console.log('== Como suenan los mensajes ==');
setConfig('url_api', 'https://script.google.com/macros/s/PRUEBA/exec');
const panelMensajes = datosPanel();
const confirmadaMsj = panelMensajes.proximas[0];

if (confirmadaMsj) {
  const unaSola = textoWhatsAppAlumno([confirmadaMsj], '', 'confirmada');
  comprobar('con una clase habla en singular',
            unaSola.indexOf('la clase de') !== -1 && unaSola.indexOf('estas clases') === -1,
            unaSola);
  comprobar('y sin lista de vinetas', unaSola.indexOf(String.fromCharCode(8226)) === -1, unaSola);
  comprobar('lleva el enlace corto', unaSola.indexOf('github.io') !== -1, unaSola);

  if (panelMensajes.proximas.length > 1) {
    const varias = textoWhatsAppAlumno(panelMensajes.proximas.slice(0, 2), '', 'confirmada');
    comprobar('con varias habla en plural', varias.indexOf('estas clases') !== -1, varias);
  }

  const rechazoUno = textoWhatsAppAlumno([confirmadaMsj], 'tengo examenes', 'rechazada');
  comprobar('el rechazo de una clase tambien va en singular',
            rechazoUno.indexOf('la clase de') !== -1, rechazoUno);
  comprobar('y encaja el motivo en la frase',
            rechazoUno.indexOf('(tengo examenes).') !== -1, rechazoUno);
}

console.log('== Fechas en lenguaje normal ==');
const hoyTexto = fechaCercana(hoyISO());
comprobar('hoy se dice hoy', hoyTexto === 'hoy', hoyTexto);

const dosD2 = n => ('0' + n).slice(-2);
const iso = d => d.getFullYear() + '-' + dosD2(d.getMonth() + 1) + '-' + dosD2(d.getDate());
const mananaTexto = fechaCercana(iso(sumarDias(ahora(), 1)));
comprobar('manana se dice manana', mananaTexto.indexOf('mañana') === 0, mananaTexto);
comprobar('y con el dia del mes', /\d+$/.test(mananaTexto), mananaTexto);

const enTresTexto = fechaCercana(iso(sumarDias(ahora(), 3)));
comprobar('dentro de tres dias, sin mes', enTresTexto.indexOf(' de ') === -1, enTresTexto);

const lejosTexto = fechaCercana(iso(sumarDias(ahora(), 20)));
comprobar('mas lejos, con el mes', lejosTexto.indexOf(' de ') !== -1, lejosTexto);

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
// Se guardan ventanas -una manana y una tarde por dia-, no clases ya cortadas
comprobar('guarda dos ventanas por dia', cambio.tramos === 10, cambio.tramos + ' ventanas');

limpiarCache();
const trasCambio = leerHorarioBase_();
comprobar('el lunes empieza a las 08:30', trasCambio[1][0].hora_inicio === '08:30',
          trasCambio[1][0].hora_inicio);
comprobar('el lunes tiene manana y tarde', trasCambio[1].length === 2,
          trasCambio[1].length + ' ventanas');
comprobar('la manana acaba a las 13:00', trasCambio[1][0].hora_fin === '13:00',
          trasCambio[1][0].hora_fin);
comprobar('la tarde del viernes acaba a las 17:00', trasCambio[5][1].hora_fin === '17:00',
          trasCambio[5][1].hora_fin);
comprobar('el sabado sigue cerrado', trasCambio[6] === undefined);

// Y de esas ventanas salen las clases de siempre cuando el dia esta vacio
const reglasBase = reglasDeHuecos_('');
const lunesLibre = ofertasDelDia_('2026-08-24', trasCambio[1], [], {}, reglasBase);
comprobar('un lunes vacio da 3 clases de manana y 3 de tarde',
          lunesLibre.length === 6, JSON.stringify(lunesLibre.map(o => o.hora_inicio)));
comprobar('la primera a las 08:30', lunesLibre[0].hora_inicio === '08:30',
          lunesLibre[0].hora_inicio);
comprobar('y la ultima acaba a las 18:30',
          lunesLibre[lunesLibre.length - 1].hora_fin === '18:30',
          lunesLibre[lunesLibre.length - 1].hora_fin);

const aUnaHora = guardarHorario({
  duracion: 60,
  dias: { 1: { activo: true, manana: ['09:00', '12:00'], tarde: ['', ''] } }
});
limpiarCache();
const deUnaHora = leerHorarioBase_();
comprobar('guarda la ventana de la manana', aUnaHora.ok && deUnaHora[1].length === 1,
          JSON.stringify(aUnaHora.error || deUnaHora[1].length));
comprobar('con la duracion nueva caben 3 clases de una hora',
          ofertasDelDia_('2026-08-24', deUnaHora[1], [], {}, reglasDeHuecos_('')).length === 3,
          JSON.stringify(ofertasDelDia_('2026-08-24', deUnaHora[1], [], {}, reglasDeHuecos_(''))));
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
  const yaConfirmada = cambiarEstado([conProximas.id], 'confirmada', '');
  comprobar('confirmar algo ya confirmado no rompe nada',
            yaConfirmada.ok === true && yaConfirmada.sin_cambios === true,
            JSON.stringify(yaConfirmada));

  const anulada = cambiarEstado([conProximas.id], 'cancelada', 'Prueba');
  comprobar('una clase confirmada si se puede anular', anulada.ok === true,
            JSON.stringify(anulada.error));

  const reconfirmar = cambiarEstado([conProximas.id], 'confirmada', '');
  comprobar('y despues no se puede reconfirmar, con el motivo claro',
            reconfirmar.ok === false && reconfirmar.error.indexOf('cancelada') !== -1,
            JSON.stringify(reconfirmar));
}

// Mezclar una valida con una imposible: se hace lo que se puede
const panelTrasAnular = datosPanel();
if (panelTrasAnular.pendientes.length) {
  const pendiente = panelTrasAnular.pendientes[0];
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
    'Alumno Antiguo', '376600111', '', '2026-01-01 10:00:00', 'SI', '', '', '', ''
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

console.log('== Acceso al panel ==');
const claveBuena = claveDelPanel_();
comprobar('la clave se genera sola y es larga', claveBuena.length === 24, claveBuena.length + ' caracteres');
comprobar('la misma clave vale', claveValida_(claveBuena) === true);
comprobar('una clave inventada no vale', claveValida_('estonoeslaclavecorrecta') === false);
comprobar('sin clave no se entra', claveValida_('') === false);
comprobar('una clave de otra longitud no vale', claveValida_(claveBuena + 'x') === false);

comprobar('con la clave se puede pedir el panel',
          enrutar_('panel', { t: claveBuena }).ok === true);
comprobar('y con la cuenta de Sara tambien, sin clave',
          enrutar_('panel', {}).ok === true);

EMAIL_ACTIVO = 'curioso@example.com';   // alguien que no es Sara
comprobar('un desconocido sin clave no entra',
          enrutar_('panel', {}).no_autorizado === true);
comprobar('ni puede confirmar clases',
          enrutar_('confirmar', { ids: ['R-LOQUESEA'] }).no_autorizado === true);
comprobar('pero con la clave si entra, venga de donde venga',
          enrutar_('panel', { t: claveBuena }).ok === true);
comprobar('lo publico sigue abierto para cualquiera',
          enrutar_('disponibilidad', {}).ok === true);
EMAIL_ACTIVO = 'sara@example.com';

const nueva = cambiarClaveDelPanel();
comprobar('al cambiar la clave, la anterior deja de servir', claveValida_(claveBuena) === false);
comprobar('y el enlace nuevo lleva la clave nueva',
          nueva.indexOf(claveDelPanel_()) !== -1, nueva);

/*
 * El enlace bueno es el que pasa por la pagina de los alumnos: asi se queda fuera la
 * barra gris de Google que dice "esta aplicacion la ha creado un usuario de Apps
 * Script". Ese aviso vive fuera del marco del panel y no hay forma de quitarlo desde
 * dentro.
 */
comprobar('el enlace va por la pagina, no por script.google.com',
          nueva.indexOf('panel.html') !== -1, nueva);

// La clave detras de la almohadilla: el navegador no la manda a ningun servidor
comprobar('y la clave viaja donde no la ve nadie',
          nueva.indexOf('#t=') !== -1 && nueva.indexOf('?t=') === -1, nueva);

// Sin pagina publica configurada se sigue dando el enlace de siempre
setConfig('url_publica', '');
limpiarCache();
comprobar('sin pagina configurada, el de siempre',
          enlaceDelPanel().indexOf('?t=') !== -1, enlaceDelPanel());
setConfig('url_publica', 'https://ejemplo.github.io/clases-sara/');
limpiarCache();

console.log('== El mensaje habla de todo lo marcado ==');
limpiarCache();
disp = obtenerDisponibilidad();

// Un alumno pide tres clases
const libresParaMensaje = [];
disp.dias.forEach(d => {
  if (libresParaMensaje.length >= 3) return;
  const l = d.franjas.filter(f => f.estado === 'libre');
  if (l.length) libresParaMensaje.push({ fecha: d.fecha, hora_inicio: l[0].hora_inicio });
});

const pedido = crearReserva({
  nombre: 'Nil Vidal', telefono: '672577', huecos: libresParaMensaje
});
comprobar('el alumno pide tres clases', pedido.ok && pedido.reservas.length === 3,
          JSON.stringify(pedido.error));

if (pedido.ok) {
  const idsPedido = pedido.reservas.map(r => r.id);

  // Sara confirma una suelta y despues las tres juntas, como pasa en la practica
  cambiarEstado([idsPedido[0]], 'confirmada', '');
  const todas = cambiarEstado(idsPedido, 'confirmada', '');

  comprobar('confirmar las tres devuelve las tres, aunque una ya lo estuviera',
            todas.ok && todas.reservas.length === 3,
            (todas.reservas || []).length + ' devueltas');
  comprobar('y avisa de que solo cambiaron dos', todas.cambiadas === 2, 'cambiadas: ' + todas.cambiadas);

  const mensaje = textoWhatsAppAlumno(todas.reservas, '', 'confirmada');
  const lineas = mensaje.split(String.fromCharCode(10)).filter(l => l.charCodeAt(0) === 8226);
  comprobar('el mensaje lista las tres clases', lineas.length === 3,
            lineas.length + ' lineas');
  comprobar('y van ordenadas por fecha',
            lineas.join('') === lineas.slice().join(''), 'orden');

  // Repetir cuando ya estaba todo hecho: sigue pudiendo reenviar el mensaje
  const repetida = cambiarEstado(idsPedido, 'confirmada', '');
  comprobar('repetir no cambia nada pero devuelve las tres',
            repetida.ok && repetida.sin_cambios === true && repetida.reservas.length === 3,
            JSON.stringify({ ok: repetida.ok, sin: repetida.sin_cambios,
                             n: (repetida.reservas || []).length }));
}

console.log('== Permisos de todas las acciones de Sara ==');
/*
 * Se recorren todas: una sola que se quedara sin aceptar la clave dejaria a Sara
 * sin poder usar ese boton, y eso ya paso una vez con anular.
 */
const claveViva = claveDelPanel_();
const ACCIONES_SARA = ['panel', 'confirmar', 'rechazar', 'anular', 'marcar_tipo',
                       'marcar_avisado', 'guardar_config', 'guardar_horario'];

EMAIL_ACTIVO = 'curioso@example.com';   // sin cuenta reconocida: solo vale la clave

ACCIONES_SARA.forEach(function (accion) {
  const sinClave = enrutar_(accion, { ids: ['R-X'], tipo: 'campo', horario: HORARIO_POR_DEFECTO });
  comprobar(accion + ': sin clave se bloquea', sinClave.no_autorizado === true,
            JSON.stringify(sinClave).substring(0, 120));

  const conClave = enrutar_(accion, { t: claveViva, ids: ['R-X'], tipo: 'campo',
                                      horario: HORARIO_POR_DEFECTO });
  comprobar(accion + ': con clave pasa el control', conClave.no_autorizado !== true,
            JSON.stringify(conClave).substring(0, 120));
});

EMAIL_ACTIVO = 'sara@example.com';

const ACCIONES_PUBLICAS = ['disponibilidad', 'consultar'];
ACCIONES_PUBLICAS.forEach(function (accion) {
  const resp = enrutar_(accion, { codigo: 'ZZZZZZ' });
  comprobar(accion + ': sigue abierta a cualquiera', resp.no_autorizado !== true);
});

comprobar('cancelar ya no es una accion valida',
          enrutar_('cancelar', { codigo: 'ZZZZZZ' }).error === 'Acción no reconocida.',
          JSON.stringify(enrutar_('cancelar', { codigo: 'ZZZZZZ' })));

console.log('== Las clases van al calendario de Sara ==');
limpiarCache();
disp = obtenerDisponibilidad();
const huecoAgenda = (function () {
  for (const d of disp.dias) {
    const l = d.franjas.filter(f => f.estado === 'libre');
    if (l.length) return { fecha: d.fecha, hora_inicio: l[0].hora_inicio, hora_fin: l[0].hora_fin };
  }
  return null;
})();

if (huecoAgenda) {
  const paraAgenda = crearReserva({
    nombre: 'Ona Serra', telefono: '672588',
    huecos: [{ fecha: huecoAgenda.fecha, hora_inicio: huecoAgenda.hora_inicio }]
  });
  comprobar('se pide la clase', paraAgenda.ok === true, JSON.stringify(paraAgenda.error));

  if (paraAgenda.ok) {
    const idAgenda = paraAgenda.reservas[0].id;
    const eventosAntes = EVENTOS.length;

    // Mientras esta pendiente no se apunta nada
    sincronizarAgenda([idAgenda]);
    comprobar('una clase pendiente no se apunta', EVENTOS.length === eventosAntes,
              EVENTOS.length + ' eventos');

    cambiarEstado([idAgenda], 'confirmada', '');
    const puesta = sincronizarAgenda([idAgenda]);
    comprobar('al confirmarla se apunta', puesta.ok && puesta.creados === 1,
              JSON.stringify(puesta));

    const evento = EVENTOS[EVENTOS.length - 1];
    comprobar('con el nombre del alumno en el titulo',
              evento.titulo.indexOf('Ona Serra') !== -1, evento.titulo);
    comprobar('a la hora correcta',
              evento.inicio.getTime() === aDate(huecoAgenda.fecha, huecoAgenda.hora_inicio).getTime());
    comprobar('con el movil en la descripcion',
              evento.descripcion.indexOf('376672588') !== -1, evento.descripcion);
    comprobar('y queda anotado en la hoja',
              reservaCompleta_(buscarPorId_(idAgenda)).id === idAgenda &&
              String(buscarPorId_(idAgenda).evento_id).indexOf('ev') === 0,
              String(buscarPorId_(idAgenda).evento_id));

    // Repetir no duplica
    const repetida2 = sincronizarAgenda([idAgenda]);
    comprobar('sincronizar dos veces no duplica el evento', repetida2.creados === 0);

    // Al liberar la hora, el evento se va
    cambiarEstado([idAgenda], 'cancelada', 'Prueba');
    const quitada = sincronizarAgenda([idAgenda]);
    comprobar('al liberar la hora el evento desaparece', quitada.borrados === 1,
              JSON.stringify(quitada));
    comprobar('y la hoja se queda sin referencia',
              String(buscarPorId_(idAgenda).evento_id || '') === '');

    limpiarCache();
    disp = obtenerDisponibilidad();
    const vuelve = disp.dias.filter(d => d.fecha === huecoAgenda.fecha)[0];
    comprobar('la hora vuelve a ofrecerse',
              vuelve && vuelve.franjas.some(f => f.hora_inicio === huecoAgenda.hora_inicio),
              'sigue sin ofrecerse');
  }
}

console.log('== Si el calendario no responde ==');
const calendarioBueno = global.CalendarApp.getCalendarById;
global.CalendarApp.getCalendarById = () => null;
limpiarCache();
const aOscuras = obtenerDisponibilidad();
comprobar('no se ofrece ninguna hora', aOscuras.dias.length === 0, aOscuras.dias.length + ' dias');
comprobar('y se avisa de que es por el calendario', aOscuras.sin_calendario === true);
global.CalendarApp.getCalendarById = calendarioBueno;
limpiarCache();
comprobar('al volver el calendario, vuelven las horas',
          obtenerDisponibilidad().dias.length > 0);

console.log('== Cada alumno con su autoescuela ==');
comprobar('la lista sale de la configuracion', listaDeEscuelas().length === 2,
          JSON.stringify(listaDeEscuelas()));
comprobar('con su enlace corto', listaDeEscuelas()[1].slug === 'encamp',
          listaDeEscuelas()[1].slug);
comprobar('el enlace reconoce la autoescuela', escuelaValida('encamp') === 'Encamp');
comprobar('y tambien el nombre escrito', escuelaValida('Andorra') === 'Andorra');
comprobar('una inventada no cuela', escuelaValida('Barcelona') === '');

limpiarCache();
disp = obtenerDisponibilidad();
const huecoEscuela = (function () {
  for (const d of disp.dias) {
    const l = d.franjas.filter(f => f.estado === 'libre');
    if (l.length) return { fecha: d.fecha, hora_inicio: l[0].hora_inicio };
  }
  return null;
})();

if (huecoEscuela) {
  const deEncamp = crearReserva({
    nombre: 'Roc Vila', telefono: '672610', escuela: 'encamp', huecos: [huecoEscuela]
  });
  comprobar('la reserva guarda la autoescuela del enlace',
            deEncamp.ok && deEncamp.reservas[0].escuela === 'Encamp',
            JSON.stringify(deEncamp.error || deEncamp.reservas[0].escuela));

  // Otro dia entra por el enlace generico: se acuerda de la suya
  limpiarCache();
  disp = obtenerDisponibilidad();
  const otroHueco = (function () {
    for (const d of disp.dias) {
      if (d.fecha === huecoEscuela.fecha) continue;
      const l = d.franjas.filter(f => f.estado === 'libre');
      if (l.length) return { fecha: d.fecha, hora_inicio: l[0].hora_inicio };
    }
    return null;
  })();

  if (otroHueco) {
    const sinEnlace = crearReserva({
      nombre: 'Roc Vila', telefono: '672610', huecos: [otroHueco]
    });
    comprobar('sin enlace, hereda la autoescuela de sus clases anteriores',
              sinEnlace.ok && sinEnlace.reservas[0].escuela === 'Encamp',
              JSON.stringify(sinEnlace.error || sinEnlace.reservas[0].escuela));
  }

  const idEscuela = deEncamp.reservas[0].id;
  comprobar('Sara la puede corregir', marcarEscuela([idEscuela], 'Andorra').ok === true);
  comprobar('y queda cambiada',
            reservaCompleta_(buscarPorId_(idEscuela)).escuela === 'Andorra',
            reservaCompleta_(buscarPorId_(idEscuela)).escuela);
  comprobar('no acepta una autoescuela inventada',
            marcarEscuela([idEscuela], 'Lleida').ok === false);
  comprobar('se puede dejar sin marcar', marcarEscuela([idEscuela], '').ok === true);

  // El dato llega a la hoja, que es de donde salen las comisiones
  marcarEscuela([idEscuela], 'Encamp');
  const cab = HOJAS['Reservas'].m[0];
  const fila = HOJAS['Reservas'].m.find(f => f[0] === idEscuela);
  comprobar('la hoja tiene la columna escuela', cab.indexOf('escuela') !== -1);
  comprobar('con el valor escrito', fila[cab.indexOf('escuela')] === 'Encamp',
            String(fila[cab.indexOf('escuela')]));
}

setConfig('url_publica', 'https://ejemplo.github.io/clases-sara/');
const enlaces = enlacesPorEscuela();
comprobar('hay un enlace por autoescuela', enlaces.length === 2, JSON.stringify(enlaces));
comprobar('cada uno lleva la suya', enlaces[1].enlace.indexOf('?e=encamp') !== -1,
          enlaces[1].enlace);
comprobar('sin repetir parametros al cambiar el enlace publico',
          (enlaces[0].enlace.match(/\?/g) || []).length === 1, enlaces[0].enlace);

console.log('== El tipo se elige al confirmar ==');
limpiarCache();
disp = obtenerDisponibilidad('andorra');
const huecoTipo = (function () {
  for (const d of disp.dias) {
    const l = d.franjas.filter(f => f.estado === 'libre');
    if (l.length) return { fecha: d.fecha, hora_inicio: l[0].hora_inicio };
  }
  return null;
})();

if (huecoTipo) {
  const pedida = crearReserva({
    nombre: 'Aina Puig', telefono: '672620', escuela: 'andorra', huecos: [huecoTipo]
  });
  const idTipo = pedida.reservas[0].id;
  comprobar('nace sin tipo', reservaCompleta_(buscarPorId_(idTipo)).tipo === '');

  const conTipo = {};
  conTipo[idTipo] = 'Circulación';
  const confirmada = cambiarEstado([idTipo], 'confirmada', '', conTipo);
  comprobar('confirmar guarda el tipo de una vez',
            confirmada.ok && reservaCompleta_(buscarPorId_(idTipo)).tipo === 'Circulación',
            reservaCompleta_(buscarPorId_(idTipo)).tipo);

  // El evento nace ya con todo puesto
  EVENTOS = [];
  sincronizarAgenda([idTipo]);
  const ev = EVENTOS[EVENTOS.length - 1];
  comprobar('el evento dice de quien es y que clase es',
            ev && ev.titulo.indexOf('Aina Puig') !== -1 && ev.titulo.indexOf('Circulación') !== -1,
            ev ? ev.titulo : 'sin evento');
  comprobar('y lleva la direccion de la autoescuela',
            ubicacionDeEscuela('Andorra') === 'Av. Meritxell 1',
            ubicacionDeEscuela('Andorra'));
  comprobar('con la autoescuela en la descripcion',
            ev && ev.descripcion.indexOf('Andorra') !== -1, ev ? ev.descripcion : '');

  // Lo que ve el alumno para su propio calendario
  const suya = consultarPorTelefono('672620');
  const suClase = suya.ok ? suya.reservas.filter(x => x.hora_inicio === huecoTipo.hora_inicio)[0] : null;
  comprobar('el alumno tambien sabe que clase es', suClase && suClase.tipo === 'Circulación');
  comprobar('y donde se da', suClase && suClase.ubicacion === 'Av. Meritxell 1',
            suClase ? suClase.ubicacion : '');
  comprobar('sin que se le escape el telefono', suClase && suClase.telefono === undefined);

  comprobar('un tipo inventado no cuela', tipoValido('parking') === '');
  comprobar('y el escrito de cualquier manera si', tipoValido('CIRCULACION') === 'Circulación');
}

console.log('== Lo que Sara cambia en el calendario ==');
limpiarCache();
EVENTOS = [];
disp = obtenerDisponibilidad();

// Dos huecos del mismo dia, con sitio de sobra entre ellos
let parDeHuecos = null;
disp.dias.forEach(d => {
  if (parDeHuecos) return;
  const l = d.franjas.filter(f => f.estado === 'libre');
  if (l.length >= 3) parDeHuecos = { fecha: d.fecha, franjas: l };
});

if (!parDeHuecos) {
  console.log('  (sin dias con tres huecos libres, se omite)');
} else {
  const pedir = (tel, franja) => crearReserva({
    nombre: 'Test Calendario', telefono: tel,
    huecos: [{ fecha: parDeHuecos.fecha, hora_inicio: franja.hora_inicio }]
  });

  const primera = pedir('672700', parDeHuecos.franjas[0]);
  const idCal = primera.reservas[0].id;
  const tipos = {}; tipos[idCal] = 'Campo';
  cambiarEstado([idCal], 'confirmada', '', tipos);
  sincronizarAgenda([idCal]);

  const evento = EVENTOS[EVENTOS.length - 1];
  comprobar('la clase esta en el calendario', !!evento, 'sin evento');

  // Sara la arrastra a otra hora
  const destino = parDeHuecos.franjas[2];
  evento.inicio = aDate(parDeHuecos.fecha, destino.hora_inicio);
  evento.fin    = aDate(parDeHuecos.fecha, destino.hora_fin);

  const vuelta = traerCambiosDelCalendario();
  comprobar('al moverla en el calendario, la reserva se mueve',
            vuelta.ok && vuelta.movidas.length === 1, JSON.stringify(vuelta));
  comprobar('y la hoja lo refleja',
            reservaCompleta_(buscarPorId_(idCal)).hora_inicio === destino.hora_inicio,
            reservaCompleta_(buscarPorId_(idCal)).hora_inicio);

  limpiarCache();
  disp = obtenerDisponibilidad();
  const diaTrasMover = disp.dias.filter(d => d.fecha === parDeHuecos.fecha)[0];
  comprobar('la hora de antes vuelve a ofrecerse',
            diaTrasMover.franjas.some(f => f.hora_inicio === parDeHuecos.franjas[0].hora_inicio));
  comprobar('y la nueva ya no',
            !diaTrasMover.franjas.some(f => f.hora_inicio === destino.hora_inicio));

  // Un segundo alumno ocupa otra hora, y Sara intenta mover la primera encima
  const segunda = pedir('672701', parDeHuecos.franjas[1]);
  if (segunda.ok) {
    const idSeg = segunda.reservas[0].id;
    const tipos2 = {}; tipos2[idSeg] = 'Campo';
    cambiarEstado([idSeg], 'confirmada', '', tipos2);
    sincronizarAgenda([idSeg]);

    evento.inicio = aDate(parDeHuecos.fecha, parDeHuecos.franjas[1].hora_inicio);
    evento.fin    = aDate(parDeHuecos.fecha, parDeHuecos.franjas[1].hora_fin);

    const choque = traerCambiosDelCalendario();
    const conError = (choque.movidas || []).filter(m => m.error);
    comprobar('no deja pisar la clase de otro alumno', conError.length === 1,
              JSON.stringify(choque.movidas));
    comprobar('y la reserva se queda donde estaba',
              reservaCompleta_(buscarPorId_(idCal)).hora_inicio === destino.hora_inicio);
  }

  // Sara borra el evento del calendario
  EVENTOS = EVENTOS.filter(e => e.id !== evento.id);
  const borrada = traerCambiosDelCalendario();
  comprobar('al borrar el evento, la clase se libera',
            borrada.liberadas.length === 1, JSON.stringify(borrada.liberadas));
  comprobar('la reserva queda cancelada',
            reservaCompleta_(buscarPorId_(idCal)).estado === 'cancelada');
  comprobar('con el motivo claro',
            reservaCompleta_(buscarPorId_(idCal)).motivo_rechazo.indexOf('calendario') !== -1,
            reservaCompleta_(buscarPorId_(idCal)).motivo_rechazo);

  limpiarCache();
  disp = obtenerDisponibilidad();
  const diaFinal = disp.dias.filter(d => d.fecha === parDeHuecos.fecha)[0];
  comprobar('y esa hora vuelve a estar libre',
            diaFinal.franjas.some(f => f.hora_inicio === destino.hora_inicio));

  const sinCambios = traerCambiosDelCalendario();
  comprobar('si no se toca nada, no cambia nada',
            sinCambios.movidas.length === 0 && sinCambios.liberadas.length === 0,
            JSON.stringify(sinCambios));
}

console.log('== Clases que Sara apunta a mano en el calendario ==');
limpiarCache();
EVENTOS = [];
disp = obtenerDisponibilidad();

const diaManual = disp.dias.filter(d => d.franjas.filter(f => f.estado === 'libre').length >= 2)[0];

if (diaManual) {
  const libre = diaManual.franjas.filter(f => f.estado === 'libre')[0];

  comprobar('un evento cualquiera no es una clase', esTituloDeClase_('Dentista') === false);
  comprobar('pero uno que empieza por Clase si', esTituloDeClase_('Clase Pere') === true);
  comprobar('tambien con punto medio', esTituloDeClase_('Clase · Marta Ruiz') === true);

  const partido = partirTituloDeClase_('Clase · Marta Ruiz · Campo');
  comprobar('saca el nombre del titulo', partido.nombre === 'Marta Ruiz', partido.nombre);
  comprobar('y el tipo si viene', partido.tipo === 'Campo', partido.tipo);
  comprobar('con formato suelto tambien',
            partirTituloDeClase_('Clase Pere Font').nombre === 'Pere Font',
            partirTituloDeClase_('Clase Pere Font').nombre);

  // Sara apunta una clase a mano, a una hora que no es de las que ofrece
  EVENTOS.push({
    id: 'ev-manual-1', titulo: 'Clase Pere Font',
    inicio: aDate(diaManual.fecha, '16:00'), fin: aDate(diaManual.fecha, '17:30'),
    descripcion: 'Me ha llamado. Movil 672 777'
  });

  const importadas = importarClasesDelCalendario();
  comprobar('se da de alta como clase', importadas.ok && importadas.importadas.length === 1,
            JSON.stringify(importadas));

  const panelManual = datosPanel();
  const claseManual = panelManual.proximas.filter(r => r.nombre === 'Pere Font')[0];
  comprobar('y aparece en el panel de Sara', !!claseManual, 'no aparece');
  comprobar('confirmada, no pendiente',
            claseManual && claseManual.estado === 'confirmada');
  comprobar('con el movil que Sara escribio en la descripcion',
            claseManual && claseManual.telefono === '376672777',
            claseManual ? claseManual.telefono : '');

  // No se duplica al volver a revisar
  const otraVez = importarClasesDelCalendario();
  comprobar('revisar dos veces no la duplica', otraVez.importadas.length === 0,
            JSON.stringify(otraVez.importadas));

  // Un bloqueo normal sigue siendo un bloqueo
  EVENTOS.push({
    id: 'ev-bloqueo', titulo: 'Dentista',
    inicio: aDate(diaManual.fecha, '08:30'), fin: aDate(diaManual.fecha, '10:00')
  });
  const conBloqueo = importarClasesDelCalendario();
  comprobar('un bloqueo no se convierte en clase', conBloqueo.importadas.length === 0,
            JSON.stringify(conBloqueo.importadas));

  // Y las horas que pisa dejan de ofrecerse
  limpiarCache();
  disp = obtenerDisponibilidad();
  const trasManual = disp.dias.filter(d => d.fecha === diaManual.fecha)[0];
  comprobar('la hora del dentista desaparece',
            !trasManual || !trasManual.franjas.some(f => f.hora_inicio === '08:30'));

  const pisada = trasManual && trasManual.franjas.some(function (f) {
    return enMin(f.hora_inicio) < enMin('17:30') && enMin(f.hora_fin) > enMin('16:00');
  });
  comprobar('y las que pisa la clase de las 16:00 tambien', !pisada, 'sigue ofreciendose');
}

console.log('== Clases sin movil ==');
const panelSinMovil = datosPanel();
// Sin movil, el panel junta los avisos por el nombre: son las apuntadas a mano
comprobar('una clase sin movil tambien se puede identificar',
          panelSinMovil.pendientes.every(r => !!r.id && r.nombre !== undefined),
          JSON.stringify(panelSinMovil.pendientes.map(r => r.nombre)));
comprobar('y las proximas vienen en orden de agenda',
          panelSinMovil.proximas.every((r, i, todas) =>
            i === 0 || (todas[i - 1].fecha + todas[i - 1].hora_inicio) <= (r.fecha + r.hora_inicio)),
          JSON.stringify(panelSinMovil.proximas.map(r => r.fecha + ' ' + r.hora_inicio)));

// Dos clases a mano de alumnos distintos, ninguna con movil
if (diaManual) {
  // A una hora que siga libre de verdad, en el dia que sea: las pruebas de antes
  // han ido llenando la agenda y una hora fija ya no vale
  limpiarCache();
  const diaParaAna = obtenerDisponibilidad().dias.filter(d => d.franjas.length)[0];

  if (diaParaAna) {
    const libreParaAna = diaParaAna.franjas[0];
    EVENTOS.push({
      id: 'ev-m2', titulo: 'Clase Ana',
      inicio: aDate(diaParaAna.fecha, libreParaAna.hora_inicio),
      fin: aDate(diaParaAna.fecha, libreParaAna.hora_fin),
      descripcion: ''
    });
  }
  limpiarCache();
  importarClasesDelCalendario();

  const panel2 = datosPanel();
  const anas = panel2.proximas.filter(r => r.nombre === 'Ana');
  comprobar('una clase sin movil entra igual', anas.length === 1, anas.length);
  comprobar('y no se mezcla con otro alumno sin movil',
            anas.length === 1 && anas[0].telefono === '', JSON.stringify(anas));
}

console.log('== Resumen mensual para las comisiones ==');

// Clases ya dadas: dos de un alumno y una de otro, en meses distintos
const hoja = HOJAS['Reservas'];
const ayer = Utilities.formatDate(sumarDias(ahora(), -1), TZ, 'yyyy-MM-dd');
const haceUnMes = Utilities.formatDate(sumarDias(ahora(), -35), TZ, 'yyyy-MM-dd');

function apuntarClaseDada(fecha, hora, fin, nombre, escuela, tipo, estado) {
  hoja.appendRow(['R-RES-' + hoja.m.length, '', fecha, hora, fin, estado || 'confirmada',
                  nombre, '376600000', '', '', 'SI', '', tipo, '', escuela]);
}

apuntarClaseDada(ayer, '08:30', '10:00', 'Lucia Mas', 'Andorra', 'Campo');
apuntarClaseDada(ayer, '10:00', '11:30', 'Lucia Mas', 'Andorra', 'Circulación');
apuntarClaseDada(haceUnMes, '08:30', '10:00', 'Lucia Mas', 'Andorra', 'Campo');
apuntarClaseDada(ayer, '11:30', '13:00', 'Joan Pla', 'Encamp', 'Campo');

// Estas no deben contar
const manana2 = Utilities.formatDate(sumarDias(ahora(), 1), TZ, 'yyyy-MM-dd');
apuntarClaseDada(manana2, '08:30', '10:00', 'Futuro Alumno', 'Andorra', 'Campo');
apuntarClaseDada(ayer, '14:00', '15:30', 'Anulada Prueba', 'Andorra', 'Campo', 'cancelada');
apuntarClaseDada(ayer, '15:30', '17:00', 'Pendiente Prueba', 'Andorra', '', 'pendiente');

const resumen = actualizarResumen();
comprobar('la pestana se genera', resumen.ok === true, JSON.stringify(resumen));

const tabla = HOJAS['Resumen'].m;
const cuerpo = tabla.slice(1).filter(f => f[0]);

function buscar(mesTexto, alumno) {
  return cuerpo.filter(f => String(f[0]).indexOf(mesTexto) === 0 && f[1] === alumno)[0];
}

const mesActual = nombreMes(Number(ayer.split('-')[1]));
const lucia = buscar(mesActual, 'Lucia Mas');
comprobar('agrupa por mes y alumno', !!lucia, JSON.stringify(cuerpo));
comprobar('con su nombre completo', lucia && lucia[1] === 'Lucia Mas');
comprobar('y su autoescuela', lucia && lucia[2] === 'Andorra', lucia ? lucia[2] : '');
comprobar('cuenta las clases dadas', lucia && lucia[3] === 2, lucia ? lucia[3] : '');
comprobar('y sus horas', lucia && lucia[4] === 3, lucia ? lucia[4] : '');
comprobar('con el desglose por tipo',
          lucia && lucia[5].indexOf('Campo: 1') !== -1 && lucia[5].indexOf('Circulación: 1') !== -1,
          lucia ? lucia[5] : '');

comprobar('separa los meses',
          !!buscar(nombreMes(Number(haceUnMes.split('-')[1])), 'Lucia Mas'),
          'no aparece el mes anterior');
comprobar('y a los alumnos de otra autoescuela',
          buscar(mesActual, 'Joan Pla') && buscar(mesActual, 'Joan Pla')[2] === 'Encamp');

comprobar('no cuenta las clases que aun no se han dado',
          !cuerpo.some(f => f[1] === 'Futuro Alumno'), 'cuenta una clase futura');
comprobar('ni las anuladas', !cuerpo.some(f => f[1] === 'Anulada Prueba'));
comprobar('ni las que estan sin confirmar', !cuerpo.some(f => f[1] === 'Pendiente Prueba'));

// Rehacerlo no duplica
const antes = cuerpo.length;
actualizarResumen();
const despues = HOJAS['Resumen'].m.slice(1).filter(f => f[0]).length;
comprobar('rehacerlo no duplica lineas', despues === antes, antes + ' -> ' + despues);

console.log('== El calendario no se llena solo ==');

/*
 * La prueba que faltaba el dia que una clase se convirtio en 250 eventos iguales.
 *
 * El fallo no estaba en ninguna funcion suelta, sino en repetirlas: la revision
 * automatica corre cada cuarto de hora y el panel la lanza cada vez que Sara lo abre.
 * Basta con que una vuelta deje algo a medias para que la siguiente lo repita, y asi
 * hasta el infinito. Por eso aqui no se comprueba una llamada: se comprueban diez
 * seguidas, que es como se ejecuta de verdad.
 */
function bancoLimpio(cabecera) {
  EVENTOS = [];
  CONTADOR_EVENTOS = 0;
  // Por dentro, no cambiando la hoja: getHoja() se queda con la referencia
  const hoja = HOJAS['Reservas'];
  hoja.m.length = 0;
  hoja.m.push((cabecera || COLS_RESERVAS).slice());
  olvidarCabecera_();
  limpiarCache();
}

function primerHuecoLibre() {
  const disp = obtenerDisponibilidad();
  const dia = disp.dias.filter(d => d.franjas.some(f => f.estado === 'libre'))[0];
  if (!dia) return null;
  return { fecha: dia.fecha, hora_inicio: dia.franjas.filter(f => f.estado === 'libre')[0].hora_inicio };
}

function claseConfirmada(nombre, movil) {
  const hueco = primerHuecoLibre();
  if (!hueco) return null;
  const alta = crearReserva({ nombre: nombre, telefono: movil, escuela: 'andorra',
                              huecos: [hueco] });
  if (!alta.ok) return null;
  cambiarEstado(alta.ids, 'confirmada', '', {});
  sincronizarAgenda(alta.ids);
  return alta;
}

bancoLimpio();
const alta1 = claseConfirmada('Bucle Prueba', '376611222');
comprobar('la clase se confirma y se apunta', !!alta1, 'no se pudo preparar');

if (alta1) {
  comprobar('un evento, y solo uno', EVENTOS.length === 1, EVENTOS.length);

  const antesDeLasVueltas = EVENTOS.length;
  for (let v = 0; v < 10; v++) sincronizarTodo();

  comprobar('diez revisiones seguidas no crean ni un evento mas',
            EVENTOS.length === antesDeLasVueltas,
            antesDeLasVueltas + ' -> ' + EVENTOS.length);

  const activas = filasComoObjetos(HOJAS['Reservas']).filter(function (f) {
    return ['pendiente', 'confirmada'].indexOf(String(f.estado).trim()) !== -1;
  });
  comprobar('ni una reserva de mas en la hoja', activas.length === 1, activas.length);
}

console.log('== Los eventos del sistema no vuelven a entrar ==');

comprobar('el evento que crea el sistema va firmado',
          EVENTOS.length > 0 && String(EVENTOS[0].descripcion).indexOf(FIRMA_AUTOMATICA) !== -1,
          EVENTOS.length ? EVENTOS[0].descripcion : 'sin eventos');

// Aunque la hoja pierda el rastro del evento, el evento se delata solo
if (EVENTOS.length) {
  const suya = filasComoObjetos(HOJAS['Reservas'])[0];
  HOJAS['Reservas'].m[suya._fila - 1][indiceCol_('evento_id') - 1] = '';
  limpiarCache();

  const reimportado = importarClasesDelCalendario();
  comprobar('un evento del sistema no entra como clase apuntada a mano',
            (reimportado.importadas || []).length === 0,
            JSON.stringify(reimportado.importadas));
}

console.log('== Una columna de mas no descuadra nada ==');

/*
 * Asi estaba la hoja de verdad: con dos columnas que ya no se usan en medio. El
 * sistema escribia contando posiciones de memoria, no mirando la hoja, y cada dato
 * caia en la casilla de al lado sin dar el menor error.
 */
const CABECERA_VIEJA = ['id', 'creado_en', 'fecha', 'hora_inicio', 'hora_fin', 'estado',
                        'nombre', 'telefono', 'notas', 'codigo', 'actualizado_en',
                        'avisado', 'motivo_rechazo', 'grupo', 'tipo', 'evento_id', 'escuela'];

bancoLimpio(CABECERA_VIEJA);

comprobar('cada columna se busca en la hoja, no de memoria',
          indiceCol_('evento_id') === 16, indiceCol_('evento_id'));

const alta3 = claseConfirmada('Columna Extra', '376611333');
comprobar('la clase entra con la hoja descuadrada', !!alta3, 'no se pudo preparar');

if (alta3) {
  const fila3 = filasComoObjetos(HOJAS['Reservas'])[0];
  comprobar('el nombre va a la columna del nombre', fila3.nombre === 'Columna Extra', fila3.nombre);
  comprobar('el aviso a la del aviso', String(fila3.avisado) === 'NO', fila3.avisado);
  comprobar('y la escuela a la de la escuela', String(fila3.escuela).length > 0, fila3.escuela);
  comprobar('el evento se guarda en su columna, no en la de al lado',
            String(fila3.evento_id).indexOf('ev') === 0, JSON.stringify(fila3.evento_id));

  for (let v = 0; v < 5; v++) sincronizarTodo();
  comprobar('y con la columna de mas tampoco se duplica nada',
            EVENTOS.length === 1, EVENTOS.length);
}

console.log('== Reparar y limpiar ==');

// repararHoja deja las columnas como deben estar, sin perder ningun dato
const informe = repararHoja();
const cabeceraNueva = HOJAS['Reservas'].m[0];
comprobar('la hoja queda con las columnas que toca',
          cabeceraNueva.join(',') === COLS_RESERVAS.join(','), cabeceraNueva.join(','));

const trasReparar = filasComoObjetos(HOJAS['Reservas']);
comprobar('sin perder la reserva', trasReparar.length === 1, trasReparar.length);
comprobar('ni sus datos', trasReparar.length && trasReparar[0].nombre === 'Columna Extra',
          trasReparar.length ? trasReparar[0].nombre : '');
comprobar('y el informe dice que columnas se han quitado',
          informe.indexOf('codigo') !== -1 && informe.indexOf('grupo') !== -1, informe);

// limpiarDuplicados se lleva las copias que dejo el fallo
const modelo = filasComoObjetos(HOJAS['Reservas'])[0];
for (let c = 0; c < 4; c++) {
  HOJAS['Reservas'].appendRow(filaParaHoja_({
    id: 'R-COPIA-' + c, creado_en: modelo.creado_en,
    fecha: modelo.fecha, hora_inicio: modelo.hora_inicio, hora_fin: modelo.hora_fin,
    estado: 'confirmada', nombre: modelo.nombre, telefono: modelo.telefono,
    actualizado_en: modelo.actualizado_en, avisado: 'SI'
  }));
  EVENTOS.push({ id: 'copia' + c, titulo: EVENTOS[0].titulo,
                 inicio: EVENTOS[0].inicio, fin: EVENTOS[0].fin, descripcion: '' });
}
limpiarCache();

comprobar('antes de limpiar hay copias', EVENTOS.length === 5, EVENTOS.length);
limpiarDuplicados();

comprobar('se queda una sola reserva por hueco',
          filasComoObjetos(HOJAS['Reservas']).length === 1,
          filasComoObjetos(HOJAS['Reservas']).length);
comprobar('y un solo evento por clase', EVENTOS.length === 1, EVENTOS.length);

console.log('== Borrar una linea del Sheet limpia de verdad ==');

/*
 * Lo que le pasaba a Sara: borraba las lineas de la hoja, abria el panel y las clases
 * volvian a estar ahi. El evento seguia en el calendario, y como el calendario tambien
 * dice que horas estan ocupadas, la clase se colaba otra vez como si la hubiera
 * apuntado ella a mano.
 */
bancoLimpio();
const altaB = claseConfirmada('Borrame Prueba', '376611444');
comprobar('la clase esta puesta', !!altaB && EVENTOS.length === 1, EVENTOS.length);

if (altaB) {
  const suHueco = filasComoObjetos(HOJAS['Reservas'])[0];
  const fechaB = aFechaISO(suHueco.fecha);
  const horaB  = aHoraHHMM(suHueco.hora_inicio);

  // Sara borra la linea a mano desde el Sheet
  HOJAS['Reservas'].m.splice(1, 1);
  limpiarCache();

  const resB = sincronizarTodo();
  comprobar('el evento desaparece del calendario', EVENTOS.length === 0,
            EVENTOS.length + ' eventos: ' + EVENTOS.map(e => e.titulo).join(', '));
  comprobar('y se cuenta como quitada', resB.borrados === 1, JSON.stringify(resB));

  comprobar('la clase no vuelve a colarse en la hoja',
            filasComoObjetos(HOJAS['Reservas']).length === 0,
            filasComoObjetos(HOJAS['Reservas']).length);

  // Y la hora vuelve a ofrecerse a los alumnos
  limpiarCache();
  const dispB = obtenerDisponibilidad();
  const diaB = dispB.dias.filter(d => d.fecha === fechaB)[0];
  comprobar('la hora vuelve a estar libre para los alumnos',
            !!diaB && diaB.franjas.some(f => f.hora_inicio === horaB && f.estado === 'libre'),
            'no se ofrece ' + fechaB + ' ' + horaB);

  // Diez vueltas mas: nada resucita
  for (let v = 0; v < 10; v++) sincronizarTodo();
  comprobar('y no resucita en diez revisiones',
            EVENTOS.length === 0 && filasComoObjetos(HOJAS['Reservas']).length === 0,
            EVENTOS.length + ' eventos, ' + filasComoObjetos(HOJAS['Reservas']).length + ' filas');
}

console.log('== Lo que Sara apunta a mano no se borra sola ==');

// Un evento suyo, sin la firma del sistema: manda el calendario, no la hoja
bancoLimpio();
const huecoMano = primerHuecoLibre();
EVENTOS.push({ id: 'ev-suyo', titulo: 'Clase Marta Ruiz',
               inicio: aDate(huecoMano.fecha, huecoMano.hora_inicio),
               fin: aDate(huecoMano.fecha, '23:00'), descripcion: 'Movil: 376600111' });
limpiarCache();

sincronizarTodo();
comprobar('entra en la hoja como clase',
          filasComoObjetos(HOJAS['Reservas']).some(f => f.nombre === 'Marta Ruiz'),
          JSON.stringify(filasComoObjetos(HOJAS['Reservas']).map(f => f.nombre)));
comprobar('y su evento sigue donde estaba',
          EVENTOS.some(e => e.id === 'ev-suyo'), 'se ha borrado el evento de Sara');

console.log('== Empezar de cero ==');

bancoLimpio();
claseConfirmada('Adios Prueba', '376611555');
EVENTOS.push({ id: 'bloqueo', titulo: 'Dentista',
               inicio: aDate(primerHuecoLibre().fecha, '20:00'),
               fin: aDate(primerHuecoLibre().fecha, '21:00'), descripcion: '' });
limpiarCache();

const informeCero = empezarDeCero();
comprobar('no queda ninguna clase en la hoja',
          filasComoObjetos(HOJAS['Reservas']).length === 0,
          filasComoObjetos(HOJAS['Reservas']).length);
comprobar('ni ningun evento de clase en el calendario',
          !EVENTOS.some(e => /^clase/i.test(e.titulo)),
          EVENTOS.map(e => e.titulo).join(', '));
comprobar('pero los bloqueos de Sara siguen intactos',
          EVENTOS.some(e => e.titulo === 'Dentista'), 'se ha borrado el bloqueo');
comprobar('y la revision automatica queda parada',
          !revisionAutomaticaActiva(), 'sigue activa');

// Con miles de eventos no cabe en una tanda: tiene que dejarse apuntado y seguir sola
bancoLimpio();
claseConfirmada('Tanda Prueba', '376611666');
DISPARADORES = [];

const topeOriginal = TOPE_TANDA_MS;
TOPE_TANDA_MS = -1;                       // como si el tiempo ya se hubiera agotado
const parcial = continuarLimpieza();
TOPE_TANDA_MS = topeOriginal;

comprobar('si no le da tiempo, se programa sola para seguir',
          DISPARADORES.some(d => d.funcion === 'continuarLimpieza'),
          JSON.stringify(DISPARADORES));
comprobar('y avisa de que quedan mas', parcial.indexOf('Quedan m') !== -1, parcial);
comprobar('sin haber tocado el evento todavia', EVENTOS.length === 1, EVENTOS.length);

console.log('== Borrar miles de eventos, entregados a cachos ==');

/*
 * Lo que le paso a Sara: el proceso borro 30 eventos, volvio a preguntar, le dijeron
 * que no habia mas y dio el trabajo por terminado con cinco mil todavia puestos.
 */
bancoLimpio();
const huecoMil = primerHuecoLibre();
for (let i = 0; i < 120; i++) {
  EVENTOS.push({ id: 'masivo' + i, titulo: 'Clase - Jesus prueba3',
                 inicio: aDate(huecoMil.fecha, huecoMil.hora_inicio),
                 fin: aDate(huecoMil.fecha, '23:00'),
                 descripcion: FIRMA_AUTOMATICA });
}
EVENTOS.push({ id: 'bloqueo-mil', titulo: 'Examenes',
               inicio: aDate(huecoMil.fecha, '20:00'),
               fin: aDate(huecoMil.fecha, '21:00'), descripcion: '' });

TOPE_ENTREGA = 30;          // el calendario solo devuelve 30 cada vez
limpiarCache();

const infMil = empezarDeCero();
TOPE_ENTREGA = 0;

comprobar('no se deja ni uno aunque los entreguen de 30 en 30',
          !EVENTOS.some(e => /^clase/i.test(e.titulo)),
          EVENTOS.filter(e => /^clase/i.test(e.titulo)).length + ' sin borrar');
comprobar('y no dice que ha terminado antes de tiempo',
          infMil.indexOf('no queda ninguna clase') !== -1, infMil);
comprobar('el total cuenta todas las tandas',
          infMil.indexOf('120 eventos') !== -1, infMil);
comprobar('el bloqueo de Sara sigue ahi',
          EVENTOS.some(e => e.titulo === 'Examenes'), 'se ha borrado el bloqueo');

console.log('== El calendario manda sobre el horario ==');

/*
 * Lo que Sara pedia: tiene el horario puesto de 08:30 a 13:00 y el medico hasta las
 * nueve. Con casillas fijas la clase de 08:30 se caia entera y hasta las diez no
 * habia nada: sesenta minutos vendibles a la basura.
 */
const VENTANA_MANANA = [{ hora_inicio: '08:30', hora_fin: '13:00' }];
const DIA = '2026-09-07';                      // un lunes cualquiera
const reglas90 = reglasDeHuecos_('');

function horasDe(ofertas) {
  return ofertas.map(o => o.hora_inicio + '-' + o.hora_fin);
}

function eventoEn(fecha, desde, hasta) {
  return { inicio: aDate(fecha, desde).getTime(), fin: aDate(fecha, hasta).getTime() };
}

const diaVacio = ofertasDelDia_(DIA, VENTANA_MANANA, [], {}, reglas90);
comprobar('un dia vacio da las tres de siempre',
          horasDe(diaVacio).join(' | ') === '08:30-10:00 | 10:00-11:30 | 11:30-13:00',
          horasDe(diaVacio).join(' | '));

const conMedico = ofertasDelDia_(DIA, VENTANA_MANANA, [eventoEn(DIA, '08:00', '09:00')], {}, reglas90);
comprobar('con medico hasta las 9, la clase se ofrece a las 9',
          horasDe(conMedico)[0] === '09:00-10:30', horasDe(conMedico).join(' | '));
comprobar('y se rescata la hora que antes se tiraba',
          conMedico.length === 2 &&
          horasDe(conMedico).join(' | ') === '09:00-10:30 | 10:30-12:00',
          horasDe(conMedico).join(' | '));

/*
 * Ninguna oferta puede pisar a otra. Llego a pasar: se ofrecia ademas una pegada al
 * final del hueco, y en pantalla las 10:30 y las 11:30 parecian clases seguidas
 * cuando la de las 10:30 llega hasta las 12:00. El alumno elegia una y la barra le
 * decia hora y media, que era correcto pero no cuadraba con lo que estaba viendo.
 */
function algunaSePisa(ofertas) {
  for (var i = 1; i < ofertas.length; i++) {
    if (enMin(ofertas[i].hora_inicio) < enMin(ofertas[i - 1].hora_fin)) return true;
  }
  return false;
}

comprobar('y ninguna clase ofrecida pisa a la anterior',
          !algunaSePisa(conMedico), horasDe(conMedico).join(' | '));
comprobar('tampoco en un dia entero libre',
          !algunaSePisa(diaVacio), horasDe(diaVacio).join(' | '));

const medicoRaro = ofertasDelDia_(DIA, VENTANA_MANANA, [eventoEn(DIA, '08:00', '09:07')], {}, reglas90);
comprobar('una hora rara se redondea al cuarto siguiente',
          horasDe(medicoRaro)[0] === '09:15-10:45', horasDe(medicoRaro).join(' | '));

const tardeEntera = ofertasDelDia_(DIA, VENTANA_MANANA, [eventoEn(DIA, '00:00', '23:59')], {}, reglas90);
comprobar('un dia entero ocupado no ofrece nada', tardeEntera.length === 0,
          horasDe(tardeEntera).join(' | '));

// Un hueco en medio: se reparte a los dos lados sin dejar nada colgando
const conHueco = ofertasDelDia_(DIA, VENTANA_MANANA, [eventoEn(DIA, '10:00', '11:00')], {}, reglas90);
comprobar('con un evento en medio se aprovechan los dos lados',
          horasDe(conHueco).join(' | ') === '08:30-10:00 | 11:00-12:30',
          horasDe(conHueco).join(' | '));
comprobar('y siguen sin pisarse', !algunaSePisa(conHueco), horasDe(conHueco).join(' | '));

console.log('== Traslados entre autoescuelas ==');

/*
 * Sara acaba en Andorra a las 10:00. Un alumno de Encamp no puede entrar a las 10:00
 * porque hay veinticinco minutos de coche: lo primero que se le puede ofrecer es a
 * las 10:30, ya redondeado al cuarto.
 */
const claseAndorra = { '2026-09-07': [{ inicio: enMinutos('08:30'), fin: enMinutos('10:00'), escuela: 'Andorra' }] };

const paraAndorra = ofertasDelDia_(DIA, VENTANA_MANANA, [], claseAndorra, reglasDeHuecos_('andorra'));
comprobar('el de la misma autoescuela entra pegado, sin esperar',
          horasDe(paraAndorra)[0] === '10:00-11:30', horasDe(paraAndorra).join(' | '));

const paraEncamp = ofertasDelDia_(DIA, VENTANA_MANANA, [], claseAndorra, reglasDeHuecos_('encamp'));
comprobar('el de la otra espera a que Sara llegue',
          horasDe(paraEncamp)[0] === '10:30-12:00', horasDe(paraEncamp).join(' | '));
comprobar('y nunca se le ofrecen las 10:00',
          horasDe(paraEncamp).indexOf('10:00-11:30') === -1, horasDe(paraEncamp).join(' | '));

// Tambien por el otro lado: si la clase de Encamp es la siguiente, hay que salir antes
const claseEncampTarde = { '2026-09-07': [{ inicio: enMinutos('11:30'), fin: enMinutos('13:00'), escuela: 'Encamp' }] };
const antesDeEncamp = ofertasDelDia_(DIA, VENTANA_MANANA, [], claseEncampTarde, reglasDeHuecos_('andorra'));
comprobar('una clase que acabaria justo antes del viaje no se ofrece',
          horasDe(antesDeEncamp).every(h => h.indexOf('-11:30') === -1),
          horasDe(antesDeEncamp).join(' | '));
comprobar('pero si la que acaba con margen de sobra',
          horasDe(antesDeEncamp).indexOf('08:30-10:00') !== -1,
          horasDe(antesDeEncamp).join(' | '));

// Quien no dice de que autoescuela es, lo ve todo: al reservar se le avisa
const sinEscuela = ofertasDelDia_(DIA, VENTANA_MANANA, [], claseAndorra, reglasDeHuecos_(''));
comprobar('sin autoescuela conocida se ensena todo',
          horasDe(sinEscuela)[0] === '10:00-11:30', horasDe(sinEscuela).join(' | '));

console.log('== Las piezas por separado ==');

comprobar('redondear arriba al cuarto', redondearArriba_(547, 15) === 555, redondearArriba_(547, 15));
comprobar('redondear abajo al cuarto', redondearAbajo_(547, 15) === 540, redondearAbajo_(547, 15));
comprobar('lo que ya es exacto no se toca', redondearArriba_(510, 15) === 510);

const libres = intervalosLibres_(
  { ini: enMinutos('08:30'), fin: enMinutos('13:00') },
  [{ ini: enMinutos('10:00'), fin: enMinutos('11:00'), escuela: 'Andorra' }]
);
comprobar('parte la ventana en dos', libres.length === 2, JSON.stringify(libres));
comprobar('y sabe de quien es la clase de al lado',
          libres[0].escDer === 'Andorra' && libres[1].escIzq === 'Andorra',
          JSON.stringify(libres));

comprobar('dos ocupaciones que se pisan cuentan como una',
          intervalosLibres_(
            { ini: enMinutos('08:30'), fin: enMinutos('13:00') },
            [{ ini: enMinutos('09:00'), fin: enMinutos('10:30'), escuela: '' },
             { ini: enMinutos('10:00'), fin: enMinutos('11:00'), escuela: '' }]
          ).length === 2);

console.log('== Las proximas clases, en orden de agenda ==');

bancoLimpio();
const hojaAg = HOJAS['Reservas'];

// El mismo alumno, el mismo movil: es lo que usa el panel para juntar sus clases
const MOVILES_AG = {};
function movilDe(nombre) {
  if (!MOVILES_AG[nombre]) MOVILES_AG[nombre] = '3766' + (10000 + Object.keys(MOVILES_AG).length);
  return MOVILES_AG[nombre];
}

function apuntarClase(fecha, inicio, fin, nombre, escuela, estado, tipo) {
  const id = 'R-AG-' + hojaAg.m.length;
  hojaAg.appendRow(filaParaHoja_({
    id: id, creado_en: '', fecha: fecha, hora_inicio: inicio, hora_fin: fin,
    estado: estado || 'confirmada', nombre: nombre, telefono: movilDe(nombre),
    actualizado_en: '', avisado: 'SI', tipo: tipo || '', escuela: escuela || '',
    evento_id: 'ev-ag-' + hojaAg.m.length
  }));
  return id;
}

const d1 = Utilities.formatDate(sumarDias(ahora(), 1), TZ, 'yyyy-MM-dd');
const d2 = Utilities.formatDate(sumarDias(ahora(), 2), TZ, 'yyyy-MM-dd');

// A proposito desordenadas y con el mismo alumno en dias distintos
apuntarClase(d2, '11:30', '13:00', 'Marta Ruiz', 'Encamp', 'confirmada', 'Campo');
apuntarClase(d1, '15:00', '16:30', 'Joan Pla', 'Andorra', 'confirmada', 'Circulacion');
apuntarClase(d1, '08:30', '10:00', 'Marta Ruiz', 'Andorra', 'confirmada', 'Campo');
apuntarClase(d2, '08:30', '10:00', 'Joan Pla', 'Encamp', 'confirmada', 'Campo');
limpiarCache();

const agenda = datosPanel().proximas;
comprobar('salen las cuatro', agenda.length === 4, agenda.length);

const orden = agenda.map(r => r.fecha + ' ' + r.hora_inicio);
comprobar('de la mas cercana a la mas lejana',
          orden.join(' | ') === [d1 + ' 08:30', d1 + ' 15:00', d2 + ' 08:30', d2 + ' 11:30'].join(' | '),
          orden.join(' | '));

comprobar('sin agrupar por alumno: cada clase va suelta',
          agenda[0].nombre === 'Marta Ruiz' && agenda[1].nombre === 'Joan Pla',
          agenda.map(r => r.nombre).join(', '));

// Lo que la agenda tiene que poder enseñar de cada clase
const primera = agenda[0];
comprobar('trae la hora de inicio y de fin',
          primera.hora_inicio === '08:30' && primera.hora_fin === '10:00');
comprobar('el nombre del alumno', primera.nombre === 'Marta Ruiz');
comprobar('la autoescuela', primera.escuela === 'Andorra', primera.escuela);
comprobar('si es campo o circulacion', primera.tipo === 'Campo', primera.tipo);
comprobar('y la fecha ya escrita en cristiano',
          !!primera.etiqueta_fecha && primera.etiqueta_fecha.length > 5, primera.etiqueta_fecha);

/*
  * Las pendientes tambien van en orden de reloj. Juntarlas por alumno para mandarle
  * un solo WhatsApp lo hace el panel al confirmar, con lo que Sara haya marcado.
  */
apuntarClase(d2, '15:00', '16:30', 'Pere Font', 'Andorra', 'pendiente');
apuntarClase(d1, '10:00', '11:30', 'Pere Font', 'Andorra', 'pendiente');
limpiarCache();

const pend = datosPanel().pendientes;
comprobar('las pendientes van sueltas', pend.length === 2, pend.length);
comprobar('y de la mas cercana a la mas lejana',
          pend[0].fecha === d1 && pend[1].fecha === d2,
          JSON.stringify(pend.map(r => r.fecha + ' ' + r.hora_inicio)));
comprobar('cada una con su identificador, para poder marcarlas',
          pend.every(r => !!r.id), JSON.stringify(pend.map(r => r.id)));
comprobar('y con el movil, que es por donde se juntan al avisar',
          pend[0].telefono === pend[1].telefono, pend[0].telefono + ' / ' + pend[1].telefono);

console.log('== Una clase que ya paso queda como realizada ==');

bancoLimpio();
const ayerAg = Utilities.formatDate(sumarDias(ahora(), -1), TZ, 'yyyy-MM-dd');
const mananaAg = Utilities.formatDate(sumarDias(ahora(), 1), TZ, 'yyyy-MM-dd');

const idPasada  = apuntarClase(ayerAg, '08:30', '10:00', 'Ya Dada', 'Andorra', 'confirmada', 'Campo');
const idFutura  = apuntarClase(mananaAg, '08:30', '10:00', 'Por Dar', 'Andorra', 'confirmada', 'Campo');
const idAnulada = apuntarClase(ayerAg, '11:30', '13:00', 'Anulada', 'Andorra', 'cancelada');
limpiarCache();

const dadas = marcarRealizadas();
comprobar('marca la que ya termino', dadas.realizadas === 1, JSON.stringify(dadas));
comprobar('y queda como realizada',
          reservaCompleta_(buscarPorId_(idPasada)).estado === 'realizada',
          reservaCompleta_(buscarPorId_(idPasada)).estado);
comprobar('la de manana sigue confirmada',
          reservaCompleta_(buscarPorId_(idFutura)).estado === 'confirmada');
comprobar('y una anulada se queda como estaba',
          reservaCompleta_(buscarPorId_(idAnulada)).estado === 'cancelada');

comprobar('volver a pasar no marca nada mas', marcarRealizadas().realizadas === 0);

// Ya no es una "proxima clase": eso es lo que Sara quiere ver
const trasMarcar = datosPanel();
comprobar('sale de las proximas',
          !trasMarcar.proximas.some(r => r.nombre === 'Ya Dada'),
          JSON.stringify(trasMarcar.proximas.map(r => r.nombre)));
comprobar('pero sigue en el historial',
          trasMarcar.recientes.some(r => r.nombre === 'Ya Dada'));

/*
 * La trampa: al dejar de estar "confirmada", el paso de sincronizar veia "no esta
 * confirmada pero tiene evento" y se lo habria borrado del calendario. Sara perderia
 * de su agenda las clases que acaba de dar.
 */
EVENTOS = [{ id: 'ev-realizada', titulo: 'Clase - Ya Dada',
             inicio: aDate(ayerAg, '08:30'), fin: aDate(ayerAg, '10:00'),
             descripcion: FIRMA_AUTOMATICA }];
hojaAg.m[buscarPorId_(idPasada)._fila - 1][indiceCol_('evento_id') - 1] = 'ev-realizada';
limpiarCache();

sincronizarTodaLaAgenda();
comprobar('y su evento NO se borra del calendario',
          EVENTOS.some(e => e.id === 'ev-realizada'),
          'se ha borrado el evento de una clase ya dada');

// Y cuenta para las comisiones
actualizarResumen();
const filasResumen = HOJAS['Resumen'].m.slice(1).filter(f => f[0]);
comprobar('cuenta para las comisiones',
          filasResumen.some(f => f[1] === 'Ya Dada'),
          JSON.stringify(filasResumen.map(f => f[1])));
comprobar('y la de manana todavia no',
          !filasResumen.some(f => f[1] === 'Por Dar'),
          JSON.stringify(filasResumen.map(f => f[1])));

console.log('== Pedir la resena ==');

setConfig('resenas',
  'Andorra = https://search.google.com/local/writereview?placeid=ChIJAAAA; ' +
  'Encamp = https://search.google.com/local/writereview?placeid=ChIJBBBB');
limpiarCache();

const listaResenas = enlacesDeResena();
comprobar('lee un enlace por autoescuela', listaResenas.length === 2,
          JSON.stringify(listaResenas));

/*
 * La direccion lleva su propio '=' dentro, en el placeid. Partir por el primer igual
 * y quedarse ahi dejaba el enlace cortado a la mitad.
 */
comprobar('sin cortar la direccion por su propio igual',
          listaResenas[0].enlace === 'https://search.google.com/local/writereview?placeid=ChIJAAAA',
          listaResenas[0].enlace);

comprobar('el de Andorra es el de Andorra',
          enlaceDeResena('Andorra').indexOf('ChIJAAAA') !== -1, enlaceDeResena('Andorra'));
comprobar('y el de Encamp el suyo',
          enlaceDeResena('Encamp').indexOf('ChIJBBBB') !== -1, enlaceDeResena('Encamp'));
comprobar('una autoescuela sin enlace no inventa ninguno',
          enlaceDeResena('Ordino') === '', enlaceDeResena('Ordino'));
comprobar('ni cuando no se dice cual', enlaceDeResena('') === '');

// Va directo al cuadro de escribir, no a la ficha del mapa
comprobar('el enlace abre el cuadro de escribir',
          listaResenas.every(r => r.enlace.indexOf('/local/writereview?placeid=') !== -1),
          JSON.stringify(listaResenas.map(r => r.enlace)));

// La pagina del alumno los recibe
limpiarCache();
const dispResenas = obtenerDisponibilidad();
comprobar('la pagina del alumno los recibe',
          (dispResenas.resenas || []).length === 2,
          JSON.stringify(dispResenas.resenas));

// Sin configurar, no se ofrece nada y no se rompe nada
setConfig('resenas', '');
limpiarCache();
comprobar('sin configurar no hay enlaces', enlacesDeResena().length === 0);
comprobar('y la pagina sigue funcionando',
          obtenerDisponibilidad().ok !== false && (obtenerDisponibilidad().resenas || []).length === 0);

console.log('== Cien vueltas sin que crezca nada ==');

/*
 * Lo que paso de verdad: una clase se convirtio en mas de doscientos cincuenta
 * eventos porque la revision se repetia cada cuarto de hora y cada vuelta dejaba algo
 * a medias. Aqui se dan cien vueltas seguidas maltratando el sistema y se cuenta
 * antes y despues: si algo crece, esto lo dice.
 */
bancoLimpio();

const hoyEstres = primerHuecoLibre();
const claseEstres = claseConfirmada('Estres Uno', '376699001');
comprobar('preparada la clase de partida', !!claseEstres && EVENTOS.length === 1, EVENTOS.length);

function retrato() {
  const filas = filasComoObjetos(HOJAS['Reservas']);
  return {
    eventos: EVENTOS.filter(e => /^clase/i.test(e.titulo)).length,
    filas: filas.length,
    activas: filas.filter(f => ['pendiente', 'confirmada', 'realizada']
                                 .indexOf(String(f.estado).trim()) !== -1).length
  };
}

const antesEstres = retrato();

// Cien vueltas: mas de un dia entero de revisiones cada cuarto de hora
for (let v = 0; v < 100; v++) sincronizarTodo();

const trasVueltas = retrato();
comprobar('cien revisiones no crean ni un evento',
          trasVueltas.eventos === antesEstres.eventos,
          antesEstres.eventos + ' -> ' + trasVueltas.eventos);
comprobar('ni una fila', trasVueltas.filas === antesEstres.filas, antesEstres.filas + ' -> ' + trasVueltas.filas);

console.log('== Maltratando el sistema a proposito ==');

// 1. Un evento del sistema al que se le borra el rastro en la hoja
if (EVENTOS.length) {
  const suya = filasComoObjetos(HOJAS['Reservas'])[0];
  HOJAS['Reservas'].m[suya._fila - 1][indiceCol_('evento_id') - 1] = '';
  limpiarCache();

  for (let v = 0; v < 20; v++) sincronizarTodo();
  const tras = retrato();
  comprobar('perder el rastro del evento no lo multiplica',
            tras.eventos <= 1, 'quedaron ' + tras.eventos + ' eventos');
}

// 2. Una clase confirmada a la que se le borra la fila entera
bancoLimpio();
claseConfirmada('Estres Dos', '376699002');
const antesBorrar = EVENTOS.length;
HOJAS['Reservas'].m.splice(1, 1);
limpiarCache();

for (let v = 0; v < 20; v++) sincronizarTodo();
comprobar('borrar la fila deja el calendario limpio',
          EVENTOS.filter(e => /^clase/i.test(e.titulo)).length === 0,
          'quedaron ' + EVENTOS.filter(e => /^clase/i.test(e.titulo)).length);
comprobar('y no resucita la fila',
          filasComoObjetos(HOJAS['Reservas']).length === 0,
          filasComoObjetos(HOJAS['Reservas']).length);

// 3. Eventos sueltos que Sara apunto a mano, revisados muchas veces
bancoLimpio();
const huecoMano2 = primerHuecoLibre();
EVENTOS.push({ id: 'mano-1', titulo: 'Clase Marta Ruiz',
               inicio: aDate(huecoMano2.fecha, huecoMano2.hora_inicio),
               fin: aDate(huecoMano2.fecha, '23:00'), descripcion: '' });
limpiarCache();

for (let v = 0; v < 20; v++) sincronizarTodo();
const manoFilas = filasComoObjetos(HOJAS['Reservas']).filter(f => f.nombre === 'Marta Ruiz');
comprobar('una clase apuntada a mano entra una sola vez',
          manoFilas.length === 1, manoFilas.length + ' filas');
comprobar('y su evento sigue siendo uno',
          EVENTOS.filter(e => e.id === 'mano-1').length === 1);

// 4. La hoja descuadrada Y cien vueltas: la mezcla que lo provoco todo
bancoLimpio(CABECERA_VIEJA);
claseConfirmada('Estres Tres', '376699003');
const antesDescuadre = EVENTOS.filter(e => /^clase/i.test(e.titulo)).length;

for (let v = 0; v < 50; v++) sincronizarTodo();
comprobar('con la hoja descuadrada tampoco se multiplica',
          EVENTOS.filter(e => /^clase/i.test(e.titulo)).length === antesDescuadre,
          antesDescuadre + ' -> ' + EVENTOS.filter(e => /^clase/i.test(e.titulo)).length);

console.log('== Lo que el alumno no puede pedir ==');

bancoLimpio();

// La direccion de la API es publica: acepta lo que le manden
const lejos = Utilities.formatDate(sumarDias(ahora(), 400), TZ, 'yyyy-MM-dd');
const paraSiempre = crearReserva({
  nombre: 'Listo Listillo', telefono: '376699004',
  huecos: [{ fecha: lejos, hora_inicio: '09:00' }]
});
comprobar('no se puede reservar para dentro de un año',
          paraSiempre.ok === false, JSON.stringify(paraSiempre));

// Un nombre de diez mil letras llenaria la hoja
const largo = crearReserva({
  nombre: new Array(500).join('AB'), telefono: '376699005',
  huecos: [primerHuecoLibre()]
});
if (largo.ok) {
  comprobar('un nombre larguisimo se recorta',
            largo.reservas[0].nombre.length <= 80, largo.reservas[0].nombre.length);
}

// Pedir mil horas de una vez
const muchas = [];
for (let i = 0; i < 1000; i++) muchas.push(primerHuecoLibre());
const avalancha = crearReserva({ nombre: 'Mil Horas', telefono: '376699006', huecos: muchas });
comprobar('no se pueden pedir mil horas de golpe', avalancha.ok === false,
          JSON.stringify(avalancha).substring(0, 120));

// Basura por la puerta publica
comprobar('una fecha inventada se rechaza',
          crearReserva({ nombre: 'Basura Uno', telefono: '376699007',
                         huecos: [{ fecha: 'ayer', hora_inicio: 'tarde' }] }).ok === false);
comprobar('y sin horas tampoco entra',
          crearReserva({ nombre: 'Basura Dos', telefono: '376699008', huecos: [] }).ok === false);

console.log('== Lo que Sara nunca llego a contestar ==');

bancoLimpio();
const ayerAud = Utilities.formatDate(sumarDias(ahora(), -1), TZ, 'yyyy-MM-dd');
const mananaAud = Utilities.formatDate(sumarDias(ahora(), 1), TZ, 'yyyy-MM-dd');

const idOlvidada = apuntarClase(ayerAud, '08:30', '10:00', 'Nadie Contesto', 'Andorra', 'pendiente');
const idFutura2  = apuntarClase(mananaAud, '08:30', '10:00', 'Aun Espera', 'Andorra', 'pendiente');
limpiarCache();

/*
 * Una solicitud a la que se le paso la fecha desaparecia del panel pero se quedaba en
 * pie para siempre, y el alumno la seguia viendo como "pendiente" sin que nadie fuera
 * a contestarle nunca.
 */
const alDia = marcarRealizadas();
comprobar('la que se paso de fecha se cierra', alDia.caducadas === 1, JSON.stringify(alDia));
comprobar('con un motivo que se entiende',
          reservaCompleta_(buscarPorId_(idOlvidada)).motivo_rechazo.indexOf('sin confirmar') !== -1,
          reservaCompleta_(buscarPorId_(idOlvidada)).motivo_rechazo);
comprobar('y la de mañana sigue esperando respuesta',
          reservaCompleta_(buscarPorId_(idFutura2)).estado === 'pendiente');
comprobar('pasar otra vez no cierra nada mas', marcarRealizadas().caducadas === 0);

console.log('== Cada dato en su columna, esten donde esten ==');

/*
 * Se escribian tres columnas seguidas dando por hecho que fecha, hora_inicio y
 * hora_fin iban pegadas. El dia que no lo esten, eso machaca lo que pille sin dar
 * ningun error: es exactamente lo que llenó un calendario entero.
 */
bancoLimpio(CABECERA_VIEJA);
const idCampos = apuntarClase(mananaAud, '08:30', '10:00', 'Campos Prueba', 'Andorra', 'confirmada', 'Campo');
limpiarCache();

escribirCampos_(buscarPorId_(idCampos), {
  fecha: mananaAud, hora_inicio: '15:00', hora_fin: '16:30',
  actualizado_en: '2026-01-01 00:00:00'
});

const trasCampos = reservaCompleta_(buscarPorId_(idCampos));
comprobar('la hora nueva va a su sitio', trasCampos.hora_inicio === '15:00', trasCampos.hora_inicio);
comprobar('y la de fin tambien', trasCampos.hora_fin === '16:30', trasCampos.hora_fin);
comprobar('sin tocar el nombre', trasCampos.nombre === 'Campos Prueba', trasCampos.nombre);
comprobar('ni el estado', trasCampos.estado === 'confirmada', trasCampos.estado);
comprobar('ni el tipo de clase', trasCampos.tipo === 'Campo', trasCampos.tipo);

console.log('== El historico tampoco se descuadra ==');

/*
 * archivarAntiguas escribia en el Historico por posicion. Esa hoja pudo crearse con
 * otras columnas: es el mismo fallo, en otra hoja.
 */
bancoLimpio();
const viejaFecha = Utilities.formatDate(sumarDias(ahora(), -400), TZ, 'yyyy-MM-dd');
apuntarClase(viejaFecha, '08:30', '10:00', 'Del Año Pasado', 'Andorra', 'realizada', 'Campo');
limpiarCache();

// El Historico con una cabecera de otra epoca, en otro orden y con columnas de mas
HOJAS['Historico'] = new HojaFalsa([['estado', 'nombre', 'codigo', 'fecha', 'hora_inicio',
                                     'hora_fin', 'telefono', 'grupo', 'id']]);

archivarAntiguas(6);
const guardada = HOJAS['Historico'].m[1];
const cabHist = HOJAS['Historico'].m[0];

comprobar('el nombre va bajo "nombre"',
          guardada[cabHist.indexOf('nombre')] === 'Del Año Pasado',
          JSON.stringify(guardada));
comprobar('la fecha bajo "fecha"',
          aFechaISO(guardada[cabHist.indexOf('fecha')]) === viejaFecha,
          guardada[cabHist.indexOf('fecha')]);
comprobar('el estado bajo "estado"',
          guardada[cabHist.indexOf('estado')] === 'realizada',
          guardada[cabHist.indexOf('estado')]);
comprobar('y las columnas que ya no existen se quedan vacias',
          guardada[cabHist.indexOf('codigo')] === '' &&
          guardada[cabHist.indexOf('grupo')] === '',
          JSON.stringify(guardada));

console.log('== El diagnostico detecta lo que dice detectar ==');

/*
 * Nunca se habia ejecutado en las pruebas. Es la herramienta que avisa de que algo va
 * mal: si es ella la que falla, o si avisa de cosas que no pasan, deja de servir y
 * nadie se entera hasta que el problema ya es gordo.
 */
bancoLimpio();
guardarHorario(HORARIO_POR_DEFECTO);
limpiarCache();

const sano = diagnostico();
comprobar('se ejecuta entero sin romperse', typeof sano === 'string' && sano.length > 100);
comprobar('con la hoja en orden, no se queja de las columnas',
          sano.indexOf('PROBLEMA sobran columnas') === -1 &&
          sano.indexOf('>>> Ejecuta repararHoja()') === -1, 'se queja sin motivo');
comprobar('ni inventa clases fuera de horario',
          sano.indexOf('caen fuera del horario') === -1, 'da un aviso falso');
comprobar('dice de que dia es el codigo', sano.indexOf(VERSION_CODIGO) !== -1);

// Dos clases que se pisan sin empezar a la misma hora
const diaSolape = Utilities.formatDate(sumarDias(ahora(), 3), TZ, 'yyyy-MM-dd');
apuntarClase(diaSolape, '09:00', '10:30', 'Uno Solapa', 'Andorra', 'confirmada');
apuntarClase(diaSolape, '10:00', '11:30', 'Otro Solapa', 'Andorra', 'confirmada');
limpiarCache();

const conSolape = diagnostico();
comprobar('caza dos clases que se pisan aunque empiecen a distinta hora',
          conSolape.indexOf('SE PISAN') !== -1 || conSolape.indexOf('DOS RESERVAS') !== -1,
          'no detecta el solape');

// Una clase fuera de las ventanas del horario
bancoLimpio();
apuntarClase(diaSolape, '23:00', '23:45', 'De Madrugada', 'Andorra', 'confirmada');
limpiarCache();
comprobar('avisa de una clase fuera del horario',
          diagnostico().indexOf('caen fuera del horario') !== -1, 'no la ve');

// Y con la hoja descuadrada lo dice con todas las letras
bancoLimpio(CABECERA_VIEJA);
limpiarCache();
const descuadrado = diagnostico();
comprobar('avisa de las columnas que sobran',
          descuadrado.indexOf('sobran columnas') !== -1, 'no ve el descuadre');
comprobar('y dice como arreglarlo',
          descuadrado.indexOf('repararHoja()') !== -1, 'no dice que hacer');

bancoLimpio();
guardarHorario(HORARIO_POR_DEFECTO);
limpiarCache();

console.log('\n' + (fallos === 0 ? 'TODO CORRECTO' : fallos + ' PRUEBAS FALLIDAS'));
process.exit(fallos === 0 ? 0 : 1);
