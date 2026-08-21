# Puesta en marcha

Guía completa. Se hace una sola vez, con la cuenta de Google del proyecto.
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

| Archivo en el editor | Tipo | Origen | Qué hace |
|---|---|---|---|
| `appsscript.json` | ya existe, sustituye su contenido | [appsscript.json](apps-script/appsscript.json) | Permisos y zona horaria |
| `00_Base` | Secuencia de comandos | [00_Base.gs](apps-script/00_Base.gs) | Hoja, ajustes, fechas y teléfonos |
| `01_Instalar` | Secuencia de comandos | [01_Instalar.gs](apps-script/01_Instalar.gs) | Crea la hoja y el calendario |
| `02_Disponibilidad` | Secuencia de comandos | [02_Disponibilidad.gs](apps-script/02_Disponibilidad.gs) | Calcula las horas libres |
| `03_Reservas` | Secuencia de comandos | [03_Reservas.gs](apps-script/03_Reservas.gs) | Reservas y respuestas de Sara |
| `04_Avisos` | Secuencia de comandos | [04_Avisos.gs](apps-script/04_Avisos.gs) | Correos y mensajes de WhatsApp |
| `05_Api` | Secuencia de comandos | [05_Api.gs](apps-script/05_Api.gs) | Entrada web y permisos |
| `06_Escuelas` | Secuencia de comandos | [06_Escuelas.gs](apps-script/06_Escuelas.gs) | Autoescuelas y sus enlaces |
| `07_Horario` | Secuencia de comandos | [07_Horario.gs](apps-script/07_Horario.gs) | Horario semanal editable |
| `08_Diagnostico` | Secuencia de comandos | [08_Diagnostico.gs](apps-script/08_Diagnostico.gs) | Revisión y archivado |
| `09_Agenda` | Secuencia de comandos | [09_Agenda.gs](apps-script/09_Agenda.gs) | Apunta las clases en el calendario |
| `10_Resumen` | Secuencia de comandos | [10_Resumen.gs](apps-script/10_Resumen.gs) | Resumen mensual para las comisiones |
| `11_Reparar` | Secuencia de comandos | [11_Reparar.gs](apps-script/11_Reparar.gs) | Reparar y limpiar cuando algo se descuadra |
| `panel` | **HTML** | [panel.html](apps-script/panel.html) | El panel de Sara |

Son **trece archivos**. Si falta uno, algo dejará de funcionar sin avisar: por ejemplo,
sin `09_Agenda` las clases no se apuntan en el calendario y el panel da un error al
poner la agenda al día.



> El editor añade la extensión solo. Al crear `panel` elige **HTML**, no secuencia de comandos.

Guarda con `Ctrl+S`. Para comprobar que no falta ninguno, abre `08_Diagnostico`, ejecuta
`diagnostico()` y mira que no salga ningún error de "no está definida".

## 3. Ejecutar la instalación

1. En el desplegable de funciones de la barra superior, elige **`instalar`**.
2. Pulsa **Ejecutar**.
3. Google pedirá permisos: **Revisar permisos** → elige la cuenta → *Configuración avanzada* →
   *Ir a Reservas Sara (no seguro)* → **Permitir**.
   Ese aviso sale porque el proyecto es tuyo y no está verificado por Google. Es normal.
4. Abre **Registro de ejecución**: verás el enlace a la hoja de cálculo creada.

Entre los permisos hay uno para **ejecutar tareas cuando no estás**: es el que permite
revisar el calendario cada 15 minutos. Sin él, los cambios que Sara haga en su calendario
no se recogen hasta que abre el panel.

Esto ha creado:
- La hoja **SARA · Reservas de clases** con las pestañas `Reservas`, `HorarioBase` y `Config`.
- El calendario **Clases – disponibilidad** en el Google Calendar de la cuenta.
- El horario de Sara ya cargado: clases de 90 minutos, de lunes a jueves 08:30–13:00 y 14:00–18:30, viernes 08:30–13:00 y 14:00–17:00.

## 4. Rellenar la configuración

Abre la hoja de cálculo → pestaña **Config** y completa:

