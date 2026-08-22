/**
 * Reserva de clases con Sara — lógica del front público.
 *
 * Habla con una aplicación web de Apps Script. Todas las llamadas van por JSONP:
 * Apps Script responde a las peticiones POST con una redirección que el navegador
 * no sabe seguir, así que intentarlo primero por ahí solo servía para esperar el
 * doble. Con JSONP hay un único viaje y funciona en cualquier móvil.
 */

(function () {
  'use strict';

  var CLAVE_ALMACEN = 'sara_reservas_v1';

  var estado = {
    disponibilidad: null,
    elegidas: [],
    telefonoSara: CONFIG.TELEFONO_SARA || '',
    antelacion: 6,
    separacionMinima: 60,
    escuela: '',
  };

  /**
   * La autoescuela viene en el enlace que Sara reparte: ?e=andorra, ?e=encamp.
   *
   * Se guarda en el movil, asi que aunque el alumno entre otro dia por el enlace
   * de siempre sus clases siguen contando para la suya. Si no viene ninguna, el
   * servidor mira con cual reservo la ultima vez.
   */
  function recordarEscuela() {
    var enLaUrl = (window.location.search.match(/[?&]e=([\w-]+)/) || [])[1];
    var guardada = leerAlmacen().escuela;

    if (enLaUrl) {
      estado.escuela = enLaUrl;
      var datos = leerAlmacen();
      datos.escuela = enLaUrl;
      escribirAlmacen(datos);
    } else if (guardada) {
      estado.escuela = guardada;
    }
  }

  // --- Comunicación con la API ---------------------------------------------

  var contadorLlamadas = 0;

  function llamarApi(accion, datos) {
    if (!CONFIG.URL_API || CONFIG.URL_API.indexOf('PEGA_AQUI') === 0) {
      return Promise.reject(new Error('Falta configurar URL_API en config.js'));
    }

    return new Promise(function (resolver, rechazar) {
      var nombre = 'saraCb' + (++contadorLlamadas) + '_' + Date.now();
      var etiqueta = document.createElement('script');
      var temporizador = setTimeout(function () {
        limpiar();
        rechazar(new Error('Sin respuesta del servidor'));
      }, 30000);

      function limpiar() {
        clearTimeout(temporizador);
        try { delete window[nombre]; } catch (e) { window[nombre] = undefined; }
        if (etiqueta.parentNode) etiqueta.parentNode.removeChild(etiqueta);
      }

      window[nombre] = function (resultado) {
        limpiar();
        resolver(resultado);
      };

      etiqueta.src = CONFIG.URL_API +
        '?accion=' + encodeURIComponent(accion) +
        '&callback=' + nombre +
        '&datos=' + encodeURIComponent(JSON.stringify(datos || {}));
      etiqueta.onerror = function () { limpiar(); rechazar(new Error('No se pudo conectar')); };
      document.body.appendChild(etiqueta);
    });
  }

  // --- Disponibilidad -------------------------------------------------------

  /**
   * conservar = true mantiene lo que el alumno tenia elegido, quitando solo lo que
   * ya no este libre. Se usa cuando una peticion falla: perder la seleccion entera
   * despues de tocar seis horas es lo peor que le puede pasar.
   */
  function cargarDisponibilidad(conservar) {
    mostrar('cargando', true);
    ocultar('sin-huecos');

    // Su autoescuela viaja con la peticion: si Sara tiene que cruzar el pais entre
    // una clase y la siguiente, esas horas no se le ofrecen
    llamarApi('disponibilidad', { escuela: estado.escuela }).then(function (respuesta) {
      mostrar('cargando', false);
      if (!respuesta || !respuesta.ok) {
        return fallo(respuesta && respuesta.error ? respuesta.error : 'No se pudieron cargar las horas.');
      }
      estado.disponibilidad = respuesta.datos;
      estado.antelacion = respuesta.datos.antelacion_minima_horas || 6;
      estado.separacionMinima = respuesta.datos.separacion_minima !== undefined
        ? respuesta.datos.separacion_minima : 60;
      if (!estado.telefonoSara) estado.telefonoSara = respuesta.datos.telefono_sara || '';

      // El titulo ya viene escrito en el HTML. Solo se reescribe si Sara lo ha
      // cambiado en su hoja, para que no parpadee nada mas abrir la pagina. Se toca
      // solo el texto: los emojis viven en el HTML y no se pierden.
      if (respuesta.datos.nombre_sitio) {
        var texto = $('titulo-texto');
        document.title = respuesta.datos.nombre_sitio;
        if (texto.textContent.trim() !== respuesta.datos.nombre_sitio) {
          texto.textContent = respuesta.datos.nombre_sitio;
        }
      }

      if (conservar) depurarSeleccion(respuesta.datos.dias);
      else limpiarSeleccion();

      pintarDias(respuesta.datos.dias);
      marcarElegidas();
      pintarPie();
    }).catch(function (error) {
      mostrar('cargando', false);
      fallo(error.message);
    });
  }

  function pintarDias(dias) {
    var contenedor = $('dias');

    if (!dias || !dias.length) {
      contenedor.innerHTML = '';

      // Si el calendario de Sara no responde no se ofrece nada, y hay que decirlo
      var aviso = $('sin-huecos').querySelector('p strong');
      if (aviso) {
        aviso.textContent = estado.disponibilidad && estado.disponibilidad.sin_calendario
          ? 'Ahora mismo no podemos mostrarte las horas.'
          : 'Ahora mismo no hay horas libres.';
      }

      var enlace = $('wa-sin-huecos');
      if (estado.telefonoSara) {
        enlace.href = enlaceWhatsApp('Hola Sara, ¿tienes algún hueco libre para una clase?');
      } else {
        enlace.classList.add('oculto');
      }
      $('sin-huecos').classList.remove('oculto');
      return;
    }

    var html = '';
    var semanaPintada = -1;

    dias.forEach(function (dia) {
      if (dia.semana !== semanaPintada) {
        semanaPintada = dia.semana;
        html += '<h2 class="titulo-semana">' +
                (semanaPintada === 0 ? 'Esta semana' : 'La semana que viene') +
                '</h2>';
      }

      var horas = dia.franjas.map(function (franja) {
        var urgente = franja.estado === 'urgente';
        return '<button type="button" class="hora' + (urgente ? ' hora-urgente' : '') + '"' +
               ' data-fecha="' + dia.fecha + '"' +
               ' data-inicio="' + franja.hora_inicio + '"' +
               ' data-fin="' + franja.hora_fin + '"' +
               ' data-etiqueta="' + escapar(dia.etiqueta) + '"' +
               ' data-urgente="' + (urgente ? '1' : '0') + '">' +
               // La hora de fin va en el propio boton: sin ella, dos clases seguidas
               // parecen durar lo que hay hasta la siguiente, y no es asi
               franja.hora_inicio +
               (urgente ? '<small>consultar</small>' : '<small>' + franja.hora_fin + '</small>') +
               '</button>';
      }).join('');

      html += '<div class="dia">' +
                '<div class="dia-cabecera">' +
                  '<span class="dia-nombre">' + escapar(dia.etiqueta) + '</span>' +
                  (dia.es_hoy ? '<span class="insignia-hoy">hoy</span>' : '') +
                '</div>' +
                '<div class="horas">' + horas + '</div>' +
              '</div>';
    });

    contenedor.innerHTML = html;

    Array.prototype.forEach.call(contenedor.querySelectorAll('.hora'), function (boton) {
      boton.addEventListener('click', function () { alPulsarHora(boton); });
    });
  }

  // --- Elegir horas ---------------------------------------------------------

  function alPulsarHora(boton) {
    var hueco = {
      fecha: boton.dataset.fecha,
      hora_inicio: boton.dataset.inicio,
      hora_fin: boton.dataset.fin,
      etiqueta: boton.dataset.etiqueta
    };

    if (boton.dataset.urgente === '1') return abrirUrgente(hueco);

    var posicion = indiceDeHueco(hueco);
    if (posicion === -1) {
      // Dos clases no pueden pisarse. No deberia poder pasar, pero decirlo con
      // claridad vale mas que un "deja una hora entre clase y clase" que no encaja
      if (sePisaConOtra(hueco)) {
        return avisar('Esa clase se solapa con otra que ya has elegido. ' +
                      'Quita una de las dos.');
      }
      if (rompeLaRegla(hueco)) {
        return avisar('Deja al menos ' + textoSeparacion() + ' entre una clase y otra ' +
                      'del mismo día.');
      }
      estado.elegidas.push(hueco);
      boton.classList.add('hora-elegida');
    } else {
      estado.elegidas.splice(posicion, 1);
      boton.classList.remove('hora-elegida');
    }
    pintarBarra();
  }

  function indiceDeHueco(hueco) {
    for (var i = 0; i < estado.elegidas.length; i++) {
      if (estado.elegidas[i].fecha === hueco.fecha &&
          estado.elegidas[i].hora_inicio === hueco.hora_inicio) return i;
    }
    return -1;
  }

  function limpiarSeleccion() {
    estado.elegidas = [];
    pintarBarra();
  }

  /** Se queda solo con las horas elegidas que siguen libres. */
  function depurarSeleccion(dias) {
    var libres = {};
    (dias || []).forEach(function (d) {
      d.franjas.forEach(function (f) {
        if (f.estado === 'libre') libres[d.fecha + ' ' + f.hora_inicio] = true;
      });
    });
    estado.elegidas = estado.elegidas.filter(function (h) {
      return libres[h.fecha + ' ' + h.hora_inicio];
    });
    pintarBarra();
  }

  /** Vuelve a pintar de azul las horas elegidas despues de redibujar el listado. */
  function marcarElegidas() {
    estado.elegidas.forEach(function (h) {
      var boton = document.querySelector(
        '.hora[data-fecha="' + h.fecha + '"][data-inicio="' + h.hora_inicio + '"]');
      if (boton) boton.classList.add('hora-elegida');
    });
  }

  /**
   * Entre dos clases del mismo dia tiene que quedar un rato libre. Se comprueba aqui
   * para avisarle al momento, y el servidor lo vuelve a mirar antes de guardar nada.
   */
  /** Dos clases del mismo dia que se pisan aunque sea un minuto. */
  function sePisaConOtra(hueco) {
    var nuevo = enMinutos(hueco.hora_inicio, hueco.hora_fin);

    return estado.elegidas.some(function (h) {
      if (h.fecha !== hueco.fecha) return false;
      var otro = enMinutos(h.hora_inicio, h.hora_fin);
      return nuevo.inicio < otro.fin && nuevo.fin > otro.inicio;
    });
  }

  function rompeLaRegla(hueco) {
    if (estado.separacionMinima <= 0) return false;

    var bloques = [enMinutos(hueco.hora_inicio, hueco.hora_fin)];
    estado.elegidas.forEach(function (h) {
      if (h.fecha === hueco.fecha) bloques.push(enMinutos(h.hora_inicio, h.hora_fin));
    });

    bloques.sort(function (a, b) { return a.inicio - b.inicio; });

    for (var i = 1; i < bloques.length; i++) {
      if (bloques[i].inicio - bloques[i - 1].fin < estado.separacionMinima) return true;
    }
    return false;
  }

  function textoSeparacion() {
    var m = estado.separacionMinima;
    if (m < 60) return m + ' minutos';
    if (m === 60) return 'una hora';
    if (m === 90) return 'hora y media';
    return String(Math.round((m / 60) * 10) / 10).replace('.', ',') + ' horas';
  }

  function enMinutos(inicio, fin) {
    var aMin = function (hora) {
      var p = String(hora).split(':');
      return Number(p[0]) * 60 + Number(p[1] || 0);
    };
    return { inicio: aMin(inicio), fin: aMin(fin) };
  }

  function pintarBarra() {
    var barra = $('barra');
    var total = estado.elegidas.length;

    if (!total) { barra.classList.add('oculto'); return; }

    ordenarElegidas();
    $('barra-cuenta').textContent = textoTiempoElegido();
    $('barra-detalle').textContent = resumenCorto();
    barra.classList.remove('oculto');
  }

  /**
   * '1,5 h elegidas'. Se cuenta el tiempo y no el numero de clases porque una clase
   * dura hora y media: decir "1 hora elegida" al reservar 90 minutos confunde.
   */
  function textoTiempoElegido() {
    var minutos = 0;
    estado.elegidas.forEach(function (h) {
      minutos += enMinutos(h.hora_inicio, h.hora_fin).fin -
                 enMinutos(h.hora_inicio, h.hora_fin).inicio;
    });

    if (minutos < 60) return minutos + ' min elegidos';

    var horas = Math.round((minutos / 60) * 10) / 10;
    var texto = String(horas).replace('.', ',');
    return texto + (minutos === 60 ? ' h elegida' : ' h elegidas');
  }

  function ordenarElegidas() {
    estado.elegidas.sort(function (a, b) {
      return (a.fecha + a.hora_inicio) < (b.fecha + b.hora_inicio) ? -1 : 1;
    });
  }

  function resumenCorto() {
    return estado.elegidas.slice(0, 3).map(function (h) {
      return h.etiqueta.split(',')[0].substring(0, 3) + ' ' + h.hora_inicio;
    }).join(' · ') + (estado.elegidas.length > 3 ? ' …' : '');
  }

  // --- Pedir las horas ------------------------------------------------------

  function abrirFormulario() {
    if (!estado.elegidas.length) return;
    ordenarElegidas();

    $('lista-elegidas').innerHTML = estado.elegidas.map(function (h) {
      return '<li><span>' + escapar(h.etiqueta) + '</span><b>' +
             h.hora_inicio + ' – ' + h.hora_fin + '</b></li>';
    }).join('');

    $('btn-enviar').textContent = estado.elegidas.length === 1
      ? 'Pedir esta clase' : 'Pedir estas ' + estado.elegidas.length + ' clases';

    var guardado = leerAlmacen();
    if (guardado.nombre && guardado.telefono) {
      $('recordado-nombre').textContent = guardado.nombre;
      $('recordado-telefono').textContent = guardado.telefono;
      $('campo-nombre').value = guardado.nombre;
      $('campo-telefono').value = guardado.telefono;
      $('datos-guardados').classList.remove('oculto');
      $('campos-datos').classList.add('oculto');
    } else {
      $('datos-guardados').classList.add('oculto');
      $('campos-datos').classList.remove('oculto');
    }

    ocultar('error-reserva');
    abrirHoja('hoja-reserva');
  }

  function abrirUrgente(hueco) {
    $('urgente-cuando').textContent = hueco.etiqueta + ' · ' + hueco.hora_inicio;
    $('urgente-horas').textContent = estado.antelacion;
    var enlace = $('urgente-wa');
    if (estado.telefonoSara) {
      enlace.href = enlaceWhatsApp(
        'Hola Sara, ¿podrías darme clase el ' + hueco.etiqueta + ' a las ' + hueco.hora_inicio +
        '? Sé que queda poco tiempo.');
      enlace.classList.remove('oculto');
    } else {
      enlace.classList.add('oculto');
    }
    abrirHoja('hoja-urgente');
  }

  function enviarReserva(evento) {
    evento.preventDefault();
    ocultar('error-reserva');

    var nombre   = $('campo-nombre').value.trim();
    var telefono = $('campo-telefono').value.trim();
    var notas    = $('campo-notas').value.trim();

    if (nombre.length < 3) return errorReserva('Escribe tu nombre y apellido.', true);
    // Se escribe como se quiera: con espacios, con prefijo, con guiones. Solo se
    // cuentan los dígitos, y con seis (un móvil de Andorra) ya vale. El servidor
    // le pone el prefijo que le falte.
    if (contarDigitos(telefono) < 6) {
      return errorReserva('Revisa tu número de móvil: faltan cifras.', true);
    }
    if (!estado.elegidas.length) {
      cerrarHojas();
      return avisar('Se han quedado sin sitio. Vuelve a elegir las horas.');
    }

    var boton = $('btn-enviar');
    var textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Enviando…';

    llamarApi('reservar', {
      nombre: nombre,
      telefono: telefono,
      notas: notas,
      escuela: estado.escuela,
      huecos: estado.elegidas.map(function (h) {
        return { fecha: h.fecha, hora_inicio: h.hora_inicio };
      })
    }).then(function (respuesta) {
      boton.disabled = false;
      boton.textContent = textoOriginal;

      if (!respuesta || !respuesta.ok) {
        if (respuesta && respuesta.motivo === 'antelacion') {
          cerrarHojas();
          avisar(respuesta.error);
          return;
        }
        errorReserva(respuesta && respuesta.error ? respuesta.error : 'No se pudo reservar.');
        cargarDisponibilidad(true);
        return;
      }

      guardarEnAlmacen(nombre, telefono);
      mostrarExito(respuesta);
      $('campo-notas').value = '';
      cargarDisponibilidad();

      // El correo a Sara se pide aquí, con el alumno ya mirando su confirmación:
      // dentro de la reserva le hacía esperar casi un segundo de más.
      if (respuesta.ids && respuesta.ids.length) {
        llamarApi('avisar', { ids: respuesta.ids }).catch(function () {});
      }

    }).catch(function () {
      boton.disabled = false;
      boton.textContent = textoOriginal;
      errorReserva('No hay conexión con el servidor. Inténtalo de nuevo.');
    });
  }

  function mostrarExito(respuesta) {
    cerrarHojas();

    var creadas = respuesta.reservas || [];
    $('hecho-titulo').textContent = creadas.length === 1
      ? 'Clase solicitada' : creadas.length + ' clases solicitadas';

    $('hecho-horas').innerHTML = creadas.map(function (r) {
      return '<li><span>' + escapar(r.etiqueta_fecha) + '</span><b>' +
             r.hora_inicio + ' – ' + r.hora_fin + '</b></li>';
    }).join('');

    var fallidas = respuesta.fallidas || [];
    if (fallidas.length) {
      var caja = $('hecho-fallidas');
      caja.textContent = 'No pudimos con ' + fallidas.map(function (f) {
        return f.etiqueta_fecha + ' a las ' + f.hora_inicio;
      }).join(', ') + '. Alguien se te adelantó.';
      caja.classList.remove('oculto');
    } else {
      ocultar('hecho-fallidas');
    }

    abrirHoja('hoja-hecho');
  }

  function errorReserva(mensaje, mostrarCampos) {
    if (mostrarCampos) {
      $('datos-guardados').classList.add('oculto');
      $('campos-datos').classList.remove('oculto');
    }
    var caja = $('error-reserva');
    caja.textContent = mensaje;
    caja.classList.remove('oculto');
  }

  // --- Mis clases -----------------------------------------------------------

  /**
   * Las clases del alumno, buscadas por su movil.
   *
   * El telefono es lo unico que hace falta: identifica al alumno y lo lleva siempre
   * encima, sin nada que apuntar ni recordar.
   */
  function cargarMisReservas() {
    var movil = leerAlmacen().telefono;
    var caja = $('lista-mias');

    if (!movil) {
      caja.innerHTML = '<div class="aviso"><p>Aquí verás las clases que pidas.</p></div>';
      return;
    }

    caja.innerHTML = '<div class="estado-carga"><div class="girador"></div></div>';

    llamarApi('consultar', { telefono: movil }).then(function (respuesta) {
      if (!respuesta || !respuesta.ok || !respuesta.reservas.length) {
        caja.innerHTML = '<div class="aviso"><p>Todavía no tienes ninguna clase.</p></div>';
        return;
      }

      // La proxima clase, arriba: es la que el alumno viene a mirar
      var reservas = respuesta.reservas.slice().sort(function (a, b) {
        return (a.fecha + a.hora_inicio) < (b.fecha + b.hora_inicio) ? -1 : 1;
      });

      caja.innerHTML = reservas.map(tarjetaReserva).join('');
    }).catch(function () {
      caja.innerHTML = '<div class="aviso"><p>No se pudieron cargar tus clases.</p></div>';
    });
  }

  function tarjetaReserva(reserva) {
    var explicacion = {
      pendiente:  'Sara todavía no la ha confirmado. Te escribirá por WhatsApp.',
      confirmada: '¡Confirmada! Nos vemos ese día.',
      realizada:  'Clase dada. ¡Buen trabajo!',
      rechazada:  'Sara no pudo ese día. Elige otra hora.',
      cancelada:  'Esta clase ya no está en pie.'
    }[reserva.estado] || '';

    // Solo tiene sentido guardar en la agenda lo que Sara ya ha confirmado
    var calendario = reserva.estado === 'confirmada'
      ? '<a class="boton boton-neutro boton-peq" target="_blank" rel="noopener" href="' +
        enlaceGoogleCalendar(reserva) + '">Añadir a mi calendario</a>'
      : '';

    return '<div class="tarjeta mia mia-' + reserva.estado + '">' +
             '<div class="mia-fila">' +
               '<div>' +
                 '<div class="mia-cuando">' + escapar(reserva.etiqueta_fecha) + '</div>' +
                 '<div class="mia-cuando">' + reserva.hora_inicio + ' – ' + reserva.hora_fin + '</div>' +
                 (reserva.tipo || reserva.escuela
                   ? '<div class="mia-detalle">' +
                     [reserva.tipo, reserva.escuela].filter(Boolean).map(escapar).join(' · ') +
                     '</div>'
                   : '') +
               '</div>' +
               '<span class="etiqueta et-' + reserva.estado + '">' + reserva.estado + '</span>' +
             '</div>' +
             '<p class="ayuda">' + explicacion +
               (reserva.motivo_rechazo ? ' ' + escapar(reserva.motivo_rechazo) : '') + '</p>' +
             '<div class="acciones-mia">' + calendario + '</div>' +
           '</div>';
  }

  // --- Memoria del móvil ----------------------------------------------------

  function leerAlmacen() {
    try {
      var crudo = localStorage.getItem(CLAVE_ALMACEN);
      return crudo ? JSON.parse(crudo) : {};
    } catch (e) {
      return {};
    }
  }

  function escribirAlmacen(datos) {
    try {
      localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(datos));
    } catch (e) { /* modo privado: se pierde, no es crítico */ }
  }

  function guardarEnAlmacen(nombre, telefono) {
    var datos = leerAlmacen();
    datos.nombre = nombre;
    datos.telefono = telefono;
    escribirAlmacen(datos);
  }

  // --- Hojas emergentes -----------------------------------------------------

  function abrirHoja(id) {
    $('fondo-modal').classList.remove('oculto');
    $(id).classList.remove('oculto');
    document.body.style.overflow = 'hidden';
  }

  function cerrarHojas() {
    ['hoja-reserva', 'hoja-urgente', 'hoja-hecho'].forEach(function (id) {
      var hoja = $(id);
      if (hoja) hoja.classList.add('oculto');
    });
    $('fondo-modal').classList.add('oculto');
    document.body.style.overflow = '';
  }

  // --- Utilidades -----------------------------------------------------------

  function $(id) { return document.getElementById(id); }
  function mostrar(id, visible) { $(id).style.display = visible ? '' : 'none'; }
  function ocultar(id) { $(id).classList.add('oculto'); }

  function contarDigitos(texto) {
    return String(texto || '').replace(/\D/g, '').length;
  }

  function escapar(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Enlace que abre Google Calendar con la clase ya rellenada.
   *
   * Antes se descargaba un archivo .ics, pero en el movil acababa en un archivo
   * suelto que muchas veces daba error al abrirlo. Esto abre la aplicacion de
   * calendario directamente y el alumno solo pulsa guardar.
   */
  function enlaceGoogleCalendar(reserva) {
    var sinGuiones = reserva.fecha.replace(/-/g, '');
    var inicio = sinGuiones + 'T' + reserva.hora_inicio.replace(':', '') + '00';
    var fin    = sinGuiones + 'T' + reserva.hora_fin.replace(':', '') + '00';

    var titulo  = 'Clase de conducir con Sara' + (reserva.tipo ? ' · ' + reserva.tipo : '');
    var detalle = (reserva.tipo ? 'Clase de ' + reserva.tipo + '\n' : '') +
                  (reserva.escuela ? 'Autoescuela: ' + reserva.escuela : '');

    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
           '&text=' + encodeURIComponent(titulo) +
           '&dates=' + inicio + '/' + fin +
           '&ctz=Europe/Madrid' +
           (reserva.ubicacion ? '&location=' + encodeURIComponent(reserva.ubicacion) : '') +
           (detalle ? '&details=' + encodeURIComponent(detalle) : '');
  }

  function enlaceWhatsApp(texto) {
    return 'https://wa.me/' + estado.telefonoSara + '?text=' + encodeURIComponent(texto);
  }

  function pintarPie() {
    if (!estado.telefonoSara) return;
    $('pie-texto').innerHTML = '¿Alguna duda? <a href="' +
      enlaceWhatsApp('Hola Sara, tengo una duda sobre las clases.') +
      '" target="_blank" rel="noopener">Escríbele a Sara</a>.';
  }

  function fallo(mensaje) {
    $('dias').innerHTML = '<div class="aviso"><p><strong>No se pudieron cargar las horas.</strong></p>' +
                          '<p>' + escapar(mensaje) + '</p></div>';
  }

  var temporizadorBrindis = null;
  function avisar(mensaje) {
    var caja = $('brindis');
    caja.textContent = mensaje;
    caja.classList.add('visible');
    clearTimeout(temporizadorBrindis);
    temporizadorBrindis = setTimeout(function () { caja.classList.remove('visible'); }, 3200);
  }

  // --- Arranque -------------------------------------------------------------

  function cambiarVista(vista) {
    Array.prototype.forEach.call(document.querySelectorAll('.pestana'), function (boton) {
      boton.classList.toggle('activa', boton.dataset.vista === vista);
    });
    $('vista-reservar').classList.toggle('oculto', vista !== 'reservar');
    $('vista-mias').classList.toggle('oculto', vista !== 'mias');
    $('barra').classList.toggle('oculto', vista !== 'reservar' || !estado.elegidas.length);

    if (vista === 'mias') cargarMisReservas();
    if (vista === 'reservar' && !estado.disponibilidad) cargarDisponibilidad();
  }

  document.addEventListener('DOMContentLoaded', function () {
    Array.prototype.forEach.call(document.querySelectorAll('.pestana'), function (boton) {
      boton.addEventListener('click', function () { cambiarVista(boton.dataset.vista); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.js-cerrar'), function (boton) {
      boton.addEventListener('click', cerrarHojas);
    });

    $('fondo-modal').addEventListener('click', cerrarHojas);
    $('btn-continuar').addEventListener('click', abrirFormulario);
    $('formulario-reserva').addEventListener('submit', enviarReserva);
    $('btn-cambiar-datos').addEventListener('click', function () {
      $('datos-guardados').classList.add('oculto');
      $('campos-datos').classList.remove('oculto');
      $('campo-nombre').focus();
    });
    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape') cerrarHojas();
    });

    recordarEscuela();

    // Sara manda el enlace acabado en #mis-clases al confirmar: se abre ahi directo
    if (window.location.hash === '#mis-clases') cambiarVista('mias');
    else cargarDisponibilidad();
  });

})();
