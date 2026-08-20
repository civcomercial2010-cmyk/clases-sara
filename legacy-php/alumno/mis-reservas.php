<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/includes/db.php';
require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/funciones.php';

$alumno    = requireAlumno();
$pageTitle = 'Mis reservas — ' . SITE_NAME;

$db = getDB();
$stmt = $db->prepare("
    SELECT * FROM reservas
    WHERE alumno_id = ?
    ORDER BY fecha DESC, hora_inicio DESC
    LIMIT 50
");
$stmt->execute([$alumno['id']]);
$reservas = $stmt->fetchAll();

$alumnoActual = $alumno;
include dirname(__DIR__) . '/includes/header.php';
?>
<main class="container">
  <div class="page-header">
    <h1>Mis reservas</h1>
  </div>

  <?php if ($reservas): ?>
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Estado</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($reservas as $r): ?>
          <tr>
            <td><?= formatearFecha($r['fecha']) ?></td>
            <td><?= formatearHora($r['hora_inicio']) ?> – <?= formatearHora($r['hora_fin']) ?></td>
            <td><?= badgeEstado($r['estado']) ?></td>
            <td>
              <?php
              $esFutura = $r['fecha'] > date('Y-m-d') ||
                          ($r['fecha'] === date('Y-m-d') && $r['hora_inicio'] > date('H:i:s'));
              if (in_array($r['estado'], ['pendiente', 'confirmada']) && $esFutura):
              ?>
                <a href="cancelar.php?reserva_id=<?= $r['id'] ?>&token=<?= h($alumno['token']) ?>"
                   class="btn btn-xs btn-danger"
                   onclick="return confirm('¿Cancelar esta reserva?')">
                  Cancelar
                </a>
              <?php elseif ($r['cancelacion_tardia']): ?>
                <small class="text-warning">Cancelación tardía</small>
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
    <p class="text-muted">No tienes reservas aún.</p>
  <?php endif; ?>

  <div style="margin-top:1.5rem;">
    <a href="?token=<?= h($alumno['token']) ?>" class="btn btn-primary">Reservar nueva clase</a>
  </div>
</main>
<?php include dirname(__DIR__) . '/includes/footer.php'; ?>
