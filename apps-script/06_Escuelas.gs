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

/**
 * [{ nombre: 'Andorra', slug: 'andorra', direccion: 'Av. Meritxell 1' }, ...]
 *
 * En la hoja se escriben separadas por punto y coma, y con la dirección detrás de un
 * igual si se quiere: la dirección acaba en el evento del calendario, para que tanto
 * Sara como el alumno vean dónde es sin buscarlo.
 *
 *   Andorra = Av. Meritxell 1, Andorra la Vella; Encamp = Carrer Major 5, Encamp
 */
function listaDeEscuelas() {
  var crudo = String(config('autoescuelas', ''));
  if (!crudo) return [];

  // El punto y coma separa autoescuelas; si no hay ninguno, valen las comas
  var trozos = crudo.indexOf(';') !== -1 ? crudo.split(';') : crudo.split(',');

  return trozos
    .map(function (trozo) { return String(trozo).trim(); })
    .filter(function (trozo) { return trozo !== ''; })
    .map(function (trozo) {
      var partes = trozo.split('=');
      var nombre = partes[0].trim();
      return {
        nombre: nombre,
        slug: slugDeEscuela_(nombre),
        direccion: partes.length > 1 ? partes.slice(1).join('=').trim() : ''
      };
    });
}

/** Dónde se da la clase: la dirección de la autoescuela, o su nombre si no la hay. */
function ubicacionDeEscuela(nombre) {
  var buscado = slugDeEscuela_(nombre || '');
  if (!buscado) return '';

  var escuelas = listaDeEscuelas();
  for (var i = 0; i < escuelas.length; i++) {
    if (escuelas[i].slug === buscado) {
      return escuelas[i].direccion || escuelas[i].nombre;
    }
  }
  return '';
}

/**
 * Enlaces para dejar reseña, uno por autoescuela.
 *
 * Van directos al cuadro de escribir la reseña, no a la ficha del mapa: la dirección
 * es search.google.com/local/writereview con el identificador del sitio. Se escriben
 * en la hoja Config igual que las autoescuelas, separados por punto y coma:
 *
 *   Andorra = https://search.google.com/local/writereview?placeid=ChIJ...; Encamp = ...
 *
 * Las estrellas no se pueden dejar puestas de antemano: Google no lo permite, y
 * forzar la nota va contra sus normas. Las pone el alumno.
 */
function enlacesDeResena() {
  var crudo = String(config('resenas', ''));
  if (!crudo) return [];

  return crudo.split(';')
    .map(function (trozo) { return String(trozo).trim(); })
    .filter(function (trozo) { return trozo !== ''; })
    .map(function (trozo) {
      var partes = trozo.split('=');
      var nombre = partes[0].trim();
      return {
        nombre: nombre,
        slug: slugDeEscuela_(nombre),
        // La dirección lleva su propio '=' dentro, así que se vuelve a unir
        enlace: partes.length > 1 ? partes.slice(1).join('=').trim() : ''
      };
    })
    .filter(function (r) { return r.enlace !== ''; });
}

/** El enlace de reseña de una autoescuela, o cadena vacía si no lo tiene puesto. */
function enlaceDeResena(nombre) {
  var buscado = slugDeEscuela_(nombre || '');
  if (!buscado) return '';

  var lista = enlacesDeResena();
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].slug === buscado) return lista[i].enlace;
  }
  return '';
}

/**
 * Tipos de clase, configurables igual que las autoescuelas.
 * Sara elige uno al confirmar y aparece en el título del evento.
 */
function listaDeTipos() {
  var crudo = String(config('tipos_clase', 'Campo, Circulación'));
  return crudo.split(',')
    .map(function (t) { return String(t).trim(); })
    .filter(function (t) { return t !== ''; });
}

/** Devuelve el tipo tal y como está escrito en la configuración, o cadena vacía. */
function tipoValido(valor) {
  var buscado = slugDeEscuela_(valor || '');
  if (!buscado) return '';

  var tipos = listaDeTipos();
  for (var i = 0; i < tipos.length; i++) {
    if (slugDeEscuela_(tipos[i]) === buscado) return tipos[i];
  }
  return '';
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
