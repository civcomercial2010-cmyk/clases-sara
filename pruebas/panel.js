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

console.log('\n' + (fallos === 0
  ? 'TODO CORRECTO — el panel y la guía están completos'
  : fallos + ' PROBLEMAS'));
process.exit(fallos === 0 ? 0 : 1);
