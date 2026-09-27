const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { readImportRows } = require('../lib/crm-import');

test('CSV UTF-8 sans BOM : en-têtes français préservés', () => {
  const csv = 'Nom,Société,E-mail,Téléphone\nEssai,Bureau fictif,import@example.com,0102030405\n';
  const rows = readImportRows(Buffer.from(csv, 'utf8'), 'exemple.csv', XLSX);
  assert.equal(rows[0]['Société'], 'Bureau fictif');
  assert.ok(Object.hasOwn(rows[0], 'Téléphone'));
});

test('CSV Windows-1252 : en-têtes français préservés', () => {
  const csv = Buffer.from([
    ...Buffer.from('Nom,Soci'), 0xe9, ...Buffer.from('t'), 0xe9,
    ...Buffer.from(',E-mail\nEssai,Bureau fictif,import@example.com\n'),
  ]);
  const rows = readImportRows(csv, 'exemple.csv', XLSX);
  assert.equal(rows[0]['Société'], 'Bureau fictif');
});