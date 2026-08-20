<?php
if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

// --- Admin (Sara) ---

function isAdmin(): bool {
    return !empty($_SESSION['admin_id']) && (int)$_SESSION['admin_id'] > 0;
}

function requireAdmin(): void {
    if (!isAdmin()) {
        header('Location: ' . BASE_URL . '/login.php');
        exit;
    }
}

// --- Alumno (acceso por token) ---

function getAlumnoByToken(string $token): ?array {
    if (strlen($token) < 8) return null;
    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM alumnos WHERE token = ? AND activo = 1 LIMIT 1');
    $stmt->execute([trim($token)]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function getAlumnoActual(): ?array {
    $token = $_GET['token'] ?? $_SESSION['alumno_token'] ?? '';
    if (!$token) return null;
    $alumno = getAlumnoByToken($token);
    if ($alumno) {
        $_SESSION['alumno_token'] = $token;
    }
    return $alumno ?: null;
}

function requireAlumno(): array {
    $alumno = getAlumnoActual();
    if (!$alumno) {
        http_response_code(403);
        include __DIR__ . '/header.php';
        echo '<main class="container"><div class="alert alert-danger">'
            . '<h2>Enlace no válido</h2>'
            . '<p>Este enlace no es válido o ha sido desactivado.</p>'
            . '<p>Solicita un nuevo enlace a tu autoescuela.</p>'
            . '</div></main>';
        include __DIR__ . '/footer.php';
        exit;
    }
    return $alumno;
}

// --- CSRF ---

function getCsrfToken(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function validarCsrf(string $token): bool {
    return !empty($_SESSION['csrf_token'])
        && hash_equals($_SESSION['csrf_token'], $token);
}

function inputCsrf(): string {
    return '<input type="hidden" name="csrf_token" value="' . htmlspecialchars(getCsrfToken()) . '">';
}

// --- Token de alumno ---

function generarToken(): string {
    return bin2hex(random_bytes(32));
}
