/*
 * Pruebas del parte semanal.
 *
 * Cargan partes/Parte.gs sobre una imitación mínima de Google: la hoja de datos, el
 * calendario y, sobre todo, una hoja de cálculo falsa que entiende insertar y borrar
 * filas, combinar celdas y copiar formatos. Es lo que permite comprobar que la
 * plantilla se rellena bien sin tocar Drive.
 *
 *   node pruebas/partes.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallos = 0;
function comprobar(descripcion, condicion, extra) {
  if (condicion) console.log('  OK   ' + descripcion);
  else { fallos++; console.log('  FALLA ' + descripcion + (extra ? '  -> ' + extra : '')); }
}

function dosD(n) { return ('0' + n).slice(-2); }

// ---------- Google, imitado ----------

global.Utilities = {
  formatDate: function (fecha, tz, patron) {
    return patron
      .replace('yyyy', fecha.getFullYear()).replace('MM', dosD(fecha.getMonth() + 1))
      .replace('dd', dosD(fecha.getDate())).replace('HH', dosD(fecha.getHours()))
      .replace('mm', dosD(fecha.getMinutes()));
  }
};
global.Logger = { log: m => console.log('   [log] ' + m) };
const PROPS = {};
global.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => PROPS[k] || null, setProperty: (k, v) => { PROPS[k] = v; } }) };
global.ScriptApp = {
  getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ onWeekDay: () => ({ atHour: () => ({ create: () => {} }) }) }) }),
  getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/PRUEBA/exec' }),
  getOAuthToken: () => 'token', WeekDay: { SATURDAY: 'SATURDAY' }
};
global.MimeType = { GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet', MICROSOFT_EXCEL: 'xlsx' };
global.HtmlService = { createHtmlOutput: h => ({ html: h, setTitle: function () { return this; } }) };
let CORREOS = [];
global.MailApp = { sendEmail: o => CORREOS.push(o) };

/**
 * Una hoja falsa con lo justo: valores en una matriz, filas que se insertan y se
 * borran, celdas que se combinan y formatos que se copian (se apunta de dónde).
 */
function HojaFalsa(nombre, matriz) {
  this.nombre = nombre; this.m = matriz; this.merges = []; this.copias = []; this.formulas = {};
}
HojaFalsa.prototype.getName = function () { return this.nombre; };
HojaFalsa.prototype.getLastRow = function () { return this.m.length; };
HojaFalsa.prototype.getDataRange = function () { return this.getRange(1, 1, this.m.length, Math.max(...this.m.map(f => f.length))); };
HojaFalsa.prototype.asegurar = function (f, c) {
  while (this.m.length < f) this.m.push([]);
  const fila = this.m[f - 1];
  while (fila.length < c) fila.push('');
};
HojaFalsa.prototype.getRange = function (f, c, nf, nc) {
  const hoja = this; nf = nf || 1; nc = nc || 1;
  return {
    fila: f, col: c, nf: nf, nc: nc,
    getValues: () => { const s = []; for (let i = 0; i < nf; i++) { hoja.asegurar(f + i, c + nc - 1); s.push(hoja.m[f - 1 + i].slice(c - 1, c - 1 + nc)); } return s; },
    setValues: v => { v.forEach((fila, i) => { hoja.asegurar(f + i, c + nc - 1); fila.forEach((x, j) => { hoja.m[f - 1 + i][c - 1 + j] = x; }); }); },
    setValue: v => { hoja.asegurar(f, c); hoja.m[f - 1][c - 1] = v; },
    setNumberFormat: function () { return this; },
    setFormula: v => { hoja.asegurar(f, c); hoja.m[f - 1][c - 1] = v; },
    setFormulas: v => { v.forEach((fila, i) => { hoja.asegurar(f + i, c); fila.forEach((x, j) => { hoja.m[f - 1 + i][c - 1 + j] = x; }); }); },
    copyTo: (destino, tipo) => { hoja.copias.push({ de: f, a: destino.fila, tipo: tipo }); },
    merge: () => { hoja.merges.push(f + ':' + c + '-' + (c + nc - 1)); },
    breakApart: () => { hoja.merges = hoja.merges.filter(m => m.indexOf(f + ':') !== 0); }
  };
};
HojaFalsa.prototype.insertRowsBefore = function (f, n) {
  const ancho = Math.max(...this.m.map(x => x.length));
  for (let i = 0; i < n; i++) this.m.splice(f - 1, 0, new Array(ancho).fill(''));
  // Las combinaciones de más abajo se desplazan
  this.merges = this.merges.map(m => { const [r, rest] = m.split(':'); return (Number(r) >= f ? Number(r) + n : Number(r)) + ':' + rest; });
};
HojaFalsa.prototype.deleteRows = function (f, n) {
  this.m.splice(f - 1, n);
  this.merges = this.merges.filter(m => { const r = Number(m.split(':')[0]); return r < f || r >= f + n; })
    .map(m => { const [r, rest] = m.split(':'); return (Number(r) >= f + n ? Number(r) - n : Number(r)) + ':' + rest; });
};

