/**
 * Autoescuelas.
 *
 * Sara da clase para más de una, y a fin de mes cada una le paga lo suyo. Cada clase
 * queda etiquetada con la autoescuela del alumno, junto al campo o calle, para que la
 * cuenta salga sin tener que recordar quién era de dónde.
 *
 * La etiqueta viaja en el enlace: Sara comparte una dirección distinta en cada grupo
 * de alumnos y el dato entra solo, sin preguntarle nada a nadie. Si alguien reenvía
 * el enlace equivocado, Sara lo corrige desde su panel de un toque.
 *
 * La lista vive en la hoja Config, no en el código: cuando entre una tercera
 * autoescuela se escribe ahí y funciona sin tocar nada más.
 */

/** [{ nombre: 'Andorra', slug: 'andorra' }, ...] */
function listaDeEscuelas() {
  var crudo = String(config('autoescuelas', ''));
  if (!crudo) return [];

  return crudo.split(',')
    .map(function (nombre) { return String(nombre).trim(); })
    .filter(function (nombre) { return nombre !== ''; })
    .map(function (nombre) {
      return { nombre: nombre, slug: slugDeEscuela_(nombre) };
    });
}

/** 'Autoescola Encamp' -> 'autoescolaencamp'. Sin acentos, para que quepa en un enlace. */
function slugDeEscuela_(nombre) {
  return String(nombre)
    .toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Devuelve el nombre tal y como está escrito en la configuración, venga como venga:
 * por su slug desde el enlace, o por su nombre desde el panel. Cadena vacía si no
 * es ninguna de las conocidas, para no guardar etiquetas inventadas.
 */
function escuelaValida(valor) {
  var buscado = slugDeEscuela_(valor || '');
  if (!buscado) return '';

  var escuelas = listaDeEscuelas();
  for (var i = 0; i < escuelas.length; i++) {
    if (escuelas[i].slug === buscado) return escuelas[i].nombre;
  }
  return '';
}

/**
 * La última autoescuela con la que reservó ese móvil.
 *
 * Sirve para cuando un alumno entra por el enlace genérico o cambia de teléfono:
 * si ya vino antes de Encamp, sus clases siguen siendo de Encamp sin que nadie
 * tenga que acordarse.
 */
function escuelaDelAlumno_(telefono, filas) {
  var movil = normalizarTelefono(telefono);
  if (!movil) return '';

  var lista = filas || filasComoObjetos(getHoja(HOJA_RESERVAS));
  for (var i = lista.length - 1; i >= 0; i--) {
    if (String(lista[i].telefono).trim() !== movil) continue;
    var escuela = escuelaValida(lista[i].escuela);
    if (escuela) return escuela;
  }
  return '';
}

/** Cambia la autoescuela de unas clases. Lo usa Sara desde el panel. */
function marcarEscuela(ids, escuela) {
  var nombre = escuelaValida(escuela);
  if (!nombre && String(escuela || '').trim() !== '') {
    return { ok: false, error: 'Esa autoescuela no está en la lista.' };
  }

  var lista = [].concat(ids || []).filter(Boolean);
  if (!lista.length) return { ok: false, error: 'Falta la clase.' };

  var pedidos = {};
  lista.forEach(function (id) { pedidos[String(id).trim()] = true; });

  var hoja = getHoja(HOJA_RESERVAS);
  var columna = indiceCol_('escuela');
  var tocadas = 0;

  filasComoObjetos(hoja).forEach(function (fila) {
    if (!pedidos[String(fila.id).trim()]) return;
    hoja.getRange(fila._fila, columna).setValue(nombre);
    tocadas++;
  });

  if (!tocadas) return { ok: false, error: 'No encontramos esa clase.' };
  return { ok: true, escuela: nombre, tocadas: tocadas };
}

/** Los enlaces que Sara comparte, uno por autoescuela. Se ven en su panel. */
function enlacesPorEscuela() {
  var base = config('url_publica', '');
  if (!base) return [];

  var limpio = base.replace(/[?#].*$/, '');
  return listaDeEscuelas().map(function (escuela) {
    return {
      nombre: escuela.nombre,
      enlace: limpio + '?e=' + escuela.slug
    };
  });
}
