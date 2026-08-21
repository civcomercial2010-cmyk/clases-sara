# Plataforma de reservas de clases — Sara

Documento de decisiones. Actualizado: 2026-08-20.

## Objetivo

Sara comparte **un único enlace público**. El alumno abre, ve los huecos que Sara tiene
libres, elige uno y lo solicita dejando nombre y móvil. Sara aprueba o rechaza.
Prioridad absoluta: **simplicidad operativa para Sara**.

## Decisiones cerradas

| # | Decisión | Elegido |
|---|---|---|
| 1 | Acceso del alumno | Enlace público único, sin alta previa de alumnos |
| 2 | Flujo de reserva | Solicitud → Sara aprueba o rechaza |
| 3 | Stack | GitHub Pages (front) + Apps Script (API) + Google Sheets (datos) |
| 4 | Disponibilidad | Horario base semanal + eventos en Google Calendar = OCUPADO |
| 5 | Calendario | Calendario **secundario dedicado**, nunca el personal de Sara |
| 6 | Datos del alumno | Nombre + móvil |
| 7 | Aviso al alumno | WhatsApp al confirmar/rechazar |
| 8 | Aviso a Sara | WhatsApp al entrar una solicitud nueva |
| 9 | Acceso de Sara al panel | Su cuenta de Google |
| 10 | Avisos de WhatsApp | Enlaces wa.me desde el panel, sin API. Meta Cloud API queda para fase 2 |
| 11 | Dominio propio | Descartado |
| 12 | Horario de Sara | Clases de 90 min · L-J 08:30-13:00 y 14:00-18:30 · V 08:30-13:00 y 14:00-17:00, editable desde el panel |
| 13 | Antelación mínima | 6 horas. Por debajo, se invita a escribir a Sara por WhatsApp |
| 14 | Semanas a la vista | 2 |
| 15 | Límite por alumno | Sin tope de clases, pero al menos 1 hora de descanso entre dos del mismo día |
| 17 | Cancelaciones | El alumno no cancela: habla con Sara y ella libera la hora |
| 18 | Campo o calle | Sara lo marca por clase; queda en la hoja para sus comisiones |
| 16 | Cuenta de Google de Sara | La suya de siempre; se guarda en `email_admin` de la hoja Config |

## Arquitectura

Dos despliegues distintos de Apps Script, cada uno con su modo de acceso:

```
ALUMNO (público)
  clases-sara.github.io  ──fetch──▶  Web App "API"
                                     ejecutar como: Sara
                                     acceso: cualquiera, incluso anónimo
                                          │
SARA (privado)                            ▼
  Web App "Panel" (HtmlService)   ┌──────────────────┐
  ejecutar como: usuario ─────────▶│  Google Sheets   │  reservas + alumnos + config
  acceso: solo Sara                └──────────────────┘
                                          │
                                          ▼
                                   Google Calendar
                                   "Clases – disponibilidad"  (solo lectura)
                                          │
                                          ▼
                                     WhatsApp API
```

Motivo del doble despliegue: el panel de Sara necesita identidad de Google, lo que
exige sesión y redirecciones incompatibles con una llamada cross-origin desde GitHub
Pages. Sirviéndolo desde HtmlService, Google gestiona el login por nosotros.

CORS del alumno: los POST se envían con `Content-Type: text/plain` para evitar el
preflight, patrón estándar con Apps Script.

## Cálculo de huecos libres

```
LIBRE = horario_base(día)
        − eventos del calendario "Clases – disponibilidad"
        − reservas en estado pendiente o confirmada
        − franjas con menos de X horas de antelación
```

## Herencia del MVP PHP

El código PHP anterior queda como **especificación funcional de referencia**, no se
despliega. Reaprovechable de [includes/funciones.php](includes/funciones.php):

- Estados de reserva: `pendiente / confirmada / rechazada / cancelada`
- Protección anti doble reserva
- Marca de cancelación tardía (< 24 h)
- Rejilla semanal de slots

## Por qué no hay API de WhatsApp

WATI cuesta 39-49 €/mes y la Cloud API de Meta cobra por plantilla enviada. Las dos
exigen verificación de empresa y, sobre todo, **absorben el número**: Sara perdería
WhatsApp normal en su móvil y necesitaría una segunda línea.

En su lugar el panel abre WhatsApp con el mensaje ya escrito y Sara pulsa enviar.
Coste cero, sin verificaciones y el alumno recibe el mensaje desde el número de Sara
de siempre. El módulo queda aislado en `04_Avisos.gs`: para automatizarlo solo hay
que implementar `enviarWhatsApp_()`.

## Deuda del repositorio anterior — resuelta

- [x] `.git` estaba vacío: repositorio inicializado y con historial
- [x] Árbol partido entre `plataformas/sara/` y la raíz: todo el PHP vive ahora en `legacy-php/`
- [x] `plataformas/sara_copytest/`, duplicado byte a byte: eliminado

## Añadido después de las primeras pruebas

| Qué | Cómo |
|---|---|
| Clases confirmadas en el calendario de Sara | En *Clases – disponibilidad*, el mismo que ya usa y tiene compartido. Con el nombre del alumno y aviso una hora antes; se apuntan y se quitan solas |
| Recordar a los alumnos de mañana | Sección *Mañana* en el panel, con un botón que va abriendo un WhatsApp por alumno |
| Si el calendario no responde | No se ofrece ninguna hora y se avisa a Sara por correo. Antes se ofrecían todas |
| Archivado | `archivarAntiguas(meses)` mueve lo viejo a la pestaña *Historico* |

## El día que una clase se convirtió en 250 eventos

Una sola clase real (lunes 24, 08:30) acabó como más de 250 eventos idénticos en el
calendario y otras tantas filas en la hoja, creciendo cada quince minutos.

