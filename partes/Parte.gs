/**
 * El parte semanal de Sara, hecho solo.
 *
 * Cada semana Sara tiene que mandar a la empresa un Excel con sus clases: una hoja
 * por día con hora de inicio, hora de fin, horas, alumno, categoría del permiso,
 * tipo de clase y autoescuela, más los descansos, traslados y exámenes, y una hoja
 * con el total de horas. Lo hacía a mano. Ahora sale de lo que la app y ella han
 * ido apuntando durante la semana.
 *
 * Es un proyecto de Apps Script APARTE del de las reservas, a propósito: para
 * escribir en Drive y exportar a Excel hacen falta permisos que el proyecto de los
 * alumnos no tiene, y añadírselos obligaría a reautorizarlo entero con la página ya
 * en la calle. Este lee la misma hoja de cálculo y el mismo calendario, y no toca
 * nada de lo que ya funciona.
 *
 * Cómo se monta el Excel: en la carpeta "Partes semanales" de Drive hay una
 * plantilla, que es el parte de una semana real tal y como lo hizo Sara. Se copia,
 * se rellenan las hojas de cada día respetando sus formatos, se exporta a .xlsx, se
 * guarda en esa misma carpeta y se manda por correo. Así el formato es exactamente
 * el que la empresa ya conoce.
 *
 * Puesta en marcha: ejecutar instalarPartes() una vez desde el editor.
 */

var NOMBRE_HOJA_DATOS  = 'SARA · Reservas de clases';
var NOMBRE_CARPETA     = 'Partes semanales';
var NOMBRE_PLANTILLA   = 'Plantilla parte semanal';
var PLANTILLA_XLSX     = 'Plantilla parte semanal.xlsx';
var TZ_PARTE           = 'Europe/Madrid';

/** Las hojas de la plantilla, en el orden de la semana. */
var HOJAS_DIA = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];
var NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
var NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                   'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Reglas para las filas que no son clases.
 *
 * Entre dos clases seguidas de la misma autoescuela va un "Descanso"; si son de
 * autoescuelas distintas, o hay un examen por medio, va un "Traslado". Un hueco más
 * largo que esto es la comida o una tarde libre, y no se apunta.
 */
var REGLAS_PARTE = { descanso_max: 30, traslado_max: 60 };

// --- Puesta en marcha -------------------------------------------------------

/**
 * Una vez, desde el editor. Busca la hoja de datos y la carpeta por su nombre,
 * prepara la plantilla, deja programado el parte de cada sábado y genera el de la
 * semana pasada para comprobar que todo funciona.
 */
function instalarPartes() {
  var props = PropertiesService.getScriptProperties();

  props.setProperty('SHEET_ID', buscarHojaDeDatos_());
  props.setProperty('CARPETA_ID', buscarCarpeta_());
  var plantilla = plantillaId_();

  if (!props.getProperty('CLAVE')) props.setProperty('CLAVE', claveAleatoria_());
  publicarEnlaceEnConfig_();
  programarParteSemanal();

  // De prueba, el parte que más diga: el de la semana que viene si ya tiene clases
  // confirmadas (es lo que hay recién instalado), y si no el de la pasada
  var resultado = parteDeLaSemanaQueViene();
  if (resultado.ok && !resultado.clases) resultado = parteSemanaPasada();

  var informe = [
    'Parte semanal instalado.',
    'Hoja de datos: ' + props.getProperty('SHEET_ID'),
    'Carpeta: ' + props.getProperty('CARPETA_ID'),
    'Plantilla: ' + plantilla,
    'Cada sábado a las 08:00 se genera el parte de la semana que acaba.',
    resultado.ok ? 'Parte de prueba: ' + resultado.archivo + ' → ' + resultado.url
                 : 'Parte de prueba: ' + resultado.error
  ].join('\n');
  Logger.log(informe);
  return informe;
}

/** Cada sábado por la mañana, el parte de la semana que acaba de terminar. */
function programarParteSemanal() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'parteSemanaPasada') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('parteSemanaPasada')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(8)
    .create();
}

/**
 * Deja en la hoja Config de la app el enlace para pedir el parte desde el panel de
 * Sara: así puede volver a generarlo después de corregir una categoría o un tipo,
 * sin abrir ningún editor. Solo funciona si este proyecto está publicado como
 * aplicación web; si no, no pasa nada y el parte sigue saliendo solo cada sábado.
 */