global.SpreadsheetApp = { CopyPasteType: { PASTE_FORMAT: 'formato' }, openById: () => LIBRO_DATOS, flush: () => {} };

// ---------- Cargar el código ----------
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'partes', 'Parte.gs'), 'utf8'), { filename: 'Parte.gs' });

// ---------- Las filas de un día ----------
console.log('\n== De clases a filas ==');

const R = { descanso_max: 30, traslado_max: 60 };
const c = (ini, fin, nombre, escuela, extra) => Object.assign({ inicio: enMin_(ini), fin: enMin_(fin), nombre: nombre, escuela: escuela, categoria: 'B', tipo: 'Circulació' }, extra || {});
const resumen = filas => filas.map(f => (f.especial || f.nombre) + ' ' + f.inicio + '-' + f.fin).join(' | ');

let filas = filasDelDia_([c('10:45', '11:45', 'Queralt', 'Encamp'), c('11:50', '12:50', 'Anthea', 'Encamp')], [], R);
comprobar('cinco minutos entre dos de la misma autoescuela son un Descanso',
          filas.length === 3 && filas[1].especial === 'Descanso' && filas[1].inicio === enMin_('11:45') && filas[1].fin === enMin_('11:50'),
          resumen(filas));

filas = filasDelDia_([c('11:35', '13:05', 'Aleix', 'Encamp'), c('16:30', '17:30', 'Anthea', 'Encamp')], [], R);
comprobar('la comida no se apunta', filas.length === 2, resumen(filas));

filas = filasDelDia_([c('08:30', '10:00', 'Lino', 'Andorra'), c('10:30', '12:00', 'Marco', 'Encamp')], [], R);
comprobar('entre autoescuelas distintas va un Traslado',
          filas.length === 3 && filas[1].especial === 'Traslado', resumen(filas));

filas = filasDelDia_([c('08:30', '10:00', 'Lino', 'Andorra'), c('11:30', '13:00', 'Marco', 'Encamp')], [], R);
comprobar('pero no si hay hora y media de por medio', filas.length === 2, resumen(filas));

filas = filasDelDia_([c('11:00', '12:30', 'Lino', 'Encamp')], [{ inicio: enMin_('07:30'), fin: enMin_('10:30'), especial: 'Examen' }], R);
comprobar('el examen entra como fila y deja un Traslado hasta la clase',
          filas.length === 3 && filas[0].especial === 'Examen' && filas[1].especial === 'Traslado' &&
          filas[1].inicio === enMin_('10:30') && filas[1].fin === enMin_('11:00'),
          resumen(filas));

filas = filasDelDia_([c('09:00', '10:00', 'A', 'Encamp'), c('09:30', '10:30', 'B', 'Encamp')], [], R);
comprobar('dos clases que se pisan no generan descansos raros', filas.length === 2, resumen(filas));

filas = filasDelDia_([c('10:45', '11:45', 'Q', ''), c('11:50', '12:50', 'A', '')], [], R);
comprobar('sin autoescuela apuntada, el hueco corto es un Descanso', filas[1] && filas[1].especial === 'Descanso', resumen(filas));

comprobar('las filas salen en orden de reloj aunque entren desordenadas',
          resumen(filasDelDia_([c('16:00', '17:30', 'Tarde', 'Encamp'), c('08:00', '09:30', 'Mañana', 'Encamp')], [], R)).indexOf('Mañana') === 0);

comprobar('lo que Sara apunta como TRASLADO o desplazamiento no es un alumno',
          filaEspecial_('TRASLADO') === 'Traslado' && filaEspecial_('desplazamiento') === 'Traslado' &&
          filaEspecial_('Pausa') === 'Descanso' && filaEspecial_('Marco Pereira') === '' &&
          filaEspecial_('Tomas Landini') === '');

