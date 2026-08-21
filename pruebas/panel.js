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

console.log('== La agenda del panel ==');

const reservasGsAg = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '03_Reservas.gs'), 'utf8');
const agendaGs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '09_Agenda.gs'), 'utf8');

comprobar('las proximas se pintan como agenda, no como tarjetas de alumno',
          editor.indexOf('function pintarAgenda') !== -1 &&
          editor.indexOf("pintarAgenda('lista-proximas'") !== -1,
          'siguen agrupadas por alumno');

comprobar('con una cabecera por dia', editor.indexOf('dia-agenda') !== -1);

comprobar('y cada clase enseña hora, alumno, autoescuela y tipo',
          editor.indexOf('clase-hora') !== -1 &&
          editor.indexOf('clase-nombre') !== -1 &&
          editor.indexOf('clase-tipo') !== -1 &&
          editor.indexOf('clase-donde') !== -1 &&
          editor.indexOf("chipsDeTipo(r, 'proxima')") !== -1,
          'falta algun dato en la agenda');

// Cada dato en su columna: pegados, "Jesus prueba3Circulacion" se leia como un nombre
comprobar('cada dato en su columna, y el tipo a la derecha',
          editor.indexOf('grid-template-columns:auto 3px 1fr auto auto') !== -1 &&
          editor.indexOf('.clase-tipo{') !== -1 &&
          editor.indexOf('text-align:right') !== -1,
          'el nombre y el tipo salen pegados');

// La autoescuela va como barra de color: escrita se comia el sitio del alumno
comprobar('la autoescuela se pinta, no se escribe',
          editor.indexOf('clase-carril') !== -1 &&
          editor.indexOf('function claseDeEscuela') !== -1 &&
          editor.indexOf('.esc-1{--color-esc') !== -1,
          'sigue gastando renglon en el nombre de la autoescuela');

comprobar('con su leyenda, para saber que color es cada una',
          editor.indexOf('function leyendaDeEscuelas') !== -1);

// Los botones no aparecen hasta que Sara toca la clase: es lo que ahorra sitio
comprobar('los botones estan escondidos hasta que se toca',
          editor.indexOf('function alternarClase') !== -1 &&
          editor.indexOf('clase-detalle" hidden') !== -1,
          'los botones ocupan sitio siempre');

// Un rato libre de 20 minutos no sirve para nada y ensucia la pantalla
/*
 * 45 minutos entre dos clases de Andorra son una clase. Los mismos 45 entre una de
 * Andorra y una de Encamp no son nada: se los come el viaje.
 */
comprobar('el hueco se mide desde la clase mas corta que Sara da',
          editor.indexOf('conf.duracion_minima || 45') !== -1 &&
          editor.indexOf('libre < minima') !== -1,
          'sigue con un umbral fijo');

comprobar('y descontando el viaje cuando la de al lado es de otra autoescuela',
          editor.indexOf('!== e.nombre ? traslado : 0') !== -1,
          'ofrece huecos a los que no da tiempo a llegar');

comprobar('si solo vale para una autoescuela, lo dice',
          editor.indexOf('hueco-esc') !== -1 &&
          editor.indexOf('caben.length === escuelas.length') !== -1,
          'no dice a quien puede llamar');

comprobar('y el servidor le manda con que medirlo',
          reservasGsAg.indexOf('duracion_minima:') !== -1 &&
          reservasGsAg.indexOf('traslado:') !== -1,
          'el panel no sabe ni la duracion minima ni el traslado');

comprobar('los dias cercanos se nombran en vez de fecharse',
          editor.indexOf("return 'hoy'") !== -1 && editor.indexOf("return 'mañana'") !== -1,
          'dice "lun 24 ago" hasta para hoy');

/*
 * Las pendientes tambien van en orden de reloj, pero lo que se marca se junta por
 * alumno al confirmar: las tres clases de Marta salen en un solo WhatsApp aunque en
 * la lista estuvieran en tres dias distintos.
 */
