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
    maxSeguidas: 2
  };

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

    llamarApi('disponibilidad', {}).then(function (respuesta) {
      mostrar('cargando', false);
      if (!respuesta || !respuesta.ok) {
        return fallo(respuesta && respuesta.error ? respuesta.error : 'No se pudieron cargar las horas.');
      }
      estado.disponibilidad = respuesta.datos;
      estado.antelacion = respuesta.datos.antelacion_minima_horas || 6;
      estado.maxSeguidas = respuesta.datos.max_seguidas || 2;
      if (!estado.telefonoSara) estado.telefonoSara = respuesta.datos.telefono_sara || '';

      // El título ya viene escrito en el HTML. Solo se reescribe si Sara lo ha
      // cambiado en su hoja, para que no parpadee nada más abrir la página.
      if (respuesta.datos.nombre_sitio) {
        var titulo = respuesta.datos.nombre_sitio + ' 😊';
        document.title = respuesta.datos.nombre_sitio;
        if ($('titulo').textContent.trim() !== titulo) $('titulo').textContent = titulo;
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

      var libres = dia.franjas.filter(function (f) { return f.estado === 'libre'; }).length;

      var horas = dia.franjas.map(function (franja) {
        var urgente = franja.estado === 'urgente';
        return '<button type="button" class="hora' + (urgente ? ' hora-urgente' : '') + '"' +
               ' data-fecha="' + dia.fecha + '"' +
               ' data-inicio="' + franja.hora_inicio + '"' +
               ' data-fin="' + franja.hora_fin + '"' +
               ' data-etiqueta="' + escapar(dia.etiqueta) + '"' +
               ' data-urgente="' + (urgente ? '1' : '0') + '">' +
               franja.hora_inicio +
               (urgente ? '<small>consultar</small>' : '') +
               '</button>';
      }).join('');

      html += '<div class="dia">' +
                '<div class="dia-cabecera">' +
                  '<span class="dia-nombre">' + escapar(dia.etiqueta) + '</span>' +
                  (dia.es_hoy ? '<span class="insignia-hoy">hoy</span>' : '') +
                  '<span class="dia-detalle">' +
                    (libres === 0 ? 'consultar' : libres === 1 ? '1 libre' : libres + ' libres') +
                  '</span>' +
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
      if (rompeLaRegla(hueco)) {
        return avisar('No puedes coger más de ' + estado.maxSeguidas +
                      ' clases seguidas el mismo día. Deja un hueco entre medias.');
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
   * Nadie puede encadenar mas de dos clases seguidas el mismo dia. Se avisa aqui
   * para que no llegue a pedirlas y se lo rechace el servidor despues.
   */
  function rompeLaRegla(hueco) {
    var horas = [parseInt(hueco.hora_inicio.substring(0, 2), 10)];

    estado.elegidas.forEach(function (h) {
      if (h.fecha === hueco.fecha) horas.push(parseInt(h.hora_inicio.substring(0, 2), 10));
    });

    horas.sort(function (a, b) { return a - b; });

    var racha = 1;
    for (var i = 1; i < horas.length; i++) {
      racha = (horas[i] === horas[i - 1] + 1) ? racha + 1 : 1;
      if (racha > estado.maxSeguidas) return true;
    }
    return false;
  }

  function pintarBarra() {
    var barra = $('barra');
    var total = estado.elegidas.length;

    if (!total) { barra.classList.add('oculto'); return; }

    ordenarElegidas();
    $('barra-cuenta').textContent = total === 1 ? '1 hora elegida' : total + ' horas elegidas';
    $('barra-detalle').textContent = resumenCorto();
    barra.classList.remove('oculto');
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
      return '<li><span>' + escapar(h.etiqueta) + '</span><b>' + h.hora_inicio + '</b></li>';
    }).join('');

    $('btn-enviar').textContent = estado.elegidas.length === 1
      ? 'Pedir esta hora' : 'Pedir estas ' + estado.elegidas.length + ' horas';

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
    if (telefono.replace(/\D/g, '').length < 6) return errorReserva('Revisa tu número de móvil.', true);
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

      guardarEnAlmacen(nombre, telefono, respuesta.reservas);
      mostrarExito(respuesta);
      $('campo-notas').value = '';
      cargarDisponibilidad();

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
      ? 'Hora solicitada' : creadas.length + ' horas solicitadas';

    $('hecho-horas').innerHTML = creadas.map(function (r) {
      return '<li><span>' + escapar(r.etiqueta_fecha) + '</span><b>' + r.hora_inicio + '</b></li>';
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

    $('hecho-codigo').textContent = respuesta.codigo || '';
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

  function cargarMisReservas() {
    var almacen = leerAlmacen();
    var caja = $('lista-mias');

    if (!almacen.codigos || !almacen.codigos.length) {
      caja.innerHTML = '<div class="aviso"><p>Aquí verás las clases que pidas.</p></div>';
      return;
    }

    caja.innerHTML = '<div class="estado-carga"><div class="girador"></div></div>';

    // Basta con preguntar por un código de cada grupo: el servidor devuelve
    // todas las horas que se pidieron a la vez.
    Promise.all(almacen.codigos.map(function (codigo) {
      return llamarApi('consultar', { codigo: codigo }).catch(function () { return null; });
    })).then(function (respuestas) {
      var vistas = {};
      var reservas = [];

      respuestas.forEach(function (r) {
        if (!r || !r.ok) return;
        (r.reservas || [r.reserva]).forEach(function (reserva) {
          if (!reserva || vistas[reserva.codigo]) return;
          vistas[reserva.codigo] = true;
          reservas.push(reserva);
        });
      });

      if (!reservas.length) {
        caja.innerHTML = '<div class="aviso"><p>No encontramos tus reservas.</p></div>';
        return;
      }

      reservas.sort(function (a, b) {
        return (a.fecha + a.hora_inicio) < (b.fecha + b.hora_inicio) ? 1 : -1;
      });

      caja.innerHTML = reservas.map(tarjetaReserva).join('');
      enlazarCancelaciones(caja);
    });
  }

  function tarjetaReserva(reserva) {
    var explicacion = {
      pendiente:  'Sara todavía no la ha confirmado. Te escribirá por WhatsApp.',
      confirmada: '¡Confirmada! Nos vemos ese día.',
      rechazada:  'Sara no pudo ese día. Elige otra hora.',
      cancelada:  'Esta clase se canceló.'
    }[reserva.estado] || '';

    var puedeCancelar = reserva.estado === 'pendiente' || reserva.estado === 'confirmada';

    return '<div class="tarjeta mia mia-' + reserva.estado + '">' +
             '<div class="mia-fila">' +
               '<div>' +
                 '<div class="mia-cuando">' + escapar(reserva.etiqueta_fecha) + '</div>' +
                 '<div class="mia-cuando">' + reserva.hora_inicio + ' – ' + reserva.hora_fin + '</div>' +
                 '<div class="mia-codigo">Código ' + escapar(reserva.codigo) + '</div>' +
               '</div>' +
               '<span class="etiqueta et-' + reserva.estado + '">' + reserva.estado + '</span>' +
             '</div>' +
             '<p class="ayuda">' + explicacion +
               (reserva.motivo_rechazo ? ' ' + escapar(reserva.motivo_rechazo) : '') + '</p>' +
             (puedeCancelar
               ? '<button class="boton boton-malo boton-peq js-cancelar" data-codigo="' +
                 escapar(reserva.codigo) + '">Cancelar esta clase</button>'
               : '') +
           '</div>';
  }

  function enlazarCancelaciones(caja) {
    Array.prototype.forEach.call(caja.querySelectorAll('.js-cancelar'), function (boton) {
      boton.addEventListener('click', function () {
        if (!confirm('¿Seguro que quieres cancelar esta clase?')) return;
        boton.disabled = true;
        boton.textContent = 'Cancelando…';
        llamarApi('cancelar', { codigo: boton.dataset.codigo }).then(function (respuesta) {
          if (!respuesta || !respuesta.ok) {
            boton.disabled = false;
            boton.textContent = 'Cancelar esta clase';
            return avisar(respuesta && respuesta.error ? respuesta.error : 'No se pudo cancelar.');
          }
          avisar(respuesta.cancelacion_tardia
            ? 'Cancelada. Avisa a Sara: queda menos de un día.'
            : 'Clase cancelada.');
          cargarMisReservas();
        });
      });
    });
  }

  function buscarPorCodigo() {
    var codigo = $('entrada-codigo').value.trim().toUpperCase();
    if (codigo.length !== 6) return avisar('El código tiene 6 letras y números.');

    llamarApi('consultar', { codigo: codigo }).then(function (respuesta) {
      if (!respuesta || !respuesta.ok) {
        return avisar(respuesta && respuesta.error ? respuesta.error : 'No encontrada.');
      }
      var almacen = leerAlmacen();
      if (almacen.codigos.indexOf(codigo) === -1) {
        almacen.codigos.push(codigo);
        escribirAlmacen(almacen);
      }
      $('entrada-codigo').value = '';
      cargarMisReservas();
    });
  }

  // --- Memoria del móvil ----------------------------------------------------

  function leerAlmacen() {
    try {
      var crudo = localStorage.getItem(CLAVE_ALMACEN);
      var datos = crudo ? JSON.parse(crudo) : {};
      if (!datos.codigos) datos.codigos = [];
      return datos;
    } catch (e) {
      return { codigos: [] };
    }
  }

  function escribirAlmacen(datos) {
    try {
      localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(datos));
    } catch (e) { /* modo privado: se pierde, no es crítico */ }
  }

  function guardarEnAlmacen(nombre, telefono, reservas) {
    var datos = leerAlmacen();
    datos.nombre = nombre;
    datos.telefono = telefono;
    (reservas || []).forEach(function (r) {
      if (datos.codigos.indexOf(r.codigo) === -1) datos.codigos.push(r.codigo);
    });
    if (datos.codigos.length > 30) datos.codigos = datos.codigos.slice(-30);
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
      $(id).classList.add('oculto');
    });
    $('fondo-modal').classList.add('oculto');
    document.body.style.overflow = '';
  }

  // --- Utilidades -----------------------------------------------------------

  function $(id) { return document.getElementById(id); }
  function mostrar(id, visible) { $(id).style.display = visible ? '' : 'none'; }
  function ocultar(id) { $(id).classList.add('oculto'); }

  function escapar(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    $('btn-buscar-codigo').addEventListener('click', buscarPorCodigo);
    $('btn-cambiar-datos').addEventListener('click', function () {
      $('datos-guardados').classList.add('oculto');
      $('campos-datos').classList.remove('oculto');
      $('campo-nombre').focus();
    });
    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape') cerrarHojas();
    });

    cargarDisponibilidad();
  });

})();
