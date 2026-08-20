/**
 * Punto de entrada web.
 *
 * El mismo proyecto se publica DOS veces, con configuraciones distintas:
 *
 *   Implementación "API"    · ejecutar como: yo · acceso: cualquiera, incluso anónimo
 *                             La llama el front del alumno alojado en GitHub Pages.
 *
 *   Implementación "Panel"  · ejecutar como: usuario que accede · acceso: cualquiera con cuenta de Google
 *                             Sara abre esta URL y Google le pide su cuenta.
 *
 * Una petición con parámetro "accion" devuelve JSON. Sin parámetros, sirve el panel.
 */

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};

  if (!params.accion) return servirPanel_();

  // El calendario no devuelve JSON, sino un archivo que el móvil abre en su agenda
  if (params.accion === 'ics') return servirIcs_(params.codigo);

  var datos = params.datos ? JSON.parse(params.datos) : params;
  var salida = enrutar_(params.accion, datos);

  if (params.callback) return respuestaJsonp_(salida, params.callback);
  return respuestaJson_(salida);
}

function doPost(e) {
  var cuerpo = {};
  try {
    if (e && e.postData && e.postData.contents) cuerpo = JSON.parse(e.postData.contents);
  } catch (err) {
    return respuestaJson_({ ok: false, error: 'Petición mal formada.' });
  }
  return respuestaJson_(enrutar_(cuerpo.accion, cuerpo));
}

// --- Router ----------------------------------------------------------------

function enrutar_(accion, datos) {
  try {
    switch (accion) {
      // Públicas
      case 'disponibilidad':
        return { ok: true, datos: obtenerDisponibilidad() };
      case 'reservar':
        return crearReserva(datos);
      case 'consultar':
        return consultarPorCodigo(datos.codigo);
      case 'cancelar':
        return cancelarPorCodigo(datos.codigo);
      case 'avisar':
        return avisarDeGrupo(datos.grupo);

      // De Sara
      case 'panel':
        return exigirAdmin_() || datosPanel();
      case 'confirmar':
        return exigirAdmin_() || cambiarEstado(datos.ids || datos.id, 'confirmada', '');
      case 'rechazar':
        return exigirAdmin_() || cambiarEstado(datos.ids || datos.id, 'rechazada', datos.motivo);
      case 'anular':
        return exigirAdmin_() ||
               cambiarEstado(datos.ids || datos.id, 'cancelada', datos.motivo || 'Anulada por Sara');
      case 'marcar_avisado':
        return exigirAdmin_() || marcarAvisado(datos.ids || datos.id);
      case 'guardar_config':
        return exigirAdmin_() || guardarConfigPanel_(datos);
      case 'guardar_horario':
        return exigirAdmin_() || guardarHorario(datos.horario);

      default:
        return { ok: false, error: 'Acción no reconocida.' };
    }
  } catch (err) {
    Logger.log('Error en ' + accion + ': ' + err.message);
    return { ok: false, error: 'Error del servidor: ' + err.message };
  }
}

// --- Seguridad -------------------------------------------------------------

function emailActual_() {
  try {
    return String(Session.getActiveUser().getEmail() || '').toLowerCase();
  } catch (e) {
    return '';
  }
}

function esAdmin() {
  var actual = emailActual_();
  if (!actual) return false;
  var permitidos = String(config('email_admin', '')).toLowerCase().split(',');
  for (var i = 0; i < permitidos.length; i++) {
    if (permitidos[i].trim() === actual) return true;
  }
  return false;
}

/** Devuelve un error si quien llama no es Sara, o null si puede continuar. */
function exigirAdmin_() {
  if (esAdmin()) return null;
  return { ok: false, error: 'Solo Sara puede hacer esto.', no_autorizado: true };
}

// --- Respuestas ------------------------------------------------------------

/** Descarga del archivo de calendario con las clases confirmadas. */
function servirIcs_(codigo) {
  var ics = generarIcs(codigo);
  if (!ics) {
    return ContentService.createTextOutput(
      'No hay ninguna clase confirmada con ese código todavía.');
  }
  return ContentService.createTextOutput(ics)
    .setMimeType(ContentService.MimeType.ICAL)
    .downloadAsFile('clase-con-sara.ics');
}

function respuestaJson_(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

function respuestaJsonp_(objeto, callback) {
  var nombre = String(callback).replace(/[^\w$]/g, '');
  return ContentService
    .createTextOutput(nombre + '(' + JSON.stringify(objeto) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// --- Panel de Sara ---------------------------------------------------------

function servirPanel_() {
  if (!esAdmin()) {
    var aviso = HtmlService.createHtmlOutput(
      '<div style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:2rem;' +
      'border:1px solid #e5e7eb;border-radius:12px;text-align:center">' +
      '<h2 style="margin:0 0 .5rem">Acceso restringido</h2>' +
      '<p style="color:#6b7280">Esta página es solo para Sara.</p>' +
      '<p style="color:#6b7280;font-size:.875rem">Has entrado con <b>' +
      (emailActual_() || 'una cuenta no identificada') + '</b>.</p>' +
      '</div>');
    return aviso.setTitle('Acceso restringido');
  }

  var plantilla = HtmlService.createTemplateFromFile('panel');
  return plantilla.evaluate()
    .setTitle(config('nombre_sitio', 'Clases con Sara') + ' · Panel')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** El panel llama a estas funciones directamente con google.script.run. */
function apiPanel(accion, datos) {
  return enrutar_(accion, datos || {});
}

function guardarConfigPanel_(datos) {
  var permitidas = ['telefono_sara', 'url_publica', 'url_api', 'antelacion_minima_horas',
                    'semanas_vista', 'nombre_sitio', 'avisar_por_email', 'max_horas_seguidas'];
  permitidas.forEach(function (clave) {
    if (datos[clave] !== undefined) setConfig(clave, String(datos[clave]).trim());
  });
  return { ok: true };
}

/**
 * El panel compone los enlaces de WhatsApp en el navegador, con las plantillas que
 * recibe en datosPanel(). Así la ventana se abre dentro del propio clic de Sara y
 * el navegador no la bloquea como si fuera una ventana emergente.
 */
