const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { landingPagesForSource } = require('../lib/landing-pages');
const { startServer } = require('./helpers/server-fixture');
const { escapeHtml } = require('../public/escape-html');

test('pages fictives distinctes par source et partagées par CRM basique', () => {
  const basic = { landingPages: [{ titre: 'Exemple', url: 'https://example.com/a', statut: 'publie', date: '2026-09-28' }] };
  assert.equal(landingPagesForSource('crm-basique', basic).demoMode, true);
  assert.deepEqual(landingPagesForSource('crm-basique', basic).items, basic.landingPages);
  assert.notDeepEqual(landingPagesForSource('hubspot', basic).items, landingPagesForSource('odoo', basic).items);
});

test('ajout sans perte des données existantes, et [] préservé', async (t) => {
  const { base, active, demo, disabled, hubspot, odoo, readCrm, updateCrm, file } = await startServer(t);
  const before = readCrm();
  const response = await fetch(`${base}/api/landing-pages?clientId=${active.id}`);
  const pages = await response.json();
  assert.equal(response.status, 200);
  assert.equal(pages.demoMode, true);
  assert.ok(pages.items.length > 0);
  assert.deepEqual(readCrm().contacts, before.contacts);
  assert.deepEqual(readCrm().opportunities, before.opportunities);
  assert.deepEqual((await (await fetch(`${base}/api/landing-pages?clientId=${demo.id}`)).json()).items, pages.items);
  const saved = fs.readFileSync(file);
  const untouched = await fetch(`${base}/api/landing-pages?clientId=${active.id}`);
  assert.equal(untouched.status, 200);
  assert.deepEqual(fs.readFileSync(file), saved);
  updateCrm({ ...readCrm(), landingPages: [] });
  assert.deepEqual((await (await fetch(`${base}/api/landing-pages?clientId=${active.id}`)).json()).items, []);
  assert.equal((await fetch(`${base}/api/landing-pages?clientId=${disabled.id}`)).status, 403);
  for (const client of [hubspot, odoo]) {
    const data = await (await fetch(`${base}/api/landing-pages?clientId=${client.id}`)).json();
    assert.equal(data.demoMode, true);
    assert.ok(data.items.every((item) => item.url.startsWith('https://example.com/')));
  }
});

test('URL dangereuse non cliquable, titres échappés et brouillon sans lien', () => {
  const main = { innerHTML: '' };
  const context = { window: {}, document: { getElementById: () => main }, esc: escapeHtml, URL };
  vm.runInNewContext(fs.readFileSync('public/landing-pages-view.js', 'utf8'), context);
  assert.equal(context.window.LandingPagesView.safeUrl('javascript:alert(1)'), null);
  context.window.LandingPagesView.render({
    note: 'Exemple', items: [
      { titre: '<img src=x>', url: 'javascript:alert(1)', statut: 'publie', date: '2026-09-28' },
      { titre: 'Brouillon', url: 'https://example.com/b', statut: 'brouillon', date: '2026-09-28' },
    ],
  });
  assert.match(main.innerHTML, /&lt;img src=x&gt;/);
  assert.doesNotMatch(main.innerHTML, /href="javascript:/);
  assert.doesNotMatch(main.innerHTML, /href="https:\/\/example.com\/b"/);
  assert.match(main.innerHTML, /DÉMO · données d’exemple/);
});