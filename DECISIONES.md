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
| 10 | Proveedor WhatsApp | Pendiente: Meta Cloud API vs WATI |
| 11 | Dominio propio | Descartado |

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

## Deuda del repositorio anterior

- [ ] `.git` vacío: el proyecto no está versionado
- [ ] Árbol partido: los archivos raíz están en `plataformas/sara/`, las carpetas en la raíz
- [ ] `plataformas/sara_copytest/` es un duplicado byte a byte, eliminar