| clave | qué poner |
|---|---|
| `telefono_sara` | El móvil de Sara con prefijo y sin espacios: `34600111222` |
| `email_admin` | Los correos que pueden entrar al panel, separados por coma. Ahí va el correo de Sara |
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

## 6. El enlace del panel de Sara

El panel se sirve desde **la misma implementación** del paso 5. Basta con añadirle una
clave privada al final de la URL.

1. En Apps Script, abre `05_Api` y ejecuta la función **`enlaceDelPanel`**.
2. En el **Registro de ejecución** aparece el enlace completo, con la clave.
3. Ábrelo en el móvil de Sara y añádelo a su pantalla de inicio:
   - iPhone: Compartir → *Añadir a pantalla de inicio*
   - Android: menú ⋮ → *Añadir a pantalla principal*

Sara no tiene que autorizar nada ni ver ningún aviso de Google: el código se ejecuta
con la cuenta del proyecto. **Quien tenga ese enlace entra**, así que no se publica ni
se mezcla con el de los alumnos. Si alguna vez se filtra, ejecuta
**`cambiarClaveDelPanel`** y el anterior deja de funcionar.

Además, quien entre con un correo que figure en `email_admin` accede sin necesitar la
clave, siempre que el panel esté publicado como *"ejecutar como el usuario que accede"*.

### Alternativa: publicar el panel aparte (no recomendada)

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

> Este camino obliga a Sara a autorizar la aplicación, y Google le enseña un aviso rojo
> de *"aplicación no verificada"*. Además el código pasa a ejecutarse con su cuenta, así
> que necesita permiso sobre la hoja y el calendario. Si falta algo, la devuelve al inicio
> sin explicar por qué. Por eso es preferible el enlace con clave.

**Si Sara usa una cuenta de Google distinta a la del proyecto**, además hay que:
- Compartir la hoja de cálculo con el correo de Sara, con permiso de **Editor**.
- Compartir el calendario *Clases – disponibilidad* con el correo de Sara, con
  permiso para **hacer cambios en los eventos**.
- Añadir su correo a `email_admin`.

## 7. Publicar el enlace del alumno en GitHub Pages

1. Crea una organización gratuita en GitHub llamada **`clases-sara`** y, dentro de ella,
   un repositorio público llamado **`clases-sara.github.io`** (al llamarse igual que la
   organización + `.github.io`, la web se sirve en la raíz del dominio).
2. Sube el contenido de este proyecto (o al menos la carpeta [docs/](docs/)).
3. En el repositorio: **Settings** → **Pages**:
   - Source: *Deploy from a branch*
   - Branch: `main`, carpeta **`/docs`** → **Save**
4. En un par de minutos el enlace estará vivo:
   `https://clases-sara.github.io/`
5. Edita [docs/config.js](docs/config.js) y pega en `URL_API` la URL del **paso 5**.
   Súbelo. Ese es el único valor que hay que tocar.
6. Vuelve a la hoja **Config** y pon ese enlace en `url_publica`.

## 8. Probar antes de dárselo a nadie

1. Abre el enlace público en el móvil, en modo incógnito.
2. Reserva una hora cualquiera → debe darte un código de 6 letras.
3. Comprueba que llega el correo de aviso a `email_admin`.
4. Abre el panel de Sara → la solicitud debe aparecer en **Por confirmar**.
5. Pulsa **Confirmar** → se abre WhatsApp con el mensaje escrito. No hace falta enviarlo.
6. Vuelve al enlace público → pestaña **Mis clases**: debe figurar como confirmada.
7. En el panel, pulsa la **✕** de esa clase en *Próximas clases* y comprueba que la hora
   vuelve a salir libre en el enlace público.

---

## Cómo lo usa Sara en su día a día

**Para cerrar horas.** Abre Google Calendar, y en el calendario *Clases – disponibilidad*
crea un evento en las horas que no puede. Da igual el título. Esas horas desaparecen
del enlace al instante. Un evento de día completo cierra el día entero.