function publicarEnlaceEnConfig_() {
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  if (!url || url.indexOf('/exec') === -1) return '';

  var enlace = url + '?k=' + PropertiesService.getScriptProperties().getProperty('CLAVE');
  escribirConfig_('url_partes', enlace,
    'Enlace para generar el parte semanal desde el panel. Lo pone solo instalarPartes()');
  return enlace;
}

function claveAleatoria_() {
  var alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var salida = '';
  for (var i = 0; i < 24; i++) salida += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  return salida;
}

// --- Entradas ---------------------------------------------------------------

/** El parte de la semana pasada (lunes a domingo). Lo llama el disparador. */
function parteSemanaPasada() {
  var lunes = lunesDe_(sumarDias_(ahora_(), -7));
  return generarParte(fechaISO_(lunes));
}

/** El parte de la semana en curso, con lo que haya hasta ahora. */
function parteDeEstaSemana() {
  return generarParte(fechaISO_(lunesDe_(ahora_())));
}

/** El parte de la semana que viene, con lo ya confirmado: para verlo antes de tiempo. */
function parteDeLaSemanaQueViene() {
  return generarParte(fechaISO_(lunesDe_(sumarDias_(ahora_(), 7))));
}

/**
 * Desde el enlace del panel: ?k=clave&semana=pasada|actual|2026-08-24.
 * Genera el parte y enseña dónde ha quedado.
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var clave = PropertiesService.getScriptProperties().getProperty('CLAVE') || '';

  if (!clave || params.k !== clave) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Enlace no válido.</p>');
  }

  var semana = String(params.semana || 'actual');
  var lunes = /^\d{4}-\d{2}-\d{2}$/.test(semana) ? fechaISO_(lunesDe_(aDate_(semana)))
            : semana === 'pasada'  ? fechaISO_(lunesDe_(sumarDias_(ahora_(), -7)))
            : semana === 'proxima' ? fechaISO_(lunesDe_(sumarDias_(ahora_(), 7)))
            : fechaISO_(lunesDe_(ahora_()));

  var r;
  try { r = generarParte(lunes); } catch (err) { r = { ok: false, error: err.message }; }

  var html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>body{font-family:system-ui,sans-serif;padding:1.5rem;max-width:28rem;margin:0 auto;line-height:1.5}' +
    'a{color:#2f5eea}.ok{color:#15803d}.malo{color:#c0261f}</style></head><body>';
  if (r.ok) {
    html += '<h2 class="ok">Parte generado</h2>' +
            '<p><b>' + escapar_(r.archivo) + '</b></p>' +
            '<p>' + r.resumen.map(escapar_).join('<br>') + '</p>' +
            '<p><a href="' + escapar_(r.url) + '" target="_blank">Abrir el Excel en Drive</a></p>' +
            (r.enviado_a ? '<p>Enviado por correo a ' + escapar_(r.enviado_a) + '.</p>' : '') +
            (r.avisos.length ? '<p class="malo">' + r.avisos.map(escapar_).join('<br>') + '</p>' : '');
  } else {
    html += '<h2 class="malo">No se pudo generar el parte</h2><p>' + escapar_(r.error) + '</p>';
  }
  html += '<p><a href="#" onclick="history.back();return false">Volver</a></p></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Parte semanal');
}

// --- El parte ---------------------------------------------------------------

/**
 * Genera el Excel de la semana que empieza ese lunes ('YYYY-MM-DD').
 * Devuelve { ok, archivo, url, resumen, avisos, enviado_a }.
 */
