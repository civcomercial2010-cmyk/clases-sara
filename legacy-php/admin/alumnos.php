<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/includes/db.php';
require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/funciones.php';

requireAdmin();
$pageTitle = 'Alumnos — ' . SITE_NAME;

$db  = getDB();
$msg = '';
$err = '';

// Procesar formulario
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!validarCsrf($_POST['csrf_token'] ?? '')) {
        $err = 'Error de seguridad.';
    } else {
        $accion = $_POST['accion'] ?? '';

        if ($accion === 'crear' || $accion === 'editar') {
            $nombre   = postStr('nombre');
            $telefono = postStr('telefono');
            $email    = postStr('email');
            $notas    = postStr('notas');
            $id       = postInt('id');

            if (!$nombre) {
                $err = 'El nombre es obligatorio.';
            } elseif ($accion === 'crear') {
                $token = generarToken();
                $stmt  = $db->prepare('INSERT INTO alumnos (nombre, telefono, email, token, notas) VALUES (?,?,?,?,?)');
                $stmt->execute([$nombre, $telefono, $email, $token, $notas]);
                $msg = '✓ Alumno/a creado/a. Enlace: <strong>' . BASE_URL . '/alumno/?token=' . $token . '</strong>';
            } else {
                $stmt = $db->prepare('UPDATE alumnos SET nombre=?, telefono=?, email=?, notas=? WHERE id=?');
                $stmt->execute([$nombre, $telefono, $email, $notas, $id]);
                $msg = '✓ Datos actualizados.';
            }
        } elseif ($accion === 'desactivar') {
            $id   = postInt('id');
            $stmt = $db->prepare('UPDATE alumnos SET activo=0 WHERE id=?');
            $stmt->execute([$id]);
            $msg = 'Alumno/a desactivado/a.';
        } elseif ($accion === 'activar') {
            $id   = postInt('id');
            $stmt = $db->prepare('UPDATE alumnos SET activo=1 WHERE id=?');
            $stmt->execute([$id]);
            $msg = 'Alumno/a reactivado/a.';
        } elseif ($accion === 'regenerar_token') {
            $id    = postInt('id');
            $token = generarToken();
            $stmt  = $db->prepare('UPDATE alumnos SET token=? WHERE id=?');
            $stmt->execute([$token, $id]);
            $stmt2 = $db->prepare('SELECT * FROM alumnos WHERE id=?');
            $stmt2->execute([$id]);
            $a   = $stmt2->fetch();
            $msg = '✓ Nuevo enlace para ' . h($a['nombre']) . ': <strong>' . BASE_URL . '/alumno/?token=' . $token . '</strong>';
        }
    }
}

// Editar alumno
$editando = null;
if (isset($_GET['editar'])) {
    $stmt    = $db->prepare('SELECT * FROM alumnos WHERE id=?');
    $stmt->execute([(int)$_GET['editar']]);
    $editando = $stmt->fetch();
}

// Lista de alumnos
$alumnos = $db->query('SELECT a.*, (SELECT COUNT(*) FROM reservas r WHERE r.alumno_id=a.id AND r.estado IN (\'pendiente\',\'confirmada\')) AS clases_activas FROM alumnos a ORDER BY a.activo DESC, a.nombre ASC')->fetchAll();