**Clases apuntadas a mano.** Si un alumno la llama, Sara se apunta la clase en el
calendario escribiendo **"Clase"** delante del nombre: *Clase Pere Font*. Esa clase
aparece sola en su panel como confirmada, la hora deja de ofrecerse a los demás y
puede marcarle campo o circulación y la autoescuela. Si escribe el móvil en la
descripción del evento, también se recoge y tendrá el botón de WhatsApp.

Todo lo que **no** empiece por "Clase" sigue siendo un bloqueo normal de agenda:
*Dentista*, *Vacaciones*, *Exámenes*.

**El calendario manda.** Si mueve una clase arrastrándola en el calendario, la reserva
se mueve con ella; si borra el evento, la clase se libera y esa hora vuelve a ofrecerse.
El sistema lo revisa **solo, cada 15 minutos**, así que la hora se libera aunque Sara no
abra el panel. También se recoge al abrir el panel y con el botón *Poner al día*.
Lo único que no deja es mover una clase encima de otra: en ese caso avisa y la deja
donde estaba.

**Sus clases, en ese mismo calendario.** Cada clase que confirma se apunta sola ahí,
con el nombre del alumno y aviso una hora antes. Si libera la hora, el evento
desaparece. Los eventos que crea el sistema empiezan por *Clase ·*, así que se
distinguen de lo que ella tapa a mano.

**Los miércoles por la mañana.** Ejecutando una vez la función `bloquearMiercolesManana()`
desde el editor de Apps Script se crea un evento semanal de 09:00 a 13:00 durante un año,
para los exámenes. La semana que no haya examen, Sara borra ese evento suelto desde su
calendario y esa mañana vuelve a ofrecerse. Si termina antes, borra el evento y ajusta
la hora a mano.

**Para responder.** Le llega un correo con cada solicitud. Entra al panel, pulsa el
**✓** o la **✕**, y se le abre WhatsApp con el mensaje ya escrito para el alumno.

**Cada autoescuela con su enlace.** En el panel, arriba, Sara tiene un enlace por
autoescuela. Reparte cada uno en su grupo de alumnos y las clases quedan etiquetadas
solas, sin preguntarle nada a nadie. Si alguien usa el enlace que no era, ella lo
corrige con los botones que hay bajo el nombre del alumno.

**El resumen del mes.** La pestaña **Resumen** de la hoja de cálculo cuenta sola, mes a
mes, las clases que Sara ha dado a cada alumno: con su nombre completo, la autoescuela,
el total de clases, las horas y el desglose entre campo y circulación. Solo entran las
clases **confirmadas y ya dadas**, no las que están por venir. Se rehace en cada
revisión, cada quince minutos.

**Campo o circulación, al confirmar.** Cada clase pendiente tiene dos botones,
**Campo** y **Circulación**. Sara marca uno antes de dar el visto: si no lo hace, el
panel se lo pide. Ese dato acaba en el título del evento del calendario, tanto en el
suyo como en el del alumno, y en la columna `tipo` de la hoja para sus comisiones.
En las clases ya confirmadas se puede cambiar y se guarda al momento.

Los tipos salen de `tipos_clase` en la hoja `Config`, por si algún día hay que
añadir otro.

**Si un alumno no puede venir.** El alumno no anula clases por su cuenta: le escribe a
Sara por WhatsApp desde su propia pestaña *Mis clases*. Sara pulsa la **✕** en la tarjeta
de ese alumno dentro de *Próximas clases* y la hora vuelve a quedar libre al momento.

**Nada más.** No tiene que abrir horas una por una: su horario habitual sale libre solo.

---

## Cambios habituales