function generarParte(lunesISO) {
  var datos   = leerDatos_();
  var semana  = semanaDe_(lunesISO, datos.reservas, datos.examenes, datos.config);
  var nombre  = nombreArchivo_(lunesISO);

  var carpeta  = DriveApp.getFolderById(carpetaId_());
  var copia    = DriveApp.getFileById(plantillaId_()).makeCopy('tmp ' + nombre, carpeta);
  var libro    = SpreadsheetApp.openById(copia.getId());
  var totales  = {};

  try {
    HOJAS_DIA.forEach(function (nombreHoja, i) {
      var hoja = libro.getSheetByName(nombreHoja);
      if (!hoja) {
        semana.avisos.push('La plantilla no tiene la hoja "' + nombreHoja + '".');
        return;
      }
      var dia = semana.dias[i];
      totales[nombreHoja] = rellenarDia_(hoja, tituloDeDia_(dia.fecha), dia.filas);
    });

    enlazarTotales_(libro, totales);
    SpreadsheetApp.flush();

    var blob = exportarXlsx_(copia.getId()).setName(nombre);

    // Si ya había un parte de esa semana, se sustituye: lo normal es regenerarlo
    // después de corregir algo en el panel
    var anteriores = carpeta.getFilesByName(nombre);
    while (anteriores.hasNext()) anteriores.next().setTrashed(true);

    var archivo = carpeta.createFile(blob);
    var url = archivo.getUrl();

    var enviadoA = enviarPorCorreo_(nombre, blob, semana, url);

    var clases = 0;
    semana.dias.forEach(function (d) { clases += d.clases; });

    return {
      ok: true, archivo: nombre, url: url, clases: clases,
      resumen: semana.resumen, avisos: semana.avisos, enviado_a: enviadoA
    };
  } finally {
    // La copia de trabajo no tiene que quedarse en la carpeta
    try { copia.setTrashed(true); } catch (e) { /* ya no estaba */ }
  }
}

/**
 * Lo que la app sabe de la semana: las clases de la hoja y los exámenes del
 * calendario. Se lee todo una sola vez.
 */
function leerDatos_() {
  var libro = SpreadsheetApp.openById(sheetId_());
  var config = {};
  objetos_(libro.getSheetByName('Config')).forEach(function (fila) {
    config[String(fila.clave || '').trim()] = String(fila.valor === undefined ? '' : fila.valor).trim();
  });

  var reservas = objetos_(libro.getSheetByName('Reservas')).map(function (fila) {
    return {
      fecha: aFechaISO_(fila.fecha),
      hora_inicio: aHHMM_(fila.hora_inicio),
      hora_fin: aHHMM_(fila.hora_fin),
      estado: String(fila.estado || '').trim(),
      nombre: String(fila.nombre || '').trim(),
      tipo: String(fila.tipo || '').trim(),
      escuela: String(fila.escuela || '').trim(),
      categoria: String(fila.categoria || '').trim()
    };
  });

  return { config: config, reservas: reservas, examenes: leerExamenes_(config.calendar_id) };
}

/**
 * Los exámenes, del calendario de Sara. Son horas de trabajo y van al parte, como
 * hace ella a mano. Se reconocen por el título: "Examen", "Exámenes", "Exàmens".
 * Cualquier otro bloqueo (médico, vacaciones) es personal y no se apunta.
 */
function leerExamenes_(calendarId) {
  if (!calendarId) return [];
  var cal;
  try { cal = CalendarApp.getCalendarById(calendarId); } catch (e) { cal = null; }
  if (!cal) return [];

  // Dos meses alrededor de hoy cubren cualquier semana que se pida normalmente
  var desde = sumarDias_(ahora_(), -45);
  var hasta = sumarDias_(ahora_(), 45);

  return cal.getEvents(desde, hasta)
    .filter(function (ev) { return !ev.isAllDayEvent() && esExamen_(ev.getTitle()); })
    .map(function (ev) {
      return {
        fecha: fechaISO_(ev.getStartTime()),
        hora_inicio: hhmm_(ev.getStartTime()),
        hora_fin: hhmm_(ev.getEndTime())
      };
    });
}

function esExamen_(titulo) {
  return /ex[aàá]m/i.test(String(titulo || ''));
}

// --- La lógica pura: de clases a filas --------------------------------------

/**
 * La semana entera: siete días, cada uno con sus filas ya montadas, más el resumen
 * para el correo y los avisos de lo que falte por rellenar en el panel.
 */