console.log('\n== Traducciones y nombres ==');
comprobar('Campo -> Camp', traducirTipo_('Campo') === 'Camp', traducirTipo_('Campo'));
comprobar('Circulación -> Circulació', traducirTipo_('Circulación') === 'Circulació', traducirTipo_('Circulación'));
comprobar('Campo y circulación -> Camp / Circulació', traducirTipo_('Campo y circulación') === 'Camp / Circulació');
comprobar('lo desconocido se respeta', traducirTipo_('Autopista') === 'Autopista');
comprobar('vacío sigue vacío', traducirTipo_('') === '');
comprobar('el archivo se llama como los de Sara', nombreArchivo_('2026-08-24') === 'SARA SEMANA 24 AGOSTO.xlsx', nombreArchivo_('2026-08-24'));
comprobar('el título del día', tituloDeDia_('2026-08-24') === 'Lunes 24/08/2026', tituloDeDia_('2026-08-24'));
comprobar('y el del viernes', tituloDeDia_('2026-08-28') === 'Viernes 28/08/2026', tituloDeDia_('2026-08-28'));
comprobar('el lunes de un jueves', fechaISO_(lunesDe_(new Date(2026, 7, 27))) === '2026-08-24');
comprobar('el lunes de un domingo', fechaISO_(lunesDe_(new Date(2026, 7, 30))) === '2026-08-24');
comprobar('reconoce Examen, Exámenes y Exàmens', esExamen_('Examen') && esExamen_('Exámenes') && esExamen_('exàmens') && !esExamen_('MEDICO'));
comprobar('fechas de la hoja, vengan como vengan',
          aFechaISO_(new Date(2026, 7, 24)) === '2026-08-24' && aFechaISO_('2026-08-24') === '2026-08-24' && aFechaISO_('24/8/2026') === '2026-08-24');
comprobar('horas de la hoja, vengan como vengan',
          aHHMM_('8:30') === '08:30' && aHHMM_(new Date(2026, 7, 24, 16, 5)) === '16:05');

// ---------- La semana entera ----------
console.log('\n== La semana ==');

const reservas = [
  { fecha: '2026-08-24', hora_inicio: '08:30', hora_fin: '10:00', estado: 'realizada', nombre: 'Lino', tipo: 'Campo', escuela: 'Andorra', categoria: 'J' },
  { fecha: '2026-08-24', hora_inicio: '10:05', hora_fin: '11:35', estado: 'realizada', nombre: 'Aleix', tipo: 'Circulación', escuela: 'Andorra', categoria: 'B' },
  { fecha: '2026-08-24', hora_inicio: '15:30', hora_fin: '16:30', estado: 'confirmada', nombre: 'Marta', tipo: '', escuela: 'Encamp', categoria: '' },
  { fecha: '2026-08-25', hora_inicio: '08:30', hora_fin: '10:00', estado: 'cancelada', nombre: 'Nadie', tipo: 'Campo', escuela: 'Andorra', categoria: 'B' },
  { fecha: '2026-08-25', hora_inicio: '08:30', hora_fin: '10:00', estado: 'pendiente', nombre: 'Tampoco', tipo: 'Campo', escuela: 'Andorra', categoria: 'B' },
  { fecha: '2026-08-29', hora_inicio: '10:00', hora_fin: '11:00', estado: 'confirmada', nombre: 'Sabado', tipo: 'Campo', escuela: 'Andorra', categoria: 'B' },
  { fecha: '2026-08-17', hora_inicio: '10:00', hora_fin: '11:00', estado: 'realizada', nombre: 'Otra semana', tipo: 'Campo', escuela: 'Andorra', categoria: 'B' },
  { fecha: '2026-08-27', hora_inicio: '18:15', hora_fin: '19:00', estado: 'confirmada', nombre: 'desplazamiento', tipo: '', escuela: '', categoria: '' },
  { fecha: '2026-08-27', hora_inicio: '19:00', hora_fin: '20:30', estado: 'confirmada', nombre: 'Meenu', tipo: 'Campo', escuela: 'Encamp', categoria: 'B' }
];
const examenes = [{ fecha: '2026-08-26', hora_inicio: '09:00', hora_fin: '11:30' }];
const semana = semanaDe_('2026-08-24', reservas, examenes, {});

comprobar('siete días', semana.dias.length === 7 && semana.dias[0].fecha === '2026-08-24' && semana.dias[6].fecha === '2026-08-30');
comprobar('el lunes tiene sus tres clases y un descanso',
          semana.dias[0].clases === 3 && semana.dias[0].filas.length === 4 && semana.dias[0].filas[1].especial === 'Descanso',
          resumen(semana.dias[0].filas));
