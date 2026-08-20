<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/includes/db.php';
require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/funciones.php';
require_once dirname(__DIR__) . '/includes/email.php';

header('Content-Type: application/json; charset=utf-8');

// Solo JSON, solo admin, solo POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !isAdmin()) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'No autorizado']);
    exit;
}

$data   = json_decode(file_get_contents('php://input'), true) ?? [];
$accion = $data['accion'] ?? '';
$csrf   = $data['csrf_token'] ?? '';

if (!validarCsrf($csrf)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Token CSRF inválido']);
    exit;
}

$db = getDB();

if ($accion === 'confirmar') {
    $id   = (int)($data['reserva_id'] ?? 0);
    $stmt = $db->prepare("SELECT r.*, a.nombre, a.email, a.token FROM reservas r JOIN alumnos a ON a.id=r.alumno_id WHERE r.id=? AND r.estado='pendiente'");
    $stmt->execute([$id]);
    $reserva = $stmt->fetch();

    if (!$reserva) {
        echo json_encode(['ok' => false, 'error' => 'Reserva no encontrada o ya procesada.']);
        exit;
    }

    $stmt = $db->prepare("UPDATE reservas SET estado='confirmada', notas_admin=? WHERE id=?");
    $stmt->execute([$data['nota'] ?? null, $id]);

    // Notificar al alumno
    notificarAlumnoConfirmacion(
        ['nombre' => $reserva['nombre'], 'email' => $reserva['email'], 'token' => $reserva['token']],
        $reserva['fecha'], $reserva['hora_inicio'], $reserva['hora_fin']
    );

    echo json_encode(['ok' => true, 'mensaje' => 'Reserva confirmada.']);

} elseif ($accion === 'rechazar') {
    $id    = (int)($data['reserva_id'] ?? 0);
    $nota  = $data['nota'] ?? null;
    $stmt  = $db->prepare("SELECT r.*, a.nombre, a.email, a.token FROM reservas r JOIN alumnos a ON a.id=r.alumno_id WHERE r.id=? AND r.estado IN ('pendiente','confirmada')");
    $stmt->execute([$id]);
    $reserva = $stmt->fetch();

    if (!$reserva) {
        echo json_encode(['ok' => false, 'error' => 'Reserva no encontrada.']);
        exit;
    }

    $stmt = $db->prepare("UPDATE reservas SET estado='rechazada', notas_admin=? WHERE id=?");
    $stmt->execute([$nota, $id]);

    notificarAlumnoRechazo(
        ['nombre' => $reserva['nombre'], 'email' => $reserva['email'], 'token' => $reserva['token']],
        $reserva['fecha'], $reserva['hora_inicio'], $nota
    );

    echo json_encode(['ok' => true, 'mensaje' => 'Reserva rechazada.']);

} else {
    echo json_encode(['ok' => false, 'error' => 'Acción no reconocida.']);
}
