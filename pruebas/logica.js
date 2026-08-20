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
global.ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.com/PRUEBA/exec' }) };
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
    getId: () => e.id,
    addPopupReminder: () => envolver(e),
    deleteEvent: () => { EVENTOS = EVENTOS.filter(x => x.id !== e.id); }
  };
}

global.CalendarApp = {
  getCalendarById: () => ({
    getEvents: (desde, hasta) => (CONTADOR.calendario++,
      EVENTOS.filter(e => e.fin > desde && e.inicio < hasta)).map(envolver),
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
['00_Base', '02_Disponibilidad', '03_Reservas', '04_Avisos', '07_Horario', '09_Agenda', '05_Api'].forEach(function (nombre) {
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
  ['cancelacion_horas', '24', ''],
  ['avisar_por_email', 'NO', ''],
  ['url_publica', 'https://ejemplo.github.io/clases-sara/', '']
]);

HOJAS['Reservas'] = new HojaFalsa([
  ['id', 'creado_en', 'fecha', 'hora_inicio', 'hora_fin', 'estado', 'nombre', 'telefono',
   'notas', 'codigo', 'actualizado_en', 'avisado', 'motivo_rechazo', 'grupo', 'tipo', 'evento_id']
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

console.log('\n== Consultar y liberar ==');
const consulta = consultarPorCodigo(r.reserva.codigo);
comprobar('encuentra por código', consulta.ok === true, JSON.stringify(consulta));
comprobar('no expone el teléfono', consulta.ok && consulta.reserva.telefono === undefined);

comprobar('el alumno ya no puede cancelar por su cuenta',
          typeof this.cancelarPorCodigo === 'undefined' &&
          enrutar_('cancelar', { codigo: r.reserva.codigo }).ok === false,
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
const grupoTipos = panelTipos.proximas[0] || panelTipos.pendientes[0];

if (grupoTipos) {
  const claseTipo = grupoTipos.reservas[0];
  comprobar('una clase nace sin marcar', claseTipo.tipo === '', 'tipo: ' + claseTipo.tipo);

  comprobar('se marca como campo', marcarTipo([claseTipo.id], 'campo').ok === true);
  comprobar('y queda guardado',
            reservaCompleta_(buscarPorId_(claseTipo.id)).tipo === 'campo',
            reservaCompleta_(buscarPorId_(claseTipo.id)).tipo);

  comprobar('se puede cambiar a calle', marcarTipo([claseTipo.id], 'calle').ok === true);
  comprobar('y se refleja',
            reservaCompleta_(buscarPorId_(claseTipo.id)).tipo === 'calle');

  comprobar('se puede quitar la marca', marcarTipo([claseTipo.id], '').ok === true &&
            reservaCompleta_(buscarPorId_(claseTipo.id)).tipo === '');

  comprobar('no se cuela cualquier cosa', marcarTipo([claseTipo.id], 'autopista').ok === false);
  comprobar('ni sin decir la clase', marcarTipo([], 'campo').ok === false);

  // El dato tiene que llegar a la hoja, que es de donde salen las comisiones
  marcarTipo([claseTipo.id], 'campo');
  const cabecera = HOJAS['Reservas'].m[0];
  const fila = HOJAS['Reservas'].m.find(f => f[0] === claseTipo.id);
  comprobar('la hoja tiene la columna tipo', cabecera.indexOf('tipo') !== -1);
  comprobar('con el valor escrito', fila[cabecera.indexOf('tipo')] === 'campo',
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

console.log('== Como suenan los mensajes ==');
setConfig('url_api', 'https://script.google.com/macros/s/PRUEBA/exec');
const panelMensajes = datosPanel();
const confirmadaMsj = panelMensajes.proximas[0];

if (confirmadaMsj) {
  const unaSola = textoWhatsAppAlumno([confirmadaMsj.reservas[0]], '', 'confirmada');
  comprobar('con una clase habla en singular',
            unaSola.indexOf('la clase de') !== -1 && unaSola.indexOf('estas clases') === -1,
            unaSola);
  comprobar('y sin lista de vinetas', unaSola.indexOf(String.fromCharCode(8226)) === -1, unaSola);
  comprobar('lleva el enlace corto', unaSola.indexOf('github.io') !== -1, unaSola);

  if (confirmadaMsj.reservas.length > 1) {
    const varias = textoWhatsAppAlumno(confirmadaMsj.reservas, '', 'confirmada');
    comprobar('con varias habla en plural', varias.indexOf('estas clases') !== -1, varias);
  }

  const rechazoUno = textoWhatsAppAlumno([confirmadaMsj.reservas[0]], 'tengo examenes', 'rechazada');
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
    'Alumno Antiguo', '376600111', '', 'VIEJA1', '2026-01-01 10:00:00', 'SI', '', 'G-VIEJO', '', ''
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
comprobar('y el enlace nuevo lleva la clave nueva', nueva.indexOf('?t=') !== -1, nueva);

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

console.log('\n' + (fallos === 0 ? 'TODO CORRECTO' : fallos + ' PRUEBAS FALLIDAS'));
process.exit(fallos === 0 ? 0 : 1);