comprobar('las canceladas y las pendientes no cuentan', semana.dias[1].clases === 0 && semana.dias[1].filas.length === 0);
comprobar('el examen del miércoles entra solo', semana.dias[2].filas.length === 1 && semana.dias[2].filas[0].especial === 'Examen');
comprobar('el "desplazamiento" del jueves es una fila de Traslado, no un alumno',
          semana.dias[3].filas.length === 2 && semana.dias[3].filas[0].especial === 'Traslado' &&
          semana.dias[3].filas[1].nombre === 'Meenu' && semana.dias[3].clases === 1,
          resumen(semana.dias[3].filas));
comprobar('las horas del lunes suman con el descanso', semana.dias[0].minutos === 90 + 5 + 90 + 60, semana.dias[0].minutos);
comprobar('el total de la semana, con la clase del sábado y el jueves', semana.total === 245 + 150 + 60 + 45 + 90, semana.total);
comprobar('avisa de la clase que no tiene tipo, y no da la lata con el permiso',
          semana.avisos.some(a => /1 clase sin tipo/.test(a)) && !semana.avisos.some(a => /categoría/.test(a)),
          JSON.stringify(semana.avisos));
comprobar('y de la clase del sábado, que no cabe en la plantilla',
          semana.avisos.some(a => /fin de semana/.test(a)), JSON.stringify(semana.avisos));
comprobar('el resumen va por días', semana.resumen[0].indexOf('Lunes 24/08/2026: 4 h 05 · 3 clases') === 0 || semana.resumen[0].indexOf('Lunes 24/08/2026: 4 h 5 · 3 clases') === 0, semana.resumen[0]);
comprobar('el tipo sale en catalán', semana.dias[0].filas[0].tipo === 'Camp' && semana.dias[0].filas[2].tipo === 'Circulació');

// ---------- Rellenar la plantilla ----------
console.log('\n== Rellenar la hoja de un día ==');

function plantillaLunes() {
  // Como la de verdad: título, cabecera, clases y descansos de una semana vieja, y Total
  const h = new HojaFalsa('Lunes', [
    ['Lunes 17/08/2026', '', '', '', '', '', ''],
    ['Hora inicio', 'Hora fin', 'Horas', 'Nombre', 'Categoria', 'Tipo', 'Autoescuela'],
    [0.45, 0.49, '=$B3-$A3', 'Queralt', 'B', 'Circulació', 'Encamp'],
    [0.49, 0.495, '=$B4-$A4', 'Descanso', '', '', ''],
    [0.495, 0.53, '=$B5-$A5', 'Anthea', 'J', 'Circulació', 'Encamp'],
    ['Total', '', '=SUM(C3:C5)', '', '', '', '']
  ]);
  h.merges.push('1:1-7', '4:4-7');
  return h;
}

let hoja = plantillaLunes();
let filaTotal = rellenarDia_(hoja, 'Lunes 24/08/2026', semana.dias[0].filas);
comprobar('el título cambia', hoja.m[0][0] === 'Lunes 24/08/2026', hoja.m[0][0]);
comprobar('la cabecera sigue en la fila 2', hoja.m[1][0] === 'Hora inicio');
comprobar('las cuatro filas nuevas empiezan en la 3 y el Total va justo debajo',
          hoja.m[2][3] === 'Lino' && hoja.m[3][3] === 'Descanso' && hoja.m[4][3] === 'Aleix' && hoja.m[5][3] === 'Marta' &&
          hoja.m[6][0] === 'Total' && filaTotal === 7 && hoja.m.length === 7,
          JSON.stringify(hoja.m.map(f => f[3])));
comprobar('las horas van como fracción de día, que es lo que Sheets pinta como hora',
          Math.abs(hoja.m[2][0] - 8.5 / 24) < 1e-9 && Math.abs(hoja.m[2][1] - 10 / 24) < 1e-9, hoja.m[2][0]);
comprobar('cada fila lleva su fórmula de horas',
          hoja.m[2][2] === '=$B3-$A3' && hoja.m[5][2] === '=$B6-$A6', hoja.m[5][2]);
comprobar('y el Total suma justo las filas nuevas', hoja.m[6][2] === '=SUM(C3:C6)', hoja.m[6][2]);
comprobar('la categoría, el tipo y la autoescuela van en sus columnas',
          hoja.m[2][4] === 'J' && hoja.m[2][5] === 'Camp' && hoja.m[2][6] === 'Andorra', JSON.stringify(hoja.m[2]));