| Quiero… | Dónde |
|---|---|
| Cambiar el horario habitual | Panel de Sara → Tu disponibilidad → **Cambiar mis horarios** |
| Cambiar cuánto dura una clase | Lo mismo: el desplegable de duración |
| Añadir un tramo nuevo | Fila nueva en `HorarioBase`: día (1=lunes), hora inicio, hora fin, `SI` |
| Cambiar la antelación mínima | `antelacion_minima_horas` en `Config`, o desde Ajustes del panel |
| Mostrar más semanas | `semanas_vista` en `Config` |
| Cambiar el descanso entre clases | `separacion_minima_minutos` en `Config`. 0 las permite pegadas |
| Sacar las comisiones del mes | Hoja `Reservas`, columnas `tipo` (campo o calle) y `escuela` |
| Añadir una autoescuela | `autoescuelas` en `Config`, separadas por punto y coma. Su enlace aparece solo en el panel |
| Poner la dirección de una autoescuela | En `autoescuelas`, detrás de un igual: `Andorra = Av. Meritxell 1`. Sale como ubicación en el calendario |
| Cambiar los tipos de clase | `tipos_clase` en `Config` |
| Dejar de recibir correos | `avisar_por_email` = `NO` en `Config` |
| Cambiar el texto de los WhatsApp | Función `plantillasWhatsApp()` en [04_Avisos.gs](apps-script/04_Avisos.gs) |

## Después de pegar código: publicar

Es el olvido más habitual y no da ningún error: se pega el código, se guarda, y el
panel sigue enseñando lo de antes. La aplicación web **no usa el código del editor**,
sino una versión congelada, y hay que decirle que use la nueva.

1. **Implementar** → **Gestionar implementaciones**
2. El lápiz ✏️ de la implementación que ya existe
3. *Versión*: **Nueva versión**
4. **Implementar**

> Editar la que ya hay, **nunca "Nueva implementación"**: eso crea otra URL distinta y
> el enlace de Sara y el de los alumnos dejarían de funcionar.

**Para saber si ha funcionado**, al final del panel de Sara sale la fecha del código:

```
Código del 2026-08-21
```

Si esa fecha no es la del código que acabas de pegar, es que falta republicar. La
misma fecha sale al ejecutar `diagnostico()`, así se comparan las dos.

Lo que se toca en la hoja de cálculo (Config, horarios) sí se aplica solo, sin
republicar nada.

---

## Mantenimiento de vez en cuando

- **`archivarAntiguas()`** mueve a la pestaña *Historico* las reservas de hace más de
  seis meses. La hoja se lee entera en cada consulta, así que cuanto más corta, más
  rápido va todo. Se le puede pasar otro número de meses: `archivarAntiguas(12)`.
- **`sincronizarTodo()`** cuadra los dos lados, hoja y calendario, por si alguna vez se
  descuadran. Es lo mismo que hace el botón *Poner al día* del panel.
- **`activarRevisionAutomatica()`** vuelve a poner la revisión de cada 15 minutos si
  alguna vez se pierde, y **`desactivarRevisionAutomatica()`** la quita. `instalar()` la
  deja puesta, así que normalmente no hay que tocar nada.

## Revisar el sistema

Si algo no cuadra, ejecuta la función **`diagnostico()`** desde el editor de Apps Script
(abre el archivo `08_Diagnostico` y elígela en el desplegable). No cambia nada: revisa la
configuración, las columnas de la hoja, las reservas, el horario y el calendario, y deja
el informe en el **Registro de ejecución**.

Avisa, entre otras cosas, de:
- ajustes sin rellenar
- horas con dos reservas activas a la vez
- identificadores o códigos repetidos
- clases activas que ya no encajan en el horario actual
- si el calendario ha dejado de ser accesible

## Si algo falla

| Síntoma | Causa habitual |
|---|---|
| "Falta configurar URL_API" | No se pegó la URL en `docs/config.js` |
| El alumno ve una pantalla de inicio de sesión de Google | La implementación *API* no está como "Cualquier usuario" |
| Sara ve "Acceso restringido" | Le falta la clave del enlace, o su correo no está en `email_admin` |
| A Sara la devuelve al inicio tras autorizar | El panel está publicado como "usuario que accede". Usa el enlace con clave del paso 6 |
| No llegan los correos | `avisar_por_email` está en `NO`, o `email_admin` vacío |
| Salen horas que Sara no puede dar | El evento se creó en otro calendario, no en *Clases – disponibilidad* |
| Las horas salen desplazadas | La hoja no está en zona horaria de Madrid: *Archivo → Configuración → Zona horaria* |
