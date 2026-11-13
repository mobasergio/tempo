import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICTS, createT } from '../src/shared/i18n.js';

test('es y en tienen exactamente las mismas claves', () => {
  const es = Object.keys(DICTS.es).sort();
  const en = Object.keys(DICTS.en).sort();
  assert.deepEqual(en.filter((k) => !es.includes(k)), [], 'claves de en que no están en es');
  assert.deepEqual(es.filter((k) => !en.includes(k)), [], 'claves de es sin traducir');
});

test('los placeholders {x} coinciden entre idiomas', () => {
  const vars = (s) => (typeof s === 'string' ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort() : []);
  for (const k of Object.keys(DICTS.es)) assert.deepEqual(vars(DICTS.en[k]), vars(DICTS.es[k]), k);
});

test('los días son listas de 7', () => {
  for (const d of Object.values(DICTS)) {
    assert.equal(d['days.short'].length, 7);
    assert.equal(d['days.long'].length, 7);
  }
});

test('t: sustitución, idioma desconocido y clave inexistente', () => {
  const en = createT('en');
  assert.equal(en('notify.start', { title: 'Gym' }), 'Starting: Gym');
  assert.equal(en('widget.until', {}), 'until {time}');   // variable no dada: se deja
  assert.equal(createT('fr').lang, 'es');
  assert.equal(createT('fr')('tab.sched'), 'Horario');
  assert.equal(en('no.existe'), 'no.existe');
});

test('t.plural', () => {
  const es = createT('es');
  assert.equal(es.plural('todo.pending', 1), '1 pendiente');
  assert.equal(es.plural('todo.pending', 3), '3 pendientes');
  assert.equal(createT('en').plural('todo.pending', 2), '2 pending');
});
