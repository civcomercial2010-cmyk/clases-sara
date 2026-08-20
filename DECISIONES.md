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
| 16 | Cuenta de Google de Sara | olimpica.sara@gmail.com |

## Arquitectura

Dos despliegues distintos de Apps Script, cada uno con su modo de acceso:

```
ALUMNO (público)
  github.io/clases-sara  ──fetch──▶  Web App "API"
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

## Pendiente

- [ ] **Hoja de comisiones.** Falta saber en qué formato se las pide su jefa para
      adaptar la hoja a eso. El dato de campo o calle ya se guarda por clase.

- [ ] Móvil de Sara para los enlaces de WhatsApp (`telefono_sara` en la hoja Config)
- [ ] Crear el repositorio `clases-sara` en GitHub y activar Pages sobre `/docs`
- [ ] Ejecutar `instalar()` en Apps Script y publicar las dos implementaciones