comprobar('el descanso lleva las celdas unidas y las clases no',
          hoja.merges.indexOf('4:4-7') !== -1 && hoja.merges.indexOf('3:4-7') === -1 && hoja.merges.indexOf('5:4-7') === -1,
          JSON.stringify(hoja.merges));
comprobar('el título sigue unido', hoja.merges.indexOf('1:1-7') !== -1, JSON.stringify(hoja.merges));
comprobar('el formato se copia de una fila de clase o de descanso, según toque',
          hoja.copias.length === 4 && hoja.copias.every(c => c.tipo === 'formato') &&
          hoja.copias[0].de === 3 && hoja.copias[1].de === 4 && hoja.copias[2].de === 3,
          JSON.stringify(hoja.copias));
comprobar('no queda ninguna fila de la semana vieja',
          !hoja.m.some(f => f[3] === 'Queralt' || f[3] === 'Anthea'));

hoja = plantillaLunes();
filaTotal = rellenarDia_(hoja, 'Martes 25/08/2026', []);
comprobar('un día vacío deja una fila en blanco y el Total debajo',
          hoja.m.length === 4 && hoja.m[2].every(v => v === '') && hoja.m[3][0] === 'Total' && hoja.m[3][2] === '=SUM(C3:C3)' && filaTotal === 4,
          JSON.stringify(hoja.m));

// Total Hores apunta a la fila de cada día, con su acento y todo
const totalHores = new HojaFalsa('Total Hores', [
  ['Dias', 'Total Horas'], ['Lunes', '=Lunes!C15'], ['Martes', '=Martes!C15'], ['Miércoles', '=Miercoles!C11'],
  ['Jueves', '=Jueves!C13'], ['Viernes', '=Viernes!C8'], ['Total Horas', '=SUM(B2:B6)'], ['Horas Extra', 0]
]);
enlazarTotales_({ getSheetByName: n => (n === 'Total Hores' ? totalHores : null) },
                { Lunes: 7, Martes: 4, Miercoles: 5, Jueves: 4, Viernes: 9 });
comprobar('Total Hores apunta a la fila nueva de cada día',
          totalHores.m[1][1] === "='Lunes'!C7" && totalHores.m[3][1] === "='Miercoles'!C5" && totalHores.m[5][1] === "='Viernes'!C9",
          JSON.stringify(totalHores.m));
comprobar('y no toca la suma ni las horas extra', totalHores.m[6][1] === '=SUM(B2:B6)' && totalHores.m[7][1] === 0);

// ---------- El correo ----------
console.log('\n== El correo ==');
const LIBRO_DATOS_CONFIG = new HojaFalsa('Config', [['clave', 'valor'], ['email_admin', 'sara@example.com, jefe@example.com'], ['calendar_id', 'x']]);
global.LIBRO_DATOS = { getSheetByName: n => (n === 'Config' ? LIBRO_DATOS_CONFIG : null) };
PROPS.SHEET_ID = 'hoja';
const aQuien = enviarPorCorreo_('SARA SEMANA 24 AGOSTO.xlsx', { nombre: 'blob' }, semana, 'https://drive/x');
comprobar('va a quien dice la hoja Config', aQuien === 'sara@example.com, jefe@example.com', aQuien);
comprobar('con el Excel adjunto y el resumen en el cuerpo',
          CORREOS.length === 1 && CORREOS[0].attachments.length === 1 &&
          CORREOS[0].body.indexOf('Total: ') !== -1 && CORREOS[0].body.indexOf('sin tipo') !== -1,
          CORREOS.length ? CORREOS[0].body : 'sin correo');
comprobar('el asunto dice la semana', CORREOS[0].subject === 'Parte de clases · semana del 24 de agosto', CORREOS[0].subject);

LIBRO_DATOS_CONFIG.m.push(['email_partes', 'empresa@example.com']);
CORREOS = [];
comprobar('email_partes manda sobre email_admin',
          enviarPorCorreo_('x.xlsx', {}, semana, 'u') === 'empresa@example.com');

// ---------- El enlace del panel ----------
console.log('\n== El enlace del panel ==');
PROPS.CLAVE = 'clave-prueba';
const malo = doGet({ parameter: { k: 'otra' } });
comprobar('sin la clave no se genera nada', malo.html.indexOf('no válido') !== -1);

console.log('\n' + (fallos === 0 ? 'TODO CORRECTO' : fallos + ' PRUEBAS FALLIDAS'));
process.exit(fallos === 0 ? 0 : 1);