function semanaDe_(lunesISO, reservas, examenes, config) {
  var reglas = {
    descanso_max: Number(config.parte_descanso_max) || REGLAS_PARTE.descanso_max,
    traslado_max: Number(config.parte_traslado_max) || REGLAS_PARTE.traslado_max
  };

  var dias = [];
  var resumen = [];
  var avisos = [];
  var sinCategoria = 0, sinTipo = 0, finDeSemana = 0;

  for (var i = 0; i < 7; i++) {
    var fecha = fechaISO_(sumarDias_(aDate_(lunesISO), i));

    var clases = reservas.filter(function (r) {
      return r.fecha === fecha && (r.estado === 'confirmada' || r.estado === 'realizada');
    }).map(function (r) {
      if (!r.categoria) sinCategoria++;
      if (!r.tipo) sinTipo++;
      return {
        inicio: enMin_(r.hora_inicio), fin: enMin_(r.hora_fin),
        nombre: r.nombre, categoria: r.categoria,
        tipo: traducirTipo_(r.tipo), escuela: r.escuela
      };
    });

    var examenesDia = examenes.filter(function (ex) { return ex.fecha === fecha; })
      .map(function (ex) { return { inicio: enMin_(ex.hora_inicio), fin: enMin_(ex.hora_fin), especial: 'Examen' }; });

    var filas = filasDelDia_(clases, examenesDia, reglas);
    var minutos = 0;
    filas.forEach(function (f) { minutos += f.fin - f.inicio; });

    if (i >= 5 && clases.length) finDeSemana += clases.length;

    dias.push({ fecha: fecha, filas: filas, minutos: minutos, clases: clases.length });
    if (i < 5 || clases.length) {
      resumen.push(NOMBRES_DIA[i] + ' ' + fechaCorta_(fecha) + ': ' +
                   textoHoras_(minutos) + ' · ' + clases.length +
                   (clases.length === 1 ? ' clase' : ' clases'));
    }
  }

  var total = 0;
  dias.forEach(function (d) { total += d.minutos; });
  resumen.push('Total: ' + textoHoras_(total));

  if (sinCategoria) avisos.push(sinCategoria + (sinCategoria === 1 ? ' clase' : ' clases') +
                                ' sin categoría de permiso (B, J…). Se marca en el panel, en el alumno.');
  if (sinTipo) avisos.push(sinTipo + (sinTipo === 1 ? ' clase' : ' clases') +
                           ' sin tipo (campo o circulación). Se marca en el panel.');
  if (finDeSemana) avisos.push(finDeSemana + ' clases en fin de semana: la plantilla no tiene hoja para ' +
                               'sábado ni domingo, así que no salen en el Excel.');

  return { lunes: lunesISO, dias: dias, resumen: resumen, avisos: avisos, total: total };
}

/**
 * Las filas de un día, en orden de reloj: clases, exámenes y, entre medias, lo que
 * Sara apunta a mano: "Descanso" entre dos clases seguidas, "Traslado" cuando
 * cambia de autoescuela o viene de un examen.
 */
function filasDelDia_(clases, examenes, reglas) {
  var piezas = clases.concat(examenes).sort(function (a, b) { return a.inicio - b.inicio; });
  var filas = [];
  var anterior = null;

  piezas.forEach(function (pieza) {
    if (anterior) {
      var hueco = pieza.inicio - anterior.fin;
      if (hueco > 0) {
        var cambio = anterior.especial === 'Examen' || pieza.especial === 'Examen' ||
                     (anterior.escuela && pieza.escuela && anterior.escuela !== pieza.escuela);
        if (cambio && hueco <= reglas.traslado_max) {
          filas.push({ inicio: anterior.fin, fin: pieza.inicio, especial: 'Traslado' });
        } else if (!cambio && hueco <= reglas.descanso_max) {
          filas.push({ inicio: anterior.fin, fin: pieza.inicio, especial: 'Descanso' });
        }
      }
    }
    filas.push(pieza);
    anterior = pieza;
  });

  return filas;
}

/**
 * El tipo, como lo escribe la empresa: en catalán. Lo que no se reconozca se deja
 * tal cual, que es mejor que inventar.
 */
function traducirTipo_(tipo) {
  var limpio = String(tipo || '').toLowerCase()
    .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o').replace(/[úù]/g, 'u').trim();
  if (!limpio) return '';

  var campo = /camp/.test(limpio);
  var circulacion = /circ/.test(limpio);
  if (campo && circulacion) return 'Camp / Circulació';
  if (campo) return 'Camp';
  if (circulacion) return 'Circulació';
  return String(tipo).trim();
}

/** 'SARA SEMANA 24 AGOSTO.xlsx', como los que Sara hacía a mano. */
function nombreArchivo_(lunesISO) {
  var d = aDate_(lunesISO);
  return 'SARA SEMANA ' + d.getDate() + ' ' + NOMBRES_MES[d.getMonth()].toUpperCase() + '.xlsx';
}

