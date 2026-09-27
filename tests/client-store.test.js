const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClientStore, MODULE_KEYS } = require('../lib/client-store');

function temporaryStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-clients-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return createClientStore(path.join(dir, 'clients.json'));
}

test('profils persistants avec réglages et crédits distincts', (t) => {
  const store = temporaryStore(t);
  const a = store.create({ nom: 'Atelier fictif' });
  const b = store.create({ nom: 'Agence fictive', crmExistant: 'hubspot' });
  assert.equal(a.credits.solde, 20);
  assert.equal(a.modules.contacts, 'actif');
  assert.equal(a.modules.tableauxDeBord, 'demo');
  assert.deepEqual(Object.keys(a.modules).sort(), [...MODULE_KEYS].sort());
  store.charge(a.id, 'question');
  assert.equal(store.get(a.id).credits.solde, 19);
  assert.equal(store.get(b.id).credits.solde, 20);
  const adjusted = store.update(a.id, { credits: { solde: 2 }, consultantReferent: 'Marine' });
  assert.equal(adjusted.credits.historique.at(-1).type, 'ajustement-admin');
  assert.equal(store.recharge(a.id).credits.solde, 22);
  assert.equal(store.list().length, 2);
  assert.equal(store.remove(a.id).id, a.id);
  assert.equal(store.list().length, 1);
});

test('champs invalides rejetés sans altérer le profil', (t) => {
  const store = temporaryStore(t);
  const client = store.create({ nom: 'Essai' });
  for (const change of [
    { secteur: 'inconnu' }, { crmExistant: 'salesforce' },
    { modules: { contacts: 'bloqué' } }, { statut: 'archivé' },
    { credits: { solde: -1 } }
  ]) assert.throws(() => store.update(client.id, change), { status: 400 });
  assert.equal(store.get(client.id).credits.solde, 20);
  assert.equal(store.get(client.id).crmExistant, 'aucun');
  assert.throws(() => store.get('absent'), { status: 404 });
});

test('solde épuisé et fichier corrompu échouent explicitement', (t) => {
  const store = temporaryStore(t);
  const client = store.create({ nom: 'Essai', credits: { solde: 1 } });
  store.charge(client.id, 'question');
  assert.throws(() => store.charge(client.id, 'question'), { status: 409 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-corrupt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'clients.json');
  fs.writeFileSync(file, '{invalide');
  assert.throws(() => createClientStore(file).list(), { status: 500 });
  assert.equal(fs.readFileSync(file, 'utf8'), '{invalide');
});