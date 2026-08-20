<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/includes/db.php';
require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/funciones.php';
require_once dirname(__DIR__) . '/includes/email.php';

$alumno    = requireAlumno();
$pageTitle = 'Reserva tu clase — ' . SITE_NAME;

// Semana a mostrar
$semanaOffset = max(0, (int)($_GET['semana'] ?? 0));
$semanas      = obtenerSemanas(SEMANAS_FUTURO);
$semana       = $semanas[min($semanaOffset, count($semanas) - 1)];
$totalSemanas = count($semanas);

// Reservar (POST)
$msg = '';
$err = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && validarCsrf($_POST['csrf_token'] ?? '')) {
    $fecha      = postStr('fecha');
    $horaInicio = postStr('hora_inicio');
    $horaFin    = postStr('hora_fin');
    $notas      = postStr('notas');

    $resultado = crearReserva($alumno['id'], $fecha, $horaInicio, $horaFin, $notas);
    if ($resultado['ok']) {
        $msg = '✓ Tu solicitud ha sido enviada. Sara la confirmará en breve.';
        // Notificar a Sara
        notificarSaraNuevaReserva($alumno, $fecha, $horaInicio, $horaFin);
    } else {
        $err = $resultado['error'];
    }
}

$alumnoActual = $alumno; // Para el header
include dirname(__DIR__) . '/includes/header.php';
?>
<main class="container">
  <div class="page-header">
    <h1>Hola, <?= h(explode(' ', $alumno['nombre'])[0]) ?></h1>
    <p class="text-muted">Selecciona una hora libre para reservar tu clase de conducción.</p>
  </div>

  <?php if ($msg): ?><div class="alert alert-success"><?= h($msg) ?></div><?php endif; ?>
  <?php if ($err): ?><div class="alert alert-danger"><?= h($err) ?></div><?php endif; ?>

  <!-- Leyenda -->
  <div class="legend">
    <span class="badge badge-libre">Libre – puedes reservar</span>
    <span class="badge badge-pendiente">Ocupada</span>
    <span class="badge badge-confirmada">Ocupada</span>
    <span class="badge badge-bloqueada">No disponible</span>
  </div>

  <!-- Navegación de semanas -->
  <div class="week-nav">
    <?php if ($semanaOffset > 0): ?>
      <a href="?token=<?= h($alumno['token']) ?>&semana=<?= $semanaOffset - 1 ?>" class="btn btn-sm btn-outline">← Semana anterior</a>
    <?php else: ?>
      <span class="btn btn-sm btn-outline disabled">← Semana anterior</span>
    <?php endif; ?>
    <span class="week-label">
      <?= $semana[0]->format('j') ?> – <?= $semana[4]->format('j') ?> de <?= nombreMes((int)$semana[0]->format('n')) ?>
    </span>
    <?php if ($semanaOffset < $totalSemanas - 1): ?>
      <a href="?token=<?= h($alumno['token']) ?>&semana=<?= $semanaOffset + 1 ?>" class="btn btn-sm btn-outline">Semana siguiente →</a>
    <?php else: ?>
      <span class="btn btn-sm btn-outline disabled">Semana siguiente →</span>
    <?php endif; ?>
  </div>

  <!-- Calendario semanal alumno -->
  <div class="cal-wrap">
    <div class="cal-grid">
      <div class="cal-time-header"></div>
      <?php foreach ($semana as $dia): ?>
        <div class="cal-day-header <?= $dia->format('Y-m-d') === date('Y-m-d') ? 'cal-hoy' : '' ?>">
          <span class="cal-dia-nombre"><?= nombreDia((int)$dia->format('N')) ?></span>
          <span class="cal-dia-num"><?= $dia->format('j') ?></span>
        </div>
      <?php endforeach; ?>

      <?php
      $todasHoras    = [];
      $franjasPerDia = [];
      foreach ($semana as $dia) {
          $f      = $dia->format('Y-m-d');
          $franjas = obtenerFranjasDelDia($f, false, $alumno['id']);
          $franjasPerDia[$f] = [];
          foreach ($franjas as $fr) {
              $franjasPerDia[$f][$fr['hora_inicio']] = $fr;
              $todasHoras[$fr['hora_inicio']] = $fr['hora_fin'];
          }
      }
      ksort($todasHoras);
      ?>

      <?php foreach ($todasHoras as $hi => $hf): ?>
        <div class="cal-time"><?= formatearHora($hi) ?></div>
        <?php foreach ($semana as $dia): ?>
          <?php
          $f    = $dia->format('Y-m-d');
          $slot = $franjasPerDia[$f][$hi] ?? null;
          $pasado = $f < date('Y-m-d') || ($f === date('Y-m-d') && $hi <= date('H:i:s'));
          ?>
          <div class="cal-slot <?php
            if (!$slot || $pasado) echo 'cal-slot-sin-slot';
            elseif ($slot['estado'] === 'libre') echo 'cal-slot-libre cal-slot-clickable';
            elseif ($slot['es_propia']) echo 'cal-slot-' . $slot['estado'] . ' cal-slot-propia';
            else echo 'cal-slot-ocupada';
          ?>">
            <?php if ($slot && !$pasado): ?>
              <?php if ($slot['estado'] === 'libre'): ?>
                <button class="slot-btn js-abrir-reserva"
                        data-fecha="<?= $f ?>"
                        data-hi="<?= $hi ?>"
                        data-hf="<?= $hf ?>">
                  <?= formatearHora($hi) ?><br><small>Reservar</small>
                </button>
              <?php elseif ($slot['es_propia']): ?>
                <div class="slot-hora"><?= formatearHora($hi) ?></div>
                <div><?= badgeEstado($slot['estado']) ?></div>
                <small>Tu reserva</small>
                <?php if (in_array($slot['estado'], ['pendiente', 'confirmada'])): ?>
                  <button class="btn btn-xs btn-outline js-cancelar-reserva"
                          data-id="<?= $slot['reserva_id'] ?>"
                          data-fecha="<?= formatearFecha($f) ?>"
                          data-hora="<?= formatearHora($hi) ?>">
                    Cancelar
                  </button>
                <?php endif; ?>
              <?php else: ?>
                <div class="slot-hora"><?= formatearHora($hi) ?></div>
                <div class="text-muted"><small>Ocupada</small></div>
              <?php endif; ?>
            <?php elseif ($pasado): ?>
              <span style="opacity:.3;font-size:.75rem;">—</span>
            <?php endif; ?>
          </div>
        <?php endforeach; ?>
      <?php endforeach; ?>
    </div>
  </div>

  <div style="margin-top:1.5rem;">
    <a href="mis-reservas.php?token=<?= h($alumno['token']) ?>" class="btn btn-outline">Ver mis reservas</a>
  </div>