include dirname(__DIR__) . '/includes/header.php';
?>
<main class="container">
  <div class="page-header">
    <h1>Alumnos</h1>
  </div>

  <?php if ($msg): ?><div class="alert alert-success"><?= $msg ?></div><?php endif; ?>
  <?php if ($err): ?><div class="alert alert-danger"><?= h($err) ?></div><?php endif; ?>

  <!-- Formulario: crear / editar -->
  <section class="section">
    <h2><?= $editando ? 'Editar alumno/a' : 'Añadir alumno/a' ?></h2>
    <form method="POST" class="form-inline-grid">
      <?= inputCsrf() ?>
      <input type="hidden" name="accion" value="<?= $editando ? 'editar' : 'crear' ?>">
      <?php if ($editando): ?>
        <input type="hidden" name="id" value="<?= $editando['id'] ?>">
      <?php endif; ?>

      <div class="form-group">
        <label>Nombre completo *</label>
        <input type="text" name="nombre" class="form-control" required
               value="<?= h($editando['nombre'] ?? '') ?>" placeholder="Nombre Apellidos">
      </div>
      <div class="form-group">
        <label>Teléfono</label>
        <input type="tel" name="telefono" class="form-control"
               value="<?= h($editando['telefono'] ?? '') ?>" placeholder="6XX XXX XXX">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" class="form-control"
               value="<?= h($editando['email'] ?? '') ?>" placeholder="alumno@email.com">
      </div>
      <div class="form-group form-group-full">
        <label>Notas internas (solo las ves tú)</label>
        <textarea name="notas" class="form-control" rows="2" placeholder="Observaciones..."><?= h($editando['notas'] ?? '') ?></textarea>
      </div>
      <div class="form-group form-group-full">
        <button type="submit" class="btn btn-primary"><?= $editando ? 'Guardar cambios' : 'Crear alumno/a y generar enlace' ?></button>
        <?php if ($editando): ?>
          <a href="alumnos.php" class="btn btn-outline">Cancelar</a>
        <?php endif; ?>
      </div>
    </form>
  </section>

  <!-- Lista de alumnos -->
  <section class="section">
    <h2>Lista de alumnos (<?= count($alumnos) ?>)</h2>
    <?php if ($alumnos): ?>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Estado</th>
              <th>Clases activas</th>
              <th>Enlace</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <?php foreach ($alumnos as $a): ?>
            <tr class="<?= $a['activo'] ? '' : 'row-inactiva' ?>">
              <td><strong><?= h($a['nombre']) ?></strong></td>
              <td><?= h($a['telefono'] ?? '') ?></td>
              <td><?= h($a['email'] ?? '') ?></td>
              <td><?= $a['activo'] ? '<span class="badge badge-confirmada">Activo</span>' : '<span class="badge badge-inactiva">Inactivo</span>' ?></td>
              <td><?= (int)$a['clases_activas'] ?></td>
              <td>
                <button class="btn btn-xs btn-outline js-copiar-enlace"
                        data-url="<?= BASE_URL ?>/alumno/?token=<?= h($a['token']) ?>">
                  Copiar enlace
                </button>
              </td>
              <td>
                <div class="btn-group">
                  <a href="?editar=<?= $a['id'] ?>" class="btn btn-xs btn-outline">Editar</a>
                  <form method="POST" style="display:inline">
                    <?= inputCsrf() ?>
                    <input type="hidden" name="accion" value="regenerar_token">
                    <input type="hidden" name="id" value="<?= $a['id'] ?>">
                    <button type="submit" class="btn btn-xs btn-outline"
                            onclick="return confirm('¿Generar nuevo enlace? El anterior dejará de funcionar.')">
                      Nuevo enlace
                    </button>
                  </form>
                  <form method="POST" style="display:inline">
                    <?= inputCsrf() ?>
                    <input type="hidden" name="accion" value="<?= $a['activo'] ? 'desactivar' : 'activar' ?>">
                    <input type="hidden" name="id" value="<?= $a['id'] ?>">
                    <button type="submit" class="btn btn-xs <?= $a['activo'] ? 'btn-danger' : 'btn-success' ?>"
                            onclick="return confirm('<?= $a['activo'] ? '¿Desactivar este alumno/a?' : '¿Reactivar este alumno/a?' ?>')">
                      <?= $a['activo'] ? 'Desactivar' : 'Activar' ?>
                    </button>
                  </form>
                </div>
              </td>
            </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    <?php else: ?>
      <p class="text-muted">No hay alumnos registrados aún.</p>
    <?php endif; ?>
  </section>
</main>
<?php include dirname(__DIR__) . '/includes/footer.php'; ?>
