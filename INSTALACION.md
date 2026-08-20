# Puesta en marcha

Guía completa. Se hace una sola vez, con la cuenta **civcomercial2010@gmail.com**.
Tiempo estimado: 30–40 minutos.

---

## 1. Crear el proyecto de Apps Script

1. Entra en [script.google.com](https://script.google.com) → **Nuevo proyecto**.
2. Arriba a la izquierda, pon de nombre: `Reservas Sara`.
3. Icono del engranaje (**Configuración del proyecto**) → marca la casilla
   **Mostrar el archivo de manifiesto appsscript.json en el editor**.

## 2. Copiar los archivos

En el panel izquierdo, crea un archivo por cada uno de estos y pega su contenido
desde la carpeta [apps-script/](apps-script/):

| Archivo en el editor | Tipo | Origen |
|---|---|---|
| `appsscript.json` | ya existe, sustituye su contenido | [appsscript.json](apps-script/appsscript.json) |
| `00_Base.gs` | Secuencia de comandos | [00_Base.gs](apps-script/00_Base.gs) |
| `01_Instalar.gs` | Secuencia de comandos | [01_Instalar.gs](apps-script/01_Instalar.gs) |
| `02_Disponibilidad.gs` | Secuencia de comandos | [02_Disponibilidad.gs](apps-script/02_Disponibilidad.gs) |
| `03_Reservas.gs` | Secuencia de comandos | [03_Reservas.gs](apps-script/03_Reservas.gs) |
| `04_Avisos.gs` | Secuencia de comandos | [04_Avisos.gs](apps-script/04_Avisos.gs) |
| `05_Api.gs` | Secuencia de comandos | [05_Api.gs](apps-script/05_Api.gs) |
| `panel.html` | **HTML** | [panel.html](apps-script/panel.html) |

> El editor añade la extensión solo. Al crear `panel` elige **HTML**, no secuencia de comandos.

Guarda con `Ctrl+S`.

## 3. Ejecutar la instalación

1. En el desplegable de funciones de la barra superior, elige **`instalar`**.
2. Pulsa **Ejecutar**.
3. Google pedirá permisos: **Revisar permisos** → elige la cuenta → *Configuración avanzada* →
   *Ir a Reservas Sara (no seguro)* → **Permitir**.
   Ese aviso sale porque el proyecto es tuyo y no está verificado por Google. Es normal.
4. Abre **Registro de ejecución**: verás el enlace a la hoja de cálculo creada.

Esto ha creado:
- La hoja **SARA · Reservas de clases** con las pestañas `Reservas`, `HorarioBase` y `Config`.
- El calendario **Clases – disponibilidad** en el Google Calendar de la cuenta.
- El horario de Sara ya cargado: lunes a jueves 09:00–13:00 y 14:00–19:00, viernes 09:00–13:00 y 14:00–17:00.

## 4. Rellenar la configuración

Abre la hoja de cálculo → pestaña **Config** y completa:

| clave | qué poner |
|---|---|
| `telefono_sara` | El móvil de Sara con prefijo y sin espacios: `34600111222` |
| `email_admin` | Los correos que pueden entrar al panel, separados por coma |
| `url_publica` | Se rellena en el paso 7 |

## 5. Publicar la API (para los alumnos)

1. En Apps Script: **Implementar** → **Nueva implementación**.
2. Engranaje junto a *Seleccionar tipo* → **Aplicación web**.
3. Rellena así:
   - Descripción: `API`
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
4. **Implementar** → copia la **URL de la aplicación web** (termina en `/exec`).

> Es imprescindible que sea "Cualquier usuario". Si pones "Cualquier usuario con cuenta de Google",
> los alumnos tendrán que iniciar sesión y el enlace deja de ser público.

## 6. Publicar el panel (para Sara)

1. **Implementar** → **Nueva implementación** otra vez.
2. Tipo: **Aplicación web**.
   - Descripción: `Panel de Sara`
   - Ejecutar como: **Usuario que accede a la aplicación web**
   - Quién tiene acceso: **Cualquier usuario con una Cuenta de Google**
3. **Implementar** → copia esta segunda URL. **Es la que usa Sara**, distinta de la anterior.
4. Ábrela en el móvil de Sara y añádela a la pantalla de inicio:
   - iPhone: Compartir → *Añadir a pantalla de inicio*
   - Android: menú ⋮ → *Añadir a pantalla principal*

Solo entran los correos que estén en `email_admin`. Cualquier otro ve un aviso de acceso restringido.

**Si Sara usa una cuenta de Google distinta a la del proyecto**, además hay que:
- Compartir la hoja de cálculo con su correo, con permiso de **Editor**.
- Compartir el calendario *Clases – disponibilidad* con su correo, con permiso para
  **hacer cambios en los eventos**.
- Añadir su correo a `email_admin`.

## 7. Publicar el enlace del alumno en GitHub Pages

1. Crea un repositorio en GitHub llamado **`clases-sara`**, público.
2. Sube el contenido de este proyecto (o al menos la carpeta [docs/](docs/)).
3. En el repositorio: **Settings** → **Pages**:
   - Source: *Deploy from a branch*
   - Branch: `main`, carpeta **`/docs`** → **Save**
4. En un par de minutos el enlace estará vivo:
   `https://civcomercial2010-cmyk.github.io/clases-sara/`
5. Edita [docs/config.js](docs/config.js) y pega en `URL_API` la URL del **paso 5**.
   Súbelo. Ese es el único valor que hay que tocar.
6. Vuelve a la hoja **Config** y pon ese enlace en `url_publica`.

## 8. Probar antes de dárselo a nadie

1. Abre el enlace público en el móvil, en modo incógnito.
2. Reserva una hora cualquiera → debe darte un código de 6 letras.
3. Comprueba que llega el correo de aviso a `email_admin`.
4. Abre el panel de Sara → la solicitud debe aparecer en **Por confirmar**.
5. Pulsa **Confirmar** → se abre WhatsApp con el mensaje escrito. No hace falta enviarlo.
6. Vuelve al enlace público → pestaña **Mis reservas**: debe figurar como confirmada.
7. Cancela desde ahí y comprueba que la hora vuelve a salir libre.

---

## Cómo lo usa Sara en su día a día

**Para cerrar horas.** Abre Google Calendar, y en el calendario *Clases – disponibilidad*
crea un evento en las horas que no puede. Da igual el título. Esas horas desaparecen
del enlace al instante. Un evento de día completo cierra el día entero.

**Los miércoles por la mañana.** Ejecutando una vez la función `bloquearMiercolesManana()`
desde el editor de Apps Script se crea un evento semanal de 09:00 a 13:00 durante un año,
para los exámenes. La semana que no haya examen, Sara borra ese evento suelto desde su
calendario y esa mañana vuelve a ofrecerse. Si termina antes, borra el evento y ajusta
la hora a mano.

**Para responder.** Le llega un correo con cada solicitud. Entra al panel, pulsa
**Confirmar** o **No puedo**, y se le abre WhatsApp con el mensaje ya escrito para el alumno.

**Nada más.** No tiene que abrir horas una por una: su horario habitual sale libre solo.

---

## Cambios habituales

| Quiero… | Dónde |
|---|---|
| Cambiar el horario habitual | Hoja `HorarioBase`. `activo` = `SI` o `NO` |
| Añadir un tramo nuevo | Fila nueva en `HorarioBase`: día (1=lunes), hora inicio, hora fin, `SI` |
| Cambiar la antelación mínima | `antelacion_minima_horas` en `Config`, o desde Ajustes del panel |
| Mostrar más semanas | `semanas_vista` en `Config` |
| Dejar de recibir correos | `avisar_por_email` = `NO` en `Config` |
| Cambiar el texto de los WhatsApp | Función `plantillasWhatsApp()` en [04_Avisos.gs](apps-script/04_Avisos.gs) |

> Después de tocar código en Apps Script hay que hacer **Implementar → Gestionar implementaciones →
> editar (lápiz) → Versión: Nueva versión → Implementar**, **en las dos implementaciones**.
> Es el olvido más habitual: la aplicación publicada no usa el código actual, sino la
> versión congelada al implementar, así que sin este paso los cambios no se ven.
> Lo que se toca en la hoja de cálculo sí se aplica solo, sin republicar nada.

---

## Si algo falla

| Síntoma | Causa habitual |
|---|---|
| "Falta configurar URL_API" | No se pegó la URL en `docs/config.js` |
| El alumno ve una pantalla de inicio de sesión de Google | La implementación *API* no está como "Cualquier usuario" |
| Sara ve "Acceso restringido" | Su correo no está en `email_admin` de la hoja `Config` |
| No llegan los correos | `avisar_por_email` está en `NO`, o `email_admin` vacío |
| Salen horas que Sara no puede dar | El evento se creó en otro calendario, no en *Clases – disponibilidad* |
| Las horas salen desplazadas | La hoja no está en zona horaria de Madrid: *Archivo → Configuración → Zona horaria* |
