# Autoescuela Sara — Guía de instalación y despliegue

---

## 1. Requisitos del hosting (Hostinger)

- Plan compartido de Hostinger (cualquier plan incluye PHP + MySQL)
- PHP 7.4 o superior (recomendado PHP 8.x)
- MySQL 5.7 / MariaDB 10+
- Acceso a phpMyAdmin (incluido en Hostinger)

---

## 2. Configurar la base de datos en Hostinger

### Paso 1: Crear la base de datos

1. Entra en el **Panel de Hostinger** → **Bases de datos** → **MySQL**
2. Haz clic en **Crear nueva base de datos**
3. Anota el nombre, usuario y contraseña que te asigna Hostinger

### Paso 2: Importar el esquema

1. En el Panel de Hostinger → **Bases de datos** → **phpMyAdmin**
2. Selecciona tu base de datos recién creada
3. Haz clic en la pestaña **Importar**
4. Selecciona el archivo `db.sql` y haz clic en **Importar**

---

## 3. Configurar el archivo config.php

Edita `config.php` con los datos de tu hosting:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'u123456_autoescuela');   // Nombre de tu BD en Hostinger
define('DB_USER', 'u123456_sara');           // Usuario MySQL de Hostinger
define('DB_PASS', 'TuPasswordSegura123!');   // Contraseña MySQL

define('BASE_URL', 'https://tu-dominio.com'); // Tu dominio real, sin barra final
define('ADMIN_EMAIL', 'sara@tu-dominio.com'); // Email de Sara
```

---

## 4. Subir los archivos a Hostinger

### Opción A: Via Administrador de archivos (cPanel)

1. Panel de Hostinger → **Administrador de archivos**
2. Navega a `public_html/` (o la carpeta de tu dominio)
3. Sube todos los archivos del proyecto manteniendo la misma estructura de carpetas
4. **NO subas** `config.php` si usas GitHub (sube una copia editada manualmente)

### Opción B: Via FTP (FileZilla)

1. Panel de Hostinger → **Detalles de FTP**
2. Conecta con FileZilla usando Host, Usuario y Contraseña de FTP
3. Sube la carpeta del proyecto a `public_html/`

---

## 5. Crear la cuenta de Sara (primera vez)

1. Abre en tu navegador: `https://tu-dominio.com/setup.php`
2. Introduce el usuario y contraseña que quieras para Sara
3. Haz clic en **Crear cuenta**
4. **MUY IMPORTANTE:** Elimina `setup.php` del servidor inmediatamente después
   - En el Administrador de archivos de Hostinger: selecciona y elimina `setup.php`

---

## 6. Acceder al sistema

### Sara (administradora):
```
https://tu-dominio.com/login.php
```
Usa el usuario y contraseña que creaste en setup.php.

### Alumnos:
1. Sara entra en su panel → **Alumnos** → **Añadir alumno/a**
2. Rellena nombre, teléfono, email
3. El sistema genera un enlace único del tipo:
   ```
   https://tu-dominio.com/alumno/?token=abc123...
   ```
4. Sara copia el enlace y lo envía al alumno (WhatsApp, email, etc.)

---

## 7. Subir a GitHub (opcional, recomendado)

```bash
# En la carpeta del proyecto:
git init
git add .
# config.php está en .gitignore, súbelo manualmente al servidor
git commit -m "Primer commit: Autoescuela Sara"
git remote add origin https://github.com/tu-usuario/autoescuela-sara.git
git push -u origin main
```

**Importante:** `config.php` está en `.gitignore`. Gestiona las credenciales fuera del repositorio.

---

## 8. Cómo probar el sistema

### Prueba básica:

1. Entra como Sara: `https://tu-dominio.com/login.php`
2. Ve a **Alumnos** → Añade un alumno de prueba
3. Copia el enlace generado y ábrelo en modo incógnito
4. Selecciona una hora libre → El alumno hace la reserva
5. Vuelve al panel de Sara → Verás la reserva en **Pendientes**
6. Confirma o rechaza la reserva
7. Vuelve a la vista del alumno → Verá el estado actualizado

### Probar doble reserva:
- Abre el mismo enlace en dos ventanas distintas
- Ambas intentan reservar la misma hora al mismo tiempo
- Solo una debe tener éxito; la otra verá el mensaje de error

---

## 9. Seguridad en producción

- [ ] Eliminar `setup.php` tras el primer uso
- [ ] Cambiar `define('DEBUG', false)` en config.php
- [ ] Asegurarse de que el dominio tiene HTTPS activado (Hostinger lo incluye gratis)
- [ ] Usar contraseña robusta para Sara (mayúsculas, números, símbolos)
- [ ] No subir `config.php` al repositorio público

---

## 10. Activar notificaciones por email (opcional)

En `config.php`, cambia:
```php
define('EMAIL_ENABLED', true);
define('EMAIL_FROM', 'noreply@tu-dominio.com');
define('EMAIL_FROM_NAME', 'Autoescuela Sara');
```

Para SMTP avanzado (más fiable que mail()), instala PHPMailer via Composer
o usa el servicio SMTP de Hostinger / un servicio externo como SendGrid o Brevo (gratuito hasta 300 emails/día).

---

## 11. Pasos siguientes (mejoras opcionales post-MVP)

| Mejora | Complejidad | Herramienta |
|---|---|---|
| Notificaciones WhatsApp | Media | WATI API |
| Exportar reservas a PDF | Baja | FPDF / mPDF |
| Recordatorio automático 24h antes | Media | Cron job en Hostinger |
| Ficha de progreso por alumno | Media | Nueva tabla en BD |
| Autenticación alumno con PIN | Baja | Campo PIN en tabla alumnos |
| Panel multi-profesor | Alta | Refactorizar BD |
| App móvil (PWA) | Media | Service Worker + manifest.json |

---

## Estructura de archivos

```
/
├── index.php              → Página principal / redirección
├── login.php              → Login de Sara
├── logout.php             → Cierre de sesión
├── setup.php              → Configuración inicial (ELIMINAR tras usar)
├── config.php             → Credenciales (NO subir a GitHub)
├── db.sql                 → Esquema de base de datos
├── .htaccess              → Seguridad Apache
├── .gitignore
│
├── includes/
│   ├── db.php             → Conexión PDO
│   ├── auth.php           → Autenticación y sesiones
│   ├── funciones.php      → Lógica de negocio (reservas, calendario)
│   ├── email.php          → Notificaciones por email
│   ├── header.php         → Cabecera HTML
│   └── footer.php         → Pie de página HTML
│
├── admin/                 → Panel de Sara
│   ├── index.php          → Dashboard
│   ├── calendario.php     → Calendario con gestión completa
│   ├── reservas.php       → Lista y gestión de reservas
│   ├── alumnos.php        → Gestión de alumnos y enlaces
│   ├── disponibilidad.php → Configurar horarios semanales
│   └── ajax.php           → Endpoints AJAX (confirmar/rechazar)
│
├── alumno/                → Área del alumno
│   ├── index.php          → Calendario + reservar
│   ├── mis-reservas.php   → Historial de reservas
│   ├── cancelar.php       → Cancelar reserva
│   └── ajax.php           → Endpoints AJAX del alumno
│
└── assets/
    ├── css/style.css      → Estilos completos
    └── js/app.js          → JavaScript (modales, AJAX, utilidades)
```
