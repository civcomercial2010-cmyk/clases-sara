/*
 * Revisión del panel de Sara.
 *
 * El panel es una sola página con su JavaScript dentro, y sus botones llaman a las
 * funciones por nombre desde atributos onclick. Si al editar se pierde una función,
 * nada avisa: el navegador falla en silencio y Sara se queda con un panel en blanco.
 * Ya pasó una vez, al recortar código y llevarse por delante el editor de horarios.
 *
 *   node pruebas/panel.js
 */

const fs = require('fs');
const path = require('path');

const RUTA = path.join(__dirname, '..', 'apps-script', 'panel.html');
const html = fs.readFileSync(RUTA, 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let fallos = 0;
function comprobar(descripcion, condicion, extra) {
  if (condicion) {
    console.log('  OK   ' + descripcion);
  } else {
    fallos++;
    console.log('  FALLA ' + descripcion + (extra ? '  -> ' + extra : ''));
  }
}

/** Nombres que aparecen como "algo(" detrás de un patrón dado. */
function nombresTras(texto, patron) {
  const encontrados = new Set();
  const expresion = new RegExp(patron + '([A-Za-z_$][\\w$]*)\\(', 'g');
  let coincidencia;
  while ((coincidencia = expresion.exec(texto)) !== null) {
    encontrados.add(coincidencia[1]);
  }
  return encontrados;
}

// --- Qué funciones define ---
const definidas = nombresTras(js, 'function\\s+');
// También las que se guardan en una variable: var dosD = function (n) { ... }
(js.match(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function/g) || []).forEach(function (t) {
  definidas.add(t.replace(/(?:var|let|const)\s+/, '').replace(/\s*=\s*function/, ''));
});
console.log('\n== Lo que el panel define ==');
console.log('  ' + definidas.size + ' funciones');

// --- Qué funciones invocan los botones ---
// Tanto los del HTML fijo, onclick="cargar()", como los que el propio código
// escribe dentro de cadenas, onclick=\"responder('...
const desdeBotones = new Set();
nombresTras(html, 'on(?:click|change)=\\\\?"').forEach(function (n) { desdeBotones.add(n); });
nombresTras(js, '"').forEach(function (n) { desdeBotones.add(n); });

const delNavegador = ['location', 'window', 'alert', 'open', 'href'];
const llamadas = Array.from(desdeBotones)
  .filter(function (n) { return delNavegador.indexOf(n) === -1; })
  .sort();

console.log('\n== Botones y sus funciones ==');
comprobar('los botones llaman a alguna función', llamadas.length > 0, 'no se detectó ninguna');
llamadas.forEach(function (nombre) {
  comprobar(nombre + '() existe', definidas.has(nombre), 'no está definida en el panel');
});

// --- Llamadas dentro del propio código ---
console.log('\n== Llamadas internas ==');
const globalesPermitidas = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof',
  'String', 'Number', 'Boolean', 'Object', 'Array', 'Math', 'JSON', 'Date',
  'setTimeout', 'clearTimeout', 'encodeURIComponent', 'decodeURIComponent',
  'parseInt', 'parseFloat', 'isNaN', 'require'
]);

// Sin contar lo que va tras una barra invertida: en '\n(' el paréntesis es texto
const usadas = nombresTras(js, '(?:^|[^.\\w$\\\\])');
const huerfanas = Array.from(usadas).filter(function (n) {
  return !definidas.has(n) && !globalesPermitidas.has(n);
}).sort();

comprobar('no se llama a ninguna función que no exista', huerfanas.length === 0,
          huerfanas.join(', '));

