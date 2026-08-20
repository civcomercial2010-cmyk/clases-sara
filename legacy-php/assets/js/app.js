/* ============================================================
   Autoescuela Sara — JavaScript principal
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  // ── Utilidades ─────────────────────────────────────────────
  function getCsrfToken() {
    var m = document.querySelector('meta[name="csrf-token"]');
    if (m) return m.content;
    // Fallback: buscar en cualquier input hidden de la página
    var el = document.querySelector('input[name="csrf_token"]');
    return el ? el.value : '';
  }

  function mostrarModal(id) {
    document.getElementById(id).classList.remove('hidden');
    var bd = document.getElementById('modal-backdrop');
    if (bd) bd.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function cerrarModales() {
    document.querySelectorAll('.modal').forEach(function (m) { m.classList.add('hidden'); });
    var bd = document.getElementById('modal-backdrop');
    if (bd) bd.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Cerrar modal al pulsar backdrop o botón cancelar
  var backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.addEventListener('click', cerrarModales);
  document.querySelectorAll('.js-cerrar-modal').forEach(function (btn) {
    btn.addEventListener('click', cerrarModales);
  });

  // ── Modal de reserva (alumno) ───────────────────────────────
  document.querySelectorAll('.js-abrir-reserva').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var fecha = btn.dataset.fecha;
      var hi    = btn.dataset.hi;
      var hf    = btn.dataset.hf;

      // Formatear fecha en texto legible
      var diasES = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
      var mesesES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      var partes = fecha.split('-');
      var d = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
      var diaSem = d.getDay() === 0 ? 7 : d.getDay();
      var fechaTexto = diasES[diaSem] + ', ' + parseInt(partes[2]) + ' de ' + mesesES[parseInt(partes[1])] + ' de ' + partes[0];
      var horaTexto = hi.substring(0, 5) + ' – ' + hf.substring(0, 5);

      document.getElementById('modal-fecha-txt').textContent = fechaTexto;
      document.getElementById('modal-hora-txt').textContent  = horaTexto;
      document.getElementById('modal-fecha').value = fecha;
      document.getElementById('modal-hi').value    = hi;
      document.getElementById('modal-hf').value    = hf;

      mostrarModal('modal-reserva');
    });
  });

  // ── Modal de cancelación (alumno) ──────────────────────────
  document.querySelectorAll('.js-cancelar-reserva').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var reservaId = btn.dataset.id;
      var fecha     = btn.dataset.fecha;
      var hora      = btn.dataset.hora;

      document.getElementById('cancel-fecha-txt').textContent   = fecha;
      document.getElementById('cancel-hora-txt').textContent    = hora;
      document.getElementById('cancel-reserva-id').value        = reservaId;

      // Comprobar si la cancelación es tardía (< 24h)
      // Calculado en servidor, pero podemos mostrar el aviso siempre al cancelar
      // como medida preventiva:
      var avisoTardia = document.getElementById('aviso-cancelacion-tardia');
      if (avisoTardia) {
        // Calcular horas restantes
        var ahora = new Date();
        var partesFecha = fecha.match(/(\d+)/g); // puede ser "lunes, 5 de junio de 2026"
        // Si el dataset tiene fecha en formato Y-m-d usaríamos eso,
        // pero aquí tenemos el texto formateado. Mostramos el aviso por defecto.
        avisoTardia.classList.remove('hidden');
      }

      mostrarModal('modal-cancelar');
    });
  });

  // ── Modal de bloqueo (admin) ────────────────────────────────
  document.querySelectorAll('.js-abrir-bloquear').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.getElementById('bloquear-fecha').value = btn.dataset.fecha;
      document.getElementById('bloquear-hi').value    = btn.dataset.hi;
      document.getElementById('bloquear-hf').value    = btn.dataset.hf;
      mostrarModal('modal-bloquear');
    });
  });

  // ── Resolver BASE_URL para AJAX (se define antes de los handlers) ─
  window.ADMIN_AJAX_URL = (function () {
    var base = document.querySelector('meta[name="base-url"]');
    return base ? base.content + '/admin/ajax.php' : '/admin/ajax.php';
  })();

  // ── Acciones de reserva con AJAX (admin) ───────────────────
  document.querySelectorAll('.js-accion-reserva').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var reservaId = parseInt(btn.dataset.id);
      var accion    = btn.dataset.accion; // 'confirmar' | 'rechazar'

      if (!confirm(accion === 'confirmar' ? '¿Confirmar esta reserva?' : '¿Rechazar esta reserva?')) return;

      var nota = null;
      if (accion === 'rechazar') {
        nota = prompt('Motivo del rechazo (opcional, se enviará al alumno):') || null;
      }

      btn.disabled = true;
      btn.textContent = '...';

      fetch(window.ADMIN_AJAX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion:      accion,
          reserva_id:  reservaId,
          nota:        nota,
          csrf_token:  getCsrfToken()
        })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          var fila = btn.closest('tr') || btn.closest('.cal-slot');
          if (fila) {
            fila.style.opacity = '.4';
            setTimeout(function () { location.reload(); }, 600);
          } else {
            location.reload();
          }
        } else {
          alert('Error: ' + (data.error || 'Inténtalo de nuevo'));
          btn.disabled = false;
          btn.textContent = accion === 'confirmar' ? 'Confirmar' : 'Rechazar';
        }
      })
      .catch(function () {
        alert('Error de red. Recarga la página.');
        btn.disabled = false;
      });
    });
  });

  // ── Copiar enlace de alumno ─────────────────────────────────
  document.querySelectorAll('.js-copiar-enlace').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var url = btn.dataset.url;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          var orig = btn.textContent;
          btn.textContent = '✓ Copiado';
          setTimeout(function () { btn.textContent = orig; }, 2000);
        });
      } else {
        // Fallback para navegadores antiguos
        var el = document.createElement('textarea');
        el.value = url;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        var orig = btn.textContent;
        btn.textContent = '✓ Copiado';
        setTimeout(function () { btn.textContent = orig; }, 2000);
      }
    });
  });

  // ── Mensaje flash de sesión ─────────────────────────────────
  // Se gestiona en PHP, pero si hay un div#flash-message lo mostramos brevemente
  var flash = document.querySelector('.flash-message');
  if (flash) {
    setTimeout(function () {
      flash.style.transition = 'opacity .5s';
      flash.style.opacity = '0';
      setTimeout(function () { flash.remove(); }, 600);
    }, 4000);
  }


});
