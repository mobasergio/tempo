import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, cleanSettings, cleanHotkey, resolveLang, effectiveLang } from '../src/shared/settings.js';

test('cleanSettings: defaults y valores inválidos', () => {
  assert.deepEqual(cleanSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(cleanSettings({ theme: 'neon', lang: 'fr', sysLang: 'de', notifySound: 'yes', extra: 1 }), DEFAULT_SETTINGS);
  const s = cleanSettings({ theme: 'light', lang: 'en', sysLang: 'en', notifySound: false, hotkey: 'Alt+Ctrl+T' });
  assert.deepEqual(s, { theme: 'light', lang: 'en', sysLang: 'en', notifySound: false, hotkey: 'ctrl+alt+t' });
});

test('cleanHotkey', () => {
  assert.equal(cleanHotkey('ctrl+alt+t'), 'ctrl+alt+t');
  assert.equal(cleanHotkey('Shift + Cmd + K'), 'shift+cmd+k');
  assert.equal(cleanHotkey('ctrl+F12'), 'ctrl+f12');
  assert.equal(cleanHotkey('shift+a'), '');      // Mayús sola no basta
  assert.equal(cleanHotkey('t'), '');
  assert.equal(cleanHotkey('ctrl+alt'), '');
  assert.equal(cleanHotkey('ctrl+a+b'), '');
  assert.equal(cleanHotkey('ctrl+f25'), '');
  assert.equal(cleanHotkey(null), '');
});

test('resolveLang', () => {
  assert.equal(resolveLang(['en-US', 'es']), 'en');
  assert.equal(resolveLang(['fr-FR', 'es-ES']), 'es');
  assert.equal(resolveLang(['fr']), 'es');
  assert.equal(resolveLang(undefined), 'es');
});

test('effectiveLang: preferencia forzada, sistema en la página y en el backend', () => {
  assert.equal(effectiveLang({ lang: 'en', sysLang: 'es' }, ['es-ES']), 'en');
  assert.equal(effectiveLang({ lang: 'system', sysLang: 'es' }, ['en-GB']), 'en');
  assert.equal(effectiveLang({ lang: 'system', sysLang: 'en' }), 'en');
});
