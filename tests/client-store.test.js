const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClientStore, MODULE_KEYS, publicClient } = require('../lib/client-store');

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

test('identifiants propres au CRM, conservation, remplacement et retrait explicite', (t) => {
  const store = temporaryStore(t);
  const client = store.create({ nom: 'Test', crmExistant: 'hubspot',
    credentials: { hubspotToken: 'fake-A' } });
  assert.equal(publicClient(client).credentialsConfigured, true);
  assert.equal(JSON.stringify(publicClient(client)).includes('fake-A'), false);
  store.update(client.id, { credentials: { hubspotToken: '' } });
  assert.equal(store.get(client.id).credentials.hubspotToken, 'fake-A');
  store.update(client.id, { credits: { solde: 12 } });
  assert.equal(store.get(client.id).credentials.hubspotToken, 'fake-A');
  assert.throws(() => store.update(client.id, { credentials: { odooPassword: 'non' } }), { status: 400 });
  assert.equal(store.get(client.id).credentials.hubspotToken, 'fake-A');
  store.update(client.id, { crmExistant: 'odoo', credentials: {
    odooUrl: 'https://odoo.example.com', odooDb: 'exemple',
    odooUsername: 'test', odooPassword: 'fake-O',
  } });
  assert.equal(store.get(client.id).credentials.hubspotToken, undefined);
  assert.equal(publicClient(store.get(client.id)).credentialsConfigured, true);
  assert.throws(() => store.update(client.id, { credentials: { odooUrl: 'http://localhost' } }), { status: 400 });
  assert.throws(() => store.update(client.id, {
    credentials: { odooUrl: 'https://attacker.example.net' },
  }), /ressaisir tous les identifiants/);
  assert.equal(store.get(client.id).credentials.odooUrl, 'https://odoo.example.com');
  store.update(client.id, { credentials: {
    odooUrl: 'https://new-odoo.example.net', odooDb: 'new',
    odooUsername: 'new-user', odooPassword: 'new-pass',
  } });
  assert.equal(store.get(client.id).credentials.odooPassword, 'new-pass');
  store.clearCredentials(client.id);
  assert.deepEqual(store.get(client.id).credentials, {});
  assert.equal(store.get(client.id).credits.solde, 12);
});

test('migration unique eTeamsys : sauvegarde et aucun autre profil touché', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-migration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'clients.json');
  const store = createClientStore(file);
  const other = store.create({ nom: 'Autre', crmExistant: 'hubspot' });
  const target = store.create({ nom: 'eTeamsys', crmExistant: 'hubspot' });
  const before = fs.readFileSync(file, 'utf8');
  const existingBackup = `${file}.backup-existing.json`;
  fs.writeFileSync(existingBackup, 'à préserver');
  assert.equal(store.migrateEteamsysHubspotCredential('fake-migration'), true);
  assert.equal(store.get(other.id).credentials.hubspotToken, undefined);
  assert.equal(store.get(target.id).credentials.hubspotToken, 'fake-migration');
  assert.equal(JSON.stringify(publicClient(store.get(target.id))).includes('fake-migration'), false);
  const backups = () => fs.readdirSync(dir).filter((name) => name.includes('.backup-'));
  assert.equal(backups().length, 2);
  assert.equal(fs.readFileSync(existingBackup, 'utf8'), 'à préserver');
  assert.ok(backups().some((name) => fs.readFileSync(path.join(dir, name), 'utf8') === before));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  store.clearCredentials(target.id);
  assert.equal(store.migrateEteamsysHubspotCredential('fake-migration'), false);
  assert.equal(store.get(target.id).credentials.hubspotToken, undefined);
  assert.equal(backups().length, 2);
  fs.writeFileSync(file, '{invalide');
  assert.throws(() => store.migrateEteamsysHubspotCredential('fake-migration'), { status: 500 });
  assert.equal(fs.readFileSync(file, 'utf8'), '{invalide');
});

test('migration ambiguë ne modifie aucun profil', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-ambiguous-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'clients.json');
  const store = createClientStore(file);
  store.create({ nom: 'eTeamsys', crmExistant: 'hubspot' });
  store.create({ nom: 'eTeamsys', crmExistant: 'hubspot' });
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => store.migrateEteamsysHubspotCredential('fake'), { status: 500 });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('échec de sauvegarde : aucun jeton n’est écrit dans les profils', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-backup-failure-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'clients.json');
  const store = createClientStore(file);
  store.create({ nom: 'eTeamsys', crmExistant: 'hubspot' });
  const before = fs.readFileSync(file, 'utf8');
  const write = fs.writeFileSync;
  fs.writeFileSync = function (target, ...args) {
    if (String(target).includes('.backup-')) throw Object.assign(new Error('stockage indisponible'), { code: 'EACCES' });
    return write.call(this, target, ...args);
  };
  try {
    assert.throws(() => store.migrateEteamsysHubspotCredential('fake-global'), { status: 500 });
  } finally {
    fs.writeFileSync = write;
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('jeton eTeamsys déjà configuré : retrait ne réimporte jamais le secret global', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-already-configured-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createClientStore(path.join(dir, 'clients.json'));
  const target = store.create({ nom: 'eTeamsys', crmExistant: 'hubspot',
    credentials: { hubspotToken: 'fake-manual' } });
  assert.equal(store.migrateEteamsysHubspotCredential('fake-global'), false);
  assert.equal(store.get(target.id).credentials.hubspotToken, 'fake-manual');
  store.clearCredentials(target.id);
  assert.equal(store.migrateEteamsysHubspotCredential('fake-global'), false);
  assert.equal(store.get(target.id).credentials.hubspotToken, undefined);
});