<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/includes/db.php';
require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/funciones.php';

requireAdmin();
$pageTitle = 'Calendario — ' . SITE_NAME;

// Semana a mostrar (por parámetro o la actual)
$semanaOffset = max(0, (int)($_GET['semana'] ?? 0));
$semanas      = obtenerSemanas(SEMANAS_FUTURO + 1); // +1 por si acaso
$semana       = $semanas[min($semanaOffset, count($semanas) - 1)];
$totalSemanas = count($semanas);

// Slot a bloquear/desbloquear (POST)
$msgOk = $msgErr = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && validarCsrf($_POST['csrf_token'] ?? '')) {
    $accion     = $_POST['accion'] ?? '';
    $fecha      = $_POST['fecha'] ?? '';
    $horaInicio = $_POST['hora_inicio'] ?? '';
    $horaFin    = $_POST['hora_fin'] ?? '';
    $motivo     = trim($_POST['motivo'] ?? '');
    $db         = getDB();

    if ($accion === 'bloquear' && $fecha && $horaInicio && $horaFin) {
        // Cancelar reserva existente si la hay
        $stmt = $db->prepare("UPDATE reservas SET estado='rechazada', notas_admin='Hora bloqueada por la profesora' WHERE fecha=? AND hora_inicio=? AND estado IN ('pendiente','confirmada')");
        $stmt->execute([$fecha, $horaInicio]);
        $stmt = $db->prepare('INSERT IGNORE INTO franjas_bloqueadas (fecha, hora_inicio, hora_fin, motivo) VALUES (?,?,?,?)');
        $stmt->execute([$fecha, $horaInicio, $horaFin, $motivo]);
        $msgOk = 'Hora bloqueada correctamente.';
    } elseif ($accion === 'desbloquear' && $fecha && $horaInicio) {
        $stmt = $db->prepare('DELETE FROM franjas_bloqueadas WHERE fecha=? AND hora_inicio=?');
        $stmt->execute([$fecha, $horaInicio]);
        $msgOk = 'Hora desbloqueada.';
    } elseif ($accion === 'activar' && $fecha && $horaInicio && $horaFin) {
        $stmt = $db->prepare('INSERT IGNORE INTO franjas_desbloqueadas (fecha, hora_inicio, hora_fin) VALUES (?,?,?)');
        $stmt->execute([$fecha, $horaInicio, $horaFin]);
        $msgOk = 'Hora activada para esta fecha.';
    } elseif ($accion === 'desactivar' && $fecha && $horaInicio) {
        $stmt = $db->prepare('DELETE FROM franjas_desbloqueadas WHERE fecha=? AND hora_inicio=?');
        $stmt->execute([$fecha, $horaInicio]);
        $msgOk = 'Hora desactivada para esta fecha.';
    }
}

