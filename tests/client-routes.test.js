const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { createClientStore } = require('../lib/client-store');
const { registerAdminRoutes, resolveClientSource } = require('../lib/client-routes');

test('clientId prime sur source et un inconnu ne se replie pas', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-client-routes-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createClientStore(path.join(dir, 'clients.json'));
  const client = store.create({ nom: 'Local' });
  assert.equal(resolveClientSource({ clientId: client.id, source: 'hubspot' }, store).source, 'crm-basique');
  assert.throws(() => resolveClientSource({ clientId: 'absent', source: 'hubspot' }, store), { status: 404 });
  assert.equal(resolveClientSource({ source: 'odoo' }, store).source, 'odoo');
  assert.throws(() => resolveClientSource({ source: 'autre' }, store), { status: 400 });
});

test('CRUD administratif HTTP avec validation', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-http-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = express();
  app.use(express.json());
  registerAdminRoutes(app, createClientStore(path.join(dir, 'clients.json')));
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/admin/clients`;
  const options = { headers: { 'Content-Type': 'application/json' } };
  const created = await fetch(base, { ...options, method: 'POST', body: JSON.stringify({ nom: 'Profil test' }) });
  assert.equal(created.status, 201);
  const client = await created.json();
  assert.equal((await (await fetch(base)).json()).length, 1);
  const invalid = await fetch(base, { ...options, method: 'POST', body: JSON.stringify({ nom: 'Erreur', crmExistant: 'autre' }) });
  assert.equal(invalid.status, 400);
  assert.equal((await (await fetch(base)).json()).length, 1);
  assert.equal((await fetch(`${base}/absent`, { ...options, method: 'PUT', body: JSON.stringify({ nom: 'X' }) })).status, 404);
  assert.equal((await fetch(`${base}/${client.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await (await fetch(base)).json()).length, 0);
});

test('aucun retour admin ne dévoile les identifiants', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-secrets-http-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = express();
  app.use(express.json());
  registerAdminRoutes(app, createClientStore(path.join(dir, 'clients.json')));
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/admin/clients`;
  const options = { headers: { 'Content-Type': 'application/json' } };
  const posted = await fetch(base, { ...options, method: 'POST', body: JSON.stringify({
    nom: 'Exemple', crmExistant: 'hubspot', credentials: { hubspotToken: 'fake-secret' },
  }) });
  const response = await posted.json();
  assert.equal(response.credentialsConfigured, true);
  assert.equal(response.credentialStatus.hubspotToken, true);
  assert.equal(JSON.stringify(response).includes('fake-secret'), false);
  const listed = await (await fetch(base)).text();
  assert.equal(listed.includes('fake-secret'), false);
  const updated = await (await fetch(`${base}/${response.id}`, { ...options, method: 'PUT',
    body: JSON.stringify({ nom: 'Exemple renommé' }),
  })).text();
  assert.equal(updated.includes('fake-secret'), false);
  const cleared = await (await fetch(`${base}/${response.id}/credentials`, { method: 'DELETE' })).json();
  assert.equal(cleared.credentialsConfigured, false);
});