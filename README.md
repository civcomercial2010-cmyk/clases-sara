# Reserva de clases con Sara

Sara comparte un enlace: **[clases-sara.github.io](https://clases-sara.github.io/)**.
El alumno entra, ve las horas que Sara tiene libres, pide una dejando su nombre y su
móvil, y Sara la confirma desde su panel.

Sin coste de alojamiento, sin servidor que mantener y sin dar de alta alumnos.

## Cómo funciona

| Pieza | Dónde vive |
|---|---|
| Página del alumno | GitHub Pages, carpeta [docs/](docs/) |
| API y panel de Sara | Google Apps Script, carpeta [apps-script/](apps-script/) |
| Datos | Una hoja de Google Sheets |
| Disponibilidad | Un calendario de Google dedicado |
| Avisos | Correo a Sara, y WhatsApp al alumno con un toque desde el panel |

Las horas libres se calculan así:

```
LIBRE = horario habitual de Sara
        − lo que Sara haya tapado en el calendario "Clases – disponibilidad"
        − las horas ya pedidas o confirmadas
        − las horas a menos de 6 h vista (el alumno ve "consultar")
```

## Puesta en marcha

Sigue [INSTALACION.md](INSTALACION.md). Es la guía completa, paso a paso.

## Decisiones de diseño

Están en [DECISIONES.md](DECISIONES.md), con el porqué de cada una.

## Historia

[legacy-php/](legacy-php/) guarda el primer intento: un MVP en PHP + MySQL para Hostinger
que nunca llegó a desplegarse. Se conserva como referencia funcional; no forma parte
del sistema actual.
