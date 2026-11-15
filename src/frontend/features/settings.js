// Ajustes (modal): general y apariencia. Los valores viven en el
// backend; aquí solo se muestran y se piden los cambios.

import { $ } from '../lib/util.js';
import { applyTheme } from '../lib/theme.js';
import { createDialog } from '../lib/dialog.js';
import { cleanHotkey } from '../../shared/settings.js';

const isMac = tiny.system.isMacOS();
const KEY_LABEL = { ctrl: 'Ctrl', alt: isMac ? '⌥' : 'Alt', shift: isMac ? '⇧' : 'Mayús', cmd: '⌘', space: 'Space' };

/** 'ctrl+alt+t' → 'Ctrl + Alt + T' */
function hotkeyLabel(combo, t) {
  if (!combo) return t('settings.hotkeyNone');
  return combo.split('+').map((p) => KEY_LABEL[p] || p.toUpperCase()).join(isMac ? '' : ' + ');
}

/** Combinación a partir de una pulsación ('' si solo hay modificadores). */
function comboFromEvent(e) {
  const c = e.code || '';
  const key = /^Key[A-Z]$/.test(c) ? c.slice(3).toLowerCase()
    : /^Digit\d$/.test(c) ? c.slice(5)
    : /^F\d{1,2}$/.test(c) ? c.toLowerCase()
    : c === 'Space' ? 'space' : '';
  if (!key) return '';
  const mods = [];
  if (e.ctrlKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');
  if (e.metaKey && isMac) mods.push('cmd');   // en Windows "cmd" significa Ctrl
  return [...mods, key].join('+');
}

export function initSettings(ctx, initial) {
  const { t } = ctx;
  let s = initial.settings;
  let widgetOn = !!initial.widget;
  let launch = initial.launchAtLogin || 'unsupported';
  let recording = false;
  let hotkeyErr = '';

  const scrim = $('settings');

  // ── Abrir / cerrar ──

  const dlg = createDialog(ctx, scrim, {
    canClose: () => !recording,
    onOpen() {
      paint();
      // por si cambió desde la bandeja o en el sistema
      tiny.api.call('getSettings').then((st) => {
        if (!st) return;
        s = st.settings;
        widgetOn = !!st.widget;
        launch = st.launchAtLogin;
        paint();
      }).catch(() => {});
    },
    onClose: () => stopRecording(),
  });
  $('settingsBtn').addEventListener('click', dlg.open);
  $('settingsClose').addEventListener('click', dlg.close);

  // ── Pintar ──

  function paintSeg(id, value) {
    for (const b of $(id).children) b.setAttribute('aria-pressed', b.dataset.value === value);
  }

  function paint() {
    paintSeg('setTheme', s.theme);
    paintSeg('setLang', s.lang);
    $('setSound').checked = s.notifySound;
    $('setPopup').checked = s.notifyPopup;
    $('setWidget').checked = widgetOn;

    const unsupported = launch === 'unsupported';
    $('setLaunch').checked = launch === 'enabled' || launch === 'requires-approval';
    $('setLaunch').disabled = unsupported;
    $('setLaunch').closest('.setting-row').classList.toggle('disabled', unsupported);
    $('launchHint').textContent = t(unsupported ? 'settings.launchUnsupported'
      : launch === 'requires-approval' ? 'settings.launchApproval' : 'settings.launchHint');

    const hk = $('setHotkey');
    hk.textContent = recording ? t('settings.hotkeyRecord') : hotkeyLabel(s.hotkey, t);
    hk.classList.toggle('recording', recording);
    hk.classList.toggle('empty', !recording && !s.hotkey);
    $('clearHotkey').hidden = !s.hotkey || recording;
    $('hotkeyHint').textContent = hotkeyErr || t('settings.hotkeyHint');
    $('hotkeyHint').classList.toggle('err', !!hotkeyErr);
  }

  async function update(patch) {
    try {
      s = await tiny.api.call('setSettings', patch);
      hotkeyErr = '';
    } catch (e) {
      if ('hotkey' in patch) hotkeyErr = String(e.message || e);
      console.error('setSettings', e);
    }
    paint();
  }

  // ── Controles ──

  for (const b of $('setTheme').children) {
    b.addEventListener('click', () => {
      applyTheme(b.dataset.value);   // inmediato, sin esperar al backend
      update({ theme: b.dataset.value });
    });
  }
  // El cambio de idioma recarga la página (lib/i18n.js) al llegar 'settings'.
  for (const b of $('setLang').children) {
    b.addEventListener('click', () => update({ lang: b.dataset.value }));
  }
  $('setSound').addEventListener('change', (e) => update({ notifySound: e.target.checked }));
  $('setPopup').addEventListener('change', (e) => update({ notifyPopup: e.target.checked }));

  $('setWidget').addEventListener('change', async (e) => {
    try {
      const st = await tiny.api.call('setWidget', { on: e.target.checked });
      widgetOn = !!(st && st.on);
    } catch (err) { console.error('setWidget', err); }
    paint();
  });
  tiny.api.on('widget', (st) => {
    if (st && typeof st.on === 'boolean') { widgetOn = st.on; if (!scrim.hidden) paint(); }
  });

  $('setLaunch').addEventListener('change', async (e) => {
    try { launch = await tiny.api.call('setLaunchAtLogin', { on: e.target.checked }); } catch {}
    paint();
  });

  // ── Atajo global: clic y pulsar la combinación ──

  function stopRecording() {
    if (!recording) return;
    recording = false;
    paint();
  }

  $('setHotkey').addEventListener('click', () => {
    recording = !recording;
    hotkeyErr = '';
    paint();
  });
  $('setHotkey').addEventListener('blur', stopRecording);
  $('setHotkey').addEventListener('keydown', (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') return stopRecording();
    const combo = comboFromEvent(e);
    if (!combo) return;                 // aún solo modificadores
    recording = false;
    if (!cleanHotkey(combo)) {
      hotkeyErr = t('settings.hotkeyInvalid');
      paint();
      return;
    }
    update({ hotkey: combo });
  });
  $('clearHotkey').addEventListener('click', () => update({ hotkey: '' }));

  tiny.api.on('settings', (next) => {
    if (!next) return;
    s = next;
    applyTheme(s.theme);
    if (!scrim.hidden) paint();
  });

  applyTheme(s.theme);
}
