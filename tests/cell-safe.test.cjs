/**
 * FILE: cell-safe.test.cjs — typed text must never become a Sheets formula.
 * DESC: Exercises _cellSafe_ (DaoSheets.js), the one gate every write goes through.
 * AUTH: Andre Cavalcante
 * DATE: October, 2026
 * LICENCE: GPL-v3
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'DaoSheets.js'), 'utf8'), context);
const cellSafe = context._cellSafe_;

test('texto com cara de fórmula vira texto', () => {
  assert.equal(cellSafe('=JOIN(";";Students!A2:E99)'), '\'=JOIN(";";Students!A2:E99)');
  assert.equal(cellSafe('+55 92 98129-2772'), "'+55 92 98129-2772");
  assert.equal(cellSafe('- item de lista'), "'- item de lista");
  assert.equal(cellSafe('@alguem'), "'@alguem");
});

test('o resto passa intacto', () => {
  assert.equal(cellSafe('Título normal'), 'Título normal');
  assert.equal(cellSafe("'2026.1"), "'2026.1");
  assert.equal(cellSafe('2026-10-14T02:01:27.971Z'), '2026-10-14T02:01:27.971Z');
  assert.equal(cellSafe(''), '');
  assert.equal(cellSafe(-3), -3);
  assert.equal(cellSafe(true), true);
  const d = new Date();
  assert.equal(cellSafe(d), d);
});
