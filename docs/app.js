/**
 * Reserva de clases con Sara — lógica del front público.
 *
 * Habla con una aplicación web de Apps Script. Las llamadas se intentan primero
 * con fetch; si el navegador las bloquea, se repiten con JSONP, que nunca falla
 * por CORS. Así el enlace funciona igual en cualquier móvil.
 */

(function () {
  'use strict';

  var CLAVE_ALMACEN = 'sara_reservas_v1';

  var estado = {
    disponibilidad: null,
    seleccion: null,
    telefonoSara: CONFIG.TELEFONO_SARA || '',
    antelacion: 6
  };

  // --- Comunicación con la API ---------------------------------------------

  function llamarApi(accion, datos) {
    if (!CONFIG.URL_API || CONFIG.URL_API.indexOf('PEGA_AQUI') === 0) {
      return Promise.reject(new Error('Falta configurar URL_API en config.js'));
    }
    return porFetch(accion, datos).catch(function () {
      return porJsonp(accion, datos);
    });
  }

  function porFetch(accion, datos) {
    var cuerpo = JSON.stringify(Object.assign({ accion: accion }, datos || {}));
    return fetch(CONFIG.URL_API, {
      method: 'POST',
      // text/plain evita la petición previa de CORS, que Apps Script no responde
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: cuerpo,
      redirect: 'follow'
    }).then(function (respuesta) {
      if (!respuesta.ok) throw new Error('Respuesta ' + respuesta.status);
      return respuesta.json();
    });
  }

  var contadorJsonp = 0;

  function porJsonp(accion, datos) {
    return new Promise(function (resolver, rechazar) {
      var nombre = 'saraCb' + (++contadorJsonp) + '_' + Date.now();
      var etiqueta = document.createElement('script');
      var temporizador = setTimeout(function () {
        limpiar();
        rechazar(new Error('Sin respuesta del servidor'));
      }, 20000);

      function limpiar() {
        clearTimeout(temporizador);
        delete window[nombre];
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

  function cargarDisponibilidad() {
    mostrar('cargando', true);
    ocultar('sin-huecos');

    llamarApi('disponibilidad', {}).then(function (respuesta) {
      mostrar('cargando', false);
      if (!respuesta || !respuesta.ok) {
        return fallo(respuesta && respuesta.error ? respuesta.error : 'No se pudieron cargar las horas.');
      }
      estado.disponibilidad = respuesta.datos;
      estado.antelacion = respuesta.datos.antelacion_minima_horas || 6;
      if (!estado.telefonoSara) estado.telefonoSara = respuesta.datos.telefono_sara || '';

      if (respuesta.datos.nombre_sitio) {
        document.title = respuesta.datos.nombre_sitio;
        $('titulo').textContent = respuesta.datos.nombre_sitio;
      }
      pintarDias(respuesta.datos.dias);
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

    contenedor.innerHTML = dias.map(function (dia) {
      var libres = dia.franjas.filter(function (f) { return f.estado === 'libre'; }).length;
      var horas = dia.franjas.map(function (franja) {
        var urgente = franja.estado === 'urgente';
        return '<button class="hora' + (urgente ? ' hora-urgente' : '') + '"' +
               ' data-fecha="' + dia.fecha + '"' +
               ' data-inicio="' + franja.hora_inicio + '"' +
               ' data-fin="' + franja.hora_fin + '"' +
               ' data-urgente="' + (urgente ? '1' : '0') + '">' +
               franja.hora_inicio +
               (urgente ? '<small>consultar</small>' : '') +
               '</button>';
      }).join('');

      return '<div class="dia">' +
               '<div class="dia-cabecera">' +
                 '<span class="dia-nombre">' + escapar(dia.etiqueta) + '</span>' +
                 (dia.es_hoy ? '<span class="insignia-hoy">hoy</span>' : '') +
                 '<span class="dia-detalle">' +
                   (libres === 0 ? 'consultar' : libres === 1 ? '1 hora libre' : libres + ' horas libres') +
                 '</span>' +
               '</div>' +
               '<div class="horas">' + horas + '</div>' +
             '</div>';
    }).join('');

    Array.prototype.forEach.call(contenedor.querySelectorAll('.hora'), function (boton) {
      boton.addEventListener('click', function () {
        var datos = {
          fecha: boton.dataset.fecha,
          hora_inicio: boton.dataset.inicio,
          hora_fin: boton.dataset.fin,
          etiqueta: textoCuando(boton)
        };
        if (boton.dataset.urgente === '1') abrirUrgente(datos);
        else abrirReserva(datos);
      });
    });
  }

  function textoCuando(boton) {
    var dia = estado.disponibilidad.dias.filter(function (d) {
      return d.fecha === boton.dataset.fecha;
    })[0];
    return (dia ? dia.etiqueta : boton.dataset.fecha) +
           ' · ' + boton.dataset.inicio + ' a ' + boton.dataset.fin;
  }

  // --- Pedir una hora -------------------------------------------------------

  function abrirReserva(seleccion) {
    estado.seleccion = seleccion;
    $('hoja-cuando').textContent = seleccion.etiqueta;
    ocultar('error-reserva');

    var guardado = leerAlmacen();
    if (guardado.nombre) $('campo-nombre').value = guardado.nombre;
    if (guardado.telefono) $('campo-telefono').value = guardado.telefono;

    abrirHoja('hoja-reserva');
  }

  function abrirUrgente(seleccion) {
    $('urgente-cuando').textContent = seleccion.etiqueta;
    $('urgente-horas').textContent = estado.antelacion;
    var enlace = $('urgente-wa');
    if (estado.telefonoSara) {
      enlace.href = enlaceWhatsApp(
        'Hola Sara, ¿podrías darme clase el ' + seleccion.etiqueta + '? Sé que queda poco tiempo.');
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

    if (nombre.length < 3)  return errorReserva('Escribe tu nombre y apellido.');
    if (telefono.replace(/\D/g, '').length < 9) return errorReserva('Revisa tu número de móvil.');

    var boton = $('btn-enviar');
    boton.disabled = true;
    boton.textContent = 'Enviando…';

    llamarApi('reservar', {
      nombre: nombre,
      telefono: telefono,
      notas: notas,
      fecha: estado.seleccion.fecha,
      hora_inicio: estado.seleccion.hora_inicio
    }).then(function (respuesta) {
      boton.disabled = false;
      boton.textContent = 'Pedir esta hora';

      if (!respuesta || !respuesta.ok) {
        var mensaje = respuesta && respuesta.error ? respuesta.error : 'No se pudo reservar.';
        if (respuesta && respuesta.motivo === 'antelacion') {
          cerrarHojas();
          abrirUrgente(estado.seleccion);
          return;
        }
        errorReserva(mensaje);
        cargarDisponibilidad(); // la hora pudo ocuparse mientras tanto
        return;
      }

      guardarEnAlmacen(nombre, telefono, respuesta.reserva.codigo);
      cerrarHojas();
      $('hecho-cuando').textContent = estado.seleccion.etiqueta;
      $('hecho-codigo').textContent = respuesta.reserva.codigo;
      abrirHoja('hoja-hecho');
      $('campo-notas').value = '';
      cargarDisponibilidad();

    }).catch(function (error) {
      boton.disabled = false;
      boton.textContent = 'Pedir esta hora';
      errorReserva('No hay conexión con el servidor. Inténtalo de nuevo.');
    });
  }

  function errorReserva(mensaje) {
    var caja = $('error-reserva');
    caja.textContent = mensaje;
    caja.classList.remove('oculto');
  }

  // --- Mis reservas ---------------------------------------------------------

  function cargarMisReservas() {
    var almacen = leerAlmacen();
    var caja = $('lista-mias');

    if (!almacen.codigos || !almacen.codigos.length) {
      caja.innerHTML = '<div class="aviso"><p>Aquí verás las clases que pidas.</p></div>';
      return;
    }

    caja.innerHTML = '<div class="estado-carga"><div class="girador"></div></div>';

    Promise.all(almacen.codigos.map(function (codigo) {
      return llamarApi('consultar', { codigo: codigo }).catch(function () { return null; });
    })).then(function (respuestas) {
      var reservas = respuestas
        .filter(function (r) { return r && r.ok; })
        .map(function (r) { return r.reserva; })
        .sort(function (a, b) {
          return (a.fecha + a.hora_inicio) < (b.fecha + b.hora_inicio) ? 1 : -1;
        });

      if (!reservas.length) {
        caja.innerHTML = '<div class="aviso"><p>No encontramos tus reservas.</p></div>';
        return;
      }
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
                 '<div class="mia-cuando">' + escapar(reserva.etiqueta_fecha) + ' · ' +
                   reserva.hora_inicio + '–' + reserva.hora_fin + '</div>' +
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
        llamarApi('cancelar', { codigo: boton.dataset.codigo }).then(function (respuesta) {
          if (!respuesta || !respuesta.ok) {
            boton.disabled = false;
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

  // --- Almacenamiento local -------------------------------------------------

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

  function guardarEnAlmacen(nombre, telefono, codigo) {
    var datos = leerAlmacen();
    datos.nombre = nombre;
    datos.telefono = telefono;
    if (datos.codigos.indexOf(codigo) === -1) datos.codigos.push(codigo);
    if (datos.codigos.length > 20) datos.codigos = datos.codigos.slice(-20);
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
    temporizadorBrindis = setTimeout(function () { caja.classList.remove('visible'); }, 2800);
  }

  // --- Arranque -------------------------------------------------------------

  function cambiarVista(vista) {
    Array.prototype.forEach.call(document.querySelectorAll('.pestana'), function (boton) {
      boton.classList.toggle('activa', boton.dataset.vista === vista);
    });
    $('vista-reservar').classList.toggle('oculto', vista !== 'reservar');
    $('vista-mias').classList.toggle('oculto', vista !== 'mias');
    if (vista === 'mias') cargarMisReservas();
    if (vista === 'reservar') cargarDisponibilidad();
  }

  document.addEventListener('DOMContentLoaded', function () {
    Array.prototype.forEach.call(document.querySelectorAll('.pestana'), function (boton) {
      boton.addEventListener('click', function () { cambiarVista(boton.dataset.vista); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.js-cerrar'), function (boton) {
      boton.addEventListener('click', cerrarHojas);
    });
    $('fondo-modal').addEventListener('click', cerrarHojas);
    $('formulario-reserva').addEventListener('submit', enviarReserva);
    $('btn-buscar-codigo').addEventListener('click', buscarPorCodigo);
    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape') cerrarHojas();
    });

    cargarDisponibilidad();
  });

})();
