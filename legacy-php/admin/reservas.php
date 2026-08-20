<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/includes/db.php';
require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/funciones.php';
require_once dirname(__DIR__) . '/includes/email.php';

requireAdmin();
$pageTitle = 'Reservas — ' . SITE_NAME;

$db  = getDB();
$msg = '';
$err = '';

// Filtro de estado
$filtroEstado = $_GET['estado'] ?? 'todas';
$estados      = ['todas', 'pendiente', 'confirmada', 'rechazada', 'cancelada'];
if (!in_array($filtroEstado, $estados)) $filtroEstado = 'todas';

// Query de reservas
$where = $filtroEstado !== 'todas' ? "WHERE r.estado = " . $db->quote($filtroEstado) : '';
$reservas = $db->query("
    SELECT r.*, a.nombre AS alumno_nombre, a.telefono, a.email AS alumno_email, a.token AS alumno_token
    FROM reservas r
    JOIN alumnos a ON a.id = r.alumno_id
    {$where}
    ORDER BY r.fecha DESC, r.hora_inicio DESC
    LIMIT 200
")->fetchAll();

include dirname(__DIR__) . '/includes/header.php';
?>
<main class="container">
  <div class="page-header">
    <h1>Reservas</h1>
  </div>

  <!-- Filtros -->
  <div class="filtros">
    <?php foreach ($estados as $e): ?>
      <a href="?estado=<?= $e ?>" class="btn btn-sm <?= $filtroEstado === $e ? 'btn-primary' : 'btn-outline' ?>">
        <?= ucfirst($e === 'todas' ? 'Todas' : $e) ?>
      </a>
    <?php endforeach; ?>
  </div>

  <?php if ($reservas): ?>
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Alumno</th>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Estado</th>
            <th>Notas alumno</th>
            <th>Cancelación tardía</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($reservas as $r): ?>
          <tr>
            <td><?= $r['id'] ?></td>
            <td>
              <strong><?= h($r['alumno_nombre']) ?></strong><br>
              <small><?= h($r['telefono'] ?? '') ?></small>
            </td>
            <td><?= formatearFecha($r['fecha']) ?></td>
            <td><?= formatearHora($r['hora_inicio']) ?> – <?= formatearHora($r['hora_fin']) ?></td>
            <td><?= badgeEstado($r['estado']) ?></td>
            <td><small><?= h($r['notas_alumno'] ?? '') ?></small></td>
            <td><?= $r['cancelacion_tardia'] ? '<span class="badge badge-danger">Sí</span>' : '—' ?></td>
            <td>
              <?php if ($r['estado'] === 'pendiente'): ?>
                <div class="btn-group">
                  <button class="btn btn-xs btn-success js-accion-reserva"
                          data-id="<?= $r['id'] ?>" data-accion="confirmar">Confirmar</button>
                  <button class="btn btn-xs btn-danger js-accion-reserva"
                          data-id="<?= $r['id'] ?>" data-accion="rechazar">Rechazar</button>
                </div>
              <?php elseif ($r['estado'] === 'confirmada' && $r['fecha'] >= date('Y-m-d')): ?>
                <button class="btn btn-xs btn-danger js-accion-reserva"
                        data-id="<?= $r['id'] ?>" data-accion="rechazar">Cancelar</button>
              <?php else: ?>
                —
              <?php endif; ?>
            </td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php else: ?>
    <p class="text-muted">No hay reservas en este estado.</p>
  <?php endif; ?>
</main>
<?php include dirname(__DIR__) . '/includes/footer.php'; ?>
