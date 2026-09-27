const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClientStore } = require('../lib/client-store');

test('modifier un profil ne rétablit pas un ancien solde de crédits', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-credit-edit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createClientStore(path.join(dir, 'clients.json'));
  const client = store.create({ nom: 'Exemple' });
  store.charge(client.id, 'question');
  const updated = store.update(client.id, { nom: 'Nom modifié' });
  assert.equal(updated.credits.solde, 19);
  assert.equal(updated.credits.historique.length, 1);
  assert.throws(() => store.update(client.id, {
    credits: { solde: 18, expectedSolde: 20 },
  }), { status: 409 });
  assert.equal(store.get(client.id).credits.solde, 19);
  const adjusted = store.update(client.id, { credits: { solde: 18, expectedSolde: 19 } });
  assert.equal(adjusted.credits.solde, 18);
  assert.equal(adjusted.credits.historique.at(-1).type, 'ajustement-admin');
});