const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { STAGES, migrateOpportunities, summarizeOpportunities } = require('../lib/crm-transactions');
const { createCrmBasiqueStore } = require('../lib/crm-basique-store');
const { startServer, postJson } = require('./helpers/server-fixture');
const { escapeHtml } = require('../public/escape-html');

test('migration idempotente et cinq stades avec sommes', () => {
  const old = { contacts: [{ id: 'c1' }], extra: 'préservé', opportunities: [
    { id: 'o1', etape: 'qualifie', montant: 42, note: 'préservée' },
    { id: 'o2', etape: 'proposition', montant: null },
    { id: 'o3', etape: 'perdu', montant: 10 },
  ] };
  const migrated = migrateOpportunities(old);
  assert.equal(migrated.changed, true);
  assert.deepEqual(migrated.data.opportunities.map((row) => row.etape), ['initiation', 'offre-envoyee', 'perdu']);
  assert.equal(migrated.data.extra, old.extra);
  assert.equal(migrated.data.opportunities[0].note, 'préservée');
  assert.equal(migrateOpportunities(migrated.data).changed, false);
  assert.deepEqual(STAGES.map((stage) => stage.id), ['initiation', 'offre-envoyee', 'negociation', 'gagne', 'perdu']);
  const funnel = summarizeOpportunities(migrated.data.opportunities);
  assert.equal(funnel.length, 5);
  assert.equal(funnel[0].amount, 42);
  assert.equal(funnel[1].hasAmount, false);
  assert.equal(funnel[4].amount, 10);
  assert.throws(() => migrateOpportunities({ contacts: [], opportunities: [{ etape: 'autre' }] }), /Étape inconnue/);
});

test('fichier invalide intact et sauvegardes non écrasées', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-migrate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const active = path.join(dir, 'crm-basique.json');
  const store = createCrmBasiqueStore(active, path.resolve('data/crm-basique.seed.json'));
  fs.writeFileSync(active, '{invalide');
  assert.throws(() => store.load(), /JSON.*invalide/);
  assert.equal(fs.readFileSync(active, 'utf8'), '{invalide');
  const old = JSON.stringify({ contacts: [], opportunities: [{ id: 'o1', etape: 'nouveau' }] });
  fs.writeFileSync(active, old);
  const existing = `${active}.backup-existing.json`;
  fs.writeFileSync(existing, 'à garder');
  assert.equal(store.load().opportunities[0].etape, 'initiation');
  assert.equal(fs.readFileSync(existing, 'utf8'), 'à garder');
  const backups = () => fs.readdirSync(dir).filter((name) => name.includes('.backup-'));
  assert.equal(backups().length, 2);
  assert.ok(backups().some((name) => fs.readFileSync(path.join(dir, name), 'utf8') === old));
  store.load();
  assert.equal(backups().length, 2);
});

test('création, changement de stade et refus des écritures non autorisées', async (t) => {
  const { base, active, demo, disabled, hubspot, odoo, readCrm, file } = await startServer(t);
  const basicGet = await fetch(`${base}/api/transactions?clientId=${active.id}`);
  const basic = await basicGet.json();
  assert.equal(basicGet.status, 200);
  assert.deepEqual(basic.funnel.map((stage) => stage.id), STAGES.map((stage) => stage.id));
  assert.equal(basic.items.length, 6);
  assert.equal(basic.canEdit, true);
  const created = await postJson(base, '/api/crm-basique/transactions', {
    clientId: active.id, contactId: 'c1', titre: 'Projet neuf', montant: 25,
  });
  assert.equal(created.status, 201);
  const row = await created.json();
  assert.equal(row.etape, 'initiation');
  assert.ok(row.creeLe);
  assert.equal((await (await fetch(`${base}/api/transactions?clientId=${demo.id}`)).json()).items.length, 7);
  const beforeDenied = fs.readFileSync(file);
  const denied = await postJson(base, `/api/crm-basique/transactions/${row.id}`, { clientId: demo.id, etape: 'gagne' }, 'PATCH');
  assert.equal(denied.status, 403);
  assert.deepEqual(fs.readFileSync(file), beforeDenied);
  for (const input of [
    { clientId: active.id, contactId: 'inconnu', titre: 'Projet' },
    { clientId: active.id, contactId: 'c1', titre: 'Projet', etape: 'autre' },
    { clientId: active.id, contactId: 'c1', titre: 'Projet', montant: -3 },
  ]) {
    const response = await postJson(base, '/api/crm-basique/transactions', input);
    assert.ok(response.status >= 400);
    assert.deepEqual(fs.readFileSync(file), beforeDenied);
  }
  assert.equal((await fetch(`${base}/api/transactions?clientId=${disabled.id}`)).status, 403);
  const updated = await postJson(base, `/api/crm-basique/transactions/${row.id}`, { clientId: active.id, etape: 'negociation' }, 'PATCH');
  assert.equal(updated.status, 200);
  assert.equal(readCrm().opportunities.find((item) => item.id === row.id).etape, 'negociation');
  for (const profile of [hubspot, odoo]) {
    const response = await fetch(`${base}/api/transactions?clientId=${profile.id}`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.canEdit, false);
    assert.deepEqual(payload.items, []);
    assert.ok(payload.funnel.length);
    assert.ok(payload.funnel.every((stage) => stage.hasAmount === false && !Object.hasOwn(stage, 'amount')));
    assert.equal((await postJson(base, '/api/crm-basique/transactions', {
      clientId: profile.id, contactId: 'c1', titre: 'Interdit',
    })).status, 403);
  }
});

test('vue : funnel cinq stades, contrôles seulement sur CRM actif et texte échappé', () => {
  const main = {
    innerHTML: '', querySelectorAll: () => [],
  };
  const form = { addEventListener() {} };
  const context = {
    window: {}, document: { getElementById: (id) => id === 'createTransaction' ? form : main },
    esc: escapeHtml, CAT: ['blue'], fmtNum: String, fmtEUR: (n) => `${n} €`,
  };
  vm.runInNewContext(fs.readFileSync('public/transaction-view.js', 'utf8'), context);
  const data = {
    source: 'crm-basique', demoMode: true, note: '<b>attention</b>',
    funnel: summarizeOpportunities([]),
    items: [{ id: 'a', titre: '<img src=x>', contactNom: 'Jean', montant: null, etape: 'initiation' }],
    contacts: [{ id: 'c1', nom: 'Jean' }], canEdit: true,
  };
  context.window.TransactionView.render(data, { id: 'p1' }, () => {});
  assert.match(main.innerHTML, /<form id="createTransaction"/);
  assert.match(main.innerHTML, /&lt;img src=x&gt;/);
  assert.ok(STAGES.every((stage) => main.innerHTML.includes(stage.label)));
  context.window.TransactionView.render({ ...data, canEdit: false }, { id: 'p2' }, () => {});
  assert.doesNotMatch(main.innerHTML, /<form id="createTransaction"/);
  assert.doesNotMatch(main.innerHTML, /stage-select/);
});