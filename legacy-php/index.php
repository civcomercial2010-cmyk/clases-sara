<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/auth.php';

// Si viene con token, redirigir al área de alumno
$token = trim($_GET['token'] ?? '');
if ($token) {
    header('Location: ' . BASE_URL . '/alumno/?token=' . urlencode($token));
    exit;
}

// Si es admin, redirigir al panel
if (isAdmin()) {
    header('Location: ' . BASE_URL . '/admin/');
    exit;
}

// Página de inicio pública
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= SITE_NAME ?></title>
  <link rel="stylesheet" href="<?= BASE_URL ?>/assets/css/style.css">
</head>
<body>
<div class="login-wrap">
  <div class="login-card">
    <h1><?= SITE_NAME ?></h1>
    <p class="text-muted">Sistema de reservas de clases prácticas</p>
    <div style="margin-top:2rem;">
      <p>Si eres alumna/alumno, accede mediante el enlace personalizado que te ha enviado Sara.</p>
      <hr>
      <p><a href="<?= BASE_URL ?>/login.php" class="btn btn-outline btn-sm">Acceso de profesora</a></p>
    </div>
  </div>
</div>
</body>
</html>
