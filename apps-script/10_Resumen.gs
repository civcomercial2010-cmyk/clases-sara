/**
 * Resumen mensual, para las comisiones.
 *
 * Una pestaña donde Sara ve, mes a mes, cuántas clases ha dado a cada alumno, de qué
 * autoescuela y si fueron de campo o de circulación. Es lo que necesita a fin de mes
 * y lo que antes tenía que sacar filtrando la hoja de reservas a mano.
 *
 * Solo cuenta las clases **confirmadas y ya dadas**: una clase de la semana que viene
 * está confirmada, pero todavía no se ha cobrado. Se rehace sola en cada revisión.
 */

var HOJA_RESUMEN = 'Resumen';

function actualizarResumen() {
  var hoja = asegurarHojaResumen_();
  var filas = filasComoObjetos(getHoja(HOJA_RESERVAS));
  var ahoraTs = ahora().getTime();

  /*
   * Cuentan las marcadas como 'realizada' y, por si la revisión automática todavía
   * no ha pasado, también las confirmadas cuya hora ya terminó. Así el resumen está
   * al día aunque se mire justo al salir de una clase.
   */
  var dadas = filas.filter(function (fila) {
    var estado = String(fila.estado).trim();
    if (estado !== 'realizada' && estado !== 'confirmada') return false;

    var fecha = aFechaISO(fila.fecha);
    if (!fecha) return false;
    if (estado === 'realizada') return true;

    return aDate(fecha, aHoraHHMM(fila.hora_fin) || '23:59').getTime() <= ahoraTs;
  });

  var lineas = agruparParaResumen_(dadas);

  // Se borra lo que hubiera y se escribe de nuevo: así nunca quedan restos
  var ultima = hoja.getLastRow();
  if (ultima > 1) hoja.getRange(2, 1, ultima - 1, 6).clearContent();

  if (!lineas.length) {
    hoja.getRange(2, 1).setValue('Todavía no hay ninguna clase dada.');
    return { ok: true, filas: 0 };
  }

  hoja.getRange(2, 1, lineas.length, 6).setValues(lineas);
  return { ok: true, filas: lineas.length };
}

/**
 * Una línea por mes, alumno y autoescuela, con el reparto entre los tipos de clase.
 * Ordenado del mes más reciente al más antiguo, que es como se consulta.
 */
function agruparParaResumen_(filas) {
  var tipos = listaDeTipos();
  var cuentas = {};

  filas.forEach(function (fila) {
    var fecha   = aFechaISO(fila.fecha);
    var mes     = fecha.substring(0, 7);
    var nombre  = String(fila.nombre || '').trim() || 'Sin nombre';
    var escuela = String(fila.escuela || '').trim() || 'Sin autoescuela';
    var clave   = mes + '|' + nombre.toLowerCase() + '|' + escuela.toLowerCase();

    if (!cuentas[clave]) {
      cuentas[clave] = {
        mes: mes, nombre: nombre, escuela: escuela,
        total: 0, minutos: 0, porTipo: {}
      };
    }

    var cuenta = cuentas[clave];
    cuenta.total++;
    cuenta.minutos += enMinutos(aHoraHHMM(fila.hora_fin)) - enMinutos(aHoraHHMM(fila.hora_inicio));

    var tipo = String(fila.tipo || '').trim() || 'Sin marcar';
    cuenta.porTipo[tipo] = (cuenta.porTipo[tipo] || 0) + 1;
  });

  return Object.keys(cuentas)
    .map(function (clave) { return cuentas[clave]; })
    .sort(function (a, b) {
      if (a.mes !== b.mes) return a.mes < b.mes ? 1 : -1;   // el mes más nuevo, arriba
      return a.nombre.toLowerCase() < b.nombre.toLowerCase() ? -1 : 1;
    })
    .map(function (c) {
      // Las columnas de tipo van en el orden de la configuración, y al final el resto
      var desglose = tipos.map(function (t) {
        return t + ': ' + (c.porTipo[t] || 0);
      });
      Object.keys(c.porTipo).forEach(function (t) {
        if (tipos.indexOf(t) === -1) desglose.push(t + ': ' + c.porTipo[t]);
      });

      return [
        nombreDeMes_(c.mes),
        c.nombre,
        c.escuela,
        c.total,
        Math.round((c.minutos / 60) * 10) / 10,
        desglose.join(' · ')
      ];
    });
}

/** '2026-08' -> 'agosto 2026' */
function nombreDeMes_(mes) {
  var partes = mes.split('-');
  return nombreMes(Number(partes[1])) + ' ' + partes[0];
}

function asegurarHojaResumen_() {
  var ss = getSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_RESUMEN);
  if (hoja) return hoja;

  hoja = ss.insertSheet(HOJA_RESUMEN, 0);   // la primera, que es la que se consulta
  hoja.getRange(1, 1, 1, 6)
      .setValues([['Mes', 'Alumno', 'Autoescuela', 'Clases', 'Horas', 'Desglose']])
      .setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
  hoja.setFrozenRows(1);

  hoja.setColumnWidth(1, 130);
  hoja.setColumnWidth(2, 200);
  hoja.setColumnWidth(3, 150);
  hoja.setColumnWidth(4, 80);
  hoja.setColumnWidth(5, 80);
  hoja.setColumnWidth(6, 260);

  return hoja;
}
