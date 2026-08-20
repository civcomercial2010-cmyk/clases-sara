<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/includes/db.php';
require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/funciones.php';
require_once dirname(__DIR__) . '/includes/email.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Método no permitido']);
    exit;
}

$alumno = getAlumnoActual();
if (!$alumno) {
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

if ($accion === 'cancelar') {
    $reservaId = (int)($data['reserva_id'] ?? 0);
    $resultado = cancelarReserva($reservaId, $alumno['id']);

    if ($resultado['ok']) {
        $db   = getDB();
        $stmt = $db->prepare('SELECT * FROM reservas WHERE id=?');
        $stmt->execute([$reservaId]);
        $r = $stmt->fetch();
        if ($r) {
            notificarSaraCancelacion($alumno, $r['fecha'], $r['hora_inicio'], (bool)$resultado['cancelacion_tardia']);
        }
    }
    echo json_encode($resultado);
} else {
    echo json_encode(['ok' => false, 'error' => 'Acción no reconocida.']);
}
