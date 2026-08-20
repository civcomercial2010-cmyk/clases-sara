<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/includes/db.php';
require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/funciones.php';

requireAdmin();
$pageTitle = 'Panel de Sara — ' . SITE_NAME;

$db = getDB();

// Reservas pendientes de confirmación
$pendientes = $db->query('
    SELECT r.*, a.nombre AS alumno_nombre, a.telefono, a.email AS alumno_email
    FROM reservas r
    JOIN alumnos a ON a.id = r.alumno_id
    WHERE r.estado = \'pendiente\'
    ORDER BY r.fecha ASC, r.hora_inicio ASC
')->fetchAll();

// Próximas confirmadas (hoy en adelante)
$proximas = $db->query('
    SELECT r.*, a.nombre AS alumno_nombre
    FROM reservas r
    JOIN alumnos a ON a.id = r.alumno_id
    WHERE r.estado = \'confirmada\' AND r.fecha >= CURDATE()
    ORDER BY r.fecha ASC, r.hora_inicio ASC
    LIMIT 10
')->fetchAll();

// Estadísticas rápidas
$stats = $db->query('
    SELECT
        (SELECT COUNT(*) FROM reservas WHERE estado = \'pendiente\') AS pendientes,
        (SELECT COUNT(*) FROM reservas WHERE estado = \'confirmada\' AND fecha >= CURDATE()) AS proximas,
        (SELECT COUNT(*) FROM alumnos WHERE activo = 1) AS alumnos,
        (SELECT COUNT(*) FROM reservas WHERE estado = \'cancelada\' AND DATE(actualizado_en) = CURDATE()) AS canceladas_hoy
')->fetch();

include dirname(__DIR__) . '/includes/header.php';
?>
<main class="container">
  <div class="page-header">
    <h1>Panel de Sara</h1>
    <p class="text-muted">Bienvenida, <?= h($_SESSION['admin_nombre'] ?? 'Sara') ?></p>
  </div>

  <!-- Estadísticas -->
  <div class="stats-grid">
    <div class="stat-card stat-warning">
      <div class="stat-num"><?= (int)$stats['pendientes'] ?></div>
      <div class="stat-label">Pendientes de confirmar</div>
    </div>
    <div class="stat-card stat-success">
      <div class="stat-num"><?= (int)$stats['proximas'] ?></div>
      <div class="stat-label">Próximas confirmadas</div>
    </div>
    <div class="stat-card stat-primary">
      <div class="stat-num"><?= (int)$stats['alumnos'] ?></div>
      <div class="stat-label">Alumnos activos</div>
    </div>
    <div class="stat-card stat-danger">
      <div class="stat-num"><?= (int)$stats['canceladas_hoy'] ?></div>
      <div class="stat-label">Cancelaciones hoy</div>
    </div>
  </div>

  <!-- Solicitudes pendientes -->
  <section class="section">
    <h2>Solicitudes pendientes <?php if ($pendientes): ?><span class="badge badge-pendiente"><?= count($pendientes) ?></span><?php endif; ?></h2>

    <?php if ($pendientes): ?>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Contacto</th>
              <th>Notas</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <?php foreach ($pendientes as $r): ?>
            <tr>
              <td><strong><?= h($r['alumno_nombre']) ?></strong></td>
              <td><?= formatearFecha($r['fecha']) ?></td>
              <td><?= formatearHora($r['hora_inicio']) ?> – <?= formatearHora($r['hora_fin']) ?></td>
              <td>
                <?php if ($r['telefono']): ?><?= h($r['telefono']) ?><br><?php endif; ?>
                <?php if ($r['alumno_email']): ?><small><?= h($r['alumno_email']) ?></small><?php endif; ?>
              </td>
              <td><small><?= h($r['notas_alumno'] ?? '') ?></small></td>
              <td>
                <div class="btn-group">
                  <button class="btn btn-sm btn-success js-accion-reserva"
                          data-id="<?= $r['id'] ?>" data-accion="confirmar">
                    Confirmar
                  </button>
                  <button class="btn btn-sm btn-danger js-accion-reserva"
                          data-id="<?= $r['id'] ?>" data-accion="rechazar">
                    Rechazar
                  </button>
                </div>
              </td>
            </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    <?php else: ?>
      <p class="text-muted">No hay solicitudes pendientes.</p>
    <?php endif; ?>
  </section>

  <!-- Próximas clases confirmadas -->
  <section class="section">
    <h2>Próximas clases confirmadas</h2>
    <?php if ($proximas): ?>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>Alumno</th><th>Fecha</th><th>Hora</th></tr>
          </thead>
          <tbody>
            <?php foreach ($proximas as $r): ?>
            <tr>
              <td><?= h($r['alumno_nombre']) ?></td>
              <td><?= formatearFecha($r['fecha']) ?></td>
              <td><?= formatearHora($r['hora_inicio']) ?> – <?= formatearHora($r['hora_fin']) ?></td>
            </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      </div>
      <p><a href="<?= BASE_URL ?>/admin/reservas.php">Ver todas las reservas →</a></p>
    <?php else: ?>
      <p class="text-muted">No hay clases próximas confirmadas.</p>
    <?php endif; ?>
  </section>

  <!-- Acciones rápidas -->
  <section class="section">
    <h2>Acciones rápidas</h2>
    <div class="btn-group flex-wrap">
      <a href="<?= BASE_URL ?>/admin/calendario.php" class="btn btn-primary">Ver calendario</a>
      <a href="<?= BASE_URL ?>/admin/alumnos.php?accion=nuevo" class="btn btn-outline">Añadir alumno</a>
      <a href="<?= BASE_URL ?>/admin/disponibilidad.php" class="btn btn-outline">Gestionar horarios</a>
    </div>
  </section>
</main>

<?php include dirname(__DIR__) . '/includes/footer.php'; ?>