include dirname(__DIR__) . '/includes/header.php';
?>
<main class="container">
  <div class="page-header">
    <h1>Calendario</h1>
  </div>

  <?php if ($msgOk): ?><div class="alert alert-success"><?= h($msgOk) ?></div><?php endif; ?>
  <?php if ($msgErr): ?><div class="alert alert-danger"><?= h($msgErr) ?></div><?php endif; ?>

  <!-- Navegación de semanas -->
  <div class="week-nav">
    <?php if ($semanaOffset > 0): ?>
      <a href="?semana=<?= $semanaOffset - 1 ?>" class="btn btn-sm btn-outline">← Semana anterior</a>
    <?php else: ?>
      <span class="btn btn-sm btn-outline disabled">← Semana anterior</span>
    <?php endif; ?>
    <span class="week-label">
      Semana del <?= $semana[0]->format('j') ?> al <?= $semana[4]->format('j') ?> de <?= nombreMes((int)$semana[0]->format('n')) ?> de <?= $semana[0]->format('Y') ?>
    </span>
    <?php if ($semanaOffset < $totalSemanas - 1): ?>
      <a href="?semana=<?= $semanaOffset + 1 ?>" class="btn btn-sm btn-outline">Semana siguiente →</a>
    <?php else: ?>
      <span class="btn btn-sm btn-outline disabled">Semana siguiente →</span>
    <?php endif; ?>
  </div>

  <!-- Leyenda -->
  <div class="legend">
    <span class="badge badge-libre">Libre</span>
    <span class="badge badge-pendiente">Pendiente</span>
    <span class="badge badge-confirmada">Confirmada</span>
    <span class="badge badge-bloqueada">Bloqueada</span>
    <span class="badge badge-inactiva">Inactiva</span>
  </div>

  <!-- Calendario semanal -->
  <div class="cal-wrap">
    <div class="cal-grid cal-grid-admin">
      <!-- Cabecera de días -->
      <div class="cal-time-header"></div>
      <?php foreach ($semana as $dia): ?>
        <div class="cal-day-header <?= $dia->format('Y-m-d') === date('Y-m-d') ? 'cal-hoy' : '' ?>">
          <span class="cal-dia-nombre"><?= nombreDia((int)$dia->format('N')) ?></span>
          <span class="cal-dia-num"><?= $dia->format('j') ?></span>
        </div>
      <?php endforeach; ?>

      <?php
      // Recopilar todas las franjas únicas de todos los días para las filas de tiempo
      $todasHoras = [];
      $franjasPerDia = [];
      foreach ($semana as $dia) {
          $f = $dia->format('Y-m-d');
          $franjas = obtenerFranjasDelDia($f, true);
          $franjasPerDia[$f] = [];
          foreach ($franjas as $fr) {
              $franjasPerDia[$f][$fr['hora_inicio']] = $fr;
              $todasHoras[$fr['hora_inicio']] = $fr['hora_fin'];
          }
      }
      ksort($todasHoras);
      ?>

      <?php foreach ($todasHoras as $hi => $hf): ?>
        <!-- Etiqueta de hora -->
        <div class="cal-time"><?= formatearHora($hi) ?></div>

        <?php foreach ($semana as $dia): ?>
          <?php
          $f      = $dia->format('Y-m-d');
          $slot   = $franjasPerDia[$f][$hi] ?? null;
          $estado = $slot ? $slot['estado'] : 'sin-slot';
          $esHoy  = $dia->format('Y-m-d') === date('Y-m-d');
          ?>
          <div class="cal-slot cal-slot-<?= $estado ?> <?= $esHoy ? 'cal-hoy-col' : '' ?>">
            <?php if ($slot): ?>
              <div class="slot-hora"><?= formatearHora($hi) ?>–<?= formatearHora($hf) ?></div>
              <?php if ($estado === 'pendiente' || $estado === 'confirmada'): ?>
                <div class="slot-alumno"><?= h($slot['alumno_nombre'] ?? '') ?></div>
                <div class="slot-estado"><?= badgeEstado($estado) ?></div>
                <?php if ($slot['notas_alumno']): ?>
                  <div class="slot-nota"><small><?= h($slot['notas_alumno']) ?></small></div>
                <?php endif; ?>
                <div class="slot-actions">
                  <?php if ($estado === 'pendiente'): ?>
                    <button class="btn btn-xs btn-success js-accion-reserva"
                            data-id="<?= $slot['reserva_id'] ?>" data-accion="confirmar">✓</button>
                    <button class="btn btn-xs btn-danger js-accion-reserva"
                            data-id="<?= $slot['reserva_id'] ?>" data-accion="rechazar">✗</button>
                  <?php endif; ?>
                  <button class="btn btn-xs btn-outline js-abrir-bloquear"
                          data-fecha="<?= $f ?>" data-hi="<?= $hi ?>" data-hf="<?= $hf ?>">🔒</button>
                </div>
              <?php elseif ($estado === 'bloqueada'): ?>
                <div class="slot-estado"><?= badgeEstado('bloqueada') ?></div>
                <?php if ($slot['motivo']): ?>
                  <div class="slot-nota"><small><?= h($slot['motivo']) ?></small></div>
                <?php endif; ?>
                <div class="slot-actions">
                  <form method="POST">
                    <?= inputCsrf() ?>
                    <input type="hidden" name="accion" value="desbloquear">
                    <input type="hidden" name="fecha" value="<?= $f ?>">
                    <input type="hidden" name="hora_inicio" value="<?= $hi ?>">
                    <button type="submit" class="btn btn-xs btn-outline">Desbloquear</button>
                  </form>
                </div>
              <?php elseif ($estado === 'inactiva'): ?>
                <div class="slot-estado"><?= badgeEstado('inactiva') ?></div>
                <div class="slot-actions">
                  <form method="POST">
                    <?= inputCsrf() ?>
                    <input type="hidden" name="accion" value="activar">
                    <input type="hidden" name="fecha" value="<?= $f ?>">
                    <input type="hidden" name="hora_inicio" value="<?= $hi ?>">
                    <input type="hidden" name="hora_fin" value="<?= $hf ?>">
                    <button type="submit" class="btn btn-xs btn-success">Activar</button>
                  </form>
                </div>
              <?php else: ?>
                <div class="slot-estado"><?= badgeEstado('libre') ?></div>
                <div class="slot-actions">
                  <button class="btn btn-xs btn-outline js-abrir-bloquear"
                          data-fecha="<?= $f ?>" data-hi="<?= $hi ?>" data-hf="<?= $hf ?>">Bloquear</button>
                </div>
              <?php endif; ?>
            <?php else: ?>
              <span class="text-muted" style="font-size:.75rem;">—</span>
            <?php endif; ?>
          </div>
        <?php endforeach; ?>
      <?php endforeach; ?>
    </div>
  </div>
</main>

<!-- Modal: bloquear hora -->
<div id="modal-bloquear" class="modal hidden">
  <div class="modal-content">
    <h3>Bloquear hora</h3>
    <form method="POST" id="form-bloquear">
      <?= inputCsrf() ?>
      <input type="hidden" name="accion" value="bloquear">
      <input type="hidden" name="fecha" id="bloquear-fecha">
      <input type="hidden" name="hora_inicio" id="bloquear-hi">
      <input type="hidden" name="hora_fin" id="bloquear-hf">
      <div class="form-group">
        <label>Motivo (opcional, solo lo ves tú)</label>
        <input type="text" name="motivo" class="form-control" placeholder="Ej: Revisión del coche, médico...">
      </div>
      <div class="btn-group">
        <button type="submit" class="btn btn-danger">Bloquear</button>
        <button type="button" class="btn btn-outline js-cerrar-modal">Cancelar</button>
      </div>
    </form>
  </div>
</div>
<div id="modal-backdrop" class="modal-backdrop hidden"></div>

<?php include dirname(__DIR__) . '/includes/footer.php'; ?>
