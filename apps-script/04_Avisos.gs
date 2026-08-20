/**
 * Avisos.
 *
 * A Sara: email automático con cada solicitud nueva (gratis, le llega como aviso al móvil).
 * Al alumno: no se envía nada automático. El panel abre WhatsApp con el mensaje ya
 * redactado y Sara solo pulsa enviar, desde su WhatsApp de siempre.
 *
 * Las plantillas viven aquí y el panel las reutiliza, para que el texto sea el mismo
 * venga de donde venga. El día que se contrate una API de WhatsApp basta con
 * implementar enviarWhatsApp_() y llamarla desde avisarSara* y desde los cambios de estado.
 */

function avisarSaraNuevaSolicitud(reserva) {
  if (String(config('avisar_por_email', 'SI')).toUpperCase() !== 'SI') return;

  var destino = primerEmailAdmin_();
  if (!destino) return;

  var asunto = 'Nueva solicitud de clase · ' + reserva.etiqueta_fecha + ' a las ' + reserva.hora_inicio;
  var cuerpo =
    reserva.nombre + ' ha solicitado una clase.\n\n' +
    'Día: ' + reserva.etiqueta_fecha + '\n' +
    'Hora: ' + reserva.hora_inicio + ' – ' + reserva.hora_fin + '\n' +
    'Móvil: ' + reserva.telefono + '\n' +
    (reserva.notas ? 'Nota: ' + reserva.notas + '\n' : '') +
    '\nEntra en tu panel para confirmarla o rechazarla.';

  enviarEmail_(destino, asunto, cuerpo);
}

function avisarSaraCancelacion(reserva, tardia) {
  if (String(config('avisar_por_email', 'SI')).toUpperCase() !== 'SI') return;

  var destino = primerEmailAdmin_();
  if (!destino) return;

  var asunto = 'Clase cancelada · ' + reserva.etiqueta_fecha + ' a las ' + reserva.hora_inicio;
  var cuerpo =
    reserva.nombre + ' ha cancelado su clase.\n\n' +
    'Día: ' + reserva.etiqueta_fecha + '\n' +
    'Hora: ' + reserva.hora_inicio + ' – ' + reserva.hora_fin + '\n' +
    'Móvil: ' + reserva.telefono + '\n' +
    (tardia ? '\nAVISO: cancelación con menos de ' + configNum('cancelacion_horas', 24) +
              ' horas de antelación.\n' : '') +
    '\nLa hora ha vuelto a quedar libre en el enlace de reservas.';

  enviarEmail_(destino, asunto, cuerpo);
}

function enviarEmail_(destino, asunto, cuerpo) {
  try {
    MailApp.sendEmail(destino, asunto, cuerpo);
  } catch (e) {
    Logger.log('No se pudo enviar el aviso por email: ' + e.message);
  }
}

// --- Mensajes de WhatsApp ---------------------------------------------------

/**
 * Plantillas por estado. Marcadores disponibles:
 *   {nombre}  primer nombre del alumno
 *   {cuando}  'Jueves, 21 de agosto a las 10:00'
 *   {motivo}  ' (lo que Sara escriba)' o cadena vacía
 *   {enlace}  enlace público de reservas
 */
function plantillasWhatsApp() {
  return {
    pendiente:  'Hola {nombre}, soy Sara. He recibido tu solicitud para el {cuando}. Te confirmo en breve.',
    confirmada: 'Hola {nombre}, soy Sara. Te confirmo tu clase del {cuando}. ¡Nos vemos!',
    rechazada:  'Hola {nombre}, soy Sara. No voy a poder darte la clase del {cuando}{motivo}. Puedes elegir otra hora aquí: {enlace}',
    cancelada:  'Hola {nombre}, soy Sara. He tenido que anular tu clase del {cuando}{motivo}. Puedes elegir otra hora aquí: {enlace}',
    recordatorio: 'Hola {nombre}, soy Sara. Te recuerdo tu clase del {cuando}. ¡Nos vemos!'
  };
}

function rellenarPlantilla(plantilla, valores) {
  return String(plantilla)
    .replace('{nombre}', valores.nombre || '')
    .replace('{cuando}', valores.cuando || '')
    .replace('{motivo}', valores.motivo || '')
    .replace('{enlace}', valores.enlace || '');
}

/** Texto que Sara enviará al alumno según el estado de la reserva. */
function textoWhatsAppAlumno(reserva, motivo) {
  var plantillas = plantillasWhatsApp();
  var plantilla  = plantillas[reserva.estado] || plantillas.pendiente;
  var textoMotivo = motivo || reserva.motivo_rechazo || '';

  return rellenarPlantilla(plantilla, {
    nombre: String(reserva.nombre || '').split(' ')[0],
    cuando: reserva.etiqueta_fecha + ' a las ' + reserva.hora_inicio,
    motivo: textoMotivo ? ' (' + textoMotivo + ')' : '',
    enlace: config('url_publica', '')
  });
}

/** Enlace que abre WhatsApp con el mensaje ya escrito. */
function enlaceWhatsApp(telefono, texto) {
  return 'https://wa.me/' + normalizarTelefono(telefono) + '?text=' + encodeURIComponent(texto);
}

function primerEmailAdmin_() {
  var lista = String(config('email_admin', '')).split(',');
  return lista.length ? lista[0].trim() : '';
}

/**
 * Punto de extensión para el día que haya API de WhatsApp (Meta Cloud API o WATI).
 * Implementar aquí y llamarla desde avisarSara* y desde confirmar/rechazar.
 */
function enviarWhatsApp_(telefono, texto) {
  throw new Error('Sin API de WhatsApp configurada. Se usan enlaces wa.me desde el panel.');
}