comprobar('las pendientes van en orden de reloj, con casilla',
          editor.indexOf("pintarPendientes('lista-pendientes'") !== -1 &&
          editor.indexOf('function alternarPendiente') !== -1,
          'siguen agrupadas por alumno');

comprobar('la barra dice cuantos WhatsApp van a salir',
          editor.indexOf('function refrescarBarraPendientes') !== -1 &&
          editor.indexOf("alumnos + (alumnos === 1 ? ' alumno' : ' alumnos')") !== -1,
          'no avisa de cuantos mensajes saldran');

comprobar('vienen todas marcadas: lo normal es confirmarlo todo',
          editor.indexOf('PENDIENTES.marcadas[r.id] = true') !== -1,
          'hay que marcarlas una a una');

// Lo que se perdia al ordenar por hora, recuperado
comprobar('los avisos se juntan por alumno antes de mandarse',
          editor.indexOf('function colaDeAvisos') !== -1 &&
          editor.indexOf('porAlumno[quien] = {') !== -1,
          'mandaria un WhatsApp por clase');

comprobar('y se abre uno por persona, de uno en uno',
          editor.indexOf('function siguienteAviso') !== -1,
          'los moviles no dejan abrir varios de golpe');

// La autoescuela se sigue pudiendo corregir si el alumno entro por el enlace de otra
comprobar('la autoescuela se corrige desde la clase pendiente',
          editor.indexOf('chipsDeEscuela(ESTADO.grupos[clave], clave)') !== -1,
          'ya no se puede corregir la autoescuela');

const reservasPend = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '03_Reservas.gs'), 'utf8');
comprobar('y el servidor las manda ya ordenadas',
          reservasPend.indexOf('pendientes.sort(porReloj)') !== -1 &&
          reservasPend.indexOf('pendientes: pendientes,') !== -1,
          'el servidor sigue agrupando las pendientes');

comprobar('el servidor las manda en orden de reloj',
          reservasGsAg.indexOf('proximas: proximas') !== -1 &&
          reservasGsAg.indexOf('proximas: agruparPorAlumno_') === -1,
          'el servidor sigue agrupando las proximas');

comprobar('lo que ya paso se marca como realizada',
          reservasGsAg.indexOf('function marcarRealizadas') !== -1 &&
          agendaGs.indexOf('marcarRealizadas()') !== -1,
          'nadie las marca');

/*
 * La trampa: al dejar de estar confirmada, el paso de sincronizar veria "no esta
 * confirmada pero tiene evento" y se lo borraria del calendario.
 */
comprobar('y su evento se queda en el calendario',
          agendaGs.indexOf("if (estado === 'realizada') return false;") !== -1 &&
          agendaGs.indexOf("if (estado === 'realizada') return;") !== -1,
          'una clase dada perderia su evento');

console.log('== La cuenta de los huecos ==');

/*
 * Las comprobaciones de arriba miran que el codigo diga lo que tiene que decir. Esta
 * saca las funciones del panel y las ejecuta: la resta del traslado es justo donde se
 * cuela un error que ningun texto delata.
 */
function extraerFuncion(nombre) {
  const desde = js.indexOf('function ' + nombre + '(');
  if (desde === -1) return '';

  let nivel = 0;
  for (let i = js.indexOf('{', desde); i < js.length; i++) {
    if (js[i] === '{') nivel++;
    else if (js[i] === '}' && --nivel === 0) return js.slice(desde, i + 1);
  }
  return '';
}

const fuenteHuecos = ['enMinutosReloj', 'textoDeHueco', 'claseDeEscuela', 'huecoEntre']
  .map(extraerFuncion).join('\n\n');

comprobar('se pueden sacar las cuatro funciones del hueco',
          fuenteHuecos.indexOf('function huecoEntre') !== -1 &&
          fuenteHuecos.indexOf('function textoDeHueco') !== -1,
          'no se encontraron en el panel');