/** 'Lunes 24/08/2026', el título de cada hoja. */
function tituloDeDia_(fechaISO) {
  var d = aDate_(fechaISO);
  var dia = (d.getDay() + 6) % 7;
  return NOMBRES_DIA[dia] + ' ' + fechaCorta_(fechaISO);
}

// --- Rellenar la plantilla --------------------------------------------------

/**
 * Rellena la hoja de un día respetando el formato de la plantilla.
 *
 * La plantilla trae filas de una semana real. Se usan como muestra de formato: la
 * primera fila de clase para las clases y la primera de "Descanso" para las filas
 * especiales. Se insertan las filas nuevas justo encima del Total copiando ese
 * formato, se escriben los datos y después se quitan las filas de muestra. Así los
 * bordes, las fuentes, las celdas unidas y los formatos de hora son los mismos que
 * ya tenía el parte.
 *
 * Devuelve la fila donde ha quedado el Total, para enlazarla desde "Total Hores".
 */
function rellenarDia_(hoja, titulo, filas) {
  var ultima = Math.max(hoja.getLastRow(), 3);
  var colA = hoja.getRange(1, 1, ultima, 1).getValues();

  var filaTotal = -1;
  for (var i = colA.length - 1; i >= 0; i--) {
    if (String(colA[i][0]).trim().toLowerCase() === 'total') { filaTotal = i + 1; break; }
  }
  if (filaTotal === -1) throw new Error('La hoja "' + hoja.getName() + '" de la plantilla no tiene fila Total.');

  var colD = hoja.getRange(1, 4, filaTotal, 1).getValues();
  var estiloClase = filaTotal > 3 ? 3 : 2;
  var estiloPausa = 0;
  for (var r = 3; r < filaTotal; r++) {
    if (/^descanso$/i.test(String(colD[r - 1][0]).trim())) { estiloPausa = r; break; }
  }
  if (!estiloPausa) estiloPausa = estiloClase;

  // Un día sin nada sigue teniendo una fila, para que el Total tenga qué sumar
  if (!filas.length) filas = [{ vacia: true }];

  hoja.insertRowsBefore(filaTotal, filas.length);

  var valores = [];
  filas.forEach(function (f, i) {
    var fila = filaTotal + i;
    var origen = f.especial ? estiloPausa : estiloClase;
    hoja.getRange(origen, 1, 1, 7)
        .copyTo(hoja.getRange(fila, 1, 1, 7), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

    // Las filas insertadas heredan lo que tuviera la de arriba, unido o no: se
    // deshace siempre y se vuelve a unir solo en las filas especiales
    var bloque = hoja.getRange(fila, 4, 1, 4);
    bloque.breakApart();
    if (f.especial) bloque.merge();

    valores.push(f.vacia
      ? ['', '', '', '', '', '', '']
      : [f.inicio / 1440, f.fin / 1440, '',
         f.especial || f.nombre,
         f.especial ? '' : (f.categoria || ''),
         f.especial ? '' : (f.tipo || ''),
         f.especial ? '' : (f.escuela || '')]);
  });
  hoja.getRange(filaTotal, 1, filas.length, 7).setValues(valores);

  // Fuera las filas de muestra: las nuevas suben a la 3
  if (filaTotal > 3) hoja.deleteRows(3, filaTotal - 3);
  var nuevaTotal = 3 + filas.length;

  var formulas = [];
  for (var k = 3; k < nuevaTotal; k++) {
    formulas.push([filas[k - 3].vacia ? '' : '=$B' + k + '-$A' + k]);
  }
  hoja.getRange(3, 3, formulas.length, 1).setFormulas(formulas);
  hoja.getRange(nuevaTotal, 3).setFormula('=SUM(C3:C' + (nuevaTotal - 1) + ')');
  hoja.getRange(1, 1).setValue(titulo);

  return nuevaTotal;
}

/** "Total Hores" apunta al Total de cada día, esté en la fila que esté. */
function enlazarTotales_(libro, totales) {
  var hoja = libro.getSheetByName('Total Hores');
  if (!hoja) return;

  var porSlug = {};
  HOJAS_DIA.forEach(function (n) { porSlug[slug_(n)] = n; });

  var ultima = Math.max(hoja.getLastRow(), 2);
  var nombres = hoja.getRange(1, 1, ultima, 1).getValues();
  for (var i = 0; i < nombres.length; i++) {
    var nombreHoja = porSlug[slug_(nombres[i][0])];
    if (nombreHoja && totales[nombreHoja]) {
      hoja.getRange(i + 1, 2).setFormula("='" + nombreHoja + "'!C" + totales[nombreHoja]);
    }
  }
}

/** El libro, como Excel. Es la misma exportación que "Descargar como .xlsx". */
function exportarXlsx_(id) {
  var url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx';
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('No se pudo exportar a Excel (' + resp.getResponseCode() + ').');
  }
  return resp.getBlob();
}

