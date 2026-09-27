const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { escapeHtml } = require('../public/escape-html.js');

test('navigation et copilote présents', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const js = fs.readFileSync('public/app.js', 'utf8');
  assert.match(html, /id="sideNav"/);
  assert.match(html, /id="mainContent"/);
  assert.match(html, /id="copilotPanel"/);
  for (const name of ['Contacts', 'Entreprises', 'Transactions', 'Tableaux de bord']) {
    assert.ok(js.includes(name));
  }
  assert.ok(js.indexOf('Contacts') < js.indexOf('Entreprises'));
  assert.ok(js.indexOf('Entreprises') < js.indexOf('Transactions'));
});

test('les données externes ne deviennent pas du HTML', () => {
  assert.equal(escapeHtml('"><img src=x onerror=alert(1)>'), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
});

test('assistant en simulation avec actions futures désactivées', () => {
  const js = fs.readFileSync('public/copilot-ui.js', 'utf8');
  assert.match(js, /Résumé/);
  assert.match(js, /Comment faire/);
  assert.match(js, /Bientôt disponible/);
  assert.match(js, /Recharger \(simulation\)/);
});