const ESTADO_PRUEBA = {
  datos: { config: {
    duracion_minima: 45,
    traslado: 25,
    escuelas: [{ nombre: 'Andorra', slug: 'andorra' }, { nombre: 'Encamp', slug: 'encamp' }]
  } }
};

const huecos = new Function('ESTADO', 'escapar',
  fuenteHuecos + '\nreturn { huecoEntre: huecoEntre, textoDeHueco: textoDeHueco };'
)(ESTADO_PRUEBA, function (t) { return String(t); });

function clase(inicio, fin, escuela) {
  return { hora_inicio: inicio, hora_fin: fin, escuela: escuela };
}

// --- Como se lee un rato libre ---
comprobar('45 minutos se dicen en minutos', huecos.textoDeHueco(45) === '45 min libres',
          huecos.textoDeHueco(45));
comprobar('dos horas justas, sin minutos', huecos.textoDeHueco(120) === '2 h libres',
          huecos.textoDeHueco(120));
comprobar('y una hora y media, en singular', huecos.textoDeHueco(90) === '1 h 30 libre',
          huecos.textoDeHueco(90));

// --- Entre dos clases de la misma autoescuela ---
const corto = huecos.huecoEntre(clase('08:30', '10:00', 'Andorra'),
                                clase('10:45', '12:15', 'Andorra'));
comprobar('45 minutos entre dos de Andorra son una clase',
          corto.indexOf('45 min libres') !== -1, corto || '(no sale)');
comprobar('y se dice que son para Andorra',
          corto.indexOf('Andorra') !== -1 && corto.indexOf('Encamp') === -1, corto);

const cortisimo = huecos.huecoEntre(clase('08:30', '10:00', 'Andorra'),
                                    clase('10:30', '12:00', 'Andorra'));
comprobar('media hora no da para nada y no se enseña', cortisimo === '', cortisimo);

// --- Con cambio de autoescuela de por medio ---
const conViaje = huecos.huecoEntre(clase('08:30', '10:00', 'Andorra'),
                                   clase('10:45', '12:15', 'Encamp'));
comprobar('los mismos 45 minutos con viaje de por medio no valen',
          conViaje === '', conViaje || '(no sale)');

const viajeLargo = huecos.huecoEntre(clase('08:30', '10:00', 'Andorra'),
                                     clase('11:40', '13:10', 'Encamp'));
comprobar('con hora y 40 si queda sitio pese al viaje',
          viajeLargo.indexOf('1 h 40 libre') !== -1, viajeLargo || '(no sale)');

// --- Un rato largo le sirve a todo el mundo ---
const largo = huecos.huecoEntre(clase('08:30', '10:00', 'Andorra'),
                                clase('12:00', '13:30', 'Andorra'));
comprobar('dos horas les valen a las dos autoescuelas',
          largo.indexOf('2 h libres') !== -1 && largo.indexOf('Andorra') === -1,
          largo || '(no sale)');

// --- Sin autoescuela apuntada no se descuenta nada ---
const sinEscuela = huecos.huecoEntre(clase('08:30', '10:00', ''),
                                     clase('10:45', '12:15', ''));
comprobar('sin autoescuela apuntada, el hueco es el que es',
          sinEscuela.indexOf('45 min libres') !== -1, sinEscuela || '(no sale)');

console.log('== La pagina del alumno dice hasta que hora ==');

const alumnoJs = fs.readFileSync(path.join(__dirname, '..', 'docs', 'app.js'), 'utf8');

/*
 * Sin la hora de fin en el boton, dos clases seguidas parecen durar lo que hay hasta
 * la siguiente: el alumno elegia las 10:30 y la barra le decia hora y media, cuando
 * el boton de al lado ponia 11:30.
 */
