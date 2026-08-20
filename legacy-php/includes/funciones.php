<?php
// ============================================================
// Funciones principales del sistema de reservas
// ============================================================

// --- Helpers de fecha ---

function nombreDia(int $n): string {
    return ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][$n] ?? '';
}

function nombreMes(int $n): string {
    return ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][$n] ?? '';
}

function formatearFecha(string $fecha): string {
    $ts = strtotime($fecha);
    return date('N', $ts) === false ? $fecha
        : nombreDia((int)date('N', $ts)) . ', ' . (int)date('j', $ts) . ' de ' . nombreMes((int)date('n', $ts));
}

function formatearHora(string $hora): string {
    return substr($hora, 0, 5); // HH:MM
}

// --- Semanas del calendario ---

function obtenerSemanas(int $numSemanas = 3): array {
    $semanas = [];
    $hoy = new DateTime();
    // Empezar desde el lunes de esta semana (o lunes próximo si hoy es fin de semana)
    $diaSemana = (int)$hoy->format('N'); // 1=lunes, 7=domingo
    if ($diaSemana >= 6) {
        // Fin de semana: empezar la próxima semana
        $hoy->modify('next monday');
    } else {
        // Volver al lunes de la semana actual
        $hoy->modify('monday this week');
    }

    for ($s = 0; $s < $numSemanas; $s++) {
        $semana = [];
        $inicioSemana = clone $hoy;
        for ($d = 0; $d < 5; $d++) { // Lunes a viernes
            $semana[] = clone $hoy;
            $hoy->modify('+1 day');
        }
        $hoy->modify('+2 days'); // Saltar fin de semana
        $semanas[] = $semana;
    }
    return $semanas;
}

// --- Franjas del día ---

/**
 * Obtiene todas las franjas de un día concreto con su estado.
 * Para alumnos: solo muestra slots activos y no revela datos privados.
 * Para admin: muestra todos los slots con información completa.
 */