/**
 * El parte, por correo, con el Excel adjunto y el resumen en el cuerpo. Va a
 * `email_partes` de la hoja Config si está, y si no a `email_admin`.
 */
function enviarPorCorreo_(nombre, blob, semana, url) {
  var config = leerConfigCorta_();
  var destinos = String(config.email_partes || config.email_admin || '')
    .split(',').map(function (e) { return e.trim(); }).filter(Boolean);
  if (!destinos.length) return '';

  var lunes = aDate_(semana.lunes);
  var asunto = 'Parte de clases · semana del ' + lunes.getDate() + ' de ' + NOMBRES_MES[lunes.getMonth()];
  var cuerpo = 'Adjunto el parte de la semana del ' + fechaCorta_(semana.lunes) + '.\n\n' +
               semana.resumen.join('\n') + '\n\n' +
               (semana.avisos.length ? 'Ojo:\n- ' + semana.avisos.join('\n- ') + '\n\n' +
                 'Se corrige en el panel y el parte se puede volver a generar; el archivo se sustituye.\n\n'
                 : '') +
               'También está en Drive, en la carpeta "' + NOMBRE_CARPETA + '":\n' + url + '\n\n' +
               'Generado automáticamente a partir de las clases apuntadas en la app.';

  MailApp.sendEmail({
    to: destinos.join(','),
    subject: asunto,
    body: cuerpo,
    attachments: [blob],
    name: 'Clases con Sara'
  });
  return destinos.join(', ');
}

// --- Dónde están las cosas --------------------------------------------------

function prop_(clave) {
  return PropertiesService.getScriptProperties().getProperty(clave) || '';
}

function sheetId_() {
  return prop_('SHEET_ID') || buscarHojaDeDatos_();
}

function carpetaId_() {
  return prop_('CARPETA_ID') || buscarCarpeta_();
}

function buscarHojaDeDatos_() {
  var archivos = DriveApp.getFilesByName(NOMBRE_HOJA_DATOS);
  if (!archivos.hasNext()) {
    throw new Error('No encuentro la hoja "' + NOMBRE_HOJA_DATOS + '" en Drive.');
  }
  return archivos.next().getId();
}

function buscarCarpeta_() {
  var carpetas = DriveApp.getFoldersByName(NOMBRE_CARPETA);
  if (!carpetas.hasNext()) {
    throw new Error('No encuentro la carpeta "' + NOMBRE_CARPETA + '" en Drive.');
  }
  return carpetas.next().getId();
}

/**
 * La plantilla, como hoja de Google. La primera vez se convierte desde el Excel que
 * hay en la carpeta; después se reutiliza. Para cambiar el formato del parte basta
 * con borrar la hoja "Plantilla parte semanal" y dejar un Excel nuevo con ese nombre.
 */
function plantillaId_() {
  var props = PropertiesService.getScriptProperties();
  var guardada = props.getProperty('PLANTILLA_ID');
  if (guardada) {
    try {
      var f = DriveApp.getFileById(guardada);
      if (!f.isTrashed()) return guardada;
    } catch (e) { /* la borraron: se rehace */ }
  }

  var carpeta = DriveApp.getFolderById(carpetaId_());

  var hojas = carpeta.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (hojas.hasNext()) {
    var hoja = hojas.next();
    if (hoja.getName() === NOMBRE_PLANTILLA) {
      props.setProperty('PLANTILLA_ID', hoja.getId());
      return hoja.getId();
    }
  }

  var excel = excelDePlantilla_(carpeta);
  if (!excel) {
    throw new Error('Falta la plantilla: deja en la carpeta "' + NOMBRE_CARPETA +
                    '" un Excel llamado "' + PLANTILLA_XLSX + '".');
  }

  var creado = Drive.Files.create(
    { name: NOMBRE_PLANTILLA, mimeType: MimeType.GOOGLE_SHEETS, parents: [carpeta.getId()] },
    excel.getBlob()
  );
  props.setProperty('PLANTILLA_ID', creado.id);
  return creado.id;
}

