<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= h($pageTitle ?? SITE_NAME) ?></title>
  <link rel="stylesheet" href="<?= BASE_URL ?>/assets/css/style.css">
  <meta name="csrf-token" content="<?= htmlspecialchars(getCsrfToken(), ENT_QUOTES) ?>">
  <meta name="base-url" content="<?= BASE_URL ?>">
</head>
<body>
<header class="site-header">
  <div class="container header-inner">
    <a href="<?= BASE_URL ?>/" class="site-logo"><?= h(SITE_NAME) ?></a>
    <nav class="site-nav">
      <?php if (isAdmin()): ?>
        <a href="<?= BASE_URL ?>/admin/" class="<?= (strpos($_SERVER['REQUEST_URI'] ?? '', '/admin/') !== false && strpos($_SERVER['REQUEST_URI'] ?? '', '/reservas') === false && strpos($_SERVER['REQUEST_URI'] ?? '', '/alumnos') === false && strpos($_SERVER['REQUEST_URI'] ?? '', '/disponibilidad') === false && strpos($_SERVER['REQUEST_URI'] ?? '', '/calendario') === false) ? 'active' : '' ?>">Inicio</a>
        <a href="<?= BASE_URL ?>/admin/calendario.php" class="<?= (strpos($_SERVER['REQUEST_URI'] ?? '', '/calendario') !== false) ? 'active' : '' ?>">Calendario</a>
        <a href="<?= BASE_URL ?>/admin/reservas.php" class="<?= (strpos($_SERVER['REQUEST_URI'] ?? '', '/reservas') !== false) ? 'active' : '' ?>">Reservas</a>
        <a href="<?= BASE_URL ?>/admin/alumnos.php" class="<?= (strpos($_SERVER['REQUEST_URI'] ?? '', '/alumnos') !== false) ? 'active' : '' ?>">Alumnos</a>
        <a href="<?= BASE_URL ?>/admin/disponibilidad.php" class="<?= (strpos($_SERVER['REQUEST_URI'] ?? '', '/disponibilidad') !== false) ? 'active' : '' ?>">Horarios</a>
        <a href="<?= BASE_URL ?>/logout.php" class="btn btn-sm btn-outline">Salir</a>
      <?php elseif (($alumnoActual ?? null)): ?>
        <a href="<?= BASE_URL ?>/alumno/?token=<?= h($alumnoActual['token']) ?>">Calendario</a>
        <a href="<?= BASE_URL ?>/alumno/mis-reservas.php?token=<?= h($alumnoActual['token']) ?>">Mis reservas</a>
      <?php endif; ?>
    </nav>
  </div>
</header>
