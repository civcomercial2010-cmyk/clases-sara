<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/includes/db.php';
require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/funciones.php';
require_once dirname(__DIR__) . '/includes/email.php';

$alumno = requireAlumno();

$reservaId = (int)($_POST['reserva_id'] ?? $_GET['reserva_id'] ?? 0);

if (!$reservaId) {
    header('Location: ' . BASE_URL . '/alumno/?token=' . urlencode($alumno['token']));
    exit;
}

// Cancelación por GET = confirmación visual (desde mis-reservas sin modal)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Verificar que la reserva pertenece al alumno
    $db   = getDB();
    $stmt = $db->prepare("SELECT * FROM reservas WHERE id=? AND alumno_id=? AND estado IN ('pendiente','confirmada')");
    $stmt->execute([$reservaId, $alumno['id']]);
    $reserva = $stmt->fetch();

    if (!$reserva) {
        header('Location: ' . BASE_URL . '/alumno/mis-reservas.php?token=' . urlencode($alumno['token']));
        exit;
    }

    $tardía = (strtotime($reserva['fecha'] . ' ' . $reserva['hora_inicio']) - time()) < 86400;
    $pageTitle = 'Cancelar reserva — ' . SITE_NAME;
    $alumnoActual = $alumno;
    include dirname(__DIR__) . '/includes/header.php';
    ?>
    <main class="container">
      <div class="page-header"><h1>Cancelar reserva</h1></div>
      <div class="card" style="max-width:480px">
        <p>¿Confirmas la cancelación de la clase del <strong><?= formatearFecha($reserva['fecha']) ?></strong>
           a las <strong><?= formatearHora($reserva['hora_inicio']) ?></strong>?</p>
        <?php if ($tardía): ?>
          <div class="alert alert-warning">
            <strong>Atención:</strong> Las cancelaciones con menos de 24 horas de antelación
            podrán ser facturadas salvo justificante.
          </div>
        <?php endif; ?>
        <form method="POST">
          <?= inputCsrf() ?>
          <input type="hidden" name="reserva_id" value="<?= $reservaId ?>">
          <input type="hidden" name="token" value="<?= h($alumno['token']) ?>">
          <div class="btn-group">
            <button type="submit" class="btn btn-danger">Confirmar cancelación</button>
            <a href="mis-reservas.php?token=<?= h($alumno['token']) ?>" class="btn btn-outline">Volver</a>
          </div>
        </form>
      </div>
    </main>
    <?php
    include dirname(__DIR__) . '/includes/footer.php';
    exit;
}

// POST: ejecutar cancelación
if (!validarCsrf($_POST['csrf_token'] ?? '')) {
    header('Location: ' . BASE_URL . '/alumno/?token=' . urlencode($alumno['token']));
    exit;
}

$resultado = cancelarReserva($reservaId, $alumno['id']);

if ($resultado['ok']) {
    // Notificar a Sara
    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM reservas WHERE id=?');
    $stmt->execute([$reservaId]);
    $r    = $stmt->fetch();
    if ($r) {
        notificarSaraCancelacion($alumno, $r['fecha'], $r['hora_inicio'], (bool)$resultado['cancelacion_tardia']);
    }

    if ($resultado['cancelacion_tardia']) {
        $_SESSION['flash'] = 'Reserva cancelada. Recuerda: las cancelaciones con menos de 24 horas de antelación podrán ser facturadas salvo justificante.';
    } else {
        $_SESSION['flash'] = 'Reserva cancelada correctamente.';
    }
}

header('Location: ' . BASE_URL . '/alumno/mis-reservas.php?token=' . urlencode($alumno['token']));
exit;
