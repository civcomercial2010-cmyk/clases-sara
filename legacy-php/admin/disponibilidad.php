<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/includes/db.php';
require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/funciones.php';

requireAdmin();
$pageTitle = 'Horarios — ' . SITE_NAME;

$db  = getDB();
$msg = '';
$err = '';

// Guardar cambios en la plantilla semanal
if ($_SERVER['REQUEST_METHOD'] === 'POST' && validarCsrf($_POST['csrf_token'] ?? '')) {
    $accion = $_POST['accion'] ?? '';

    if ($accion === 'toggle_base') {
        $id     = postInt('id');
        $activo = postInt('activo');
        $stmt   = $db->prepare('UPDATE horarios_base SET activo=? WHERE id=?');
        $stmt->execute([$activo ? 0 : 1, $id]);
        $msg = 'Horario actualizado.';
    } elseif ($accion === 'add_base') {
        $dia  = postInt('dia_semana');
        $hi   = postStr('hora_inicio');
        $hf   = postStr('hora_fin');
        if ($dia && $hi && $hf) {
            try {
                $stmt = $db->prepare('INSERT INTO horarios_base (dia_semana, hora_inicio, hora_fin) VALUES (?,?,?)');
                $stmt->execute([$dia, $hi . ':00', $hf . ':00']);
                $msg = 'Franja añadida.';
            } catch (PDOException $e) {
                $err = 'Ya existe esa franja para ese día.';
            }
        }
    } elseif ($accion === 'delete_base') {
        $id   = postInt('id');
        $stmt = $db->prepare('DELETE FROM horarios_base WHERE id=?');
        $stmt->execute([$id]);
        $msg = 'Franja eliminada.';
    }
}

// Cargar horarios base
$horarios = $db->query('SELECT * FROM horarios_base ORDER BY dia_semana, hora_inicio')->fetchAll();
$porDia   = [];
foreach ($horarios as $h) {
    $porDia[$h['dia_semana']][] = $h;
}

$dias = [1 => 'Lunes', 2 => 'Martes', 3 => 'Miércoles', 4 => 'Jueves', 5 => 'Viernes'];

include dirname(__DIR__) . '/includes/header.php';
?>
<main class="container">
  <div class="page-header">
    <h1>Gestión de horarios</h1>
    <p class="text-muted">Estos son los horarios base de cada semana. Puedes activar/desactivar franjas para todos los días de la semana, o usar el calendario para modificar fechas concretas.</p>
  </div>

  <?php if ($msg): ?><div class="alert alert-success"><?= h($msg) ?></div><?php endif; ?>
  <?php if ($err): ?><div class="alert alert-danger"><?= h($err) ?></div><?php endif; ?>

  <div class="info-box">
    <strong>Nota sobre los miércoles:</strong> Las franjas de mañana (09:00–12:00) están desactivadas por defecto.
    Para activarlas en un miércoles concreto, usa el <a href="calendario.php">calendario</a> y haz clic en "Activar" sobre ese slot.
  </div>

  <!-- Plantilla semanal -->
  <div class="horarios-grid">
    <?php foreach ($dias as $numDia => $nombreDia): ?>
    <div class="horario-dia">
      <h3><?= $nombreDia ?></h3>
      <?php if (!empty($porDia[$numDia])): ?>
        <?php foreach ($porDia[$numDia] as $h): ?>
        <div class="horario-franja <?= $h['activo'] ? '' : 'franja-inactiva' ?>">
          <span><?= formatearHora($h['hora_inicio']) ?>–<?= formatearHora($h['hora_fin']) ?></span>
          <div class="btn-group">
            <form method="POST">
              <?= inputCsrf() ?>
              <input type="hidden" name="accion" value="toggle_base">
              <input type="hidden" name="id" value="<?= $h['id'] ?>">
              <input type="hidden" name="activo" value="<?= $h['activo'] ?>">
              <button type="submit" class="btn btn-xs <?= $h['activo'] ? 'btn-outline' : 'btn-success' ?>">
                <?= $h['activo'] ? 'Desactivar' : 'Activar' ?>
              </button>
            </form>
            <form method="POST" onsubmit="return confirm('¿Eliminar esta franja permanentemente?')">
              <?= inputCsrf() ?>
              <input type="hidden" name="accion" value="delete_base">
              <input type="hidden" name="id" value="<?= $h['id'] ?>">
              <button type="submit" class="btn btn-xs btn-danger">✕</button>
            </form>
          </div>
        </div>
        <?php endforeach; ?>
      <?php else: ?>
        <p class="text-muted">Sin franjas</p>
      <?php endif; ?>
    </div>
    <?php endforeach; ?>
  </div>

  <!-- Añadir franja -->
  <section class="section">
    <h2>Añadir franja horaria</h2>
    <form method="POST" class="form-inline-row">
      <?= inputCsrf() ?>
      <input type="hidden" name="accion" value="add_base">
      <div class="form-group">
        <label>Día</label>
        <select name="dia_semana" class="form-control">
          <?php foreach ($dias as $n => $nombre): ?>
            <option value="<?= $n ?>"><?= $nombre ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="form-group">
        <label>Inicio</label>
        <input type="time" name="hora_inicio" class="form-control" value="09:00" required>
      </div>
      <div class="form-group">
        <label>Fin</label>
        <input type="time" name="hora_fin" class="form-control" value="10:00" required>
      </div>
      <div class="form-group" style="align-self:flex-end">
        <button type="submit" class="btn btn-primary">Añadir</button>
      </div>
    </form>
  </section>
</main>
<?php include dirname(__DIR__) . '/includes/footer.php'; ?>
