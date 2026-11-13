// Barra de actualización: tinyjs comprueba el manifest al arrancar
// ("auto": "launch" en tinyjs.json) y avisa con 'update-available'.

import { $ } from '../lib/util.js';

export function initUpdate() {
  tiny.api.on('update-available', ({ latest } = {}) => {
    $('updateVer').textContent = latest ? latest : '';
    $('updateBar').hidden = false;
  });

  $('updateInstall').addEventListener('click', async () => {
    const btn = $('updateInstall');
    btn.disabled = true;
    btn.textContent = 'Actualizando…';
    $('updateErr').hidden = true;
    try {
      await tiny.app.update.install();   // verifica sha256, sustituye y reinicia
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Reintentar';
      $('updateErr').textContent = '· No se pudo actualizar: ' + (e?.message || e);
      $('updateErr').hidden = false;
    }
  });
}