// --- Elementos que el JavaScript busca por id ---
console.log('\n== Elementos de la página ==');
const idsEnHtml = new Set();
(html.match(/id="([\w-]+)"/g) || []).forEach(function (t) {
  idsEnHtml.add(t.replace(/id="/, '').replace('"', ''));
});

const idsBuscados = new Set();
(js.match(/el\('([\w-]+)'\)/g) || []).forEach(function (t) {
  idsBuscados.add(t.replace(/el\('/, '').replace("')", ''));
});

// Los que se construyen al vuelo, el('ck-' + r.id), no se pueden comprobar aquí
const perdidos = Array.from(idsBuscados).filter(function (id) {
  return !idsEnHtml.has(id);
}).sort();

comprobar('todos los elementos que busca están en la página', perdidos.length === 0,
          perdidos.join(', '));

// --- Piezas que no pueden faltar ---
console.log('\n== Piezas imprescindibles ==');
[
  ['la clave del enlace llega al navegador', /var CLAVE = '<\?= clave \?>'/],
  ['las acciones la devuelven al servidor', /conClave\(/],
  ['confirmar', /'confirmar'/],
  ['rechazar', /'rechazar'/],
  ['liberar una hora', /'anular'/],
  ['marcar campo o calle', /marcar_tipo/],
  ['cambiar los horarios', /guardar_horario/],
  ['apuntar las clases en el calendario', /'agendar'/],
  ['poner la agenda al día', /agendar_todo/],
  ['el mensaje de WhatsApp con todas las clases', /\{clases\}/]
].forEach(function (par) {
  comprobar(par[0], par[1].test(js));
});

// --- La guía tiene que nombrar todos los archivos ---
console.log('\n== La guía de instalación ==');
const guia = fs.readFileSync(path.join(__dirname, '..', 'INSTALACION.md'), 'utf8');
const archivos = fs.readdirSync(path.join(__dirname, '..', 'apps-script'));

archivos.forEach(function (archivo) {
  comprobar('la guía manda pegar ' + archivo, guia.indexOf(archivo) !== -1,
            'quien siga la guía se lo dejará');
});

// --- El diagnóstico tiene que conocer todos los archivos ---
console.log('\n== La revisión del sistema ==');
const diag = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '08_Diagnostico.gs'), 'utf8');
const bloque = (diag.match(/var esperado = \{([\s\S]*?)\n  \};/) || [])[1] || '';

archivos.filter(function (a) { return a.slice(-3) === '.gs'; }).forEach(function (archivo) {
  const nombre = archivo.replace('.gs', '');
  comprobar('la revisión vigila ' + nombre, bloque.indexOf("'" + nombre + "'") !== -1,
            'si falta ese archivo, nadie avisará');
});

// Y las funciones que dice vigilar tienen que existir de verdad
const desajustes = [];
bloque.split('\n').forEach(function (linea) {
  const m = linea.match(/'([\w]+)':\s*\[(.*)\]/);
  if (!m) return;

  let fuente;
  try {
    fuente = fs.readFileSync(path.join(__dirname, '..', 'apps-script', m[1] + '.gs'), 'utf8');
  } catch (e) {
    desajustes.push(m[1] + ' (no existe)');
    return;
  }

  m[2].split(',')
    .map(function (x) { return x.trim().replace(/'/g, ''); })
    .filter(Boolean)
    .forEach(function (f) {
      if (fuente.indexOf('function ' + f) === -1) desajustes.push(m[1] + '.' + f);
    });
});
comprobar('y todas esas funciones existen', desajustes.length === 0, desajustes.join(', '));

console.log('== El editor de horarios ==');

const editor = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'panel.html'), 'utf8');

comprobar('el editor llega hasta el viernes y para',
          editor.indexOf("'Viernes'") !== -1 &&
          editor.indexOf("'S\\u00e1bado'") === -1 &&
          editor.indexOf("'Domingo'") === -1,
          'sigue ofreciendo el fin de semana');

comprobar('los dias se recorren hasta ULTIMO_DIA',
          editor.indexOf('var ULTIMO_DIA = 5') !== -1 &&
          editor.indexOf('d <= 7') === -1,
          'queda algun bucle hasta el domingo');

/*
 * El aviso de guardado salia solo abajo del todo y duraba dos segundos: pulsando el
 * boton desde arriba no se veia y parecia que no hacia nada.
 */
comprobar('el boton de guardar avisa en el propio boton',
          editor.indexOf("id=\"btn-guardar-horario\"") !== -1 &&
          editor.indexOf("boton.textContent = 'Guardando\u2026'") !== -1,
          'no se entera de si ha guardado');

comprobar('y dice cuantas clases caben, no cuantas ventanas',
          editor.indexOf('resp.clases') !== -1 && editor.indexOf('resp.tramos') === -1,
          'sigue contando ventanas como si fueran clases');

const horarioGs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '07_Horario.gs'), 'utf8');
comprobar('y el servidor lo devuelve', horarioGs.indexOf('clases: caben') !== -1);

console.log('== El testigo de la version ==');

const baseGs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '00_Base.gs'), 'utf8');
const reservasGs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '03_Reservas.gs'), 'utf8');

comprobar('el codigo lleva su fecha', /var VERSION_CODIGO = '\d{4}-\d{2}-\d{2}'/.test(baseGs),
          'sin VERSION_CODIGO');
comprobar('el panel la recibe', reservasGs.indexOf('version: VERSION_CODIGO') !== -1);
comprobar('y la ensena al pie',
          editor.indexOf("el('pie-version')") !== -1 && editor.indexOf('id="pie-version"') !== -1,
          'no se ve por ningun lado');

const guiaPublicar = fs.readFileSync(path.join(__dirname, '..', 'INSTALACION.md'), 'utf8');
comprobar('la guia explica como publicar',
          guiaPublicar.indexOf('Gestionar implementaciones') !== -1 &&
          guiaPublicar.indexOf('Nueva implementaci') !== -1,
          'no dice como republicar');

console.log('== La pagina del alumno, sin pedir el movil ==');

const paginaHtml = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
const paginaJs   = fs.readFileSync(path.join(__dirname, '..', 'docs', 'app.js'), 'utf8');
const paginaCss  = fs.readFileSync(path.join(__dirname, '..', 'docs', 'estilo.css'), 'utf8');

// El alumno ve sus clases por el movil desde el que reservo, sin escribir nada
comprobar('no queda el bloque de buscar por movil',
          paginaHtml.indexOf('otro m') === -1 &&
          paginaHtml.indexOf('entrada-movil') === -1,
          'sigue pidiendo el numero');

comprobar('ni el codigo que lo movia',
          paginaJs.indexOf('buscarPorMovil') === -1 &&
          paginaJs.indexOf('btn-buscar-movil') === -1,
          'queda codigo huerfano');

comprobar('ni sus estilos',
          paginaCss.indexOf('bloque-buscar') === -1 &&
          paginaCss.indexOf('fila-formulario') === -1,
          'queda CSS muerto');

// Y tampoco rastro de los codigos de reserva, que se quitaron antes
comprobar('sin rastro de codigos de reserva',
          paginaHtml.toLowerCase().indexOf('codigo') === -1 &&
          paginaCss.indexOf('codigo') === -1,
          'vuelve a hablar de codigos');

console.log('\n' + (fallos === 0
  ? 'TODO CORRECTO — el panel, la guía y la revisión están al día'
  : fallos + ' PROBLEMAS'));
process.exit(fallos === 0 ? 0 : 1);
