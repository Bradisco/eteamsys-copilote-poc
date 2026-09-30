const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server-fixture');

test('deux profils HubSpot utilisent uniquement leurs propres identifiants', async (t) => {
  const { base, hubspot, store } = await startServer(t, { mockHubspot: true });
  const second = store.create({ nom: 'HubSpot B', crmExistant: 'hubspot',
    credentials: { hubspotToken: 'fake-B' } });
  store.update(hubspot.id, { credentials: { hubspotToken: 'fake-A' } });
  const overview = async (id) => (await (await fetch(`${base}/api/overview?clientId=${id}`)).json());
  const a = await overview(hubspot.id);
  const b = await overview(second.id);
  assert.equal(a.demoMode, false);
  assert.equal(b.demoMode, false);
  assert.equal(a.lifecycle[0].count, 11);
  assert.equal(b.lifecycle[0].count, 22);
  const contacts = async (id) => (await (await fetch(`${base}/api/contacts?clientId=${id}`)).json());
  assert.equal((await contacts(hubspot.id)).items[0].nom, 'Compte 11');
  assert.equal((await contacts(second.id)).items[0].nom, 'Compte 22');
  assert.equal((await (await fetch(`${base}/api/transactions?clientId=${second.id}`)).json()).funnel[0].count, 22);
  assert.equal((await (await fetch(`${base}/api/email-reminders?clientId=${hubspot.id}`)).json()).counters[0].count, 11);
  const copilot = await fetch(`${base}/api/copilot/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: second.id, question: 'Pipeline ?' }),
  });
  assert.equal(copilot.status, 200);
  const answer = (await copilot.json()).answer;
  assert.match(answer, /22/);
  assert.doesNotMatch(answer, /11/);
  assert.match(b.note, /ce profil/);
  assert.doesNotMatch(b.sourceLabel, /eTeamsys/);
  const legacy = await (await fetch(`${base}/api/overview?source=hubspot`)).json();
  assert.equal(legacy.demoMode, true);
  const listed = await (await fetch(`${base}/api/admin/clients`)).text();
  assert.equal(listed.includes('fake-A'), false);
  assert.equal(listed.includes('fake-B'), false);
});

test('sans identifiants ni client reconnu, aucune connexion LIVE n’est réutilisée', async (t) => {
  const { base, hubspot } = await startServer(t, { mockHubspot: true });
  const demo = await (await fetch(`${base}/api/overview?clientId=${hubspot.id}`)).json();
  assert.equal(demo.demoMode, true);
  assert.equal(demo.sourceLabel, 'HubSpot — instantané de référence (mode démo)');
  assert.match(demo.note, /eTeamsys/);
  assert.equal((await (await fetch(`${base}/api/contacts?source=hubspot`)).json()).demoMode, true);
  assert.equal((await fetch(`${base}/api/overview?clientId=absent`)).status, 404);
});

test('les accès Odoo utilisent la configuration de chaque profil', async (t) => {
  const { base, odoo, store } = await startServer(t, { mockOdoo: true });
  const makeCredentials = (letter) => ({
    odooUrl: `https://tenant-${letter}.example.net`, odooDb: `db-${letter}`,
    odooUsername: `user-${letter}`, odooPassword: letter === 'a' ? 'fake-OA' : 'fake-OB',
  });
  store.update(odoo.id, { credentials: makeCredentials('a') });
  const other = store.create({ nom: 'Odoo B', crmExistant: 'odoo',
    credentials: makeCredentials('b') });
  for (const [client, count] of [[odoo, 31], [other, 42]]) {
    const overviewResponse = await fetch(`${base}/api/overview?clientId=${client.id}`);
    assert.equal(overviewResponse.status, 200);
    const overview = await overviewResponse.json();
    assert.equal(overview.demoMode, false);
    assert.equal(overview.lifecycle[0].count, count);
    const directory = await (await fetch(`${base}/api/contacts?clientId=${client.id}`)).json();
    assert.equal(directory.items[0].nom, `Compte ${count}`);
  }
  assert.equal((await (await fetch(`${base}/api/overview?source=odoo`)).json()).demoMode, true);
});