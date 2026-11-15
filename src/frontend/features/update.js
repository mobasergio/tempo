// Barra de actualización: tinyjs comprueba el manifest al arrancar
// ("auto": "launch" en tinyjs.json) y avisa con 'update-available'.

import { $ } from '../lib/util.js';

export function initUpdate({ t }) {
  tiny.api.on('update-available', ({ latest } = {}) => {
    $('updateMsg').textContent = t('update.available', { ver: latest || '' }).replace(/\s+/g, ' ');
    $('updateBar').hidden = false;
  });

  $('updateInstall').addEventListener('click', async () => {
    const btn = $('updateInstall');
    btn.disabled = true;
    btn.textContent = t('update.installing');
    $('updateErr').hidden = true;
    try {
      await tiny.app.update.install();   // verifica sha256, sustituye y reinicia
    } catch (e) {
      btn.disabled = false;
      btn.textContent = t('update.retry');
      $('updateErr').textContent = t('update.failed', { msg: e?.message || e });
      $('updateErr').hidden = false;
    }
  });
}
