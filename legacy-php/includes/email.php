<?php
// ============================================================
// Sistema de notificaciones por email
// Estado: preparado pero desactivado (EMAIL_ENABLED = false en config.php)
// Para activar: configurar EMAIL_ENABLED = true y los datos SMTP
// ============================================================

/**
 * Envía un email usando la función mail() de PHP o PHPMailer (si está disponible).
 * En Hostinger puedes usar mail() directamente o configurar SMTP externo.
 */
function enviarEmail(string $para, string $asunto, string $cuerpoHtml): bool {
    if (!defined('EMAIL_ENABLED') || !EMAIL_ENABLED) {
        return false; // Emails desactivados
    }

    $from     = EMAIL_FROM;
    $fromName = EMAIL_FROM_NAME;
    $headers  = implode("\r\n", [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        "From: {$fromName} <{$from}>",
        "Reply-To: {$from}",
        'X-Mailer: PHP/' . PHP_VERSION,
    ]);

    return mail($para, '=?UTF-8?B?' . base64_encode($asunto) . '?=', $cuerpoHtml, $headers);
}

// --- Plantilla base de email ---

function plantillaEmail(string $titulo, string $contenido): string {
    return '<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>' . htmlspecialchars($titulo) . '</title></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
    <div style="background:#2563eb;padding:24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:20px;">Autoescuela Sara</h1>
    </div>
    <div style="padding:24px;">
      ' . $contenido . '
    </div>
    <div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#64748b;">
      Autoescuela Sara &bull; Este es un mensaje automático, no respondas a este email.
    </div>
  </div>
</body>
</html>';
}

// --- Notificación a Sara: nueva solicitud ---

function notificarSaraNuevaReserva(array $alumno, string $fecha, string $horaInicio, string $horaFin): void {
    if (!defined('ADMIN_EMAIL') || !ADMIN_EMAIL) return;
    $fechaFormat = formatearFecha($fecha);
    $hora        = formatearHora($horaInicio) . ' – ' . formatearHora($horaFin);
    $contenido   = "
        <h2 style='color:#2563eb;'>Nueva solicitud de reserva</h2>
        <p><strong>Alumno:</strong> " . htmlspecialchars($alumno['nombre']) . "</p>
        <p><strong>Fecha:</strong> {$fechaFormat}</p>
        <p><strong>Hora:</strong> {$hora}</p>
        <p><a href='" . BASE_URL . "/admin/' style='background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;margin-top:10px;'>Ver en el panel</a></p>
    ";
    enviarEmail(ADMIN_EMAIL, 'Nueva solicitud de reserva - ' . $alumno['nombre'], plantillaEmail('Nueva solicitud', $contenido));
}

// --- Notificación a alumno: reserva confirmada ---

function notificarAlumnoConfirmacion(array $alumno, string $fecha, string $horaInicio, string $horaFin): void {
    if (!$alumno['email']) return;
    $fechaFormat = formatearFecha($fecha);
    $hora        = formatearHora($horaInicio) . ' – ' . formatearHora($horaFin);
    $enlace      = BASE_URL . '/alumno/?token=' . urlencode($alumno['token']);
    $contenido   = "
        <h2 style='color:#16a34a;'>¡Reserva confirmada!</h2>
        <p>Hola <strong>" . htmlspecialchars($alumno['nombre']) . "</strong>,</p>
        <p>Tu reserva ha sido <strong>confirmada</strong>:</p>
        <p><strong>Fecha:</strong> {$fechaFormat}</p>
        <p><strong>Hora:</strong> {$hora}</p>
        <p><a href='{$enlace}' style='background:#16a34a;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;margin-top:10px;'>Ver mis reservas</a></p>
        <p style='color:#64748b;font-size:13px;'>Recuerda presentarte con antelación suficiente.</p>
    ";
    enviarEmail($alumno['email'], 'Reserva confirmada - ' . $fechaFormat, plantillaEmail('Reserva confirmada', $contenido));
}

// --- Notificación a alumno: reserva rechazada ---

function notificarAlumnoRechazo(array $alumno, string $fecha, string $horaInicio, ?string $motivo): void {
    if (!$alumno['email']) return;
    $fechaFormat = formatearFecha($fecha);
    $motivoHtml  = $motivo ? '<p><strong>Motivo:</strong> ' . htmlspecialchars($motivo) . '</p>' : '';
    $enlace      = BASE_URL . '/alumno/?token=' . urlencode($alumno['token']);
    $contenido   = "
        <h2 style='color:#dc2626;'>Solicitud no disponible</h2>
        <p>Hola <strong>" . htmlspecialchars($alumno['nombre']) . "</strong>,</p>
        <p>Tu solicitud para el <strong>{$fechaFormat}</strong> no ha podido ser confirmada.</p>
        {$motivoHtml}
        <p><a href='{$enlace}' style='background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;margin-top:10px;'>Reservar otra hora</a></p>
    ";
    enviarEmail($alumno['email'], 'Sobre tu reserva - ' . $fechaFormat, plantillaEmail('Reserva no disponible', $contenido));
}

// --- Notificación a Sara: alumno cancela ---

function notificarSaraCancelacion(array $alumno, string $fecha, string $horaInicio, bool $tardía): void {
    if (!defined('ADMIN_EMAIL') || !ADMIN_EMAIL) return;
    $fechaFormat = formatearFecha($fecha);
    $aviso       = $tardía ? '<p style="color:#dc2626;"><strong>⚠ Cancelación con menos de 24 horas de antelación.</strong></p>' : '';
    $contenido   = "
        <h2 style='color:#d97706;'>Cancelación de reserva</h2>
        <p><strong>Alumno:</strong> " . htmlspecialchars($alumno['nombre']) . "</p>
        <p><strong>Clase cancelada:</strong> {$fechaFormat} – " . formatearHora($horaInicio) . "</p>
        {$aviso}
        <p><a href='" . BASE_URL . "/admin/' style='background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;margin-top:10px;'>Ver panel</a></p>
    ";
    enviarEmail(ADMIN_EMAIL, 'Cancelación de clase - ' . $alumno['nombre'], plantillaEmail('Cancelación', $contenido));
}