comprobar('el boton lleva la hora de fin',
          alumnoJs.indexOf("'<small>' + franja.hora_fin + '</small>'") !== -1,
          'el alumno no sabe cuanto dura la clase que elige');

comprobar('y no deja elegir dos clases que se pisen',
          alumnoJs.indexOf('function sePisaConOtra') !== -1 &&
          alumnoJs.indexOf('se solapa con otra') !== -1,
          'se pueden pedir dos clases encima de otra');

console.log('== La resena en la pagina del alumno ==');

const alumnoResena = fs.readFileSync(path.join(__dirname, '..', 'docs', 'app.js'), 'utf8');
const dispGs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '02_Disponibilidad.gs'), 'utf8');

/*
 * De serie solo se le pide a quien ya ha dado alguna clase: antes no tiene nada que
 * contar. Con resena_siempre en SI se le pide a todo el mundo, que es la unica forma
 * de comprobar que el enlace lleva a donde tiene que llevar.
 */
comprobar('de serie, solo despues de una clase dada',
          alumnoResena.indexOf("r.estado === 'realizada'") !== -1 &&
          alumnoResena.indexOf('if (!dadas.length && !disp.resena_siempre) return') !== -1,
          'no distingue quien ha dado clase');

comprobar('y hay un interruptor para poder probarla',
          alumnoResena.indexOf('disp.resena_siempre') !== -1 &&
          dispGs.indexOf("config('resena_siempre'") !== -1,
          'no se puede comprobar sin dar una clase');

comprobar('sale tambien sin ninguna clase todavia',
          alumnoResena.indexOf('bloqueDeResena([])') !== -1,
          'no sale en las pantallas vacias');

comprobar('con el texto que pidio Sara',
          alumnoResena.indexOf('¿Qué tal tu clase conmigo?') !== -1 &&
          alumnoResena.indexOf('pon una reseña nombrándome') !== -1,
          'el texto no es el suyo');

comprobar('y al enlace de su autoescuela',
          alumnoResena.indexOf('r.nombre === suya || r.slug === suya') !== -1,
          'manda a todos a la misma ficha');

comprobar('si no hay enlaces configurados, no se enseña nada',
          alumnoResena.indexOf('if (!resenas.length)') !== -1);

const escuelasGs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '06_Escuelas.gs'), 'utf8');
comprobar('el servidor sabe leerlos de la hoja',
          escuelasGs.indexOf('function enlacesDeResena') !== -1 &&
          escuelasGs.indexOf('function enlaceDeResena') !== -1);

console.log('== Los enlaces para los alumnos ==');

/*
 * Se comparten una vez por grupo de alumnos y no hacen falta a diario, asi que van
 * al final: encima de las clases solo estorbaban.
 */
comprobar('estan por debajo de las clases y de los ajustes',
          editor.indexOf('id="bloque-enlace"') > editor.indexOf('id="lista-proximas"') &&
          editor.indexOf('id="bloque-enlace"') > editor.indexOf('guardarAjustes()'),
          'siguen arriba, encima de las clases');

comprobar('y antes del pie con la version',
          editor.indexOf('id="bloque-enlace"') < editor.indexOf('id="pie-version"'),
          'quedan por debajo del pie');

comprobar('los botones, pegados a la derecha',
          editor.indexOf('#enlaces-escuela{display:flex;gap:.375rem;flex-wrap:wrap;margin-left:auto}') !== -1,
          'no estan alineados a la derecha');

console.log('== El titulo de cada uno ==');

const apiGsTitulo = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '05_Api.gs'), 'utf8');
const reservasGsTitulo = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '03_Reservas.gs'), 'utf8');

/*
 * Sara y sus alumnos ven titulos distintos. Estaban compartiendo el mismo ajuste, asi
 * que cambiar uno cambiaba el otro sin querer.
 */