function obtenerFranjasDelDia(string $fecha, bool $esAdmin = false, ?int $alumnoId = null): array {
    $db = getDB();
    $ts = strtotime($fecha);
    $diaSemana = (int)date('N', $ts); // 1=Lun ... 5=Vie

    if ($diaSemana > 5) return []; // No hay clases el fin de semana

    // 1. Slots base de la plantilla semanal
    $stmt = $db->prepare('SELECT hora_inicio, hora_fin, activo FROM horarios_base WHERE dia_semana = ? ORDER BY hora_inicio');
    $stmt->execute([$diaSemana]);
    $baseSlots = $stmt->fetchAll();

    // 2. Slots desbloqueados manualmente para esta fecha
    $stmt = $db->prepare('SELECT hora_inicio, hora_fin FROM franjas_desbloqueadas WHERE fecha = ?');
    $stmt->execute([$fecha]);
    $desbloqueadasRaw = $stmt->fetchAll();
    $desbloqueadas = [];
    foreach ($desbloqueadasRaw as $d) {
        $desbloqueadas[$d['hora_inicio']] = $d['hora_fin'];
    }

    // 3. Slots bloqueados manualmente para esta fecha
    $stmt = $db->prepare('SELECT hora_inicio, hora_fin, motivo FROM franjas_bloqueadas WHERE fecha = ?');
    $stmt->execute([$fecha]);
    $bloqueadasRaw = $stmt->fetchAll();
    $bloqueadas = [];
    foreach ($bloqueadasRaw as $b) {
        $bloqueadas[$b['hora_inicio']] = $b;
    }

    // 4. Reservas activas (pendiente o confirmada) para esta fecha
    $stmt = $db->prepare('
        SELECT r.id, r.hora_inicio, r.hora_fin, r.estado, r.alumno_id, r.notas_alumno, r.notas_admin, a.nombre AS alumno_nombre
        FROM reservas r
        JOIN alumnos a ON a.id = r.alumno_id
        WHERE r.fecha = ? AND r.estado IN (\'pendiente\', \'confirmada\')
    ');
    $stmt->execute([$fecha]);
    $reservasRaw = $stmt->fetchAll();
    $reservas = [];
    foreach ($reservasRaw as $r) {
        $reservas[$r['hora_inicio']] = $r;
    }

    // 5. Construir mapa de slots
    $slotMap = [];
    foreach ($baseSlots as $s) {
        $slotMap[$s['hora_inicio']] = [
            'hora_inicio'  => $s['hora_inicio'],
            'hora_fin'     => $s['hora_fin'],
            'activo_base'  => (bool)$s['activo'],
            'desbloqueado' => false,
        ];
    }
    // Añadir slots desbloqueados que no estaban en la base
    foreach ($desbloqueadas as $hi => $hf) {
        if (!isset($slotMap[$hi])) {
            $slotMap[$hi] = [
                'hora_inicio'  => $hi,
                'hora_fin'     => $hf,
                'activo_base'  => false,
                'desbloqueado' => true,
            ];
        } else {
            $slotMap[$hi]['desbloqueado'] = true;
        }
    }
    ksort($slotMap);

    // 6. Determinar estado de cada slot
    $franjas = [];
    foreach ($slotMap as $hi => $slot) {
        $activoBase  = $slot['activo_base'];
        $desbloqueado = $slot['desbloqueado'];
        $estaActivo  = $activoBase || $desbloqueado;

        // Para alumnos: no mostrar slots inactivos
        if (!$estaActivo && !$esAdmin) continue;

        $estado        = 'libre';
        $motivo        = null;
        $alumnoNombre  = null;
        $reservaId     = null;
        $reservaEstado = null;
        $esPropia      = false;
        $notasAlumno   = null;
        $notasAdmin    = null;

        if (isset($bloqueadas[$hi])) {
            $estado = 'bloqueada';
            $motivo = $esAdmin ? ($bloqueadas[$hi]['motivo'] ?? '') : null;
        } elseif (isset($reservas[$hi])) {
            $r             = $reservas[$hi];
            $estado        = $r['estado']; // 'pendiente' o 'confirmada'
            $reservaId     = (int)$r['id'];
            $reservaEstado = $r['estado'];
            $esPropia      = ($alumnoId !== null && (int)$r['alumno_id'] === $alumnoId);
            if ($esAdmin) {
                $alumnoNombre = $r['alumno_nombre'];
                $notasAlumno  = $r['notas_alumno'];
                $notasAdmin   = $r['notas_admin'];
            }
        } elseif (!$estaActivo) {
            // Slot inactivo en plantilla (miércoles mañana) mostrado a admin
            $estado = 'inactiva';
        }

        $franjas[] = [
            'hora_inicio'   => $hi,
            'hora_fin'      => $slot['hora_fin'],
            'estado'        => $estado,
            'activo_base'   => $activoBase,
            'desbloqueado'  => $desbloqueado,
            'motivo'        => $motivo,
            'reserva_id'    => $reservaId,
            'alumno_nombre' => $alumnoNombre,
            'es_propia'     => $esPropia,
            'notas_alumno'  => $notasAlumno,
            'notas_admin'   => $notasAdmin,
        ];
    }

    return $franjas;
}

// --- Creación de reserva con protección anti doble reserva ---

function crearReserva(int $alumnoId, string $fecha, string $horaInicio, string $horaFin, string $notas = ''): array {
    $db = getDB();

    // Validar que la fecha es futura
    if ($fecha <= date('Y-m-d')) {
        return ['ok' => false, 'error' => 'No puedes reservar en fechas pasadas.'];
    }

    // Validar que el slot existe y está activo
    $ts = strtotime($fecha);
    $diaSemana = (int)date('N', $ts);
    if ($diaSemana > 5) {
        return ['ok' => false, 'error' => 'No hay clases los fines de semana.'];
    }

    $db->beginTransaction();
    try {
        // Bloquear lectura para prevenir doble reserva concurrente
        $stmt = $db->prepare('
            SELECT id FROM reservas
            WHERE fecha = ? AND hora_inicio = ? AND estado IN (\'pendiente\', \'confirmada\')
            FOR UPDATE
        ');
        $stmt->execute([$fecha, $horaInicio]);
        if ($stmt->fetch()) {
            $db->rollBack();
            return ['ok' => false, 'error' => 'Esta hora ya ha sido reservada. Elige otra.'];
        }

        // Verificar que no está bloqueada
        $stmt = $db->prepare('SELECT id FROM franjas_bloqueadas WHERE fecha = ? AND hora_inicio = ?');
        $stmt->execute([$fecha, $horaInicio]);
        if ($stmt->fetch()) {
            $db->rollBack();
            return ['ok' => false, 'error' => 'Esta hora no está disponible.'];
        }

        // Verificar que el slot existe (en base o desbloqueado)
        $stmt = $db->prepare('SELECT id FROM horarios_base WHERE dia_semana = ? AND hora_inicio = ? AND activo = 1');
        $stmt->execute([$diaSemana, $horaInicio]);
        $enBase = $stmt->fetch();

        if (!$enBase) {
            $stmt = $db->prepare('SELECT id FROM franjas_desbloqueadas WHERE fecha = ? AND hora_inicio = ?');
            $stmt->execute([$fecha, $horaInicio]);
            $desbloqueado = $stmt->fetch();
            if (!$desbloqueado) {
                $db->rollBack();
                return ['ok' => false, 'error' => 'Esta hora no está disponible.'];
            }
        }

        // Insertar reserva
        $stmt = $db->prepare('
            INSERT INTO reservas (alumno_id, fecha, hora_inicio, hora_fin, estado, notas_alumno)
            VALUES (?, ?, ?, ?, \'pendiente\', ?)
        ');
        $stmt->execute([$alumnoId, $fecha, $horaInicio, $horaFin, $notas]);
        $reservaId = (int)$db->lastInsertId();

        $db->commit();
        return ['ok' => true, 'reserva_id' => $reservaId];

    } catch (PDOException $e) {
        $db->rollBack();
        // UNIQUE KEY violation = doble reserva simultánea
        if ($e->getCode() === '23000') {
            return ['ok' => false, 'error' => 'Esta hora ya ha sido reservada por otro alumno. Elige otra.'];
        }
        return ['ok' => false, 'error' => 'Error al crear la reserva. Inténtalo de nuevo.'];
    }
}

// --- Cancelación de reserva ---

function cancelarReserva(int $reservaId, int $alumnoId): array {
    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM reservas WHERE id = ? AND alumno_id = ? AND estado IN (\'pendiente\', \'confirmada\')');
    $stmt->execute([$reservaId, $alumnoId]);
    $reserva = $stmt->fetch();

    if (!$reserva) {
        return ['ok' => false, 'error' => 'Reserva no encontrada.'];
    }

    // Detectar cancelación tardía (< 24h)
    $fechaHoraClase = strtotime($reserva['fecha'] . ' ' . $reserva['hora_inicio']);
    $tardía = ($fechaHoraClase - time()) < 86400;

    $stmt = $db->prepare('UPDATE reservas SET estado = \'cancelada\', cancelacion_tardia = ? WHERE id = ?');
    $stmt->execute([$tardía ? 1 : 0, $reservaId]);

    return ['ok' => true, 'cancelacion_tardia' => $tardía];
}

// --- Etiqueta visual de estado ---

function badgeEstado(string $estado): string {
    $map = [
        'libre'      => ['Libre',       'badge-libre'],
        'pendiente'  => ['Pendiente',   'badge-pendiente'],
        'confirmada' => ['Confirmada',  'badge-confirmada'],
        'rechazada'  => ['Rechazada',   'badge-rechazada'],
        'cancelada'  => ['Cancelada',   'badge-cancelada'],
        'bloqueada'  => ['No disponible','badge-bloqueada'],
        'inactiva'   => ['Inactiva',    'badge-inactiva'],
    ];
    [$label, $cls] = $map[$estado] ?? [$estado, 'badge-default'];
    return '<span class="badge ' . $cls . '">' . $label . '</span>';
}

// --- Sanitización ---

function h(string $str): string {
    return htmlspecialchars($str, ENT_QUOTES, 'UTF-8');
}

function postStr(string $key, string $default = ''): string {
    return trim($_POST[$key] ?? $default);
}

function postInt(string $key, int $default = 0): int {
    return (int)($_POST[$key] ?? $default);
}
