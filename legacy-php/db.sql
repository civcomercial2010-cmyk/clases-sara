-- ============================================================
-- AUTOESCUELA SARA - Base de Datos
-- Importar en phpMyAdmin antes de usar la aplicación
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- Tabla: admin (Sara, única administradora)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `nombre` VARCHAR(100) DEFAULT 'Sara',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_usuario` (`usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabla: alumnos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `alumnos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(100) NOT NULL,
  `telefono` VARCHAR(20) DEFAULT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `token` VARCHAR(64) NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `notas` TEXT DEFAULT NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabla: reservas
-- UNIQUE KEY en (fecha, hora_inicio) previene doble reserva a nivel BD
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reservas` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `alumno_id` INT NOT NULL,
  `fecha` DATE NOT NULL,
  `hora_inicio` TIME NOT NULL,
  `hora_fin` TIME NOT NULL,
  `estado` ENUM('pendiente','confirmada','rechazada','cancelada') NOT NULL DEFAULT 'pendiente',
  `notas_alumno` TEXT DEFAULT NULL,
  `notas_admin` TEXT DEFAULT NULL,
  `cancelacion_tardia` TINYINT(1) NOT NULL DEFAULT 0,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fecha_hora` (`fecha`, `hora_inicio`),
  KEY `idx_alumno` (`alumno_id`),
  KEY `idx_estado` (`estado`),
  KEY `idx_fecha` (`fecha`),
  CONSTRAINT `fk_reserva_alumno` FOREIGN KEY (`alumno_id`) REFERENCES `alumnos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabla: franjas_bloqueadas (bloqueos manuales de Sara)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `franjas_bloqueadas` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `fecha` DATE NOT NULL,
  `hora_inicio` TIME NOT NULL,
  `hora_fin` TIME NOT NULL,
  `motivo` TEXT DEFAULT NULL COMMENT 'Solo visible para Sara',
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bloqueo_fecha_hora` (`fecha`, `hora_inicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabla: franjas_desbloqueadas (slots que Sara activa manualmente)
-- Usado para habilitar miércoles mañana en fechas concretas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `franjas_desbloqueadas` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `fecha` DATE NOT NULL,
  `hora_inicio` TIME NOT NULL,
  `hora_fin` TIME NOT NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_desbloqueo_fecha_hora` (`fecha`, `hora_inicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabla: horarios_base (plantilla semanal)
-- dia_semana: 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes
-- activo=0: slot desactivado por defecto (miércoles mañanas)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `horarios_base` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `dia_semana` TINYINT NOT NULL COMMENT '1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie',
  `hora_inicio` TIME NOT NULL,
  `hora_fin` TIME NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dia_hora` (`dia_semana`, `hora_inicio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- DATOS INICIALES
-- ============================================================

-- Admin: se crea desde setup.php (no incluir contraseña aquí)
-- Ejecuta setup.php para crear el primer acceso de Sara

-- Horarios base: Lunes
INSERT INTO `horarios_base` (`dia_semana`, `hora_inicio`, `hora_fin`, `activo`) VALUES
(1, '09:00:00', '10:00:00', 1),
(1, '10:00:00', '11:00:00', 1),
(1, '11:00:00', '12:00:00', 1),
(1, '12:00:00', '13:00:00', 1),
(1, '14:00:00', '15:00:00', 1),
(1, '15:00:00', '16:00:00', 1),
(1, '16:00:00', '17:00:00', 1),
(1, '17:00:00', '18:00:00', 1),
(1, '18:00:00', '19:00:00', 1);

-- Horarios base: Martes
INSERT INTO `horarios_base` (`dia_semana`, `hora_inicio`, `hora_fin`, `activo`) VALUES
(2, '09:00:00', '10:00:00', 1),
(2, '10:00:00', '11:00:00', 1),
(2, '11:00:00', '12:00:00', 1),
(2, '12:00:00', '13:00:00', 1),
(2, '14:00:00', '15:00:00', 1),
(2, '15:00:00', '16:00:00', 1),
(2, '16:00:00', '17:00:00', 1),
(2, '17:00:00', '18:00:00', 1),
(2, '18:00:00', '19:00:00', 1);

-- Horarios base: Miércoles (mañanas DESACTIVADAS por defecto)
INSERT INTO `horarios_base` (`dia_semana`, `hora_inicio`, `hora_fin`, `activo`) VALUES
(3, '09:00:00', '10:00:00', 0),
(3, '10:00:00', '11:00:00', 0),
(3, '11:00:00', '12:00:00', 0),
(3, '12:00:00', '13:00:00', 1),
(3, '14:00:00', '15:00:00', 1),
(3, '15:00:00', '16:00:00', 1),
(3, '16:00:00', '17:00:00', 1),
(3, '17:00:00', '18:00:00', 1),
(3, '18:00:00', '19:00:00', 1);

-- Horarios base: Jueves
INSERT INTO `horarios_base` (`dia_semana`, `hora_inicio`, `hora_fin`, `activo`) VALUES
(4, '09:00:00', '10:00:00', 1),
(4, '10:00:00', '11:00:00', 1),
(4, '11:00:00', '12:00:00', 1),
(4, '12:00:00', '13:00:00', 1),
(4, '14:00:00', '15:00:00', 1),
(4, '15:00:00', '16:00:00', 1),
(4, '16:00:00', '17:00:00', 1),
(4, '17:00:00', '18:00:00', 1),
(4, '18:00:00', '19:00:00', 1);

-- Horarios base: Viernes (hasta 18:00)
INSERT INTO `horarios_base` (`dia_semana`, `hora_inicio`, `hora_fin`, `activo`) VALUES
(5, '09:00:00', '10:00:00', 1),
(5, '10:00:00', '11:00:00', 1),
(5, '11:00:00', '12:00:00', 1),
(5, '12:00:00', '13:00:00', 1),
(5, '14:00:00', '15:00:00', 1),
(5, '15:00:00', '16:00:00', 1),
(5, '16:00:00', '17:00:00', 1),
(5, '17:00:00', '18:00:00', 1);

-- Alumno de ejemplo para pruebas
INSERT INTO `alumnos` (`nombre`, `telefono`, `email`, `token`, `activo`, `notas`) VALUES
('María García López', '612345678', 'maria@example.com', 'demo_alumno_token_prueba_abc123xyz', 1, 'Alumna de ejemplo para pruebas');