comprobar('el panel tiene su propio titulo',
          reservasGsTitulo.indexOf("nombre_panel: config('nombre_panel'") !== -1 &&
          editor.indexOf('resp.config.nombre_panel || resp.config.nombre_sitio') !== -1,
          'panel y alumno comparten titulo');

comprobar('y sale ya escrito, sin parpadeo',
          editor.indexOf('<h1 id="titulo">Clases con Sarita</h1>') !== -1,
          'parpadea al cargar');

comprobar('tambien en la pestaña del navegador',
          apiGsTitulo.indexOf("config('nombre_panel', 'Clases con Sarita')") !== -1);

comprobar('y se puede cambiar desde los ajustes',
          apiGsTitulo.indexOf("'nombre_panel'") !== -1);

console.log('== El panel sin la barra de Google ==');

const envoltorio = fs.readFileSync(path.join(__dirname, '..', 'docs', 'panel.html'), 'utf8');

/*
 * Google pone en sus aplicaciones web un aviso que dice "esta aplicacion la ha creado
 * un usuario de Apps Script". Vive fuera del marco donde corre el panel, asi que no
 * hay forma de quitarlo desde dentro: metiendolo en un marco propio se queda fuera.
 */
comprobar('el panel se abre dentro de un marco propio',
          envoltorio.indexOf('<iframe id="panel"') !== -1 &&
          envoltorio.indexOf('CONFIG.URL_API') !== -1,
          'no monta el panel');

// La clave no puede acabar en un repositorio publico
comprobar('LA CLAVE NO ESTA EN EL ARCHIVO',
          !/[?#]t=[\w-]{8,}/.test(envoltorio.replace(/panel\.html#t=/g, '')),
          'hay una clave escrita en un archivo publico');

comprobar('se lee de detras de la almohadilla, que no viaja a ningun servidor',
          envoltorio.indexOf('window.location.hash.match') !== -1,
          'la clave viajaria al servidor');

comprobar('y sin ella se explica en vez de quedarse en blanco',
          envoltorio.indexOf('id="sin-clave"') !== -1);

comprobar('los buscadores no lo indexan',
          envoltorio.indexOf('noindex') !== -1, 'el panel seria rastreable');

const apiEnlace = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '05_Api.gs'), 'utf8');
comprobar('y es el enlace que se da al pedirlo',
          apiEnlace.indexOf("'panel.html#t=' + clave") !== -1,
          'sigue dando el de script.google.com');

console.log('== Los contadores ==');

/*
 * Las pendientes vienen agrupadas por alumno, asi que contar los grupos decia 1
 * cuando eran las tres clases que habia pedido la misma persona.
 */
comprobar('por confirmar cuenta clases, no alumnos',
          editor.indexOf("el('n-pendientes').textContent = clases;") !== -1,
          'sigue contando alumnos');

/*
 * El subtitulo sumaba el total de cada grupo. Al pasar las pendientes a lista suelta
 * ese total dejo de existir y el panel decia "NaN clases esperando respuesta".
 */
comprobar('el subtitulo cuenta lo mismo que el contador',
          editor.indexOf('var clases = pendientes.length') !== -1 &&
          editor.indexOf('clases += g.total') === -1,
          'el subtitulo diria NaN');

/*
 * Los archivos se pegan a mano, asi que es facil actualizar el panel y no el resto.
 * Aqui se saca comoLista del panel y se ejecuta con las dos formas que puede mandar
 * el servidor: la de ahora y la agrupada de antes.
 */
const lista = new Function(extraerFuncion('comoLista') + '\nreturn comoLista;')();

const sueltas = lista([
  { id: 'b', fecha: '2026-09-08', hora_inicio: '09:00' },
  { id: 'a', fecha: '2026-09-07', hora_inicio: '10:30' }
]);
comprobar('con la forma de ahora, las devuelve ordenadas',
          sueltas.length === 2 && sueltas[0].id === 'a',
          JSON.stringify(sueltas.map(r => r.id)));

