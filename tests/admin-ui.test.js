const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('backoffice avec avertissement, table et formulaire', () => {
  const html = fs.readFileSync('public/admin.html', 'utf8');
  assert.match(html, /Outil interne/);
  assert.match(html, /id="clientForm"/);
  assert.match(html, /id="clientsTable"/);
  assert.match(html, /admin\.js/);
});