/** El Excel de plantilla: el que se llama así o, si no, cualquier parte de Sara. */
function excelDePlantilla_(carpeta) {
  var exacto = carpeta.getFilesByName(PLANTILLA_XLSX);
  if (exacto.hasNext()) return exacto.next();

  var candidato = null;
  var archivos = carpeta.getFilesByType(MimeType.MICROSOFT_EXCEL);
  while (archivos.hasNext()) {
    var f = archivos.next();
    if (/semana/i.test(f.getName()) && (!candidato || f.getDateCreated() < candidato.getDateCreated())) {
      candidato = f;   // el más antiguo: el que hizo Sara a mano
    }
  }
  return candidato;
}

function leerConfigCorta_() {
  var config = {};
  objetos_(SpreadsheetApp.openById(sheetId_()).getSheetByName('Config')).forEach(function (fila) {
    config[String(fila.clave || '').trim()] = String(fila.valor === undefined ? '' : fila.valor).trim();
  });
  return config;
}

/** Escribe o actualiza una clave en la hoja Config de la app. */
function escribirConfig_(clave, valor, descripcion) {
  var hoja = SpreadsheetApp.openById(sheetId_()).getSheetByName('Config');
  if (!hoja) return;
  var filas = hoja.getDataRange().getValues();
  for (var i = 1; i < filas.length; i++) {
    if (String(filas[i][0]).trim() === clave) {
      hoja.getRange(i + 1, 2).setValue(valor);
      return;
    }
  }
  hoja.appendRow([clave, valor, descripcion || '']);
}

// --- Utilidades -------------------------------------------------------------

/** Las filas de una hoja como objetos, con la cabecera de nombres. */
function objetos_(hoja) {
  if (!hoja) return [];
  var datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return [];
  var cabecera = datos[0].map(function (c) { return String(c).trim(); });
  var salida = [];
  for (var i = 1; i < datos.length; i++) {
    if (datos[i].every(function (v) { return v === '' || v === null; })) continue;
    var obj = {};
    cabecera.forEach(function (col, j) { if (col) obj[col] = datos[i][j]; });
    salida.push(obj);
  }
  return salida;
}

function ahora_() { return new Date(); }

function aDate_(fechaISO) {
  var t = String(fechaISO).split('-');
  return new Date(Number(t[0]), Number(t[1]) - 1, Number(t[2]), 0, 0, 0);
}

function fechaISO_(d) {
  return Utilities.formatDate(d, TZ_PARTE, 'yyyy-MM-dd');
}

function hhmm_(d) {
  return Utilities.formatDate(d, TZ_PARTE, 'HH:mm');
}

function sumarDias_(d, n) {
  var salida = new Date(d.getTime());
  salida.setDate(salida.getDate() + n);
  return salida;
}

/** El lunes de la semana de esa fecha. */
function lunesDe_(d) {
  var salida = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var retroceso = (salida.getDay() + 6) % 7;
  salida.setDate(salida.getDate() - retroceso);
  return salida;
}

function aFechaISO_(valor) {
  if (valor instanceof Date) return fechaISO_(valor);
  var s = String(valor || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s;
}

function aHHMM_(valor) {
  if (valor instanceof Date) return hhmm_(valor);
  var s = String(valor || '').trim();
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  return ('0' + m[1]).slice(-2) + ':' + m[2];
}

function enMin_(hhmm) {
  var t = String(hhmm).split(':');
  return Number(t[0]) * 60 + Number(t[1] || 0);
}

/** '24/08/2026' */
function fechaCorta_(fechaISO) {
  var t = String(fechaISO).split('-');
  return t[2] + '/' + t[1] + '/' + t[0];
}

/** '4 h 30' · '9 h' · '0 h' */
function textoHoras_(minutos) {
  var h = Math.floor(minutos / 60);
  var m = minutos % 60;
  if (!minutos) return '0 h';
  if (!h) return m + ' min';
  if (!m) return h + ' h';
  return h + ' h ' + m;
}

function slug_(texto) {
  return String(texto || '').toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]/g, '');
}

function escapar_(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
