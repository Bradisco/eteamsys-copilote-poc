const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDirectory } = require('../lib/crm-directory');

test('la dernière page Odoo exactement pleine ne propose pas de page vide', async () => {
  let requestedLimit;
  const directory = createDirectory({
    hubspotConfigured: false, odooConfigured: true,
    hsList: async () => ({ results: [] }),
    odooExecuteKw: async (model, method, args, options) => {
      requestedLimit = options.limit;
      return [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    },
    loadCrmBasique: () => ({ contacts: [] }),
  });
  const page = await directory.contacts('odoo', '', 2);
  assert.equal(requestedLimit, 3);
  assert.equal(page.items.length, 2);
  assert.equal(page.nextCursor, null);
});

function directory(overrides = {}) {
  return createDirectory({
    hubspotConfigured: false, odooConfigured: false,
    hsList: async () => { throw new Error('Appel non attendu'); },
    odooExecuteKw: async () => [],
    loadCrmBasique: () => ({ contacts: [
      { id: '1', nom: 'A', societe: 'Atelier fictif', statut: 'lead' },
      { id: '2', nom: 'B', societe: 'Atelier fictif', statut: 'client' },
      { id: '3', nom: 'C', societe: '', statut: 'lead' }
    ] }),
    ...overrides
  });
}
test('entreprises du CRM basique dérivées des contacts', async () => {
  const result = await directory().companies('crm-basique', '', 50);
  assert.equal(result.derived, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].nombreContacts, 2);
  assert.equal((await directory().contacts('crm-basique', '', 2)).nextCursor, '2');
});
test('sources non configurées clairement fictives', async () => {
  for (const source of ['hubspot', 'odoo']) {
    const result = await directory().contacts(source, '', 50);
    assert.equal(result.demoMode, true);
    assert.match(result.items[0].nom, /\(exemple\)/);
  }
});
test('connecteur configuré en échec sans remplacement silencieux', async () => {
  const failing = directory({ hubspotConfigured: true, hsList: async () => { throw new Error('HubSpot 403'); } });
  await assert.rejects(failing.contacts('hubspot', '', 50), /HubSpot 403/);
});
test('curseurs invalides rejetés', async () => {
  await assert.rejects(directory().companies('crm-basique', '-1', 50), { status: 400 });
});