</main>

<!-- Modal: confirmar reserva -->
<div id="modal-reserva" class="modal hidden">
  <div class="modal-content">
    <h3>Confirmar reserva</h3>
    <p>Fecha: <strong id="modal-fecha-txt"></strong></p>
    <p>Hora: <strong id="modal-hora-txt"></strong></p>
    <form method="POST" action="">
      <?= inputCsrf() ?>
      <input type="hidden" name="fecha" id="modal-fecha">
      <input type="hidden" name="hora_inicio" id="modal-hi">
      <input type="hidden" name="hora_fin" id="modal-hf">
      <div class="form-group">
        <label>Notas para Sara (opcional)</label>
        <textarea name="notas" class="form-control" rows="2" placeholder="Ej: Quiero practicar aparcamiento..."></textarea>
      </div>
      <div class="btn-group">
        <button type="submit" class="btn btn-primary">Solicitar esta hora</button>
        <button type="button" class="btn btn-outline js-cerrar-modal">Cancelar</button>
      </div>
    </form>
  </div>
</div>

<!-- Modal: cancelar reserva -->
<div id="modal-cancelar" class="modal hidden">
  <div class="modal-content">
    <h3>Cancelar reserva</h3>
    <p>¿Seguro que quieres cancelar la clase del <strong id="cancel-fecha-txt"></strong> a las <strong id="cancel-hora-txt"></strong>?</p>
    <div id="aviso-cancelacion-tardia" class="alert alert-warning hidden">
      <strong>Atención:</strong> Las cancelaciones con menos de 24 horas de antelación podrán ser facturadas salvo justificante.
    </div>
    <form method="POST" action="cancelar.php">
      <?= inputCsrf() ?>
      <input type="hidden" name="reserva_id" id="cancel-reserva-id">
      <input type="hidden" name="token" value="<?= h($alumno['token']) ?>">
      <div class="btn-group">
        <button type="submit" class="btn btn-danger">Sí, cancelar</button>
        <button type="button" class="btn btn-outline js-cerrar-modal">Volver</button>
      </div>
    </form>
  </div>
</div>
<div id="modal-backdrop" class="modal-backdrop hidden"></div>

<?php include dirname(__DIR__) . '/includes/footer.php'; ?>