const agrupadas = lista([
  { nombre: 'Marta', total: 2, reservas: [
    { id: 'm2', fecha: '2026-09-09', hora_inicio: '09:00' },
    { id: 'm1', fecha: '2026-09-07', hora_inicio: '09:00' }
  ] },
  { nombre: 'Joan', total: 1, reservas: [
    { id: 'j1', fecha: '2026-09-08', hora_inicio: '15:00' }
  ] }
]);
comprobar('y con la agrupada de antes, las abre',
          agrupadas.length === 3, JSON.stringify(agrupadas.map(r => r.id)));
comprobar('mezclando los alumnos en orden de reloj',
          agrupadas.map(r => r.id).join(',') === 'm1,j1,m2',
          agrupadas.map(r => r.id).join(','));

comprobar('sin datos no se rompe',
          lista(undefined).length === 0 && lista([]).length === 0);
comprobar('ni con huecos en la lista', lista([null, undefined]).length === 0);

console.log('== Un WhatsApp por alumno, no por clase ==');

/*
 * Lo que se podia perder al ordenar por hora: Marta pide tres clases, caen en tres
 * dias distintos de la lista, y confirmarlas le manda tres mensajes seguidos. Aqui se
 * saca del panel la funcion que las junta y se ejecuta de verdad.
 */
const fuenteCola = extraerFuncion('claveDeAlumno') + '\n' + extraerFuncion('colaDeAvisos');

comprobar('se puede sacar la funcion que junta los avisos',
          fuenteCola.indexOf('function colaDeAvisos') !== -1, 'no se encontro');

const cola = new Function('AVISOS', 'pintarAvisoPendiente', 'el',
  fuenteCola + '\nreturn { colaDeAvisos: colaDeAvisos, ver: function () { return AVISOS; } };'
)({ turnos: [], indice: 0 }, function () {}, function () { return { style: {} }; });

function claseDe(nombre, telefono, fecha) {
  return { nombre: nombre, telefono: telefono, fecha: fecha,
           hora_inicio: '10:30', hora_fin: '12:00', etiqueta_fecha: fecha };
}

// Tres de Marta en tres dias distintos, y una de Joan por medio
cola.colaDeAvisos([
  claseDe('Marta Ruiz', '376600111', 'lunes'),
  claseDe('Joan Pla',   '376600222', 'lunes'),
  claseDe('Marta Ruiz', '376600111', 'miercoles'),
  claseDe('Marta Ruiz', '376600111', 'viernes')
], { hecho: 'Confirmadas', estado: 'confirmada' }, '');

const turnos = cola.ver().turnos;
comprobar('cuatro clases, dos alumnos: dos mensajes', turnos.length === 2,
          JSON.stringify(turnos.map(t => t.nombre + ':' + t.reservas.length)));
comprobar('las tres de Marta van en el mismo',
          turnos[0].nombre === 'Marta Ruiz' && turnos[0].reservas.length === 3,
          JSON.stringify(turnos[0].reservas.length));
comprobar('y la de Joan en el suyo',
          turnos[1].nombre === 'Joan Pla' && turnos[1].reservas.length === 1);

// Una clase apuntada a mano puede no tener movil: se junta por el nombre
cola.colaDeAvisos([
  claseDe('Ana Sense Mobil', '', 'lunes'),
  claseDe('Ana Sense Mobil', '', 'martes')
], { hecho: 'Confirmadas', estado: 'confirmada' }, '');

comprobar('sin movil se juntan por el nombre',
          cola.ver().turnos.length === 1 && cola.ver().turnos[0].reservas.length === 2,
          JSON.stringify(cola.ver().turnos.map(t => t.nombre + ':' + t.reservas.length)));

console.log('\n' + (fallos === 0
  ? 'TODO CORRECTO — el panel, la guía y la revisión están al día'
  : fallos + ' PROBLEMAS'));
process.exit(fallos === 0 ? 0 : 1);
