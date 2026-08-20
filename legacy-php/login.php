<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/auth.php';

if (isAdmin()) {
    header('Location: ' . BASE_URL . '/admin/');
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Validar CSRF
    if (!validarCsrf($_POST['csrf_token'] ?? '')) {
        $error = 'Error de seguridad. Recarga la página.';
    } else {
        $usuario = trim($_POST['usuario'] ?? '');
        $password = $_POST['password'] ?? '';

        if ($usuario && $password) {
            $db   = getDB();
            $stmt = $db->prepare('SELECT * FROM admin WHERE usuario = ? LIMIT 1');
            $stmt->execute([$usuario]);
            $admin = $stmt->fetch();

            if ($admin && password_verify($password, $admin['password_hash'])) {
                session_regenerate_id(true);
                $_SESSION['admin_id']   = $admin['id'];
                $_SESSION['admin_nombre'] = $admin['nombre'];
                header('Location: ' . BASE_URL . '/admin/');
                exit;
            } else {
                // Pequeña pausa para dificultar fuerza bruta
                sleep(1);
                $error = 'Usuario o contraseña incorrectos.';
            }
        } else {
            $error = 'Introduce usuario y contraseña.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acceso — <?= SITE_NAME ?></title>
  <link rel="stylesheet" href="<?= BASE_URL ?>/assets/css/style.css">
</head>
<body>
<div class="login-wrap">
  <div class="login-card">
    <h1><?= SITE_NAME ?></h1>
    <p class="text-muted">Panel de profesora</p>

    <?php if ($error): ?>
      <div class="alert alert-danger"><?= h($error) ?></div>
    <?php endif; ?>

    <form method="POST" action="">
      <?= inputCsrf() ?>
      <div class="form-group">
        <label for="usuario">Usuario</label>
        <input type="text" id="usuario" name="usuario" class="form-control"
               value="<?= h($_POST['usuario'] ?? '') ?>" autocomplete="username" required autofocus>
      </div>
      <div class="form-group">
        <label for="password">Contraseña</label>
        <input type="password" id="password" name="password" class="form-control"
               autocomplete="current-password" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Entrar</button>
    </form>
  </div>
</div>
</body>
</html>