**Qué pasó.** Al quitar las columnas `codigo` y `grupo` del código, la hoja de verdad
se quedó con las suyas: `instalar()` solo añade las columnas que faltan, nunca retira
las que sobran. El sistema buscaba cada columna contando posiciones en una lista del
código en lugar de mirar la cabecera de la hoja, así que a partir de la décima columna
escribía todo corrido un sitio. El identificador del evento se guardaba en `grupo` y
la columna `evento_id` quedaba vacía para siempre. A partir de ahí:

1. Toda clase confirmada parecía no tener evento → se le creaba uno nuevo.
2. Ningún evento del calendario constaba como conocido → se importaban todos como
   clases nuevas.
3. A esas clases nuevas se les creaba su evento → vuelta a empezar, duplicando.

Lo disparaban a la vez la revisión automática y el panel, que la lanza cada vez que
Sara lo abre.

**Lo que se hizo.** La hoja manda: `indiceCol_()` lee la cabecera real y las filas se
escriben poniendo cada dato en su columna por nombre. Además, cuatro redes por si
alguna vez vuelve a fallar algo parecido:

| Red | Qué evita |
|---|---|
| Firma en los eventos que crea el sistema | Que se reimporten como clases de Sara |
| No se importa nada sobre una hora ya ocupada | Filas duplicadas |
| Antes de crear un evento se mira si ya está | Copias de la misma clase |
| Tope de 20 cambios por vuelta, con aviso por correo | Que un fallo crezca sin freno |
| Un cierre en `sincronizarTodo()` | Que el panel y la revisión automática se pisen |

**La lección.** El fallo no estaba en ninguna función suelta: estaba en repetirlas. Las
pruebas comprobaban una llamada y todas pasaban. Ahora se comprueban diez seguidas,
que es como se ejecuta de verdad, y también con la hoja descuadrada a propósito.

## Auditoría antes de abrir a los alumnos

Repaso completo buscando fallos, no confirmando que todo iba bien. Nueve hallazgos.

### Lo mismo que llenó el calendario, esperando en otros sitios

| Dónde | Qué pasaba |
|---|---|
| `archivarAntiguas` | Escribía el histórico **por posición** en una hoja que pudo crearse con otras columnas. Nadie se habría enterado hasta consultar el histórico un año después |
| Mover un evento | Escribía tres columnas seguidas dando por hecho que `fecha`, `hora_inicio` y `hora_fin` iban pegadas |

Los dos van ahora por `escribirCampos_()`, que coloca cada dato en la columna que
lleva su nombre estén donde estén.

### La puerta pública estaba demasiado abierta

La dirección de la API es anónima por diseño: acepta lo que le manden, no solo lo que
manda la página.

- **Sin tope por arriba**: se podía pedir una clase para dentro de tres años, fuera de
  lo que Sara ve en su panel. Ahora no se pasa de lo que se ofrece.
- **Nombre sin recortar**: cabían diez mil letras en una fila. Ahora 80.

### El detector se había quedado ciego

`diagnostico()` es lo que avisa de que algo va mal, y **nunca se había ejecutado en las
pruebas**. Tenía dos fallos heredados del cambio de horario:

- Buscaba dos clases que empezaran **a la misma hora**. Desde que las horas se adaptan
  al calendario, una de 09:00 a 10:30 y otra de 10:00 a 11:30 se pisan de sobra sin
  empezar igual.
- Daba por «fuera de horario» toda clase que no empezara a una hora exacta: con horas
  adaptadas eso son casi todas, y el aviso se llenaba de falsos.

Además, su lista de funciones vigiladas ignoraba doce de las nuevas: no habría avisado
si faltaba media pegada.

### Lo demás

- **Solicitudes zombis**: una que Sara nunca respondía se quedaba pendiente para
  siempre. Desaparecía de su panel y el alumno la seguía viendo como «sin respuesta»
  sin que nadie fuera a contestarle. Ahora se cierran solas al pasárseles la fecha.
- **Datos personales en un repositorio público**: el móvil real de Sara como ejemplo en
  el código, su correo y el de la cuenta del proyecto en las dos guías.
- **Permiso de más**: se pedía acceso a internet (`script.external_request`) sin usarlo.

### Lo que se probó y estaba bien

Zona horaria y cambio de hora · las ocho acciones de Sara protegidas · el doble toque
al reservar · las cuotas de correo y de disparadores · el fallo seguro cuando el
calendario no responde · la clave del panel, que no está en ningún archivo.

### Las dos pruebas que faltaban

**Estrés**: cien vueltas de revisión con la hoja descuadrada a propósito, rastros
borrados y eventos sueltos. Se cuenta antes y después: si algo crece, salta.

**De punta a punta**: los once pasos de un día real, por las mismas llamadas que usan
la página y el panel. Desde que el alumno ve las horas hasta que Sara libera una y el
hueco vuelve a ofrecerse.

**367 comprobaciones** en la lógica y **137** en el panel.

## Pendiente

- [ ] **Hoja de comisiones.** Falta saber en qué formato se las pide su jefa para
      adaptar la hoja a eso. El dato de campo o calle ya se guarda por clase.

- [ ] Móvil de Sara para los enlaces de WhatsApp (`telefono_sara` en la hoja Config)
- [x] Repositorio `clases-sara.github.io` creado en la organización `clases-sara`, con
      Pages sirviendo `/docs`. La página vive en **https://clases-sara.github.io/**
- [ ] **`url_publica` en la hoja Config** apuntando a esa dirección. Es el enlace que
      viaja en todos los WhatsApp que manda Sara: si se queda con el antiguo, los
      alumnos reciben un enlace roto y nadie se entera hasta que uno lo dice
- [ ] Ejecutar `instalar()` en Apps Script y publicar la implementación
