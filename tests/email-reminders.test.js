const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildBasicReminders } = require('../lib/email-reminders');
const { startServer } = require('./helpers/server-fixture');
const { escapeHtml } = require('../public/escape-html');

test('même règle de sept jours, avec et sans e-mail ni date connue', () => {
  const items = buildBasicReminders([
    { nom: 'A', statut: 'lead', email: '', derniereRelance: null },
    { nom: 'B', statut: 'qualifie', email: 'b@example.com', derniereRelance: '2026-09-01' },
    { nom: 'C', statut: 'client', email: 'c@example.com', derniereRelance: null },
    { nom: 'D', statut: 'lead', derniereRelance: '2026-09-21' },
  ], '2026-09-21');
  assert.deepEqual(items.map((item) => item.nom), ['A', 'B']);
  assert.equal(items[0].dernierContact, null);
  assert.equal(items[0].email, '');
});

test('CRM basique nominatif ; HubSpot/Odoo uniquement les compteurs existants', async (t) => {
  const { base, active, disabled, hubspot, odoo, readCrm } = await startServer(t);
  const basic = await (await fetch(`${base}/api/email-reminders?clientId=${active.id}`)).json();
  assert.ok(basic.items.length);
  assert.deepEqual(basic.counters, []);
  const overview = await (await fetch(`${base}/api/overview?clientId=${active.id}`)).json();
  assert.equal(basic.items.length, overview.relanceItems[0].count);
  assert.equal((await fetch(`${base}/api/email-reminders?clientId=${disabled.id}`)).status, 403);
  assert.equal((await fetch(`${base}/api/email-reminders?clientId=inconnu`)).status, 404);
  for (const client of [hubspot, odoo]) {
    const data = await (await fetch(`${base}/api/email-reminders?clientId=${client.id}`)).json();
    const reference = await (await fetch(`${base}/api/overview?clientId=${client.id}`)).json();
    assert.deepEqual(data.items, []);
    assert.deepEqual(data.counters, reference.relanceItems);
    assert.match(data.note, /indisponibles/);
  }
  assert.equal(readCrm().contacts.length, 5);
});

test('contact sans e-mail : présent, sans action mailto ni HTML injecté', () => {
  const main = { innerHTML: '' };
  const context = { window: {}, document: { getElementById: () => main }, esc: escapeHtml, fmtNum: String, encodeURIComponent };
  vm.runInNewContext(fs.readFileSync('public/reminders-view.js', 'utf8'), context);
  context.window.RemindersView.render({
    source: 'crm-basique', demoMode: true, note: 'Exemple', asOf: '2026-09-28',
    items: [{ nom: '<img>', email: '', dernierContact: null, raison: 'Aucune relance enregistrée' }], counters: [],
  });
  assert.match(main.innerHTML, /&lt;img&gt;/);
  assert.match(main.innerHTML, /Non renseigné/);
  assert.doesNotMatch(main.innerHTML, /mailto:/);
});